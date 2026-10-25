import express from "express";
import {
  getDb,
  queryAll,
  queryOne,
  execute,
  generateTaskInstancesForDateRange,
  parseCalendarDate,
  addCalendarDays,
  formatCalendarDate,
} from "../db";
import { authenticateToken, requireSuperAdmin, requireTaskAccess, requireTaskCreationAccess, AuthenticatedRequest, checkClinicAccess } from "../auth";

const router = express.Router();

// GET /api/tasks - List task definitions (SUPER_ADMIN only, or filtered by clinic)
router.get("/", authenticateToken, requireTaskAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { clinicId } = req.query;
    const db = await getDb();

    let tasks = [];
    if (clinicId) {
      tasks = queryAll(
        db,
        `SELECT t.*, c.name as clinicName,
          (SELECT COUNT(*) FROM task_instances ti WHERE ti.taskId = t.id) as instanceCount
         FROM tasks t
         JOIN clinics c ON c.id = t.clinicId
         WHERE t.clinicId = ?
         ORDER BY t.id DESC;`,
        [Number(clinicId)]
      );
    } else {
      tasks = queryAll(
        db,
        `SELECT t.*, c.name as clinicName,
          (SELECT COUNT(*) FROM task_instances ti WHERE ti.taskId = t.id) as instanceCount
         FROM tasks t
         JOIN clinics c ON c.id = t.clinicId
         ORDER BY t.id DESC;`
      );
    }

    res.json({ tasks });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

// POST /api/tasks - Create task (SUPER_ADMIN only)
router.post("/", authenticateToken, requireTaskCreationAccess, async (req, res) => {
  try {
    const {
      name,
      description,
      clinicId,
      shift,
      startDate,
      endDate,
      recurrenceType = "NONE",
      relativeDays = null,
      relativeDirection = null,
    } = req.body;

    if (!name || !clinicId || !shift || !startDate) {
      res.status(400).json({ error: "Name, Clinic, Shift, and Start Date are required" });
      return;
    }

    if (!["MORNING", "EVENING"].includes(shift)) {
      res.status(400).json({ error: "Shift must be MORNING or EVENING" });
      return;
    }

    if (!["NONE", "DAILY"].includes(recurrenceType)) {
      res.status(400).json({ error: "Recurrence type must be NONE or DAILY" });
      return;
    }

    try {
      parseCalendarDate(startDate);
      if (endDate) parseCalendarDate(endDate);
    } catch {
      res.status(400).json({ error: "Start and end dates must be valid calendar dates" });
      return;
    }

    if (endDate && endDate < startDate) {
      res.status(400).json({ error: "End date cannot be before start date" });
      return;
    }

    const normalizedRelativeDays = relativeDays === null || relativeDays === ""
      ? null
      : Number(relativeDays);
    if (
      normalizedRelativeDays !== null &&
      (!Number.isInteger(normalizedRelativeDays) || normalizedRelativeDays < 0 || normalizedRelativeDays > 3650)
    ) {
      res.status(400).json({ error: "Relative days must be a whole number from 0 to 3650" });
      return;
    }
    if (normalizedRelativeDays !== null && !["AFTER", "BEFORE"].includes(relativeDirection)) {
      res.status(400).json({ error: "Relative direction must be AFTER or BEFORE" });
      return;
    }

    const db = await getDb();
    const result = execute(
      db,
      `INSERT INTO tasks (name, description, clinicId, shift, startDate, endDate, recurrenceType, relativeDays, relativeDirection)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        name.trim(),
        (description || "").trim(),
        Number(clinicId),
        shift,
        startDate,
        endDate || null,
        recurrenceType,
        normalizedRelativeDays,
        normalizedRelativeDays === null ? null : relativeDirection,
      ]
    );

    const taskId = result.lastInsertRowid;

    // Generate instances up to 30 days ahead from today/startDate
    const todayStr = formatCalendarDate(new Date());
    const futureDateStr = formatCalendarDate(addCalendarDays(todayStr, 30));
    const fromDateStr = startDate < todayStr ? startDate : todayStr;

    generateTaskInstancesForDateRange(db, fromDateStr, futureDateStr);

    const created = queryOne(
      db,
      `SELECT t.*, c.name as clinicName FROM tasks t JOIN clinics c ON c.id = t.clinicId WHERE t.id = ?;`,
      [taskId]
    );

    res.status(201).json({ task: created });
  } catch (err) {
    console.error("Error creating task:", err);
    res.status(500).json({ error: "Failed to create task" });
  }
});

// PUT /api/tasks/:id - Update task definition (SUPER_ADMIN only)
// Note: TaskInstance is a snapshot. Once created, previous instances remain unchanged.
// Future instances created after this edit will use the updated name and description.
router.put("/:id", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const taskId = Number(req.params.id);
    const {
      name,
      description,
      shift,
      startDate,
      endDate,
      recurrenceType,
      relativeDays,
      relativeDirection,
      updateFutureInstances,
    } = req.body;

    const db = await getDb();
    const existing = queryOne(db, "SELECT * FROM tasks WHERE id = ?;", [taskId]);
    if (!existing) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    try {
      if (startDate) parseCalendarDate(startDate);
      if (endDate) parseCalendarDate(endDate);
    } catch {
      res.status(400).json({ error: "Start and end dates must be valid calendar dates" });
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      res.status(400).json({ error: "End date cannot be before start date" });
      return;
    }

    const normalizedRelativeDays = relativeDays === undefined || relativeDays === null || relativeDays === ""
      ? null
      : Number(relativeDays);
    if (
      relativeDays !== undefined &&
      normalizedRelativeDays !== null &&
      (!Number.isInteger(normalizedRelativeDays) || normalizedRelativeDays < 0 || normalizedRelativeDays > 3650)
    ) {
      res.status(400).json({ error: "Relative days must be a whole number from 0 to 3650" });
      return;
    }

    execute(
      db,
      `UPDATE tasks 
       SET name = COALESCE(?, name),
           description = COALESCE(?, description),
           shift = COALESCE(?, shift),
           startDate = COALESCE(?, startDate),
           endDate = ?,
           recurrenceType = COALESCE(?, recurrenceType),
           relativeDays = COALESCE(?, relativeDays),
           relativeDirection = COALESCE(?, relativeDirection)
       WHERE id = ?;`,
      [
        name ? name.trim() : null,
        description !== undefined ? description.trim() : null,
        shift || null,
        startDate || null,
        endDate !== undefined ? (endDate || null) : existing.endDate,
        recurrenceType || null,
        relativeDays === undefined ? null : normalizedRelativeDays,
        relativeDirection || null,
        taskId,
      ]
    );

    // If updateFutureInstances is requested, we can update uncompleted FUTURE instances (from tomorrow onwards)
    // while keeping past instances and completion history completely unchanged!
    if (updateFutureInstances) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split("T")[0];

      // Update future uncompleted instances
      execute(
        db,
        `UPDATE task_instances
         SET name = ?, description = ?, shift = ?
         WHERE taskId = ? AND date >= ? 
           AND id NOT IN (SELECT taskInstanceId FROM task_completions);`,
        [name.trim(), (description || "").trim(), shift || existing.shift, taskId, tomorrowStr]
      );
    }

    const updated = queryOne(
      db,
      `SELECT t.*, c.name as clinicName FROM tasks t JOIN clinics c ON c.id = t.clinicId WHERE t.id = ?;`,
      [taskId]
    );

    res.json({ task: updated, message: "Task updated. Past snapshots and completion history remain preserved." });
  } catch (err) {
    res.status(500).json({ error: "Failed to update task" });
  }
});

// DELETE /api/tasks/:id (SUPER_ADMIN only)
router.delete("/:id", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const taskId = Number(req.params.id);
    const db = await getDb();
    execute(db, "DELETE FROM tasks WHERE id = ?;", [taskId]);
    res.json({ message: "Task definition deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete task" });
  }
});

// GET /api/tasks/instances - Get task instances for clinic, date, shift
router.get("/instances", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { clinicId, date, shift } = req.query;

    if (!clinicId) {
      res.status(400).json({ error: "clinicId is required" });
      return;
    }

    const cId = Number(clinicId);
    if (!checkClinicAccess(req.user!, cId)) {
      res.status(403).json({ error: "Access denied to this clinic" });
      return;
    }

    const targetDate = (date as string) || new Date().toISOString().split("T")[0];
    const db = await getDb();
    const currentUser = req.user!;

    // Ensure instances are generated for target date range
    generateTaskInstancesForDateRange(db, targetDate, targetDate);

    let sql = `
      SELECT ti.id, ti.taskId, ti.clinicId, ti.shift, ti.date, ti.targetDate, ti.name, ti.description
      FROM task_instances ti
      WHERE ti.clinicId = ? AND ti.date = ?
    `;
    const params: any[] = [cId, targetDate];

    if (shift && ["MORNING", "EVENING"].includes(shift as string)) {
      sql += " AND ti.shift = ?";
      params.push(shift);
    }

    sql += " ORDER BY ti.shift ASC, ti.id ASC;";

    const instances = queryAll(db, sql, params);

    // Fetch all completions for these instances
    const instanceIds = instances.map((i) => i.id);
    const completionsMap: Record<
      number,
      Array<{ id: number; userId: number; userName: string; completedAt: string }>
    > = {};

    if (instanceIds.length > 0) {
      const placeholders = instanceIds.map(() => "?").join(",");
      const allCompletions = queryAll<{
        id: number;
        taskInstanceId: number;
        userId: number;
        userName: string;
        completedAt: string;
      }>(
        db,
        `SELECT tc.id, tc.taskInstanceId, tc.userId, u.name as userName, tc.completedAt
         FROM task_completions tc
         JOIN users u ON u.id = tc.userId
         WHERE tc.taskInstanceId IN (${placeholders})
         ORDER BY tc.completedAt ASC;`,
        instanceIds
      );

      for (const comp of allCompletions) {
        if (!completionsMap[comp.taskInstanceId]) {
          completionsMap[comp.taskInstanceId] = [];
        }
        completionsMap[comp.taskInstanceId].push({
          id: comp.id,
          userId: comp.userId,
          userName: comp.userName,
          completedAt: comp.completedAt,
        });
      }
    }

    res.json({
      clinicId: cId,
      date: targetDate,
      shift: shift || "ALL",
      instances: instances.map((inst) => {
        const completions = completionsMap[inst.id] || [];
        const myCompletion = completions.find((c) => c.userId === currentUser.id) || null;
        const isCompletedByMe = !!myCompletion;

        return {
          id: inst.id,
          taskId: inst.taskId,
          clinicId: inst.clinicId,
          shift: inst.shift,
          date: inst.date,
          targetDate: inst.targetDate || inst.date,
          name: inst.name,
          description: inst.description,
          completions,
          completionCount: completions.length,
          isCompletedByMe,
          myCompletion,
          isCompleted: isCompletedByMe, // Used by standard checklist checkmark for the current user
          completion: myCompletion || completions[0] || null,
        };
      }),
    });
  } catch (err) {
    console.error("Error fetching task instances:", err);
    res.status(500).json({ error: "Failed to fetch task instances" });
  }
});

// POST /api/tasks/instances/:id/complete - Mark task as completed by current user
router.post("/instances/:id/complete", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const instanceId = Number(req.params.id);
    const db = await getDb();
    const user = req.user!;

    if (user.role === "SUPER_ADMIN") {
      res.status(403).json({ error: "Super Admins can create and manage tasks, but cannot complete them" });
      return;
    }

    // 1. Get task instance & check clinic access
    const instance = queryOne<{ id: number; clinicId: number; name: string }>(
      db,
      "SELECT id, clinicId, name FROM task_instances WHERE id = ?;",
      [instanceId]
    );

    if (!instance) {
      res.status(404).json({ error: "Task instance not found" });
      return;
    }

    if (!checkClinicAccess(user, instance.clinicId)) {
      res.status(403).json({ error: "Access denied to complete tasks for this clinic" });
      return;
    }

    // 2. Check if THIS user already completed it
    const existing = queryOne(
      db,
      "SELECT id FROM task_completions WHERE taskInstanceId = ? AND userId = ?;",
      [instanceId, user.id]
    );
    if (existing) {
      res.status(400).json({ error: "You have already marked this task as completed" });
      return;
    }

    // 3. Store userId and exact completedAt timestamp
    const now = new Date().toISOString();
    const result = execute(
      db,
      "INSERT INTO task_completions (taskInstanceId, userId, completedAt) VALUES (?, ?, ?);",
      [instanceId, user.id, now]
    );

    res.json({
      message: "Task completed successfully",
      completion: {
        id: result.lastInsertRowid,
        taskInstanceId: instanceId,
        userId: user.id,
        userName: user.name,
        completedAt: now,
      },
    });
  } catch (err) {
    console.error("Error completing task:", err);
    res.status(500).json({ error: "Failed to complete task" });
  }
});

// POST /api/tasks/instances/:id/uncomplete - Revert task completion for current user
router.post("/instances/:id/uncomplete", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const instanceId = Number(req.params.id);
    const db = await getDb();
    const user = req.user!;

    if (user.role === "SUPER_ADMIN") {
      res.status(403).json({ error: "Super Admins cannot change task completion status" });
      return;
    }

    const targetUserId = user.id;

    const completion = queryOne<{ id: number; userId: number }>(
      db,
      "SELECT id, userId FROM task_completions WHERE taskInstanceId = ? AND userId = ?;",
      [instanceId, targetUserId]
    );

    if (!completion) {
      res.status(400).json({ error: "Completion record not found for this user" });
      return;
    }

    execute(
      db,
      "DELETE FROM task_completions WHERE taskInstanceId = ? AND userId = ?;",
      [instanceId, targetUserId]
    );

    res.json({ message: "Task marked as pending for this user" });
  } catch (err) {
    console.error("Error uncompleting task:", err);
    res.status(500).json({ error: "Failed to uncomplete task" });
  }
});

export default router;
