import express from "express";
import { getDb, queryAll, queryOne, generateTaskInstancesForDateRange } from "../db";
import { authenticateToken, requireSuperAdmin, AuthenticatedRequest } from "../auth";

const router = express.Router();

// GET /api/reports/completions - Filterable completion report
router.get("/completions", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const {
      clinicId,
      startDate,
      endDate,
      dateFrom,
      dateTo,
      shift,
      taskId,
      userId,
      status,
    } = req.query;

    const db = await getDb();

    // Default date range if not specified: last 7 days to today
    const today = new Date();
    const defaultFrom = new Date(today);
    defaultFrom.setDate(today.getDate() - 7);

    const fromDate =
      (startDate as string) || (dateFrom as string) || defaultFrom.toISOString().split("T")[0];
    const toDate =
      (endDate as string) || (dateTo as string) || today.toISOString().split("T")[0];

    // Ensure instances exist in this date range
    generateTaskInstancesForDateRange(db, fromDate, toDate);

    let sql = `
      SELECT 
        ti.id as instanceId,
        ti.date,
        ti.shift,
        ti.name as taskName,
        ti.description as taskDescription,
        c.id as clinicId,
        c.name as clinicName,
        t.recurrenceType,
        CASE WHEN tc.id IS NOT NULL THEN 'COMPLETED' ELSE 'PENDING' END as status,
        tc.completedAt,
        u.id as userId,
        u.name as employeeName,
        u.nationalId as employeeNationalId
      FROM task_instances ti
      JOIN clinics c ON c.id = ti.clinicId
      LEFT JOIN tasks t ON t.id = ti.taskId
      LEFT JOIN task_completions tc ON tc.taskInstanceId = ti.id
      LEFT JOIN users u ON u.id = tc.userId
      WHERE ti.date >= ? AND ti.date <= ?
    `;

    const params: any[] = [fromDate, toDate];

    if (clinicId && clinicId !== "ALL" && !isNaN(Number(clinicId))) {
      sql += " AND ti.clinicId = ?";
      params.push(Number(clinicId));
    }

    if (shift && shift !== "ALL" && ["MORNING", "EVENING"].includes(shift as string)) {
      sql += " AND ti.shift = ?";
      params.push(shift);
    }

    if (taskId && taskId !== "ALL" && !isNaN(Number(taskId))) {
      sql += " AND ti.taskId = ?";
      params.push(Number(taskId));
    }

    if (userId && userId !== "ALL" && !isNaN(Number(userId))) {
      sql += " AND tc.userId = ?";
      params.push(Number(userId));
    }

    if (status && status !== "ALL") {
      if (status === "COMPLETED") {
        sql += " AND tc.id IS NOT NULL";
      } else if (status === "PENDING") {
        sql += " AND tc.id IS NULL";
      }
    }

    sql += " ORDER BY ti.date DESC, ti.shift ASC, ti.id ASC;";

    const rawReports = queryAll<any>(db, sql, params);

    const reports = rawReports.map((r) => ({
      id: r.instanceId,
      instanceId: r.instanceId,
      date: r.date,
      shift: r.shift,
      taskName: r.taskName,
      taskDescription: r.taskDescription,
      clinicId: r.clinicId,
      clinicName: r.clinicName,
      status: r.status,
      isCompleted: r.status === "COMPLETED",
      completedAt: r.completedAt,
      userId: r.userId,
      employeeName: r.employeeName,
      completedByUserName: r.employeeName,
      employeeNationalId: r.employeeNationalId,
    }));

    // Calculate aggregated metrics
    const totalCount = reports.length;
    const completedCount = reports.filter((r) => r.isCompleted).length;
    const pendingCount = totalCount - completedCount;
    const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    res.json({
      filters: { clinicId, dateFrom: fromDate, dateTo: toDate, startDate: fromDate, endDate: toDate, shift, taskId, userId, status },
      summary: {
        total: totalCount,
        totalCount,
        completed: completedCount,
        completedCount,
        pending: pendingCount,
        pendingCount,
        completionRate,
      },
      reports,
      records: reports,
    });
  } catch (err) {
    console.error("Error generating report:", err);
    res.status(500).json({ error: "Failed to generate completion report" });
  }
});

// GET /api/reports/dashboard-stats
router.get("/dashboard-stats", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const db = await getDb();
    const user = req.user!;
    const todayDate = new Date();
    const today = todayDate.toISOString().split("T")[0];
    const todayDayOfWeek = todayDate.getDay();

    // Ensure instances generated for today
    generateTaskInstancesForDateRange(db, today, today);

    if (user.role === "SUPER_ADMIN") {
      const clinicCount = (queryOne<{ c: number }>(db, "SELECT COUNT(*) as c FROM clinics;")?.c) || 0;
      const userCount = (queryOne<{ c: number }>(db, "SELECT COUNT(*) as c FROM users WHERE role = 'USER';")?.c) || 0;
      const doctorCount = (queryOne<{ c: number }>(db, "SELECT COUNT(*) as c FROM doctors;")?.c) || 0;
      const roomCount = (queryOne<{ c: number }>(db, "SELECT COUNT(*) as c FROM rooms;")?.c) || 0;

      const todayTasks = (queryOne<{ c: number }>(db, "SELECT COUNT(*) as c FROM task_instances WHERE date = ?;", [today])?.c) || 0;
      const todayCompleted = (
        queryOne<{ c: number }>(
          db,
          `SELECT COUNT(*) as c FROM task_completions tc JOIN task_instances ti ON ti.id = tc.taskInstanceId WHERE ti.date = ?;`,
          [today]
        )?.c
      ) || 0;

      // Active doctor schedules for today:
      // Template entries where no date override exists or date override has doctorId != NULL
      // + Date exceptions with doctorId != NULL
      const todaySchedules = (
        queryOne<{ c: number }>(
          db,
          `SELECT COUNT(*) as c
           FROM (
             -- Master templates active today with no date override
             SELECT dst.roomId, dst.shift
             FROM doctor_schedule_templates dst
             LEFT JOIN doctor_schedules ds ON ds.roomId = dst.roomId AND ds.date = ? AND ds.shift = dst.shift
             WHERE dst.dayOfWeek = ? AND ds.id IS NULL
             UNION ALL
             -- Explicit date schedules active today (with doctor assigned and not cancelled)
             SELECT ds.roomId, ds.shift
             FROM doctor_schedules ds
             WHERE ds.date = ? AND ds.doctorId IS NOT NULL AND (ds.status IS NULL OR ds.status != 'CANCELLED')
           );`,
          [today, todayDayOfWeek, today]
        )?.c
      ) || 0;

      // Recent completions
      const recentCompletions = queryAll(
        db,
        `SELECT ti.name as taskName, ti.shift, c.name as clinicName, u.name as employeeName, tc.completedAt
         FROM task_completions tc
         JOIN task_instances ti ON ti.id = tc.taskInstanceId
         JOIN clinics c ON c.id = ti.clinicId
         JOIN users u ON u.id = tc.userId
         ORDER BY tc.completedAt DESC
         LIMIT 5;`
      );

      res.json({
        role: "SUPER_ADMIN",
        metrics: {
          clinics: clinicCount,
          employees: userCount,
          doctors: doctorCount,
          rooms: roomCount,
          todayTasks,
          todayCompleted,
          todayPending: todayTasks - todayCompleted,
          todaySchedules,
        },
        recentCompletions,
      });
    } else {
      // Employee stats for assigned clinics
      const assignedIds = user.assignedClinics || [];
      if (assignedIds.length === 0) {
        res.json({
          role: "USER",
          metrics: {
            assignedClinicsCount: 0,
            todayTasks: 0,
            todayCompleted: 0,
            todayPending: 0,
            todayDoctorSchedules: 0,
          },
          recentCompletions: [],
        });
        return;
      }

      const placeholders = assignedIds.map(() => "?").join(",");

      const todayTasks = (
        queryOne<{ c: number }>(
          db,
          `SELECT COUNT(*) as c FROM task_instances WHERE clinicId IN (${placeholders}) AND date = ?;`,
          [...assignedIds, today]
        )?.c
      ) || 0;

      const todayCompleted = (
        queryOne<{ c: number }>(
          db,
          `SELECT COUNT(*) as c 
           FROM task_completions tc 
           JOIN task_instances ti ON ti.id = tc.taskInstanceId 
           WHERE ti.clinicId IN (${placeholders}) AND ti.date = ?;`,
          [...assignedIds, today]
        )?.c
      ) || 0;

      const todayDoctorSchedules = (
        queryOne<{ c: number }>(
          db,
          `SELECT COUNT(*) as c
           FROM (
             -- Master templates active today for assigned clinics with no date override
             SELECT dst.roomId, dst.shift
             FROM doctor_schedule_templates dst
             JOIN rooms r ON r.id = dst.roomId
             LEFT JOIN doctor_schedules ds ON ds.roomId = dst.roomId AND ds.date = ? AND ds.shift = dst.shift
             WHERE r.clinicId IN (${placeholders}) AND dst.dayOfWeek = ? AND ds.id IS NULL
             UNION ALL
             -- Explicit date schedules active today for assigned clinics (not cancelled)
             SELECT ds.roomId, ds.shift
             FROM doctor_schedules ds
             JOIN rooms r ON r.id = ds.roomId
             WHERE r.clinicId IN (${placeholders}) AND ds.date = ? AND ds.doctorId IS NOT NULL AND (ds.status IS NULL OR ds.status != 'CANCELLED')
           );`,
          [today, ...assignedIds, todayDayOfWeek, ...assignedIds, today]
        )?.c
      ) || 0;

      const myCompletedToday = (
        queryOne<{ c: number }>(
          db,
          `SELECT COUNT(*) as c 
           FROM task_completions tc 
           JOIN task_instances ti ON ti.id = tc.taskInstanceId 
           WHERE tc.userId = ? AND ti.date = ?;`,
          [user.id, today]
        )?.c
      ) || 0;

      res.json({
        role: "USER",
        metrics: {
          assignedClinicsCount: assignedIds.length,
          todayTasks,
          todayCompleted,
          todayPending: todayTasks - todayCompleted,
          todayDoctorSchedules,
          myCompletedToday,
        },
      });
    }
  } catch (err) {
    console.error("Error fetching dashboard stats:", err);
    res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
});

export default router;
