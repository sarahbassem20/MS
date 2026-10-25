import express from "express";
import bcrypt from "bcryptjs";
import { getDb, queryAll, queryOne, execute } from "../db";
import { authenticateToken, requireSuperAdmin, AuthenticatedRequest } from "../auth";

const router = express.Router();

// GET /api/users (SUPER_ADMIN only)
router.get("/", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const users = queryAll<{
      id: number;
      name: string;
      dob: string;
      username: string;
      nationalId: string;
      role: "SUPER_ADMIN" | "USER";
      isActive: number;
      canAddTasks: number;
    }>(db, "SELECT id, name, dob, username, nationalId, role, isActive, canAddTasks FROM users ORDER BY id ASC;");

    // Fetch assigned clinics for each user
    const usersWithClinics = users.map((u) => {
      const clinics = queryAll<{ id: number; name: string }>(
        db,
        `SELECT c.id, c.name 
         FROM user_clinics uc 
         JOIN clinics c ON c.id = uc.clinicId 
         WHERE uc.userId = ?;`,
        [u.id]
      );
      return {
        ...u,
        assignedClinics: clinics,
      };
    });

    res.json({ users: usersWithClinics });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// POST /api/users (SUPER_ADMIN only)
router.post("/", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { name, dob, username, nationalId, password, role = "USER", clinicIds = [] } = req.body;

    if (!name || !dob || !username || !nationalId || !password) {
      res.status(400).json({ error: "Name, date of birth, username, national ID, and password are required" });
      return;
    }

    if (!["SUPER_ADMIN", "USER"].includes(role)) {
      res.status(400).json({ error: "Invalid role" });
      return;
    }

    const db = await getDb();

    // Check unique nationalId
    const existing = queryOne(db, "SELECT id FROM users WHERE nationalId = ?;", [nationalId.trim()]);
    if (existing) {
      res.status(400).json({ error: "National ID is already registered" });
      return;
    }

    const existingUsername = queryOne(db, "SELECT id FROM users WHERE username = ?;", [username.trim()]);
    if (existingUsername) {
      res.status(400).json({ error: "Username is already registered" });
      return;
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = execute(
      db,
      "INSERT INTO users (name, dob, username, nationalId, password, role) VALUES (?, ?, ?, ?, ?, ?);",
      [name.trim(), dob.trim(), username.trim(), nationalId.trim(), hashedPassword, role]
    );

    const userId = result.lastInsertRowid;

    // Assign clinics
    if (Array.isArray(clinicIds)) {
      for (const clinicId of clinicIds) {
        execute(db, "INSERT OR IGNORE INTO user_clinics (userId, clinicId) VALUES (?, ?);", [userId, clinicId]);
      }
    }

    const newUser = queryOne(db, "SELECT id, name, dob, username, nationalId, role, isActive, canAddTasks FROM users WHERE id = ?;", [userId]);
    const assignedClinics = queryAll(
      db,
      `SELECT c.id, c.name FROM user_clinics uc JOIN clinics c ON c.id = uc.clinicId WHERE uc.userId = ?;`,
      [userId]
    );

    res.status(201).json({ user: { ...newUser, assignedClinics } });
  } catch (err) {
    console.error("Error creating user:", err);
    res.status(500).json({ error: "Failed to create user" });
  }
});

// PUT /api/users/:id (SUPER_ADMIN only)
router.put("/:id", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { name, dob, username, nationalId, password, role, clinicIds } = req.body;

    const db = await getDb();
    const existing = queryOne(db, "SELECT id FROM users WHERE id = ?;", [userId]);
    if (!existing) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Check unique nationalId if changed
    if (nationalId) {
      const dup = queryOne(db, "SELECT id FROM users WHERE nationalId = ? AND id != ?;", [
        nationalId.trim(),
        userId,
      ]);
      if (dup) {
        res.status(400).json({ error: "National ID is already registered to another user" });
        return;
      }
    }

    if (username) {
      const dup = queryOne(db, "SELECT id FROM users WHERE username = ? AND id != ?;", [username.trim(), userId]);
      if (dup) {
        res.status(400).json({ error: "Username is already registered to another user" });
        return;
      }
    }

    // Update fields
    if (password && password.trim().length > 0) {
      const hashedPassword = bcrypt.hashSync(password, 10);
      execute(
        db,
        "UPDATE users SET name = COALESCE(?, name), dob = COALESCE(?, dob), username = COALESCE(?, username), nationalId = COALESCE(?, nationalId), password = ?, role = COALESCE(?, role) WHERE id = ?;",
        [name ? name.trim() : null, dob ? dob.trim() : null, username ? username.trim() : null, nationalId ? nationalId.trim() : null, hashedPassword, role || null, userId]
      );
    } else {
      execute(
        db,
        "UPDATE users SET name = COALESCE(?, name), dob = COALESCE(?, dob), username = COALESCE(?, username), nationalId = COALESCE(?, nationalId), role = COALESCE(?, role) WHERE id = ?;",
        [name ? name.trim() : null, dob ? dob.trim() : null, username ? username.trim() : null, nationalId ? nationalId.trim() : null, role || null, userId]
      );
    }

    // Update clinic assignments if provided
    if (Array.isArray(clinicIds)) {
      execute(db, "DELETE FROM user_clinics WHERE userId = ?;", [userId]);
      for (const clinicId of clinicIds) {
        execute(db, "INSERT OR IGNORE INTO user_clinics (userId, clinicId) VALUES (?, ?);", [userId, clinicId]);
      }
    }

    const updated = queryOne(db, "SELECT id, name, dob, username, nationalId, role, isActive, canAddTasks FROM users WHERE id = ?;", [userId]);
    const assignedClinics = queryAll(
      db,
      `SELECT c.id, c.name FROM user_clinics uc JOIN clinics c ON c.id = uc.clinicId WHERE uc.userId = ?;`,
      [userId]
    );

    res.json({ user: { ...updated, assignedClinics } });
  } catch (err) {
    res.status(500).json({ error: "Failed to update user" });
  }
});

// PATCH /api/users/:id/activation (SUPER_ADMIN only)
router.patch("/:id/activation", authenticateToken, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = Number(req.params.id);
    if (req.user!.id === userId) {
      res.status(400).json({ error: "Cannot change your own activation status" });
      return;
    }

    const isActive = req.body?.isActive ? 1 : 0;
    const db = await getDb();
    const result = execute(db, "UPDATE users SET isActive = ? WHERE id = ?;", [isActive, userId]);
    if (result.changes === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ isActive: !!isActive });
  } catch (err) {
    res.status(500).json({ error: "Failed to update account activation" });
  }
});

// DELETE /api/users/:id (SUPER_ADMIN only)
router.delete("/:id", authenticateToken, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = Number(req.params.id);
    if (req.user!.id === userId) {
      res.status(400).json({ error: "Cannot delete your own account" });
      return;
    }

    const db = await getDb();
    execute(db, "DELETE FROM users WHERE id = ?;", [userId]);
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete user" });
  }
});

export default router;
