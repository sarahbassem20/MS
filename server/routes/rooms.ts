import express from "express";
import { getDb, queryAll, queryOne, execute } from "../db";
import { authenticateToken, requireSuperAdmin, AuthenticatedRequest, checkClinicAccess } from "../auth";

const router = express.Router();

// GET /api/rooms
router.get("/", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { clinicId } = req.query;
    const db = await getDb();

    if (clinicId) {
      const cId = Number(clinicId);
      if (!checkClinicAccess(req.user!, cId)) {
        res.status(403).json({ error: "Access denied to this clinic's rooms" });
        return;
      }

      const rooms = queryAll<{ id: number; clinicId: number; name: string; clinicName: string }>(
        db,
        `SELECT r.id, r.clinicId, r.name, c.name as clinicName
         FROM rooms r
         JOIN clinics c ON c.id = r.clinicId
         WHERE r.clinicId = ?
         ORDER BY r.id ASC;`,
        [cId]
      );
      res.json({ rooms });
    } else {
      if (req.user!.role !== "SUPER_ADMIN") {
        res.status(403).json({ error: "Clinic ID is required for non-admin users" });
        return;
      }

      const rooms = queryAll<{ id: number; clinicId: number; name: string; clinicName: string }>(
        db,
        `SELECT r.id, r.clinicId, r.name, c.name as clinicName
         FROM rooms r
         JOIN clinics c ON c.id = r.clinicId
         ORDER BY r.clinicId ASC, r.id ASC;`
      );
      res.json({ rooms });
    }
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

// POST /api/rooms (SUPER_ADMIN only)
router.post("/", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { clinicId, name } = req.body;

    if (!clinicId || !name || !name.trim()) {
      res.status(400).json({ error: "Clinic ID and Room name are required" });
      return;
    }

    const db = await getDb();
    const clinic = queryOne(db, "SELECT id FROM clinics WHERE id = ?;", [Number(clinicId)]);
    if (!clinic) {
      res.status(404).json({ error: "Clinic not found" });
      return;
    }

    const result = execute(db, "INSERT INTO rooms (clinicId, name) VALUES (?, ?);", [
      Number(clinicId),
      name.trim(),
    ]);

    const newRoom = queryOne(
      db,
      `SELECT r.id, r.clinicId, r.name, c.name as clinicName
       FROM rooms r
       JOIN clinics c ON c.id = r.clinicId
       WHERE r.id = ?;`,
      [result.lastInsertRowid]
    );

    res.status(201).json({ room: newRoom });
  } catch (err) {
    res.status(500).json({ error: "Failed to create room" });
  }
});

// PUT /api/rooms/:id (SUPER_ADMIN only)
router.put("/:id", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const roomId = Number(req.params.id);
    const { name, clinicId } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ error: "Room name is required" });
      return;
    }

    const db = await getDb();
    const existing = queryOne(db, "SELECT id FROM rooms WHERE id = ?;", [roomId]);
    if (!existing) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    execute(
      db,
      "UPDATE rooms SET name = ?, clinicId = COALESCE(?, clinicId) WHERE id = ?;",
      [name.trim(), clinicId ? Number(clinicId) : null, roomId]
    );

    const updated = queryOne(
      db,
      `SELECT r.id, r.clinicId, r.name, c.name as clinicName
       FROM rooms r
       JOIN clinics c ON c.id = r.clinicId
       WHERE r.id = ?;`,
      [roomId]
    );

    res.json({ room: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to update room" });
  }
});

// DELETE /api/rooms/:id (SUPER_ADMIN only)
router.delete("/:id", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const roomId = Number(req.params.id);
    const db = await getDb();
    execute(db, "DELETE FROM rooms WHERE id = ?;", [roomId]);
    res.json({ message: "Room deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete room" });
  }
});

export default router;
