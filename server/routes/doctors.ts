import express from "express";
import { getDb, queryAll, queryOne, execute } from "../db";
import { authenticateToken, requireSuperAdmin } from "../auth";

const router = express.Router();

// GET /api/doctors
router.get("/", authenticateToken, async (req, res) => {
  try {
    const db = await getDb();
    const { clinicId } = req.query;

    let doctors = [];
    if (clinicId) {
      doctors = queryAll<{ id: number; name: string; specialist: string }>(
        db,
        `SELECT d.id, d.name, d.specialist 
         FROM doctors d
         JOIN doctor_clinics dc ON dc.doctorId = d.id
         WHERE dc.clinicId = ?
         ORDER BY d.id ASC;`,
        [Number(clinicId)]
      );
    } else {
      doctors = queryAll<{ id: number; name: string; specialist: string }>(
        db,
        "SELECT id, name, specialist FROM doctors ORDER BY id ASC;"
      );
    }

    const doctorsWithClinics = doctors.map((d) => {
      const clinics = queryAll<{ id: number; name: string }>(
        db,
        `SELECT c.id, c.name 
         FROM doctor_clinics dc 
         JOIN clinics c ON c.id = dc.clinicId 
         WHERE dc.doctorId = ?;`,
        [d.id]
      );
      return {
        ...d,
        assignedClinics: clinics,
      };
    });

    res.json({ doctors: doctorsWithClinics });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch doctors" });
  }
});

// POST /api/doctors (SUPER_ADMIN only)
router.post("/", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { name, specialist, clinicIds = [] } = req.body;

    if (!name || !specialist) {
      res.status(400).json({ error: "Doctor name and specialist are required" });
      return;
    }

    const db = await getDb();
    const result = execute(db, "INSERT INTO doctors (name, specialist) VALUES (?, ?);", [
      name.trim(),
      specialist.trim(),
    ]);
    const doctorId = result.lastInsertRowid;

    if (Array.isArray(clinicIds)) {
      for (const cId of clinicIds) {
        execute(db, "INSERT OR IGNORE INTO doctor_clinics (doctorId, clinicId) VALUES (?, ?);", [
          doctorId,
          cId,
        ]);
      }
    }

    const newDoctor = queryOne(db, "SELECT * FROM doctors WHERE id = ?;", [doctorId]);
    const assignedClinics = queryAll(
      db,
      `SELECT c.id, c.name FROM doctor_clinics dc JOIN clinics c ON c.id = dc.clinicId WHERE dc.doctorId = ?;`,
      [doctorId]
    );

    res.status(201).json({ doctor: { ...newDoctor, assignedClinics } });
  } catch (err) {
    res.status(500).json({ error: "Failed to create doctor" });
  }
});

// PUT /api/doctors/:id (SUPER_ADMIN only)
router.put("/:id", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const doctorId = Number(req.params.id);
    const { name, specialist, clinicIds } = req.body;

    const db = await getDb();
    const existing = queryOne(db, "SELECT id FROM doctors WHERE id = ?;", [doctorId]);
    if (!existing) {
      res.status(404).json({ error: "Doctor not found" });
      return;
    }

    execute(
      db,
      "UPDATE doctors SET name = COALESCE(?, name), specialist = COALESCE(?, specialist) WHERE id = ?;",
      [name ? name.trim() : null, specialist ? specialist.trim() : null, doctorId]
    );

    if (Array.isArray(clinicIds)) {
      execute(db, "DELETE FROM doctor_clinics WHERE doctorId = ?;", [doctorId]);
      for (const cId of clinicIds) {
        execute(db, "INSERT OR IGNORE INTO doctor_clinics (doctorId, clinicId) VALUES (?, ?);", [
          doctorId,
          cId,
        ]);
      }
    }

    const updated = queryOne(db, "SELECT * FROM doctors WHERE id = ?;", [doctorId]);
    const assignedClinics = queryAll(
      db,
      `SELECT c.id, c.name FROM doctor_clinics dc JOIN clinics c ON c.id = dc.clinicId WHERE dc.doctorId = ?;`,
      [doctorId]
    );

    res.json({ doctor: { ...updated, assignedClinics } });
  } catch (err) {
    res.status(500).json({ error: "Failed to update doctor" });
  }
});

// DELETE /api/doctors/:id (SUPER_ADMIN only)
router.delete("/:id", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const doctorId = Number(req.params.id);
    const db = await getDb();
    execute(db, "DELETE FROM doctors WHERE id = ?;", [doctorId]);
    res.json({ message: "Doctor deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete doctor" });
  }
});

export default router;
