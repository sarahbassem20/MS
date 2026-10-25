import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { getDb } from "./server/db";
import authRoutes from "./server/routes/auth";
import clinicsRoutes from "./server/routes/clinics";
import usersRoutes from "./server/routes/users";
import doctorsRoutes from "./server/routes/doctors";
import roomsRoutes from "./server/routes/rooms";
import schedulesRoutes from "./server/routes/schedules";
import tasksRoutes from "./server/routes/tasks";
import reportsRoutes from "./server/routes/reports";

async function startServer() {
  // Initialize Database
  await getDb();

  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Mount API Routes
  app.use("/api/auth", authRoutes);
  app.use("/api/clinics", clinicsRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/doctors", doctorsRoutes);
  app.use("/api/rooms", roomsRoutes);
  app.use("/api/schedules", schedulesRoutes);
  app.use("/api/tasks", tasksRoutes);
  app.use("/api/reports", reportsRoutes);

  // Vite middleware for development vs static build for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Clinic Management Server listening at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
