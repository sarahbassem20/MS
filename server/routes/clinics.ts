import express from "express";
import { getDb, queryAll, queryOne, execute } from "../db";
import { authenticateToken, requireSuperAdmin, AuthenticatedRequest, checkClinicAccess } from "../auth";

const router = express.Router();

// GET /api/clinics - List clinics (SUPER_ADMIN sees all, USER sees assigned)
router.get("/", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const db = await getDb();
    const user = req.user!;

    let clinics = [];
    if (user.role === "SUPER_ADMIN") {
      clinics = queryAll<{ id: number; name: string }>(
        db,
        `SELECT c.id, c.name,
          (SELECT COUNT(*) FROM rooms r WHERE r.clinicId = c.id) as roomCount,
          (SELECT COUNT(*) FROM doctor_clinics dc WHERE dc.clinicId = c.id) as doctorCount,
          (SELECT COUNT(*) FROM user_clinics uc WHERE uc.clinicId = c.id) as employeeCount
         FROM clinics c
         ORDER BY c.id ASC;`
      );
    } else {
      clinics = queryAll<{ id: number; name: string }>(
        db,
        `SELECT c.id, c.name,
          (SELECT COUNT(*) FROM rooms r WHERE r.clinicId = c.id) as roomCount,
          (SELECT COUNT(*) FROM doctor_clinics dc WHERE dc.clinicId = c.id) as doctorCount,
          (SELECT COUNT(*) FROM user_clinics uc WHERE uc.clinicId = c.id) as employeeCount
         FROM clinics c
         JOIN user_clinics uc ON uc.clinicId = c.id
         WHERE uc.userId = ?
         ORDER BY c.id ASC;`,
        [user.id]
      );
    }

    res.json({ clinics });
  } catch (err) {
    console.error("Error fetching clinics:", err);
    res.status(500).json({ error: "Failed to fetch clinics" });
  }
});

// GET /api/clinics/:id
router.get("/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const clinicId = Number(req.params.id);
    if (!checkClinicAccess(req.user!, clinicId)) {
      res.status(403).json({ error: "Access denied to this clinic" });
      return;
    }

    const db = await getDb();
    const clinic = queryOne<{ id: number; name: string }>(
      db,
      "SELECT id, name FROM clinics WHERE id = ?;",
      [clinicId]
    );

    if (!clinic) {
      res.status(404).json({ error: "Clinic not found" });
      return;
    }

    const rooms = queryAll(db, "SELECT id, name FROM rooms WHERE clinicId = ? ORDER BY id ASC;", [clinicId]);
    const doctors = queryAll(
      db,
      `SELECT d.id, d.name, d.specialist 
       FROM doctors d 
       JOIN doctor_clinics dc ON dc.doctorId = d.id 
       WHERE dc.clinicId = ?;`,
      [clinicId]
    );
    const employees = queryAll(
      db,
      `SELECT u.id, u.name, u.nationalId 
       FROM users u 
       JOIN user_clinics uc ON uc.userId = u.id 
       WHERE uc.clinicId = ?;`,
      [clinicId]
    );

    res.json({ clinic: { ...clinic, rooms, doctors, employees } });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch clinic details" });
  }
});

// POST /api/clinics (SUPER_ADMIN only)
router.post("/", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ error: "Clinic name is required" });
      return;
    }

    const db = await getDb();
    const result = execute(db, "INSERT INTO clinics (name) VALUES (?);", [name.trim()]);
    const newClinic = queryOne(db, "SELECT * FROM clinics WHERE id = ?;", [result.lastInsertRowid]);

    res.status(201).json({ clinic: newClinic });
  } catch (err) {
    res.status(500).json({ error: "Failed to create clinic" });
  }
});

// PUT /api/clinics/:id (SUPER_ADMIN only)
router.put("/:id", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const clinicId = Number(req.params.id);
    const { name } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ error: "Clinic name is required" });
      return;
    }

    const db = await getDb();
    const existing = queryOne(db, "SELECT id FROM clinics WHERE id = ?;", [clinicId]);
    if (!existing) {
      res.status(404).json({ error: "Clinic not found" });
      return;
    }

    execute(db, "UPDATE clinics SET name = ? WHERE id = ?;", [name.trim(), clinicId]);
    const updated = queryOne(db, "SELECT * FROM clinics WHERE id = ?;", [clinicId]);

    res.json({ clinic: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to update clinic" });
  }
});

// DELETE /api/clinics/:id (SUPER_ADMIN only)
router.delete("/:id", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const clinicId = Number(req.params.id);
    const db = await getDb();

    const existing = queryOne(db, "SELECT id FROM clinics WHERE id = ?;", [clinicId]);
    if (!existing) {
      res.status(404).json({ error: "Clinic not found" });
      return;
    }

    execute(db, "DELETE FROM clinics WHERE id = ?;", [clinicId]);
    res.json({ message: "Clinic deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete clinic" });
  }
});

export default router;
