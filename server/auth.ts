import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getDb, queryAll, queryOne } from "./db";

const JWT_SECRET = process.env.JWT_SECRET || "clinic-management-secure-jwt-secret-key-2026";

export interface AuthUser {
  id: number;
  name: string;
  nationalId: string;
  role: "SUPER_ADMIN" | "USER";
  canAddTasks?: boolean;
  assignedClinics?: number[];
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export function generateToken(user: { id: number; name: string; nationalId: string; role: string }): string {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      nationalId: user.nationalId,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json({ error: "Access token required" });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    const db = await getDb();

    // Fetch user details and assigned clinics from DB
    const user = queryOne<{ id: number; name: string; nationalId: string; role: "SUPER_ADMIN" | "USER"; canAddTasks: number }>(
      db,
      "SELECT id, name, nationalId, role, canAddTasks FROM users WHERE id = ?;",
      [decoded.id]
    );

    if (!user) {
      res.status(401).json({ error: "User no longer exists" });
      return;
    }

    const assignedClinicsRows = queryAll<{ clinicId: number }>(
      db,
      "SELECT clinicId FROM user_clinics WHERE userId = ?;",
      [user.id]
    );
    const assignedClinics = assignedClinicsRows.map((r) => r.clinicId);

    req.user = {
      ...user,
      canAddTasks: !!user.canAddTasks,
      assignedClinics,
    };

    next();
  } catch (err) {
    res.status(403).json({ error: "Invalid or expired token" });
  }
}

export function requireSuperAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user || req.user.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Access denied. Super Admin privileges required." });
    return;
  }
  next();
}

export function requireTaskAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user || (req.user.role !== "SUPER_ADMIN" && !req.user.canAddTasks)) {
    res.status(403).json({ error: "Task management access required." });
    return;
  }
  next();
}

export function requireTaskCreationAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user || (req.user.role !== "SUPER_ADMIN" && !req.user.canAddTasks)) {
    res.status(403).json({ error: "Only an administrator with task-add access can create tasks." });
    return;
  }
  next();
}

export function checkClinicAccess(user: AuthUser, clinicId: number): boolean {
  if (user.role === "SUPER_ADMIN") return true;
  return !!user.assignedClinics && user.assignedClinics.includes(Number(clinicId));
}
