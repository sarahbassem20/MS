import initSqlJs, { Database } from "sql.js";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";

let dbInstance: Database | null = null;
const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "clinic_management.sqlite");

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

export async function getDb(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    try {
      const fileBuffer = fs.readFileSync(DB_PATH);
      dbInstance = new SQL.Database(fileBuffer);
    } catch (e) {
      console.error("Error reading existing DB file, creating new database:", e);
      dbInstance = new SQL.Database();
    }
  } else {
    dbInstance = new SQL.Database();
  }

  // Enable foreign keys
  dbInstance.run("PRAGMA foreign_keys = ON;");

  // Initialize schema
  initSchema(dbInstance);

  // Seed default data if empty
  await seedDefaultData(dbInstance);
  ensureFixedTasks(dbInstance);

  // Save database to disk
  saveDb();

  return dbInstance;
}

export function saveDb(): void {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error("Error saving DB to disk:", err);
  }
}

function initSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS clinics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      dob TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      nationalId TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('SUPER_ADMIN', 'USER'))
    );

    CREATE TABLE IF NOT EXISTS user_clinics (
      userId INTEGER NOT NULL,
      clinicId INTEGER NOT NULL,
      PRIMARY KEY (userId, clinicId),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (clinicId) REFERENCES clinics(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS doctors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      specialist TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS doctor_clinics (
      doctorId INTEGER NOT NULL,
      clinicId INTEGER NOT NULL,
      PRIMARY KEY (doctorId, clinicId),
      FOREIGN KEY (doctorId) REFERENCES doctors(id) ON DELETE CASCADE,
      FOREIGN KEY (clinicId) REFERENCES clinics(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clinicId INTEGER NOT NULL,
      name TEXT NOT NULL,
      FOREIGN KEY (clinicId) REFERENCES clinics(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS doctor_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctorId INTEGER,
      roomId INTEGER NOT NULL,
      date TEXT NOT NULL,
      shift TEXT NOT NULL CHECK(shift IN ('MORNING', 'EVENING')),
      isException INTEGER DEFAULT 1,
      note TEXT,
      FOREIGN KEY (doctorId) REFERENCES doctors(id) ON DELETE CASCADE,
      FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE,
      UNIQUE(roomId, date, shift, doctorId)
    );

    CREATE TABLE IF NOT EXISTS doctor_schedule_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clinicId INTEGER NOT NULL,
      roomId INTEGER NOT NULL,
      dayOfWeek INTEGER NOT NULL, -- 0 for Sunday, 1 for Monday, ..., 6 for Saturday
      shift TEXT NOT NULL CHECK(shift IN ('MORNING', 'EVENING')),
      doctorId INTEGER NOT NULL,
      FOREIGN KEY (clinicId) REFERENCES clinics(id) ON DELETE CASCADE,
      FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (doctorId) REFERENCES doctors(id) ON DELETE CASCADE,
      UNIQUE(roomId, dayOfWeek, shift, doctorId)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      clinicId INTEGER NOT NULL,
      shift TEXT NOT NULL CHECK(shift IN ('MORNING', 'EVENING')),
      startDate TEXT NOT NULL,
      endDate TEXT,
      recurrenceType TEXT NOT NULL CHECK(recurrenceType IN ('NONE', 'DAILY')),
      FOREIGN KEY (clinicId) REFERENCES clinics(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_instances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      taskId INTEGER,
      clinicId INTEGER NOT NULL,
      shift TEXT NOT NULL CHECK(shift IN ('MORNING', 'EVENING')),
      date TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE SET NULL,
      FOREIGN KEY (clinicId) REFERENCES clinics(id) ON DELETE CASCADE,
      UNIQUE(taskId, date)
    );

    CREATE TABLE IF NOT EXISTS task_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      taskInstanceId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      completedAt TEXT NOT NULL,
      FOREIGN KEY (taskInstanceId) REFERENCES task_instances(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(taskInstanceId, userId)
    );

    CREATE TABLE IF NOT EXISTS app_migrations (
      name TEXT PRIMARY KEY,
      appliedAt TEXT NOT NULL
    );

    -- Create indexes for fast querying and constraint checks
    CREATE INDEX IF NOT EXISTS idx_schedules_date_shift ON doctor_schedules(date, shift);
    CREATE INDEX IF NOT EXISTS idx_schedules_doctor_date ON doctor_schedules(doctorId, date, shift);
    CREATE INDEX IF NOT EXISTS idx_sched_templates_clinic ON doctor_schedule_templates(clinicId, dayOfWeek, shift);
    CREATE INDEX IF NOT EXISTS idx_sched_templates_doctor ON doctor_schedule_templates(doctorId, dayOfWeek, shift);
    CREATE INDEX IF NOT EXISTS idx_task_instances_date_clinic ON task_instances(clinicId, date, shift);
    CREATE INDEX IF NOT EXISTS idx_task_instances_task ON task_instances(taskId);
    CREATE INDEX IF NOT EXISTS idx_task_completions_user ON task_completions(userId);
    CREATE INDEX IF NOT EXISTS idx_task_completions_instance_user ON task_completions(taskInstanceId, userId);
  `);

  // Migrate legacy tables
  migrateUsersTable(db);
  migrateUserActivation(db);
  migrateCalendarTasks(db);
  migrateTaskInstanceTargets(db);
  removeDefaultTasks(db);
  migrateTaskCompletionsTable(db);
  migrateDoctorSchedulesAndTemplates(db);
  migrateMultipleDoctorsPerSlot(db);
}

function migrateUserActivation(db: Database) {
  const columns = queryAll<{ name: string }>(db, "PRAGMA table_info(users);");
  if (!columns.some((column) => column.name === "isActive")) {
    db.run("ALTER TABLE users ADD COLUMN isActive INTEGER NOT NULL DEFAULT 1;");
  }
  if (!columns.some((column) => column.name === "canAddTasks")) {
    db.run("ALTER TABLE users ADD COLUMN canAddTasks INTEGER NOT NULL DEFAULT 0;");
  }
}

function migrateCalendarTasks(db: Database) {
  const columns = queryAll<{ name: string }>(db, "PRAGMA table_info(tasks);");
  if (!columns.some((column) => column.name === "relativeDays")) {
    db.run("ALTER TABLE tasks ADD COLUMN relativeDays INTEGER;");
  }
  if (!columns.some((column) => column.name === "relativeDirection")) {
    db.run("ALTER TABLE tasks ADD COLUMN relativeDirection TEXT;");
  }
  if (!columns.some((column) => column.name === "isFixed")) {
    db.run("ALTER TABLE tasks ADD COLUMN isFixed INTEGER NOT NULL DEFAULT 0;");
  }
}

function migrateTaskInstanceTargets(db: Database) {
  const columns = queryAll<{ name: string }>(db, "PRAGMA table_info(task_instances);");
  if (!columns.some((column) => column.name === "targetDate")) {
    db.run("ALTER TABLE task_instances ADD COLUMN targetDate TEXT;");
  }

  const instances = queryAll<{
    id: number;
    date: string;
    name: string;
    relativeDays: number | null;
    relativeDirection: string | null;
  }>(
    db,
    `SELECT ti.id, ti.date, ti.name, t.relativeDays, t.relativeDirection
     FROM task_instances ti
     LEFT JOIN tasks t ON t.id = ti.taskId
     WHERE ti.targetDate IS NULL;`
  );
  for (const instance of instances) {
    db.run("UPDATE task_instances SET targetDate = ? WHERE id = ?;", [
      getTaskTargetDate(instance.date, instance.relativeDays, instance.relativeDirection, instance.name),
      instance.id,
    ]);
  }

  const datedNames = queryAll<{ id: number; name: string }>(
    db,
    "SELECT id, name FROM task_instances WHERE name LIKE '% - %';"
  );
  for (const instance of datedNames) {
    const cleanName = instance.name.replace(/ - [A-Z][a-z]+ \d{1,2}, \d{4}$/, "");
    if (cleanName !== instance.name) {
      db.run("UPDATE task_instances SET name = ? WHERE id = ?;", [cleanName, instance.id]);
    }
  }
}

function migrateMultipleDoctorsPerSlot(db: Database) {
  const tables = ["doctor_schedules", "doctor_schedule_templates"];
  for (const table of tables) {
    const schema = queryOne<{ sql: string }>(
      db,
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?;",
      [table]
    );
    if (!schema?.sql || !schema.sql.includes("UNIQUE(roomId, date, shift)") && !schema.sql.includes("UNIQUE(roomId, dayOfWeek, shift)")) {
      continue;
    }

    const tempTable = `${table}_multi_tmp`;
    db.run("PRAGMA foreign_keys = OFF;");
    db.run(`DROP TABLE IF EXISTS ${tempTable};`);
    if (table === "doctor_schedules") {
      db.run(`CREATE TABLE ${tempTable} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doctorId INTEGER,
        roomId INTEGER NOT NULL,
        date TEXT NOT NULL,
        shift TEXT NOT NULL CHECK(shift IN ('MORNING', 'EVENING')),
        status TEXT DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED', 'CANCELLED')),
        isException INTEGER DEFAULT 1,
        note TEXT,
        FOREIGN KEY (doctorId) REFERENCES doctors(id) ON DELETE CASCADE,
        FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE,
        UNIQUE(roomId, date, shift, doctorId)
      );`);
      db.run(`INSERT OR IGNORE INTO ${tempTable} (id, doctorId, roomId, date, shift, status, isException, note)
        SELECT ds.id, ds.doctorId, ds.roomId, ds.date, ds.shift, COALESCE(ds.status, 'SCHEDULED'), COALESCE(ds.isException, 1), ds.note
        FROM ${table} ds
        JOIN rooms r ON r.id = ds.roomId
        LEFT JOIN doctors d ON d.id = ds.doctorId
        WHERE ds.doctorId IS NULL OR d.id IS NOT NULL;`);
    } else {
      db.run(`CREATE TABLE ${tempTable} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clinicId INTEGER NOT NULL,
        roomId INTEGER NOT NULL,
        dayOfWeek INTEGER NOT NULL,
        shift TEXT NOT NULL CHECK(shift IN ('MORNING', 'EVENING')),
        doctorId INTEGER NOT NULL,
        FOREIGN KEY (clinicId) REFERENCES clinics(id) ON DELETE CASCADE,
        FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (doctorId) REFERENCES doctors(id) ON DELETE CASCADE,
        UNIQUE(roomId, dayOfWeek, shift, doctorId)
      );`);
      db.run(`INSERT OR IGNORE INTO ${tempTable} (id, clinicId, roomId, dayOfWeek, shift, doctorId)
        SELECT dst.id, dst.clinicId, dst.roomId, dst.dayOfWeek, dst.shift, dst.doctorId
        FROM ${table} dst
        JOIN clinics c ON c.id = dst.clinicId
        JOIN rooms r ON r.id = dst.roomId
        JOIN doctors d ON d.id = dst.doctorId;`);
    }
    db.run(`DROP TABLE ${table};`);
    db.run(`ALTER TABLE ${tempTable} RENAME TO ${table};`);
    db.run("PRAGMA foreign_keys = ON;");
  }
}

function removeDefaultTasks(db: Database) {
  const defaultTaskNames = [
    "فكر العملاء بتوع بكرة (Reminder for Tomorrow's Patients)",
    "remember tomorrow",
    "Reminder for Tomorrow's Patients",
    "Remember Patient",
    "Lost Patient",
    "lost patiant",
  ];
  const placeholders = defaultTaskNames.map(() => "?").join(",");
  const defaultTasks = queryAll<{ id: number }>(
    db,
    `SELECT id FROM tasks WHERE name IN (${placeholders}) AND COALESCE(isFixed, 0) = 0;`,
    defaultTaskNames
  );
  const taskIds = defaultTasks.map((task) => task.id);
  if (taskIds.length === 0) return;

  const taskPlaceholders = taskIds.map(() => "?").join(",");
  db.run(
    `DELETE FROM task_completions WHERE taskInstanceId IN (SELECT id FROM task_instances WHERE taskId IN (${taskPlaceholders}));`,
    taskIds
  );
  db.run(`DELETE FROM task_instances WHERE taskId IN (${taskPlaceholders});`, taskIds);
  db.run(`DELETE FROM tasks WHERE id IN (${taskPlaceholders});`, taskIds);
}

function migrateUsersTable(db: Database) {
  const columns = queryAll<{ name: string }>(db, "PRAGMA table_info(users);");

  try {
    if (!columns.some((column) => column.name === "username")) {
      db.run("ALTER TABLE users ADD COLUMN username TEXT;");
    }

    const users = queryAll<{
      id: number;
      name: string;
      username: string | null;
      nationalId: string;
      role: "SUPER_ADMIN" | "USER";
    }>(db, "SELECT id, name, username, nationalId, role FROM users ORDER BY id ASC;");

    const usedUsernames = new Set<string>();
    for (const user of users) {
      let username = user.username && user.username !== user.nationalId ? user.username : "";
      if (!username) {
        const baseUsername = user.role === "SUPER_ADMIN"
          ? "admin"
          : user.name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || `user${user.id}`;
        username = baseUsername;
        let suffix = 2;
        while (usedUsernames.has(username)) {
          username = `${baseUsername}${suffix++}`;
        }
        db.run("UPDATE users SET username = ? WHERE id = ?;", [username, user.id]);
      }
      usedUsernames.add(username);
    }

    db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);");
  } catch (err) {
    console.error("Users username migration error:", err);
  }
}

function migrateDoctorSchedulesAndTemplates(db: Database) {
  try {
    // 1. Ensure doctor_schedules table allows NULL for doctorId (so slots can be marked OFF)
    const schedTableInfo = queryAll(db, "PRAGMA table_info(doctor_schedules);");
    const doctorIdCol = schedTableInfo.find((col: any) => col.name === "doctorId");
    const hasIsException = schedTableInfo.some((col: any) => col.name === "isException");
    const hasStatus = schedTableInfo.some((col: any) => col.name === "status");

    if (doctorIdCol && doctorIdCol.notnull === 1) {
      console.log("Migrating doctor_schedules to allow nullable doctorId and status column...");
      db.run("PRAGMA foreign_keys = OFF;");
      db.run(`
        CREATE TABLE doctor_schedules_tmp (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          doctorId INTEGER,
          roomId INTEGER NOT NULL,
          date TEXT NOT NULL,
          shift TEXT NOT NULL CHECK(shift IN ('MORNING', 'EVENING')),
          status TEXT DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED', 'CANCELLED')),
          isException INTEGER DEFAULT 1,
          note TEXT,
          FOREIGN KEY (doctorId) REFERENCES doctors(id) ON DELETE CASCADE,
          FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE,
          UNIQUE(roomId, date, shift)
        );
      `);
      db.run(`
        INSERT OR IGNORE INTO doctor_schedules_tmp (id, doctorId, roomId, date, shift, status, isException, note)
        SELECT id, doctorId, roomId, date, shift, 'SCHEDULED', COALESCE(isException, 1), note FROM doctor_schedules;
      `);
      db.run("DROP TABLE doctor_schedules;");
      db.run("ALTER TABLE doctor_schedules_tmp RENAME TO doctor_schedules;");
      db.run("CREATE INDEX IF NOT EXISTS idx_schedules_date_shift ON doctor_schedules(date, shift);");
      db.run("CREATE INDEX IF NOT EXISTS idx_schedules_doctor_date ON doctor_schedules(doctorId, date, shift);");
      db.run("PRAGMA foreign_keys = ON;");
      console.log("doctor_schedules migration complete!");
    } else {
      if (!hasIsException) {
        try {
          db.run("ALTER TABLE doctor_schedules ADD COLUMN isException INTEGER DEFAULT 1;");
          db.run("ALTER TABLE doctor_schedules ADD COLUMN note TEXT;");
        } catch (e) { }
      }
      if (!hasStatus) {
        try {
          db.run("ALTER TABLE doctor_schedules ADD COLUMN status TEXT DEFAULT 'SCHEDULED';");
        } catch (e) { }
      }
    }

    // 2. If doctor_schedule_templates is empty, seed recurring templates for all 7 days of the week
    const tmplCountRes = queryOne<{ count: number }>(db, "SELECT COUNT(*) as count FROM doctor_schedule_templates;");
    const tmplCount = tmplCountRes?.count || 0;

    const seededDoctors = queryOne<{ count: number }>(
      db,
      "SELECT COUNT(*) as count FROM doctors WHERE id IN (1, 2, 3, 4, 5);"
    )?.count || 0;
    if (tmplCount === 0 && seededDoctors === 5) {
      console.log("Seeding master weekly doctor schedule templates...");
      // For all 7 days of the week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
      for (let day = 0; day < 7; day++) {
        // Clinic 1:
        // Room 1 (id: 1) Morning -> Dr. Ahmed Taha (id: 1)
        db.run(
          `INSERT OR IGNORE INTO doctor_schedule_templates (clinicId, roomId, dayOfWeek, shift, doctorId)
           VALUES (?, ?, ?, ?, ?);`,
          [1, 1, day, "MORNING", 1]
        );
        // Room 2 (id: 2) Morning -> Dr. Mona Youssef (id: 3)
        db.run(
          `INSERT OR IGNORE INTO doctor_schedule_templates (clinicId, roomId, dayOfWeek, shift, doctorId)
           VALUES (?, ?, ?, ?, ?);`,
          [1, 2, day, "MORNING", 3]
        );
        // Room 1 (id: 1) Evening -> Dr. Mohamed Hassan (id: 2)
        db.run(
          `INSERT OR IGNORE INTO doctor_schedule_templates (clinicId, roomId, dayOfWeek, shift, doctorId)
           VALUES (?, ?, ?, ?, ?);`,
          [1, 1, day, "EVENING", 2]
        );
        // Room 2 (id: 2) Evening -> Dr. Nourhan Adel (id: 5)
        db.run(
          `INSERT OR IGNORE INTO doctor_schedule_templates (clinicId, roomId, dayOfWeek, shift, doctorId)
           VALUES (?, ?, ?, ?, ?);`,
          [1, 2, day, "EVENING", 5]
        );

        // Clinic 2:
        // Room 4 (id: 4) Morning -> Dr. Ali Mostafa (id: 4)
        db.run(
          `INSERT OR IGNORE INTO doctor_schedule_templates (clinicId, roomId, dayOfWeek, shift, doctorId)
           VALUES (?, ?, ?, ?, ?);`,
          [2, 4, day, "MORNING", 4]
        );
        // Room 5 (id: 5) Evening -> Dr. Ahmed Taha (id: 1)
        db.run(
          `INSERT OR IGNORE INTO doctor_schedule_templates (clinicId, roomId, dayOfWeek, shift, doctorId)
           VALUES (?, ?, ?, ?, ?);`,
          [2, 5, day, "EVENING", 1]
        );

        // Clinic 3:
        // Room 6 (id: 6) Morning -> Dr. Mohamed Hassan (id: 2)
        db.run(
          `INSERT OR IGNORE INTO doctor_schedule_templates (clinicId, roomId, dayOfWeek, shift, doctorId)
           VALUES (?, ?, ?, ?, ?);`,
          [3, 6, day, "MORNING", 2]
        );
        // Room 7 (id: 7) Evening -> Dr. Ali Mostafa (id: 4)
        db.run(
          `INSERT OR IGNORE INTO doctor_schedule_templates (clinicId, roomId, dayOfWeek, shift, doctorId)
           VALUES (?, ?, ?, ?, ?);`,
          [3, 7, day, "EVENING", 4]
        );
      }
      console.log("Master weekly schedule templates seeded successfully!");
    }
  } catch (err) {
    console.error("Migration doctor schedules & templates error (non-fatal):", err);
  }
}

function migrateTaskCompletionsTable(db: Database) {
  try {
    // Check if table schema needs migration
    const tableInfo = queryAll(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name='task_completions';");
    if (tableInfo.length > 0 && tableInfo[0].sql) {
      const sqlText = tableInfo[0].sql;
      // If taskInstanceId has UNIQUE constraint by itself rather than composite UNIQUE(taskInstanceId, userId)
      if (sqlText.includes("taskInstanceId INTEGER NOT NULL UNIQUE")) {
        console.log("Migrating task_completions to multi-user composite UNIQUE(taskInstanceId, userId)...");
        db.run(`
          CREATE TABLE task_completions_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            taskInstanceId INTEGER NOT NULL,
            userId INTEGER NOT NULL,
            completedAt TEXT NOT NULL,
            FOREIGN KEY (taskInstanceId) REFERENCES task_instances(id) ON DELETE CASCADE,
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(taskInstanceId, userId)
          );
        `);
        db.run(`
          INSERT OR IGNORE INTO task_completions_new (id, taskInstanceId, userId, completedAt)
          SELECT id, taskInstanceId, userId, completedAt FROM task_completions;
        `);
        db.run("DROP TABLE task_completions;");
        db.run("ALTER TABLE task_completions_new RENAME TO task_completions;");
        db.run("CREATE INDEX IF NOT EXISTS idx_task_completions_user ON task_completions(userId);");
        db.run("CREATE INDEX IF NOT EXISTS idx_task_completions_instance_user ON task_completions(taskInstanceId, userId);");
        console.log("Migration completed successfully!");
      }
    }
  } catch (err) {
    console.error("Migration error (non-fatal):", err);
  }
}

async function seedDefaultData(db: Database) {
  // Check if users exist
  const res = db.exec("SELECT COUNT(*) as count FROM users;");
  const count = res.length > 0 && res[0].values.length > 0 ? (res[0].values[0][0] as number) : 0;

  if (count === 0) {
    console.log("Seeding initial clinic management data...");

    // Password hashes: 'admin123' and 'user123'
    const adminPassHash = bcrypt.hashSync("admin123", 10);
    const userPassHash = bcrypt.hashSync("user123", 10);

    // 1. Create Users
    // Super Admin
    db.run(
      `INSERT INTO users (id, name, dob, username, nationalId, password, role) VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [1, "Super Admin", "1988-05-15", "admin", "10000000000001", adminPassHash, "SUPER_ADMIN"]
    );
    // Employee 1 (Ahmed Mahmoud)
    db.run(
      `INSERT INTO users (id, name, dob, username, nationalId, password, role) VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [2, "Ahmed Mahmoud (أحمد محمود)", "1994-08-20", "ahmed", "20000000000002", userPassHash, "USER"]
    );
    // Employee 2 (Sarah Ali)
    db.run(
      `INSERT INTO users (id, name, dob, username, nationalId, password, role) VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [3, "Sarah Ali (سارة علي)", "1996-03-12", "sarah", "30000000000003", userPassHash, "USER"]
    );
    // Employee 3 (Omar Khaled)
    db.run(
      `INSERT INTO users (id, name, dob, username, nationalId, password, role) VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [4, "Omar Khaled (عمر خالد)", "1992-11-04", "omar", "40000000000004", userPassHash, "USER"]
    );

    // 2. Create Clinics
    db.run(`INSERT INTO clinics (id, name) VALUES (?, ?);`, [1, "Downtown Central Clinic (عيادة وسط البلد)"]);
    db.run(`INSERT INTO clinics (id, name) VALUES (?, ?);`, [2, "Nasr City Medical Center (مركز مدينة نصر الطبي)"]);
    db.run(`INSERT INTO clinics (id, name) VALUES (?, ?);`, [3, "Maadi Health Hub (مجمع المعادي الصحي)"]);

    // 3. Assign User Clinics
    // Employee 1 -> Downtown Central Clinic & Nasr City
    db.run(`INSERT INTO user_clinics (userId, clinicId) VALUES (?, ?);`, [2, 1]);
    db.run(`INSERT INTO user_clinics (userId, clinicId) VALUES (?, ?);`, [2, 2]);
    // Employee 2 -> Nasr City & Maadi
    db.run(`INSERT INTO user_clinics (userId, clinicId) VALUES (?, ?);`, [3, 2]);
    db.run(`INSERT INTO user_clinics (userId, clinicId) VALUES (?, ?);`, [3, 3]);
    // Employee 3 -> Downtown Central Clinic
    db.run(`INSERT INTO user_clinics (userId, clinicId) VALUES (?, ?);`, [4, 1]);

    // 4. Create Doctors
    db.run(`INSERT INTO doctors (id, name, specialist) VALUES (?, ?, ?);`, [1, "Dr. Ahmed Taha (د. أحمد طه)", "Cardiology (أمراض القلب)"]);
    db.run(`INSERT INTO doctors (id, name, specialist) VALUES (?, ?, ?);`, [2, "Dr. Mohamed Samir (د. محمد سمير)", "Pediatrics (طب الأطفال)"]);
    db.run(`INSERT INTO doctors (id, name, specialist) VALUES (?, ?, ?);`, [3, "Dr. Mona El-Sayed (د. منى السيد)", "Dermatology (الجلدية)"]);
    db.run(`INSERT INTO doctors (id, name, specialist) VALUES (?, ?, ?);`, [4, "Dr. Ali Hassan (د. علي حسن)", "Orthopedics (العظام)"]);
    db.run(`INSERT INTO doctors (id, name, specialist) VALUES (?, ?, ?);`, [5, "Dr. Nourhan Adel (د. نورهان عادل)", "Internal Medicine (الباطنة)"]);

    // 5. Assign Doctors to Clinics
    db.run(`INSERT INTO doctor_clinics (doctorId, clinicId) VALUES (?, ?);`, [1, 1]);
    db.run(`INSERT INTO doctor_clinics (doctorId, clinicId) VALUES (?, ?);`, [1, 2]);
    db.run(`INSERT INTO doctor_clinics (doctorId, clinicId) VALUES (?, ?);`, [2, 1]);
    db.run(`INSERT INTO doctor_clinics (doctorId, clinicId) VALUES (?, ?);`, [2, 3]);
    db.run(`INSERT INTO doctor_clinics (doctorId, clinicId) VALUES (?, ?);`, [3, 1]);
    db.run(`INSERT INTO doctor_clinics (doctorId, clinicId) VALUES (?, ?);`, [3, 2]);
    db.run(`INSERT INTO doctor_clinics (doctorId, clinicId) VALUES (?, ?);`, [4, 2]);
    db.run(`INSERT INTO doctor_clinics (doctorId, clinicId) VALUES (?, ?);`, [4, 3]);
    db.run(`INSERT INTO doctor_clinics (doctorId, clinicId) VALUES (?, ?);`, [5, 1]);

    // 6. Create Rooms for each clinic
    // Clinic 1 Rooms
    db.run(`INSERT INTO rooms (id, clinicId, name) VALUES (?, ?, ?);`, [1, 1, "Room 101 (Examinations)"]);
    db.run(`INSERT INTO rooms (id, clinicId, name) VALUES (?, ?, ?);`, [2, 1, "Room 102 (Consultations)"]);
    db.run(`INSERT INTO rooms (id, clinicId, name) VALUES (?, ?, ?);`, [3, 1, "Room 103 (Specialized)"]);
    // Clinic 2 Rooms
    db.run(`INSERT INTO rooms (id, clinicId, name) VALUES (?, ?, ?);`, [4, 2, "Room A (Clinic West)"]);
    db.run(`INSERT INTO rooms (id, clinicId, name) VALUES (?, ?, ?);`, [5, 2, "Room B (Clinic East)"]);
    // Clinic 3 Rooms
    db.run(`INSERT INTO rooms (id, clinicId, name) VALUES (?, ?, ?);`, [6, 3, "Suite 1 (General)"]);
    db.run(`INSERT INTO rooms (id, clinicId, name) VALUES (?, ?, ?);`, [7, 3, "Suite 2 (Pediatrics)"]);

    // Calculate dates for current week to seed schedules and tasks
    const today = new Date();
    const formatDate = (d: Date) => d.toISOString().split("T")[0];

    // 7. Seed sample schedules for this week
    for (let i = -3; i <= 3; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = formatDate(d);

      // Clinic 1: Room 1 morning -> Dr. Ahmed, Room 2 morning -> Dr. Mona
      db.run(
        `INSERT OR IGNORE INTO doctor_schedules (doctorId, roomId, date, shift) VALUES (?, ?, ?, ?);`,
        [1, 1, dateStr, "MORNING"]
      );
      db.run(
        `INSERT OR IGNORE INTO doctor_schedules (doctorId, roomId, date, shift) VALUES (?, ?, ?, ?);`,
        [3, 2, dateStr, "MORNING"]
      );
      // Clinic 1: Room 1 evening -> Dr. Mohamed, Room 2 evening -> Dr. Nourhan
      db.run(
        `INSERT OR IGNORE INTO doctor_schedules (doctorId, roomId, date, shift) VALUES (?, ?, ?, ?);`,
        [2, 1, dateStr, "EVENING"]
      );
      db.run(
        `INSERT OR IGNORE INTO doctor_schedules (doctorId, roomId, date, shift) VALUES (?, ?, ?, ?);`,
        [5, 2, dateStr, "EVENING"]
      );

      // Clinic 2: Room 4 (A) morning -> Dr. Ali, Room 5 (B) evening -> Dr. Ahmed
      db.run(
        `INSERT OR IGNORE INTO doctor_schedules (doctorId, roomId, date, shift) VALUES (?, ?, ?, ?);`,
        [4, 4, dateStr, "MORNING"]
      );
      db.run(
        `INSERT OR IGNORE INTO doctor_schedules (doctorId, roomId, date, shift) VALUES (?, ?, ?, ?);`,
        [1, 5, dateStr, "EVENING"]
      );
    }

    console.log("Database seeded successfully!");
  }
}

function ensureFixedTasks(db: Database) {
  const clinics = queryAll<{ id: number }>(db, "SELECT id FROM clinics ORDER BY id;");
  if (clinics.length === 0) return;

  db.run(
    "DELETE FROM task_completions WHERE taskInstanceId IN (SELECT id FROM task_instances WHERE taskId IS NULL);"
  );
  db.run("DELETE FROM task_instances WHERE taskId IS NULL;");
  db.run(
    "DELETE FROM task_completions WHERE taskInstanceId IN (SELECT ti.id FROM task_instances ti WHERE NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = ti.taskId));"
  );
  db.run(
    "DELETE FROM task_instances WHERE NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_instances.taskId);"
  );

  const distributionMigration = "fixed_task_shift_distribution_v2";
  const alreadyMigrated = queryOne<{ name: string }>(
    db,
    "SELECT name FROM app_migrations WHERE name = ?;",
    [distributionMigration]
  );
  if (!alreadyMigrated) {
    const fixedIds = queryAll<{ id: number }>(db, "SELECT id FROM tasks WHERE isFixed = 1;");
    for (const task of fixedIds) {
      db.run(
        "DELETE FROM task_completions WHERE taskInstanceId IN (SELECT id FROM task_instances WHERE taskId = ?);",
        [task.id]
      );
      db.run("DELETE FROM task_instances WHERE taskId = ?;", [task.id]);
      db.run("DELETE FROM tasks WHERE id = ?;", [task.id]);
    }
    db.run(
      "INSERT INTO app_migrations (name, appliedAt) VALUES (?, ?);",
      [distributionMigration, new Date().toISOString()]
    );
  }

  const fixedTasks = [
    ["Remember Tomorrow", "Remember patients for tomorrow.", "MORNING", 1, "AFTER"],
    ["Remember Patient", "Remember patients for the target date.", "MORNING", 8, "AFTER"],
    ["Remember Patient", "Remember patients for the target date.", "EVENING", 4, "AFTER"],
    ["Lost Patient", "Review lost patients from the target date.", "EVENING", 8, "BEFORE"],
  ] as const;
  const today = new Date().toISOString().split("T")[0];

  for (const clinic of clinics) {
    for (const [name, description, shift, relativeDays, relativeDirection] of fixedTasks) {
      const existing = queryOne<{ id: number }>(
        db,
        "SELECT id FROM tasks WHERE clinicId = ? AND isFixed = 1 AND shift = ? AND relativeDays = ? AND relativeDirection = ?;",
        [clinic.id, shift, relativeDays, relativeDirection]
      );
      if (!existing) {
        db.run(
          `INSERT INTO tasks (name, description, clinicId, shift, startDate, endDate, recurrenceType, relativeDays, relativeDirection, isFixed)
           VALUES (?, ?, ?, ?, ?, NULL, 'DAILY', ?, ?, 1);`,
          [name, description, clinic.id, shift, today, relativeDays, relativeDirection]
        );
      }
    }
  }
}

// Generate snapshots for recurring and one-time tasks within a date range
export function generateTaskInstancesForDateRange(db: Database, fromDate: string, toDate: string) {
  // 1. Get all active tasks
  const tasks = queryAll<{
    id: number;
    name: string;
    description: string;
    clinicId: number;
    shift: string;
    startDate: string;
    endDate: string | null;
    recurrenceType: string;
    relativeDays: number | null;
    relativeDirection: string | null;
  }>(db, "SELECT * FROM tasks;");

  const startD = parseCalendarDate(fromDate);
  const endD = parseCalendarDate(toDate);
  if (startD > endD) return;

  for (const task of tasks) {
    if (task.recurrenceType === "NONE") {
      // One-time task: only generate on startDate
      if (task.startDate >= fromDate && task.startDate <= toDate) {
        const instanceName = getTaskInstanceName(
          task.name,
          task.startDate,
          task.relativeDays,
          task.relativeDirection
        );
        insertTaskInstanceIfCapacityAllows(
          db,
          task,
          task.startDate,
          instanceName,
          getTaskTargetDate(task.startDate, task.relativeDays, task.relativeDirection, task.name)
        );
      }
    } else if (task.recurrenceType === "DAILY") {
      // Daily recurring task: iterate each day
      const current = new Date(startD);
      while (current <= endD) {
        const dateStr = formatCalendarDate(current);
        const taskStart = task.startDate;
        const taskEnd = task.endDate;

        if (dateStr >= taskStart && (!taskEnd || dateStr <= taskEnd)) {
          // Check if instance already exists (snapshot rule: never overwrite existing instance!)
          const existing = queryAll(
            db,
            "SELECT id FROM task_instances WHERE taskId = ? AND date = ?;",
            [task.id, dateStr]
          );

          if (existing.length === 0) {
            const instanceName = getTaskInstanceName(
              task.name,
              dateStr,
              task.relativeDays,
              task.relativeDirection
            );
            insertTaskInstanceIfCapacityAllows(
              db,
              task,
              dateStr,
              instanceName,
              getTaskTargetDate(dateStr, task.relativeDays, task.relativeDirection, task.name)
            );
          }
        }
        current.setUTCDate(current.getUTCDate() + 1);
      }
    }
  }
}

function insertTaskInstanceIfCapacityAllows(
  db: Database,
  task: { id: number; clinicId: number; shift: string; description: string },
  date: string,
  name: string,
  targetDate: string
) {
  const count = queryOne<{ count: number }>(
    db,
    "SELECT COUNT(*) as count FROM task_instances WHERE clinicId = ? AND shift = ? AND date = ?;",
    [task.clinicId, task.shift, date]
  )?.count || 0;
  if (count >= 60) return;

  db.run(
    `INSERT OR IGNORE INTO task_instances (taskId, clinicId, shift, date, name, description, targetDate)
     VALUES (?, ?, ?, ?, ?, ?, ?);`,
    [task.id, task.clinicId, task.shift, date, name, task.description, targetDate]
  );
}

function getTaskTargetDate(
  taskDate: string,
  relativeDays: number | null,
  relativeDirection: string | null,
  taskName = ""
): string {
  if (relativeDays === null || relativeDays === undefined) {
    return taskName.includes("{{TOMORROW_DATE}}")
      ? formatCalendarDate(addCalendarDays(taskDate, 1))
      : taskDate;
  }
  const offset = relativeDirection?.toUpperCase() === "BEFORE" ? -relativeDays : relativeDays;
  return formatCalendarDate(addCalendarDays(taskDate, offset));
}

function getTaskInstanceName(
  taskName: string,
  taskDate: string,
  relativeDays?: number | null,
  relativeDirection?: string | null
): string {
  const normalizedDirection = relativeDirection?.toUpperCase();
  const offset = normalizedDirection === "BEFORE" ? -(relativeDays || 0) : relativeDays || 0;
  const targetDate = addCalendarDays(taskDate, offset);
  const targetDisplay = targetDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  if (taskName.includes("{{TOMORROW_DATE}}")) {
    return taskName.replace("{{TOMORROW_DATE}}", targetDisplay);
  }

  return taskName.replace("{{TOMORROW_DATE}}", targetDisplay);
}

export function parseCalendarDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Invalid calendar date");
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Invalid calendar date");
  }
  return date;
}

export function formatCalendarDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function addCalendarDays(dateValue: string, days: number): Date {
  const date = parseCalendarDate(dateValue);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

// Helper query function returning typed array of objects
export function queryAll<T = any>(db: Database, sql: string, params: any[] = []): T[] {
  const stmt = db.prepare(sql);
  if (params.length > 0) {
    stmt.bind(params);
  }
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

// Helper query single row
export function queryOne<T = any>(db: Database, sql: string, params: any[] = []): T | null {
  const rows = queryAll<T>(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// Helper for execute with changes info
export function execute(db: Database, sql: string, params: any[] = []): { lastInsertRowid: number; changes: number } {
  db.run(sql, params);
  const rowidRes = db.exec("SELECT last_insert_rowid() as id, changes() as chg;");
  const lastInsertRowid = (rowidRes[0]?.values[0]?.[0] as number) || 0;
  const changes = (rowidRes[0]?.values[0]?.[1] as number) || 0;
  saveDb();
  return { lastInsertRowid, changes };
}
