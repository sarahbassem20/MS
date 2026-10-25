import express from "express";
import bcrypt from "bcryptjs";
import { getDb, queryOne, queryAll, execute } from "../db";
import { generateToken, authenticateToken, AuthenticatedRequest } from "../auth";

const router = express.Router();

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: "Username and Password are required" });
      return;
    }

    const db = await getDb();
    const user = queryOne<{
      id: number;
      name: string;
      dob: string;
      username: string;
      nationalId: string;
      password: string;
      role: "SUPER_ADMIN" | "USER";
      isActive: number;
      canAddTasks: number;
    }>(db, "SELECT * FROM users WHERE username = ?;", [username.trim()]);

    if (!user) {
      res.status(401).json({ error: "Invalid Username or Password" });
      return;
    }

    const isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) {
      res.status(401).json({ error: "Invalid Username or Password" });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ error: "This account is inactive. Contact the administrator." });
      return;
    }

    // Get assigned clinics
    const clinicRows = queryAll<{ clinicId: number; name: string }>(
      db,
      `SELECT c.id as clinicId, c.name 
       FROM user_clinics uc 
       JOIN clinics c ON c.id = uc.clinicId 
       WHERE uc.userId = ?;`,
      [user.id]
    );

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        dob: user.dob,
        nationalId: user.nationalId,
        role: user.role,
        isActive: !!user.isActive,
        canAddTasks: !!user.canAddTasks,
        assignedClinics: clinicRows.map((c) => ({ id: c.clinicId, name: c.name })),
      },
    });
  } catch (err: any) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error during login" });
  }
});

// GET /api/auth/me
router.get("/me", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const db = await getDb();
    const user = queryOne<{
      id: number;
      name: string;
      dob: string;
      username: string;
      nationalId: string;
      role: "SUPER_ADMIN" | "USER";
      isActive: number;
      canAddTasks: number;
    }>(db, "SELECT id, name, dob, username, nationalId, role, isActive FROM users WHERE id = ?;", [req.user.id]);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const clinicRows = queryAll<{ clinicId: number; name: string }>(
      db,
      `SELECT c.id as clinicId, c.name 
       FROM user_clinics uc 
       JOIN clinics c ON c.id = uc.clinicId 
       WHERE uc.userId = ?;`,
      [user.id]
    );

    res.json({
      user: {
        ...user,
        canAddTasks: !!user.canAddTasks,
        assignedClinics: clinicRows.map((c) => ({ id: c.clinicId, name: c.name })),
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// POST /api/auth/change-password
router.post("/change-password", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "Current and new password are required" });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: "New password must be at least 6 characters" });
      return;
    }

    const db = await getDb();
    const user = queryOne<{ password: string }>(
      db,
      "SELECT password FROM users WHERE id = ?;",
      [req.user!.id]
    );

    if (!user || !bcrypt.compareSync(currentPassword, user.password)) {
      res.status(400).json({ error: "Incorrect current password" });
      return;
    }

    const newHashed = bcrypt.hashSync(newPassword, 10);
    execute(db, "UPDATE users SET password = ? WHERE id = ?;", [newHashed, req.user!.id]);

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to change password" });
  }
});

export default router;
