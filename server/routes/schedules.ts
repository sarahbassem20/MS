import express from "express";
import { getDb, queryAll, queryOne, execute } from "../db";
import { authenticateToken, requireSuperAdmin, AuthenticatedRequest, checkClinicAccess } from "../auth";

const router = express.Router();

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Standard Middle East display order starting from Saturday:
const WEEK_DAY_INDICES = [6, 0, 1, 2, 3, 4, 5]; // 6=Sat, 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri

// ==========================================
// 1. MASTER WEEKLY TEMPLATES (الجدول الثابت)
// ==========================================

// GET /api/schedules/template - Fetch master template for a clinic
router.get("/template", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { clinicId } = req.query;
    if (!clinicId) {
      res.status(400).json({ error: "clinicId is required" });
      return;
    }

    const cId = Number(clinicId);
    if (!checkClinicAccess(req.user!, cId)) {
      res.status(403).json({ error: "Access denied to this clinic schedule" });
      return;
    }

    const db = await getDb();

    // 1. Get Clinic info
    const clinic = queryOne<{ id: number; name: string }>(
      db,
      "SELECT id, name FROM clinics WHERE id = ?;",
      [cId]
    );
    if (!clinic) {
      res.status(404).json({ error: "Clinic not found" });
      return;
    }

    // 2. Get Rooms for this clinic
    const rooms = queryAll<{ id: number; name: string }>(
      db,
      "SELECT id, name FROM rooms WHERE clinicId = ? ORDER BY id ASC;",
      [cId]
    );

    // 3. Get All Template entries for this clinic
    const roomIds = rooms.map((r) => r.id);
    let templates: Array<{
      id: number;
      clinicId: number;
      roomId: number;
      roomName: string;
      dayOfWeek: number;
      shift: "MORNING" | "EVENING";
      doctorId: number;
      doctorName: string;
      doctorSpecialist: string;
    }> = [];

    if (roomIds.length > 0) {
      const placeholders = roomIds.map(() => "?").join(",");
      templates = queryAll(
        db,
        `SELECT dst.id, dst.clinicId, dst.roomId, r.name as roomName, dst.dayOfWeek, dst.shift,
                dst.doctorId, d.name as doctorName, d.specialist as doctorSpecialist
         FROM doctor_schedule_templates dst
         JOIN rooms r ON r.id = dst.roomId
         JOIN doctors d ON d.id = dst.doctorId
         WHERE dst.roomId IN (${placeholders})
         ORDER BY dst.dayOfWeek ASC, dst.shift ASC;`,
        roomIds
      );
    }

    // 4. Construct Days array ordered from Saturday (6) to Friday (5)
    const days = WEEK_DAY_INDICES.map((dayIdx) => ({
      dayIndex: dayIdx,
      dayOfWeek: DAY_NAMES[dayIdx],
    }));

    // 5. Structure into matrix
    const matrix = days.map((day) => {
      const morningRooms: Record<number, any> = {};
      const eveningRooms: Record<number, any> = {};

      rooms.forEach((r) => {
        morningRooms[r.id] = null;
        eveningRooms[r.id] = null;
      });

      templates
        .filter((t) => t.dayOfWeek === day.dayIndex)
        .forEach((t) => {
          if (t.shift === "MORNING") {
            const current = morningRooms[t.roomId];
            morningRooms[t.roomId] = current
              ? { ...current, additionalDoctors: [...(current.additionalDoctors || []), t] }
              : t;
          } else if (t.shift === "EVENING") {
            const current = eveningRooms[t.roomId];
            eveningRooms[t.roomId] = current
              ? { ...current, additionalDoctors: [...(current.additionalDoctors || []), t] }
              : t;
          }
        });

      return {
        dayOfWeek: day.dayOfWeek,
        dayIndex: day.dayIndex,
        shifts: {
          MORNING: morningRooms,
          EVENING: eveningRooms,
        },
      };
    });

    res.json({
      clinic,
      rooms,
      days,
      templates,
      matrix,
    });
  } catch (err) {
    console.error("Error fetching schedule template:", err);
    res.status(500).json({ error: "Failed to fetch schedule template" });
  }
});

// POST /api/schedules/template - Save or update master template slot (SUPER_ADMIN only)
router.post("/template", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { clinicId, roomId, dayOfWeek, shift, doctorId } = req.body;

    if (!clinicId || !roomId || dayOfWeek === undefined || !shift || !doctorId) {
      res.status(400).json({ error: "clinicId, roomId, dayOfWeek, shift, and doctorId are required" });
      return;
    }

    if (!["MORNING", "EVENING"].includes(shift)) {
      res.status(400).json({ error: "Shift must be either MORNING or EVENING" });
      return;
    }

    const dOfWeek = Number(dayOfWeek);
    if (dOfWeek < 0 || dOfWeek > 6) {
      res.status(400).json({ error: "dayOfWeek must be between 0 (Sunday) and 6 (Saturday)" });
      return;
    }

    const db = await getDb();

    // 1. Verify Room exists
    const room = queryOne<{ id: number; clinicId: number; name: string; clinicName: string }>(
      db,
      `SELECT r.id, r.clinicId, r.name, c.name as clinicName
       FROM rooms r
       JOIN clinics c ON c.id = r.clinicId
       WHERE r.id = ?;`,
      [Number(roomId)]
    );
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    // 2. Verify Doctor exists
    const doctor = queryOne<{ id: number; name: string; specialist: string }>(
      db,
      "SELECT id, name, specialist FROM doctors WHERE id = ?;",
      [Number(doctorId)]
    );
    if (!doctor) {
      res.status(404).json({ error: "Doctor not found" });
      return;
    }

    // 3. Verify Doctor is affiliated with clinic
    const docClinic = queryOne(
      db,
      "SELECT doctorId FROM doctor_clinics WHERE doctorId = ? AND clinicId = ?;",
      [Number(doctorId), room.clinicId]
    );
    if (!docClinic) {
      res.status(400).json({
        error: `Doctor ${doctor.name} is not assigned to ${room.clinicName}. Please assign the doctor to the clinic first.`,
      });
      return;
    }

    // 4. Check Conflict in Template: Is this doctor already assigned elsewhere on this dayOfWeek + shift?
    const templateConflict = queryOne<{ id: number; roomId: number; roomName: string; clinicName: string }>(
      db,
      `SELECT dst.id, dst.roomId, r.name as roomName, c.name as clinicName
       FROM doctor_schedule_templates dst
       JOIN rooms r ON r.id = dst.roomId
       JOIN clinics c ON c.id = dst.clinicId
       WHERE dst.doctorId = ? AND dst.dayOfWeek = ? AND dst.shift = ? AND dst.roomId != ?;`,
      [Number(doctorId), dOfWeek, shift, Number(roomId)]
    );

    if (templateConflict) {
      res.status(409).json({
        error: `Conflict in Weekly Template: Dr. ${doctor.name} is already assigned at ${templateConflict.clinicName} (${templateConflict.roomName}) on ${DAY_NAMES[dOfWeek]} during the ${shift} shift.`,
      });
      return;
    }

    // 5. Insert or replace in template
    execute(
      db,
      `INSERT OR IGNORE INTO doctor_schedule_templates (clinicId, roomId, dayOfWeek, shift, doctorId)
       VALUES (?, ?, ?, ?, ?);`,
      [room.clinicId, Number(roomId), dOfWeek, shift, Number(doctorId)]
    );

    const updated = queryOne(
      db,
      `SELECT dst.id, dst.clinicId, dst.roomId, r.name as roomName, dst.dayOfWeek, dst.shift,
              dst.doctorId, d.name as doctorName, d.specialist as doctorSpecialist
       FROM doctor_schedule_templates dst
       JOIN rooms r ON r.id = dst.roomId
       JOIN doctors d ON d.id = dst.doctorId
       WHERE dst.roomId = ? AND dst.dayOfWeek = ? AND dst.shift = ?;`,
      [Number(roomId), dOfWeek, shift]
    );

    res.json({ template: updated, message: "Weekly template updated successfully" });
  } catch (err: any) {
    console.error("Error saving template slot:", err);
    res.status(500).json({ error: "Failed to save weekly template slot" });
  }
});

// DELETE /api/schedules/template/slot - Clear slot from master template (SUPER_ADMIN only)
router.delete("/template/slot", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { roomId, dayOfWeek, shift, doctorId } = req.body;
    if (!roomId || dayOfWeek === undefined || !shift) {
      res.status(400).json({ error: "roomId, dayOfWeek, and shift are required" });
      return;
    }

    const db = await getDb();
    const params = [Number(roomId), Number(dayOfWeek), shift];
    const doctorFilter = doctorId ? " AND doctorId = ?" : "";
    if (doctorId) params.push(Number(doctorId));
    execute(
      db,
      `DELETE FROM doctor_schedule_templates WHERE roomId = ? AND dayOfWeek = ? AND shift = ?${doctorFilter};`,
      params
    );
    res.json({ message: doctorId ? "Doctor removed from template slot" : "Template slot cleared successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to clear template slot" });
  }
});

// ========================================================
// 2. CALENDAR WEEKLY SCHEDULE WITH TEMPLATES & EXCEPTIONS
// ========================================================

// GET /api/schedules/weekly
router.get("/weekly", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { clinicId, weekStart, startDate: qStartDate, endDate: qEndDate } = req.query;

    if (!clinicId) {
      res.status(400).json({ error: "clinicId is required" });
      return;
    }

    const cId = Number(clinicId);
    if (!checkClinicAccess(req.user!, cId)) {
      res.status(403).json({ error: "Access denied to this clinic schedule" });
      return;
    }

    const db = await getDb();

    // 1. Get Clinic info
    const clinic = queryOne<{ id: number; name: string }>(
      db,
      "SELECT id, name FROM clinics WHERE id = ?;",
      [cId]
    );
    if (!clinic) {
      res.status(404).json({ error: "Clinic not found" });
      return;
    }

    // 2. Get Rooms for this clinic
    const rooms = queryAll<{ id: number; name: string }>(
      db,
      "SELECT id, name FROM rooms WHERE clinicId = ? ORDER BY id ASC;",
      [cId]
    );

    // 3. Calculate days of the schedule
    let startDate: Date;
    let numDays = 7;

    if (qStartDate && typeof qStartDate === "string" && qEndDate && typeof qEndDate === "string") {
      const [sy, sm, sd] = qStartDate.split("-").map(Number);
      const [ey, em, ed] = qEndDate.split("-").map(Number);
      startDate = new Date(sy, sm - 1, sd, 12, 0, 0);
      const endDate = new Date(ey, em - 1, ed, 12, 0, 0);
      const diffTime = endDate.getTime() - startDate.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
      numDays = Math.min(Math.max(diffDays, 1), 31);
    } else if (qStartDate && typeof qStartDate === "string") {
      const [sy, sm, sd] = qStartDate.split("-").map(Number);
      startDate = new Date(sy, sm - 1, sd, 12, 0, 0);
      numDays = 7;
    } else if (weekStart && typeof weekStart === "string") {
      const [sy, sm, sd] = weekStart.split("-").map(Number);
      startDate = new Date(sy, sm - 1, sd, 12, 0, 0);
      numDays = 7;
    } else {
      const today = new Date();
      const day = today.getDay(); // 0 is Sunday, 6 is Saturday
      const diff = (day + 1) % 7; // Align to Saturday
      startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - diff, 12, 0, 0);
      numDays = 7;
    }

    const days: Array<{ date: string; dayOfWeek: string; dayIndex: number }> = [];
    for (let i = 0; i < numDays; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dayNum = String(d.getDate()).padStart(2, "0");
      const dateStr = `${y}-${m}-${dayNum}`;
      days.push({
        date: dateStr,
        dayOfWeek: DAY_NAMES[d.getDay()],
        dayIndex: d.getDay(),
      });
    }

    const fromDate = days[0].date;
    const toDate = days[days.length - 1].date;
    const roomIds = rooms.map((r) => r.id);

    // 4. Fetch Master Templates for this clinic's rooms
    let templates: Array<{
      id: number;
      roomId: number;
      dayOfWeek: number;
      shift: "MORNING" | "EVENING";
      doctorId: number;
      doctorName: string;
      doctorSpecialist: string;
      roomName: string;
    }> = [];

    if (roomIds.length > 0) {
      const placeholders = roomIds.map(() => "?").join(",");
      templates = queryAll(
        db,
        `SELECT dst.id, dst.roomId, r.name as roomName, dst.dayOfWeek, dst.shift,
                dst.doctorId, d.name as doctorName, d.specialist as doctorSpecialist
         FROM doctor_schedule_templates dst
         JOIN rooms r ON r.id = dst.roomId
         JOIN doctors d ON d.id = dst.doctorId
         WHERE dst.roomId IN (${placeholders});`,
        roomIds
      );
    }

    // 5. Fetch Date-Specific Overrides / Exceptions from doctor_schedules
    let dateSchedules: Array<{
      id: number;
      doctorId: number | null;
      doctorName: string | null;
      doctorSpecialist: string | null;
      roomId: number;
      roomName: string;
      date: string;
      shift: "MORNING" | "EVENING";
      status?: string | null;
      isException: number;
      note: string | null;
    }> = [];

    if (roomIds.length > 0) {
      const placeholders = roomIds.map(() => "?").join(",");
      dateSchedules = queryAll(
        db,
        `SELECT ds.id, ds.doctorId, d.name as doctorName, d.specialist as doctorSpecialist,
                ds.roomId, r.name as roomName, ds.date, ds.shift, ds.status, ds.isException, ds.note
         FROM doctor_schedules ds
         LEFT JOIN doctors d ON d.id = ds.doctorId
         JOIN rooms r ON r.id = ds.roomId
         WHERE ds.roomId IN (${placeholders})
           AND ds.date >= ? AND ds.date <= ?
         ORDER BY ds.date ASC, ds.shift ASC;`,
        [...roomIds, fromDate, toDate]
      );
    }

    // Create lookup map for date overrides: `${roomId}_${date}_${shift}`
    const dateOverrideMap = new Map<string, (typeof dateSchedules)[0][]>();
    dateSchedules.forEach((ds) => {
      const key = `${ds.roomId}_${ds.date}_${ds.shift}`;
      dateOverrideMap.set(key, [...(dateOverrideMap.get(key) || []), ds]);
    });

    // Create lookup map for templates: `${roomId}_${dayOfWeek}_${shift}`
    const templateMap = new Map<string, (typeof templates)[0][]>();
    templates.forEach((t) => {
      const key = `${t.roomId}_${t.dayOfWeek}_${t.shift}`;
      templateMap.set(key, [...(templateMap.get(key) || []), t]);
    });

    // 6. Merge Matrix: Resolve each date + room + shift
    const resolvedSchedules: any[] = [];

    const matrix = days.map((day) => {
      const morningRooms: Record<number, any> = {};
      const eveningRooms: Record<number, any> = {};

      rooms.forEach((room) => {
        // Morning Slot
        const morningOverrides = dateOverrideMap.get(`${room.id}_${day.date}_MORNING`) || [];
        const morningOverride = morningOverrides[0];
        const morningTemplates = templateMap.get(`${room.id}_${day.dayIndex}_MORNING`) || [];
        const morningTemplate = morningTemplates[0];

        if (morningOverride) {
          const isCancelled = morningOverride.status === "CANCELLED" || morningOverride.doctorId === null;
          const docId = morningOverride.doctorId ?? morningTemplate?.doctorId ?? null;
          const docName = morningOverride.doctorName ?? morningTemplate?.doctorName ?? null;
          const docSpecialist = morningOverride.doctorSpecialist ?? morningTemplate?.doctorSpecialist ?? null;
          const overrideDoctorIds = new Set(morningOverrides.map((item) => item.doctorId).filter(Boolean));
          const inheritedDoctors = isCancelled
            ? []
            : morningTemplates.filter((item) => !overrideDoctorIds.has(item.doctorId));

          morningRooms[room.id] = {
            id: morningOverride.id,
            roomId: room.id,
            roomName: room.name,
            date: day.date,
            shift: "MORNING",
            doctorId: docId,
            doctorName: docName,
            doctorSpecialist: docSpecialist,
            status: isCancelled ? "CANCELLED" : "SCHEDULED",
            isTemplate: false,
            isException: true,
            isOff: isCancelled,
            isCancelled: isCancelled,
            note: morningOverride.note,
            additionalDoctors: [
              ...morningOverrides.slice(1),
              ...inheritedDoctors.map((item) => ({
                doctorId: item.doctorId,
                doctorName: item.doctorName,
                doctorSpecialist: item.doctorSpecialist,
              })),
            ],
          };
        } else if (morningTemplate) {
          // Inherited automatically from Master Weekly Template
          morningRooms[room.id] = {
            id: morningTemplate.id,
            roomId: room.id,
            roomName: room.name,
            date: day.date,
            shift: "MORNING",
            doctorId: morningTemplate.doctorId,
            doctorName: morningTemplate.doctorName,
            doctorSpecialist: morningTemplate.doctorSpecialist,
            status: "SCHEDULED",
            isTemplate: true,
            isException: false,
            isOff: false,
            isCancelled: false,
            note: null,
            additionalDoctors: morningTemplates.slice(1),
          };
        } else {
          morningRooms[room.id] = null;
        }

        if (morningRooms[room.id]) {
          resolvedSchedules.push(morningRooms[room.id]);
        }

        // Evening Slot
        const eveningOverrides = dateOverrideMap.get(`${room.id}_${day.date}_EVENING`) || [];
        const eveningOverride = eveningOverrides[0];
        const eveningTemplates = templateMap.get(`${room.id}_${day.dayIndex}_EVENING`) || [];
        const eveningTemplate = eveningTemplates[0];

        if (eveningOverride) {
          const isCancelled = eveningOverride.status === "CANCELLED" || eveningOverride.doctorId === null;
          const docId = eveningOverride.doctorId ?? eveningTemplate?.doctorId ?? null;
          const docName = eveningOverride.doctorName ?? eveningTemplate?.doctorName ?? null;
          const docSpecialist = eveningOverride.doctorSpecialist ?? eveningTemplate?.doctorSpecialist ?? null;
          const overrideDoctorIds = new Set(eveningOverrides.map((item) => item.doctorId).filter(Boolean));
          const inheritedDoctors = isCancelled
            ? []
            : eveningTemplates.filter((item) => !overrideDoctorIds.has(item.doctorId));

          eveningRooms[room.id] = {
            id: eveningOverride.id,
            roomId: room.id,
            roomName: room.name,
            date: day.date,
            shift: "EVENING",
            doctorId: docId,
            doctorName: docName,
            doctorSpecialist: docSpecialist,
            status: isCancelled ? "CANCELLED" : "SCHEDULED",
            isTemplate: false,
            isException: true,
            isOff: isCancelled,
            isCancelled: isCancelled,
            note: eveningOverride.note,
            additionalDoctors: [
              ...eveningOverrides.slice(1),
              ...inheritedDoctors.map((item) => ({
                doctorId: item.doctorId,
                doctorName: item.doctorName,
                doctorSpecialist: item.doctorSpecialist,
              })),
            ],
          };
        } else if (eveningTemplate) {
          eveningRooms[room.id] = {
            id: eveningTemplate.id,
            roomId: room.id,
            roomName: room.name,
            date: day.date,
            shift: "EVENING",
            doctorId: eveningTemplate.doctorId,
            doctorName: eveningTemplate.doctorName,
            doctorSpecialist: eveningTemplate.doctorSpecialist,
            status: "SCHEDULED",
            isTemplate: true,
            isException: false,
            isOff: false,
            isCancelled: false,
            note: null,
            additionalDoctors: eveningTemplates.slice(1),
          };
        } else {
          eveningRooms[room.id] = null;
        }

        if (eveningRooms[room.id]) {
          resolvedSchedules.push(eveningRooms[room.id]);
        }
      });

      return {
        date: day.date,
        dayOfWeek: day.dayOfWeek,
        dayIndex: day.dayIndex,
        shifts: {
          MORNING: morningRooms,
          EVENING: eveningRooms,
        },
      };
    });

    res.json({
      clinic,
      rooms,
      startDate: fromDate,
      endDate: toDate,
      weekStart: fromDate,
      weekEnd: toDate,
      days,
      schedules: resolvedSchedules,
      matrix,
    });
  } catch (err) {
    console.error("Error fetching weekly schedule:", err);
    res.status(500).json({ error: "Failed to fetch weekly schedule" });
  }
});

// POST /api/schedules - Create date exception or update master template (SUPER_ADMIN only)
router.post("/", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { doctorId, roomId, date, shift, applyToTemplate, note } = req.body;

    if (!doctorId || !roomId || !date || !shift) {
      res.status(400).json({ error: "Doctor, Room, Date, and Shift are required" });
      return;
    }

    if (!["MORNING", "EVENING"].includes(shift)) {
      res.status(400).json({ error: "Shift must be either MORNING or EVENING" });
      return;
    }

    const db = await getDb();

    // 1. Verify Room exists and get Clinic
    const room = queryOne<{ id: number; clinicId: number; name: string; clinicName: string }>(
      db,
      `SELECT r.id, r.clinicId, r.name, c.name as clinicName
       FROM rooms r
       JOIN clinics c ON c.id = r.clinicId
       WHERE r.id = ?;`,
      [Number(roomId)]
    );
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    // 2. Verify Doctor exists
    const doctor = queryOne<{ id: number; name: string; specialist: string }>(
      db,
      "SELECT id, name, specialist FROM doctors WHERE id = ?;",
      [Number(doctorId)]
    );
    if (!doctor) {
      res.status(404).json({ error: "Doctor not found" });
      return;
    }

    // 3. Verify Doctor is assigned to this Clinic
    const docClinic = queryOne(
      db,
      "SELECT doctorId FROM doctor_clinics WHERE doctorId = ? AND clinicId = ?;",
      [Number(doctorId), room.clinicId]
    );
    if (!docClinic) {
      res.status(400).json({
        error: `Doctor ${doctor.name} is not assigned to ${room.clinicName}. Please assign the doctor to the clinic first.`,
      });
      return;
    }

    const d = new Date(date + "T00:00:00");
    const dayOfWeek = d.getDay();

    if (applyToTemplate) {
      // -------------------------------------------------------------
      // CASE A: User requested to update the Master Weekly Template
      // -------------------------------------------------------------
      // Conflict check on Master Template
      const templateConflict = queryOne<{ id: number; roomId: number; roomName: string; clinicName: string }>(
        db,
        `SELECT dst.id, dst.roomId, r.name as roomName, c.name as clinicName
         FROM doctor_schedule_templates dst
         JOIN rooms r ON r.id = dst.roomId
         JOIN clinics c ON c.id = dst.clinicId
         WHERE dst.doctorId = ? AND dst.dayOfWeek = ? AND dst.shift = ? AND dst.roomId != ?;`,
        [Number(doctorId), dayOfWeek, shift, Number(roomId)]
      );

      if (templateConflict) {
        res.status(409).json({
          error: `Conflict in Weekly Template: Dr. ${doctor.name} is already assigned at ${templateConflict.clinicName} (${templateConflict.roomName}) on ${DAY_NAMES[dayOfWeek]} during ${shift} shift.`,
        });
        return;
      }

      // Save to template
      execute(
        db,
        `INSERT OR IGNORE INTO doctor_schedule_templates (clinicId, roomId, dayOfWeek, shift, doctorId)
         VALUES (?, ?, ?, ?, ?);`,
        [room.clinicId, Number(roomId), dayOfWeek, shift, Number(doctorId)]
      );

      // Also remove any date exception on this slot so it cleanly inherits the new template
      execute(db, "DELETE FROM doctor_schedules WHERE roomId = ? AND date = ? AND shift = ?;", [
        Number(roomId),
        date,
        shift,
      ]);

      res.status(201).json({
        message: "Weekly template updated successfully for all weeks",
        isTemplate: true,
      });
      return;
    }

    // -------------------------------------------------------------
    // CASE B: User is applying an Exception / Custom Date Schedule
    // -------------------------------------------------------------
    // Conflict check on this specific Date + Shift across date overrides AND templates
    const dateConflict = queryOne<{ id: number; roomId: number; roomName: string; clinicName: string }>(
      db,
      `SELECT ds.id, ds.roomId, r.name as roomName, c.name as clinicName
       FROM doctor_schedules ds
       JOIN rooms r ON r.id = ds.roomId
       JOIN clinics c ON c.id = r.clinicId
       WHERE ds.doctorId = ? AND ds.date = ? AND ds.shift = ? AND ds.roomId != ?;`,
      [Number(doctorId), date, shift, Number(roomId)]
    );

    if (dateConflict) {
      res.status(409).json({
        error: `Scheduling Conflict: Dr. ${doctor.name} is already scheduled at ${dateConflict.clinicName} (${dateConflict.roomName}) for ${date} during the ${shift} shift.`,
      });
      return;
    }

    // Insert or replace date override
    execute(
      db,
      `INSERT OR IGNORE INTO doctor_schedules (doctorId, roomId, date, shift, status, isException, note)
       VALUES (?, ?, ?, ?, 'SCHEDULED', 1, ?);`,
      [Number(doctorId), Number(roomId), date, shift, note || null]
    );

    const created = queryOne(
      db,
      `SELECT ds.id, ds.doctorId, d.name as doctorName, d.specialist as doctorSpecialist,
              ds.roomId, r.name as roomName, ds.date, ds.shift, ds.status, ds.isException, ds.note
       FROM doctor_schedules ds
       JOIN doctors d ON d.id = ds.doctorId
       JOIN rooms r ON r.id = ds.roomId
       WHERE ds.roomId = ? AND ds.date = ? AND ds.shift = ?;`,
      [Number(roomId), date, shift]
    );

    res.status(201).json({
      schedule: created,
      message: "Doctor schedule exception saved for this date",
      isException: true,
    });
  } catch (err: any) {
    console.error("Error creating schedule:", err);
    res.status(500).json({ error: "Failed to schedule doctor" });
  }
});

// POST /api/schedules/slot/off - Mark slot explicitly OFF/Cancelled/Apology for a specific date (Exception)
router.post("/slot/off", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { roomId, date, shift, doctorId, note } = req.body;
    if (!roomId || !date || !shift) {
      res.status(400).json({ error: "roomId, date, and shift are required" });
      return;
    }

    const db = await getDb();
    let targetDoctorId = doctorId && doctorId !== "OFF" ? Number(doctorId) : null;

    // If no doctorId was passed, retrieve the doctor from the template for that day/room/shift so we know who apologized
    if (!targetDoctorId) {
      const dayIndex = new Date(date + "T00:00:00").getDay();
      const tmpl = queryOne<{ doctorId: number }>(
        db,
        "SELECT doctorId FROM doctor_schedule_templates WHERE roomId = ? AND dayOfWeek = ? AND shift = ?;",
        [Number(roomId), dayIndex, shift]
      );
      if (tmpl && tmpl.doctorId) {
        targetDoctorId = tmpl.doctorId;
      }
    }

    execute(
      db,
      `DELETE FROM doctor_schedules WHERE roomId = ? AND date = ? AND shift = ?;`,
      [Number(roomId), date, shift]
    );
    execute(
      db,
      `INSERT INTO doctor_schedules (doctorId, roomId, date, shift, status, isException, note)
       VALUES (?, ?, ?, ?, 'CANCELLED', 1, ?);`,
      [targetDoctorId, Number(roomId), date, shift, note || "اعتذار / ملغي"]
    );

    res.json({
      message: "Slot marked as cancelled/apology for this date as an exception",
      isCancelled: true,
      doctorId: targetDoctorId,
    });
  } catch (err) {
    console.error("Error setting slot off:", err);
    res.status(500).json({ error: "Failed to mark slot off" });
  }
});

// DELETE /api/schedules/slot/remove - Revert date exception back to Weekly Master Template
router.delete("/slot/remove", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { roomId, date, shift, doctorId } = req.body;
    if (!roomId || !date || !shift) {
      res.status(400).json({ error: "roomId, date, and shift are required" });
      return;
    }

    const db = await getDb();
    // By deleting the record from doctor_schedules, the slot will seamlessly revert back to inheriting the master template!
    const params = [Number(roomId), date, shift];
    const doctorFilter = doctorId ? " AND doctorId = ?" : "";
    if (doctorId) params.push(Number(doctorId));
    execute(db, `DELETE FROM doctor_schedules WHERE roomId = ? AND date = ? AND shift = ?${doctorFilter};`, params);

    res.json({ message: doctorId ? "Doctor removed from date schedule" : "Date exception cleared. Restored to master weekly template." });
  } catch (err) {
    res.status(500).json({ error: "Failed to clear date exception" });
  }
});

// POST /api/schedules/reset-week - Clear all exceptions for a date range (SUPER_ADMIN only)
router.post("/reset-week", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { clinicId, startDate, endDate } = req.body;
    if (!clinicId || !startDate || !endDate) {
      res.status(400).json({ error: "clinicId, startDate, and endDate are required" });
      return;
    }

    const db = await getDb();
    const rooms = queryAll<{ id: number }>(db, "SELECT id FROM rooms WHERE clinicId = ?;", [Number(clinicId)]);
    const roomIds = rooms.map((r) => r.id);

    if (roomIds.length > 0) {
      const placeholders = roomIds.map(() => "?").join(",");
      execute(
        db,
        `DELETE FROM doctor_schedules WHERE roomId IN (${placeholders}) AND date >= ? AND date <= ?;`,
        [...roomIds, startDate, endDate]
      );
    }

    res.json({ message: "All date exceptions reset. Week is now 100% synchronized with Master Template." });
  } catch (err) {
    res.status(500).json({ error: "Failed to reset week exceptions" });
  }
});

export default router;
