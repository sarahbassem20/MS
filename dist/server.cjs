var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express9 = __toESM(require("express"), 1);
var import_path2 = __toESM(require("path"), 1);
var import_vite = require("vite");

// server/db.ts
var import_sql = __toESM(require("sql.js"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_path = __toESM(require("path"), 1);
var import_bcryptjs = __toESM(require("bcryptjs"), 1);
var dbInstance = null;
var DB_DIR = import_path.default.join(process.cwd(), "data");
var DB_PATH = import_path.default.join(DB_DIR, "clinic_management.sqlite");
if (!import_fs.default.existsSync(DB_DIR)) {
  import_fs.default.mkdirSync(DB_DIR, { recursive: true });
}
async function getDb() {
  if (dbInstance) {
    return dbInstance;
  }
  const SQL = await (0, import_sql.default)();
  if (import_fs.default.existsSync(DB_PATH)) {
    try {
      const fileBuffer = import_fs.default.readFileSync(DB_PATH);
      dbInstance = new SQL.Database(fileBuffer);
    } catch (e) {
      console.error("Error reading existing DB file, creating new database:", e);
      dbInstance = new SQL.Database();
    }
  } else {
    dbInstance = new SQL.Database();
  }
  dbInstance.run("PRAGMA foreign_keys = ON;");
  initSchema(dbInstance);
  await seedDefaultData(dbInstance);
  ensureFixedTasks(dbInstance);
  saveDb();
  return dbInstance;
}
function saveDb() {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    import_fs.default.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error("Error saving DB to disk:", err);
  }
}
function initSchema(db) {
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
  migrateUsersTable(db);
  migrateUserActivation(db);
  migrateCalendarTasks(db);
  migrateTaskInstanceTargets(db);
  removeDefaultTasks(db);
  migrateTaskCompletionsTable(db);
  migrateDoctorSchedulesAndTemplates(db);
  migrateMultipleDoctorsPerSlot(db);
}
function migrateUserActivation(db) {
  const columns = queryAll(db, "PRAGMA table_info(users);");
  if (!columns.some((column) => column.name === "isActive")) {
    db.run("ALTER TABLE users ADD COLUMN isActive INTEGER NOT NULL DEFAULT 1;");
  }
  if (!columns.some((column) => column.name === "canAddTasks")) {
    db.run("ALTER TABLE users ADD COLUMN canAddTasks INTEGER NOT NULL DEFAULT 0;");
  }
}
function migrateCalendarTasks(db) {
  const columns = queryAll(db, "PRAGMA table_info(tasks);");
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
function migrateTaskInstanceTargets(db) {
  const columns = queryAll(db, "PRAGMA table_info(task_instances);");
  if (!columns.some((column) => column.name === "targetDate")) {
    db.run("ALTER TABLE task_instances ADD COLUMN targetDate TEXT;");
  }
  const instances = queryAll(
    db,
    `SELECT ti.id, ti.date, ti.name, t.relativeDays, t.relativeDirection
     FROM task_instances ti
     LEFT JOIN tasks t ON t.id = ti.taskId
     WHERE ti.targetDate IS NULL;`
  );
  for (const instance of instances) {
    db.run("UPDATE task_instances SET targetDate = ? WHERE id = ?;", [
      getTaskTargetDate(instance.date, instance.relativeDays, instance.relativeDirection, instance.name),
      instance.id
    ]);
  }
  const datedNames = queryAll(
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
function migrateMultipleDoctorsPerSlot(db) {
  const tables = ["doctor_schedules", "doctor_schedule_templates"];
  for (const table of tables) {
    const schema = queryOne(
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
function removeDefaultTasks(db) {
  const defaultTaskNames = [
    "\u0641\u0643\u0631 \u0627\u0644\u0639\u0645\u0644\u0627\u0621 \u0628\u062A\u0648\u0639 \u0628\u0643\u0631\u0629 (Reminder for Tomorrow's Patients)",
    "remember tomorrow",
    "Reminder for Tomorrow's Patients",
    "Remember Patient",
    "Lost Patient",
    "lost patiant"
  ];
  const placeholders = defaultTaskNames.map(() => "?").join(",");
  const defaultTasks = queryAll(
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
function migrateUsersTable(db) {
  const columns = queryAll(db, "PRAGMA table_info(users);");
  try {
    if (!columns.some((column) => column.name === "username")) {
      db.run("ALTER TABLE users ADD COLUMN username TEXT;");
    }
    const users = queryAll(db, "SELECT id, name, username, nationalId, role FROM users ORDER BY id ASC;");
    const usedUsernames = /* @__PURE__ */ new Set();
    for (const user of users) {
      let username = user.username && user.username !== user.nationalId ? user.username : "";
      if (!username) {
        const baseUsername = user.role === "SUPER_ADMIN" ? "admin" : user.name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || `user${user.id}`;
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
function migrateDoctorSchedulesAndTemplates(db) {
  try {
    const schedTableInfo = queryAll(db, "PRAGMA table_info(doctor_schedules);");
    const doctorIdCol = schedTableInfo.find((col) => col.name === "doctorId");
    const hasIsException = schedTableInfo.some((col) => col.name === "isException");
    const hasStatus = schedTableInfo.some((col) => col.name === "status");
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
        } catch (e) {
        }
      }
      if (!hasStatus) {
        try {
          db.run("ALTER TABLE doctor_schedules ADD COLUMN status TEXT DEFAULT 'SCHEDULED';");
        } catch (e) {
        }
      }
    }
    const tmplCountRes = queryOne(db, "SELECT COUNT(*) as count FROM doctor_schedule_templates;");
    const tmplCount = tmplCountRes?.count || 0;
    const seededDoctors = queryOne(
      db,
      "SELECT COUNT(*) as count FROM doctors WHERE id IN (1, 2, 3, 4, 5);"
    )?.count || 0;
    if (tmplCount === 0 && seededDoctors === 5) {
      console.log("Seeding master weekly doctor schedule templates...");
      for (let day = 0; day < 7; day++) {
        db.run(
          `INSERT OR IGNORE INTO doctor_schedule_templates (clinicId, roomId, dayOfWeek, shift, doctorId)
           VALUES (?, ?, ?, ?, ?);`,
          [1, 1, day, "MORNING", 1]
        );
        db.run(
          `INSERT OR IGNORE INTO doctor_schedule_templates (clinicId, roomId, dayOfWeek, shift, doctorId)
           VALUES (?, ?, ?, ?, ?);`,
          [1, 2, day, "MORNING", 3]
        );
        db.run(
          `INSERT OR IGNORE INTO doctor_schedule_templates (clinicId, roomId, dayOfWeek, shift, doctorId)
           VALUES (?, ?, ?, ?, ?);`,
          [1, 1, day, "EVENING", 2]
        );
        db.run(
          `INSERT OR IGNORE INTO doctor_schedule_templates (clinicId, roomId, dayOfWeek, shift, doctorId)
           VALUES (?, ?, ?, ?, ?);`,
          [1, 2, day, "EVENING", 5]
        );
        db.run(
          `INSERT OR IGNORE INTO doctor_schedule_templates (clinicId, roomId, dayOfWeek, shift, doctorId)
           VALUES (?, ?, ?, ?, ?);`,
          [2, 4, day, "MORNING", 4]
        );
        db.run(
          `INSERT OR IGNORE INTO doctor_schedule_templates (clinicId, roomId, dayOfWeek, shift, doctorId)
           VALUES (?, ?, ?, ?, ?);`,
          [2, 5, day, "EVENING", 1]
        );
        db.run(
          `INSERT OR IGNORE INTO doctor_schedule_templates (clinicId, roomId, dayOfWeek, shift, doctorId)
           VALUES (?, ?, ?, ?, ?);`,
          [3, 6, day, "MORNING", 2]
        );
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
function migrateTaskCompletionsTable(db) {
  try {
    const tableInfo = queryAll(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name='task_completions';");
    if (tableInfo.length > 0 && tableInfo[0].sql) {
      const sqlText = tableInfo[0].sql;
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
async function seedDefaultData(db) {
  const res = db.exec("SELECT COUNT(*) as count FROM users;");
  const count = res.length > 0 && res[0].values.length > 0 ? res[0].values[0][0] : 0;
  if (count === 0) {
    console.log("Seeding initial clinic management data...");
    const adminPassHash = import_bcryptjs.default.hashSync("admin123", 10);
    const userPassHash = import_bcryptjs.default.hashSync("user123", 10);
    db.run(
      `INSERT INTO users (id, name, dob, username, nationalId, password, role) VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [1, "Super Admin", "1988-05-15", "admin", "10000000000001", adminPassHash, "SUPER_ADMIN"]
    );
    db.run(
      `INSERT INTO users (id, name, dob, username, nationalId, password, role) VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [2, "Ahmed Mahmoud (\u0623\u062D\u0645\u062F \u0645\u062D\u0645\u0648\u062F)", "1994-08-20", "ahmed", "20000000000002", userPassHash, "USER"]
    );
    db.run(
      `INSERT INTO users (id, name, dob, username, nationalId, password, role) VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [3, "Sarah Ali (\u0633\u0627\u0631\u0629 \u0639\u0644\u064A)", "1996-03-12", "sarah", "30000000000003", userPassHash, "USER"]
    );
    db.run(
      `INSERT INTO users (id, name, dob, username, nationalId, password, role) VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [4, "Omar Khaled (\u0639\u0645\u0631 \u062E\u0627\u0644\u062F)", "1992-11-04", "omar", "40000000000004", userPassHash, "USER"]
    );
    db.run(`INSERT INTO clinics (id, name) VALUES (?, ?);`, [1, "Downtown Central Clinic (\u0639\u064A\u0627\u062F\u0629 \u0648\u0633\u0637 \u0627\u0644\u0628\u0644\u062F)"]);
    db.run(`INSERT INTO clinics (id, name) VALUES (?, ?);`, [2, "Nasr City Medical Center (\u0645\u0631\u0643\u0632 \u0645\u062F\u064A\u0646\u0629 \u0646\u0635\u0631 \u0627\u0644\u0637\u0628\u064A)"]);
    db.run(`INSERT INTO clinics (id, name) VALUES (?, ?);`, [3, "Maadi Health Hub (\u0645\u062C\u0645\u0639 \u0627\u0644\u0645\u0639\u0627\u062F\u064A \u0627\u0644\u0635\u062D\u064A)"]);
    db.run(`INSERT INTO user_clinics (userId, clinicId) VALUES (?, ?);`, [2, 1]);
    db.run(`INSERT INTO user_clinics (userId, clinicId) VALUES (?, ?);`, [2, 2]);
    db.run(`INSERT INTO user_clinics (userId, clinicId) VALUES (?, ?);`, [3, 2]);
    db.run(`INSERT INTO user_clinics (userId, clinicId) VALUES (?, ?);`, [3, 3]);
    db.run(`INSERT INTO user_clinics (userId, clinicId) VALUES (?, ?);`, [4, 1]);
    db.run(`INSERT INTO doctors (id, name, specialist) VALUES (?, ?, ?);`, [1, "Dr. Ahmed Taha (\u062F. \u0623\u062D\u0645\u062F \u0637\u0647)", "Cardiology (\u0623\u0645\u0631\u0627\u0636 \u0627\u0644\u0642\u0644\u0628)"]);
    db.run(`INSERT INTO doctors (id, name, specialist) VALUES (?, ?, ?);`, [2, "Dr. Mohamed Samir (\u062F. \u0645\u062D\u0645\u062F \u0633\u0645\u064A\u0631)", "Pediatrics (\u0637\u0628 \u0627\u0644\u0623\u0637\u0641\u0627\u0644)"]);
    db.run(`INSERT INTO doctors (id, name, specialist) VALUES (?, ?, ?);`, [3, "Dr. Mona El-Sayed (\u062F. \u0645\u0646\u0649 \u0627\u0644\u0633\u064A\u062F)", "Dermatology (\u0627\u0644\u062C\u0644\u062F\u064A\u0629)"]);
    db.run(`INSERT INTO doctors (id, name, specialist) VALUES (?, ?, ?);`, [4, "Dr. Ali Hassan (\u062F. \u0639\u0644\u064A \u062D\u0633\u0646)", "Orthopedics (\u0627\u0644\u0639\u0638\u0627\u0645)"]);
    db.run(`INSERT INTO doctors (id, name, specialist) VALUES (?, ?, ?);`, [5, "Dr. Nourhan Adel (\u062F. \u0646\u0648\u0631\u0647\u0627\u0646 \u0639\u0627\u062F\u0644)", "Internal Medicine (\u0627\u0644\u0628\u0627\u0637\u0646\u0629)"]);
    db.run(`INSERT INTO doctor_clinics (doctorId, clinicId) VALUES (?, ?);`, [1, 1]);
    db.run(`INSERT INTO doctor_clinics (doctorId, clinicId) VALUES (?, ?);`, [1, 2]);
    db.run(`INSERT INTO doctor_clinics (doctorId, clinicId) VALUES (?, ?);`, [2, 1]);
    db.run(`INSERT INTO doctor_clinics (doctorId, clinicId) VALUES (?, ?);`, [2, 3]);
    db.run(`INSERT INTO doctor_clinics (doctorId, clinicId) VALUES (?, ?);`, [3, 1]);
    db.run(`INSERT INTO doctor_clinics (doctorId, clinicId) VALUES (?, ?);`, [3, 2]);
    db.run(`INSERT INTO doctor_clinics (doctorId, clinicId) VALUES (?, ?);`, [4, 2]);
    db.run(`INSERT INTO doctor_clinics (doctorId, clinicId) VALUES (?, ?);`, [4, 3]);
    db.run(`INSERT INTO doctor_clinics (doctorId, clinicId) VALUES (?, ?);`, [5, 1]);
    db.run(`INSERT INTO rooms (id, clinicId, name) VALUES (?, ?, ?);`, [1, 1, "Room 101 (Examinations)"]);
    db.run(`INSERT INTO rooms (id, clinicId, name) VALUES (?, ?, ?);`, [2, 1, "Room 102 (Consultations)"]);
    db.run(`INSERT INTO rooms (id, clinicId, name) VALUES (?, ?, ?);`, [3, 1, "Room 103 (Specialized)"]);
    db.run(`INSERT INTO rooms (id, clinicId, name) VALUES (?, ?, ?);`, [4, 2, "Room A (Clinic West)"]);
    db.run(`INSERT INTO rooms (id, clinicId, name) VALUES (?, ?, ?);`, [5, 2, "Room B (Clinic East)"]);
    db.run(`INSERT INTO rooms (id, clinicId, name) VALUES (?, ?, ?);`, [6, 3, "Suite 1 (General)"]);
    db.run(`INSERT INTO rooms (id, clinicId, name) VALUES (?, ?, ?);`, [7, 3, "Suite 2 (Pediatrics)"]);
    const today = /* @__PURE__ */ new Date();
    const formatDate = (d) => d.toISOString().split("T")[0];
    for (let i = -3; i <= 3; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = formatDate(d);
      db.run(
        `INSERT OR IGNORE INTO doctor_schedules (doctorId, roomId, date, shift) VALUES (?, ?, ?, ?);`,
        [1, 1, dateStr, "MORNING"]
      );
      db.run(
        `INSERT OR IGNORE INTO doctor_schedules (doctorId, roomId, date, shift) VALUES (?, ?, ?, ?);`,
        [3, 2, dateStr, "MORNING"]
      );
      db.run(
        `INSERT OR IGNORE INTO doctor_schedules (doctorId, roomId, date, shift) VALUES (?, ?, ?, ?);`,
        [2, 1, dateStr, "EVENING"]
      );
      db.run(
        `INSERT OR IGNORE INTO doctor_schedules (doctorId, roomId, date, shift) VALUES (?, ?, ?, ?);`,
        [5, 2, dateStr, "EVENING"]
      );
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
function ensureFixedTasks(db) {
  const clinics = queryAll(db, "SELECT id FROM clinics ORDER BY id;");
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
  const alreadyMigrated = queryOne(
    db,
    "SELECT name FROM app_migrations WHERE name = ?;",
    [distributionMigration]
  );
  if (!alreadyMigrated) {
    const fixedIds = queryAll(db, "SELECT id FROM tasks WHERE isFixed = 1;");
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
      [distributionMigration, (/* @__PURE__ */ new Date()).toISOString()]
    );
  }
  const fixedTasks = [
    ["Remember Tomorrow", "Remember patients for tomorrow.", "MORNING", 1, "AFTER"],
    ["Remember Patient", "Remember patients for the target date.", "MORNING", 8, "AFTER"],
    ["Remember Patient", "Remember patients for the target date.", "EVENING", 4, "AFTER"],
    ["Lost Patient", "Review lost patients from the target date.", "EVENING", 8, "BEFORE"]
  ];
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  for (const clinic of clinics) {
    for (const [name, description, shift, relativeDays, relativeDirection] of fixedTasks) {
      const existing = queryOne(
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
function generateTaskInstancesForDateRange(db, fromDate, toDate) {
  const tasks = queryAll(db, "SELECT * FROM tasks;");
  const startD = parseCalendarDate(fromDate);
  const endD = parseCalendarDate(toDate);
  if (startD > endD) return;
  for (const task of tasks) {
    if (task.recurrenceType === "NONE") {
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
      const current = new Date(startD);
      while (current <= endD) {
        const dateStr = formatCalendarDate(current);
        const taskStart = task.startDate;
        const taskEnd = task.endDate;
        if (dateStr >= taskStart && (!taskEnd || dateStr <= taskEnd)) {
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
function insertTaskInstanceIfCapacityAllows(db, task, date, name, targetDate) {
  const count = queryOne(
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
function getTaskTargetDate(taskDate, relativeDays, relativeDirection, taskName = "") {
  if (relativeDays === null || relativeDays === void 0) {
    return taskName.includes("{{TOMORROW_DATE}}") ? formatCalendarDate(addCalendarDays(taskDate, 1)) : taskDate;
  }
  const offset = relativeDirection?.toUpperCase() === "BEFORE" ? -relativeDays : relativeDays;
  return formatCalendarDate(addCalendarDays(taskDate, offset));
}
function getTaskInstanceName(taskName, taskDate, relativeDays, relativeDirection) {
  const normalizedDirection = relativeDirection?.toUpperCase();
  const offset = normalizedDirection === "BEFORE" ? -(relativeDays || 0) : relativeDays || 0;
  const targetDate = addCalendarDays(taskDate, offset);
  const targetDisplay = targetDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
  if (taskName.includes("{{TOMORROW_DATE}}")) {
    return taskName.replace("{{TOMORROW_DATE}}", targetDisplay);
  }
  return taskName.replace("{{TOMORROW_DATE}}", targetDisplay);
}
function parseCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Invalid calendar date");
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("Invalid calendar date");
  }
  return date;
}
function formatCalendarDate(date) {
  return date.toISOString().split("T")[0];
}
function addCalendarDays(dateValue, days) {
  const date = parseCalendarDate(dateValue);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}
function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) {
    stmt.bind(params);
  }
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}
function queryOne(db, sql, params = []) {
  const rows = queryAll(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}
function execute(db, sql, params = []) {
  db.run(sql, params);
  const rowidRes = db.exec("SELECT last_insert_rowid() as id, changes() as chg;");
  const lastInsertRowid = rowidRes[0]?.values[0]?.[0] || 0;
  const changes = rowidRes[0]?.values[0]?.[1] || 0;
  saveDb();
  return { lastInsertRowid, changes };
}

// server/routes/auth.ts
var import_express = __toESM(require("express"), 1);
var import_bcryptjs2 = __toESM(require("bcryptjs"), 1);

// server/auth.ts
var import_jsonwebtoken = __toESM(require("jsonwebtoken"), 1);
var JWT_SECRET = process.env.JWT_SECRET || "clinic-management-secure-jwt-secret-key-2026";
function generateToken(user) {
  return import_jsonwebtoken.default.sign(
    {
      id: user.id,
      name: user.name,
      nationalId: user.nationalId,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}
async function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) {
    res.status(401).json({ error: "Access token required" });
    return;
  }
  try {
    const decoded = import_jsonwebtoken.default.verify(token, JWT_SECRET);
    const db = await getDb();
    const user = queryOne(
      db,
      "SELECT id, name, nationalId, role, canAddTasks FROM users WHERE id = ?;",
      [decoded.id]
    );
    if (!user) {
      res.status(401).json({ error: "User no longer exists" });
      return;
    }
    const assignedClinicsRows = queryAll(
      db,
      "SELECT clinicId FROM user_clinics WHERE userId = ?;",
      [user.id]
    );
    const assignedClinics = assignedClinicsRows.map((r) => r.clinicId);
    req.user = {
      ...user,
      canAddTasks: !!user.canAddTasks,
      assignedClinics
    };
    next();
  } catch (err) {
    res.status(403).json({ error: "Invalid or expired token" });
  }
}
function requireSuperAdmin(req, res, next) {
  if (!req.user || req.user.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Access denied. Super Admin privileges required." });
    return;
  }
  next();
}
function requireTaskAccess(req, res, next) {
  if (!req.user || req.user.role !== "SUPER_ADMIN" && !req.user.canAddTasks) {
    res.status(403).json({ error: "Task management access required." });
    return;
  }
  next();
}
function requireTaskCreationAccess(req, res, next) {
  if (!req.user || req.user.role !== "SUPER_ADMIN" && !req.user.canAddTasks) {
    res.status(403).json({ error: "Only an administrator with task-add access can create tasks." });
    return;
  }
  next();
}
function checkClinicAccess(user, clinicId) {
  if (user.role === "SUPER_ADMIN") return true;
  return !!user.assignedClinics && user.assignedClinics.includes(Number(clinicId));
}

// server/routes/auth.ts
var router = import_express.default.Router();
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: "Username and Password are required" });
      return;
    }
    const db = await getDb();
    const user = queryOne(db, "SELECT * FROM users WHERE username = ?;", [username.trim()]);
    if (!user) {
      res.status(401).json({ error: "Invalid Username or Password" });
      return;
    }
    const isMatch = import_bcryptjs2.default.compareSync(password, user.password);
    if (!isMatch) {
      res.status(401).json({ error: "Invalid Username or Password" });
      return;
    }
    if (!user.isActive) {
      res.status(403).json({ error: "This account is inactive. Contact the administrator." });
      return;
    }
    const clinicRows = queryAll(
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
        assignedClinics: clinicRows.map((c) => ({ id: c.clinicId, name: c.name }))
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error during login" });
  }
});
router.get("/me", authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const db = await getDb();
    const user = queryOne(db, "SELECT id, name, dob, username, nationalId, role, isActive FROM users WHERE id = ?;", [req.user.id]);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const clinicRows = queryAll(
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
        assignedClinics: clinicRows.map((c) => ({ id: c.clinicId, name: c.name }))
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});
router.post("/change-password", authenticateToken, async (req, res) => {
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
    const user = queryOne(
      db,
      "SELECT password FROM users WHERE id = ?;",
      [req.user.id]
    );
    if (!user || !import_bcryptjs2.default.compareSync(currentPassword, user.password)) {
      res.status(400).json({ error: "Incorrect current password" });
      return;
    }
    const newHashed = import_bcryptjs2.default.hashSync(newPassword, 10);
    execute(db, "UPDATE users SET password = ? WHERE id = ?;", [newHashed, req.user.id]);
    res.json({ message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to change password" });
  }
});
var auth_default = router;

// server/routes/clinics.ts
var import_express2 = __toESM(require("express"), 1);
var router2 = import_express2.default.Router();
router2.get("/", authenticateToken, async (req, res) => {
  try {
    const db = await getDb();
    const user = req.user;
    let clinics = [];
    if (user.role === "SUPER_ADMIN") {
      clinics = queryAll(
        db,
        `SELECT c.id, c.name,
          (SELECT COUNT(*) FROM rooms r WHERE r.clinicId = c.id) as roomCount,
          (SELECT COUNT(*) FROM doctor_clinics dc WHERE dc.clinicId = c.id) as doctorCount,
          (SELECT COUNT(*) FROM user_clinics uc WHERE uc.clinicId = c.id) as employeeCount
         FROM clinics c
         ORDER BY c.id ASC;`
      );
    } else {
      clinics = queryAll(
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
router2.get("/:id", authenticateToken, async (req, res) => {
  try {
    const clinicId = Number(req.params.id);
    if (!checkClinicAccess(req.user, clinicId)) {
      res.status(403).json({ error: "Access denied to this clinic" });
      return;
    }
    const db = await getDb();
    const clinic = queryOne(
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
router2.post("/", authenticateToken, requireSuperAdmin, async (req, res) => {
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
router2.put("/:id", authenticateToken, requireSuperAdmin, async (req, res) => {
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
router2.delete("/:id", authenticateToken, requireSuperAdmin, async (req, res) => {
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
var clinics_default = router2;

// server/routes/users.ts
var import_express3 = __toESM(require("express"), 1);
var import_bcryptjs3 = __toESM(require("bcryptjs"), 1);
var router3 = import_express3.default.Router();
router3.get("/", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const users = queryAll(db, "SELECT id, name, dob, username, nationalId, role, isActive, canAddTasks FROM users ORDER BY id ASC;");
    const usersWithClinics = users.map((u) => {
      const clinics = queryAll(
        db,
        `SELECT c.id, c.name 
         FROM user_clinics uc 
         JOIN clinics c ON c.id = uc.clinicId 
         WHERE uc.userId = ?;`,
        [u.id]
      );
      return {
        ...u,
        assignedClinics: clinics
      };
    });
    res.json({ users: usersWithClinics });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});
router3.post("/", authenticateToken, requireSuperAdmin, async (req, res) => {
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
    const hashedPassword = import_bcryptjs3.default.hashSync(password, 10);
    const result = execute(
      db,
      "INSERT INTO users (name, dob, username, nationalId, password, role) VALUES (?, ?, ?, ?, ?, ?);",
      [name.trim(), dob.trim(), username.trim(), nationalId.trim(), hashedPassword, role]
    );
    const userId = result.lastInsertRowid;
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
router3.put("/:id", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { name, dob, username, nationalId, password, role, clinicIds } = req.body;
    const db = await getDb();
    const existing = queryOne(db, "SELECT id FROM users WHERE id = ?;", [userId]);
    if (!existing) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (nationalId) {
      const dup = queryOne(db, "SELECT id FROM users WHERE nationalId = ? AND id != ?;", [
        nationalId.trim(),
        userId
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
    if (password && password.trim().length > 0) {
      const hashedPassword = import_bcryptjs3.default.hashSync(password, 10);
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
router3.patch("/:id/activation", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (req.user.id === userId) {
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
router3.delete("/:id", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (req.user.id === userId) {
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
var users_default = router3;

// server/routes/doctors.ts
var import_express4 = __toESM(require("express"), 1);
var router4 = import_express4.default.Router();
router4.get("/", authenticateToken, async (req, res) => {
  try {
    const db = await getDb();
    const { clinicId } = req.query;
    let doctors = [];
    if (clinicId) {
      doctors = queryAll(
        db,
        `SELECT d.id, d.name, d.specialist 
         FROM doctors d
         JOIN doctor_clinics dc ON dc.doctorId = d.id
         WHERE dc.clinicId = ?
         ORDER BY d.id ASC;`,
        [Number(clinicId)]
      );
    } else {
      doctors = queryAll(
        db,
        "SELECT id, name, specialist FROM doctors ORDER BY id ASC;"
      );
    }
    const doctorsWithClinics = doctors.map((d) => {
      const clinics = queryAll(
        db,
        `SELECT c.id, c.name 
         FROM doctor_clinics dc 
         JOIN clinics c ON c.id = dc.clinicId 
         WHERE dc.doctorId = ?;`,
        [d.id]
      );
      return {
        ...d,
        assignedClinics: clinics
      };
    });
    res.json({ doctors: doctorsWithClinics });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch doctors" });
  }
});
router4.post("/", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { name, specialist, clinicIds = [] } = req.body;
    if (!name || !specialist) {
      res.status(400).json({ error: "Doctor name and specialist are required" });
      return;
    }
    const db = await getDb();
    const result = execute(db, "INSERT INTO doctors (name, specialist) VALUES (?, ?);", [
      name.trim(),
      specialist.trim()
    ]);
    const doctorId = result.lastInsertRowid;
    if (Array.isArray(clinicIds)) {
      for (const cId of clinicIds) {
        execute(db, "INSERT OR IGNORE INTO doctor_clinics (doctorId, clinicId) VALUES (?, ?);", [
          doctorId,
          cId
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
router4.put("/:id", authenticateToken, requireSuperAdmin, async (req, res) => {
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
          cId
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
router4.delete("/:id", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const doctorId = Number(req.params.id);
    const db = await getDb();
    execute(db, "DELETE FROM doctors WHERE id = ?;", [doctorId]);
    res.json({ message: "Doctor deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete doctor" });
  }
});
var doctors_default = router4;

// server/routes/rooms.ts
var import_express5 = __toESM(require("express"), 1);
var router5 = import_express5.default.Router();
router5.get("/", authenticateToken, async (req, res) => {
  try {
    const { clinicId } = req.query;
    const db = await getDb();
    if (clinicId) {
      const cId = Number(clinicId);
      if (!checkClinicAccess(req.user, cId)) {
        res.status(403).json({ error: "Access denied to this clinic's rooms" });
        return;
      }
      const rooms = queryAll(
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
      if (req.user.role !== "SUPER_ADMIN") {
        res.status(403).json({ error: "Clinic ID is required for non-admin users" });
        return;
      }
      const rooms = queryAll(
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
router5.post("/", authenticateToken, requireSuperAdmin, async (req, res) => {
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
      name.trim()
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
router5.put("/:id", authenticateToken, requireSuperAdmin, async (req, res) => {
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
router5.delete("/:id", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const roomId = Number(req.params.id);
    const db = await getDb();
    execute(db, "DELETE FROM rooms WHERE id = ?;", [roomId]);
    res.json({ message: "Room deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete room" });
  }
});
var rooms_default = router5;

// server/routes/schedules.ts
var import_express6 = __toESM(require("express"), 1);
var router6 = import_express6.default.Router();
var DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
var WEEK_DAY_INDICES = [6, 0, 1, 2, 3, 4, 5];
router6.get("/template", authenticateToken, async (req, res) => {
  try {
    const { clinicId } = req.query;
    if (!clinicId) {
      res.status(400).json({ error: "clinicId is required" });
      return;
    }
    const cId = Number(clinicId);
    if (!checkClinicAccess(req.user, cId)) {
      res.status(403).json({ error: "Access denied to this clinic schedule" });
      return;
    }
    const db = await getDb();
    const clinic = queryOne(
      db,
      "SELECT id, name FROM clinics WHERE id = ?;",
      [cId]
    );
    if (!clinic) {
      res.status(404).json({ error: "Clinic not found" });
      return;
    }
    const rooms = queryAll(
      db,
      "SELECT id, name FROM rooms WHERE clinicId = ? ORDER BY id ASC;",
      [cId]
    );
    const roomIds = rooms.map((r) => r.id);
    let templates = [];
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
    const days = WEEK_DAY_INDICES.map((dayIdx) => ({
      dayIndex: dayIdx,
      dayOfWeek: DAY_NAMES[dayIdx]
    }));
    const matrix = days.map((day) => {
      const morningRooms = {};
      const eveningRooms = {};
      rooms.forEach((r) => {
        morningRooms[r.id] = null;
        eveningRooms[r.id] = null;
      });
      templates.filter((t) => t.dayOfWeek === day.dayIndex).forEach((t) => {
        if (t.shift === "MORNING") {
          const current = morningRooms[t.roomId];
          morningRooms[t.roomId] = current ? { ...current, additionalDoctors: [...current.additionalDoctors || [], t] } : t;
        } else if (t.shift === "EVENING") {
          const current = eveningRooms[t.roomId];
          eveningRooms[t.roomId] = current ? { ...current, additionalDoctors: [...current.additionalDoctors || [], t] } : t;
        }
      });
      return {
        dayOfWeek: day.dayOfWeek,
        dayIndex: day.dayIndex,
        shifts: {
          MORNING: morningRooms,
          EVENING: eveningRooms
        }
      };
    });
    res.json({
      clinic,
      rooms,
      days,
      templates,
      matrix
    });
  } catch (err) {
    console.error("Error fetching schedule template:", err);
    res.status(500).json({ error: "Failed to fetch schedule template" });
  }
});
router6.post("/template", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { clinicId, roomId, dayOfWeek, shift, doctorId } = req.body;
    if (!clinicId || !roomId || dayOfWeek === void 0 || !shift || !doctorId) {
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
    const room = queryOne(
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
    const doctor = queryOne(
      db,
      "SELECT id, name, specialist FROM doctors WHERE id = ?;",
      [Number(doctorId)]
    );
    if (!doctor) {
      res.status(404).json({ error: "Doctor not found" });
      return;
    }
    const docClinic = queryOne(
      db,
      "SELECT doctorId FROM doctor_clinics WHERE doctorId = ? AND clinicId = ?;",
      [Number(doctorId), room.clinicId]
    );
    if (!docClinic) {
      res.status(400).json({
        error: `Doctor ${doctor.name} is not assigned to ${room.clinicName}. Please assign the doctor to the clinic first.`
      });
      return;
    }
    const templateConflict = queryOne(
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
        error: `Conflict in Weekly Template: Dr. ${doctor.name} is already assigned at ${templateConflict.clinicName} (${templateConflict.roomName}) on ${DAY_NAMES[dOfWeek]} during the ${shift} shift.`
      });
      return;
    }
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
  } catch (err) {
    console.error("Error saving template slot:", err);
    res.status(500).json({ error: "Failed to save weekly template slot" });
  }
});
router6.delete("/template/slot", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { roomId, dayOfWeek, shift, doctorId } = req.body;
    if (!roomId || dayOfWeek === void 0 || !shift) {
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
router6.get("/weekly", authenticateToken, async (req, res) => {
  try {
    const { clinicId, weekStart, startDate: qStartDate, endDate: qEndDate } = req.query;
    if (!clinicId) {
      res.status(400).json({ error: "clinicId is required" });
      return;
    }
    const cId = Number(clinicId);
    if (!checkClinicAccess(req.user, cId)) {
      res.status(403).json({ error: "Access denied to this clinic schedule" });
      return;
    }
    const db = await getDb();
    const clinic = queryOne(
      db,
      "SELECT id, name FROM clinics WHERE id = ?;",
      [cId]
    );
    if (!clinic) {
      res.status(404).json({ error: "Clinic not found" });
      return;
    }
    const rooms = queryAll(
      db,
      "SELECT id, name FROM rooms WHERE clinicId = ? ORDER BY id ASC;",
      [cId]
    );
    let startDate;
    let numDays = 7;
    if (qStartDate && typeof qStartDate === "string" && qEndDate && typeof qEndDate === "string") {
      const [sy, sm, sd] = qStartDate.split("-").map(Number);
      const [ey, em, ed] = qEndDate.split("-").map(Number);
      startDate = new Date(sy, sm - 1, sd, 12, 0, 0);
      const endDate = new Date(ey, em - 1, ed, 12, 0, 0);
      const diffTime = endDate.getTime() - startDate.getTime();
      const diffDays = Math.round(diffTime / (1e3 * 60 * 60 * 24)) + 1;
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
      const today = /* @__PURE__ */ new Date();
      const day = today.getDay();
      const diff = (day + 1) % 7;
      startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - diff, 12, 0, 0);
      numDays = 7;
    }
    const days = [];
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
        dayIndex: d.getDay()
      });
    }
    const fromDate = days[0].date;
    const toDate = days[days.length - 1].date;
    const roomIds = rooms.map((r) => r.id);
    let templates = [];
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
    let dateSchedules = [];
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
    const dateOverrideMap = /* @__PURE__ */ new Map();
    dateSchedules.forEach((ds) => {
      const key = `${ds.roomId}_${ds.date}_${ds.shift}`;
      dateOverrideMap.set(key, [...dateOverrideMap.get(key) || [], ds]);
    });
    const templateMap = /* @__PURE__ */ new Map();
    templates.forEach((t) => {
      const key = `${t.roomId}_${t.dayOfWeek}_${t.shift}`;
      templateMap.set(key, [...templateMap.get(key) || [], t]);
    });
    const resolvedSchedules = [];
    const matrix = days.map((day) => {
      const morningRooms = {};
      const eveningRooms = {};
      rooms.forEach((room) => {
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
          const inheritedDoctors = isCancelled ? [] : morningTemplates.filter((item) => !overrideDoctorIds.has(item.doctorId));
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
            isCancelled,
            note: morningOverride.note,
            additionalDoctors: [
              ...morningOverrides.slice(1),
              ...inheritedDoctors.map((item) => ({
                doctorId: item.doctorId,
                doctorName: item.doctorName,
                doctorSpecialist: item.doctorSpecialist
              }))
            ]
          };
        } else if (morningTemplate) {
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
            additionalDoctors: morningTemplates.slice(1)
          };
        } else {
          morningRooms[room.id] = null;
        }
        if (morningRooms[room.id]) {
          resolvedSchedules.push(morningRooms[room.id]);
        }
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
          const inheritedDoctors = isCancelled ? [] : eveningTemplates.filter((item) => !overrideDoctorIds.has(item.doctorId));
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
            isCancelled,
            note: eveningOverride.note,
            additionalDoctors: [
              ...eveningOverrides.slice(1),
              ...inheritedDoctors.map((item) => ({
                doctorId: item.doctorId,
                doctorName: item.doctorName,
                doctorSpecialist: item.doctorSpecialist
              }))
            ]
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
            additionalDoctors: eveningTemplates.slice(1)
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
          EVENING: eveningRooms
        }
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
      matrix
    });
  } catch (err) {
    console.error("Error fetching weekly schedule:", err);
    res.status(500).json({ error: "Failed to fetch weekly schedule" });
  }
});
router6.post("/", authenticateToken, requireSuperAdmin, async (req, res) => {
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
    const room = queryOne(
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
    const doctor = queryOne(
      db,
      "SELECT id, name, specialist FROM doctors WHERE id = ?;",
      [Number(doctorId)]
    );
    if (!doctor) {
      res.status(404).json({ error: "Doctor not found" });
      return;
    }
    const docClinic = queryOne(
      db,
      "SELECT doctorId FROM doctor_clinics WHERE doctorId = ? AND clinicId = ?;",
      [Number(doctorId), room.clinicId]
    );
    if (!docClinic) {
      res.status(400).json({
        error: `Doctor ${doctor.name} is not assigned to ${room.clinicName}. Please assign the doctor to the clinic first.`
      });
      return;
    }
    const d = /* @__PURE__ */ new Date(date + "T00:00:00");
    const dayOfWeek = d.getDay();
    if (applyToTemplate) {
      const templateConflict = queryOne(
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
          error: `Conflict in Weekly Template: Dr. ${doctor.name} is already assigned at ${templateConflict.clinicName} (${templateConflict.roomName}) on ${DAY_NAMES[dayOfWeek]} during ${shift} shift.`
        });
        return;
      }
      execute(
        db,
        `INSERT OR IGNORE INTO doctor_schedule_templates (clinicId, roomId, dayOfWeek, shift, doctorId)
         VALUES (?, ?, ?, ?, ?);`,
        [room.clinicId, Number(roomId), dayOfWeek, shift, Number(doctorId)]
      );
      execute(db, "DELETE FROM doctor_schedules WHERE roomId = ? AND date = ? AND shift = ?;", [
        Number(roomId),
        date,
        shift
      ]);
      res.status(201).json({
        message: "Weekly template updated successfully for all weeks",
        isTemplate: true
      });
      return;
    }
    const dateConflict = queryOne(
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
        error: `Scheduling Conflict: Dr. ${doctor.name} is already scheduled at ${dateConflict.clinicName} (${dateConflict.roomName}) for ${date} during the ${shift} shift.`
      });
      return;
    }
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
      isException: true
    });
  } catch (err) {
    console.error("Error creating schedule:", err);
    res.status(500).json({ error: "Failed to schedule doctor" });
  }
});
router6.post("/slot/off", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { roomId, date, shift, doctorId, note } = req.body;
    if (!roomId || !date || !shift) {
      res.status(400).json({ error: "roomId, date, and shift are required" });
      return;
    }
    const db = await getDb();
    let targetDoctorId = doctorId && doctorId !== "OFF" ? Number(doctorId) : null;
    if (!targetDoctorId) {
      const dayIndex = (/* @__PURE__ */ new Date(date + "T00:00:00")).getDay();
      const tmpl = queryOne(
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
      [targetDoctorId, Number(roomId), date, shift, note || "\u0627\u0639\u062A\u0630\u0627\u0631 / \u0645\u0644\u063A\u064A"]
    );
    res.json({
      message: "Slot marked as cancelled/apology for this date as an exception",
      isCancelled: true,
      doctorId: targetDoctorId
    });
  } catch (err) {
    console.error("Error setting slot off:", err);
    res.status(500).json({ error: "Failed to mark slot off" });
  }
});
router6.delete("/slot/remove", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { roomId, date, shift, doctorId } = req.body;
    if (!roomId || !date || !shift) {
      res.status(400).json({ error: "roomId, date, and shift are required" });
      return;
    }
    const db = await getDb();
    const params = [Number(roomId), date, shift];
    const doctorFilter = doctorId ? " AND doctorId = ?" : "";
    if (doctorId) params.push(Number(doctorId));
    execute(db, `DELETE FROM doctor_schedules WHERE roomId = ? AND date = ? AND shift = ?${doctorFilter};`, params);
    res.json({ message: doctorId ? "Doctor removed from date schedule" : "Date exception cleared. Restored to master weekly template." });
  } catch (err) {
    res.status(500).json({ error: "Failed to clear date exception" });
  }
});
router6.post("/reset-week", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { clinicId, startDate, endDate } = req.body;
    if (!clinicId || !startDate || !endDate) {
      res.status(400).json({ error: "clinicId, startDate, and endDate are required" });
      return;
    }
    const db = await getDb();
    const rooms = queryAll(db, "SELECT id FROM rooms WHERE clinicId = ?;", [Number(clinicId)]);
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
var schedules_default = router6;

// server/routes/tasks.ts
var import_express7 = __toESM(require("express"), 1);
var router7 = import_express7.default.Router();
router7.get("/", authenticateToken, requireTaskAccess, async (req, res) => {
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
router7.post("/", authenticateToken, requireTaskCreationAccess, async (req, res) => {
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
      relativeDirection = null
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
    const normalizedRelativeDays = relativeDays === null || relativeDays === "" ? null : Number(relativeDays);
    if (normalizedRelativeDays !== null && (!Number.isInteger(normalizedRelativeDays) || normalizedRelativeDays < 0 || normalizedRelativeDays > 3650)) {
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
        normalizedRelativeDays === null ? null : relativeDirection
      ]
    );
    const taskId = result.lastInsertRowid;
    const todayStr = formatCalendarDate(/* @__PURE__ */ new Date());
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
router7.put("/:id", authenticateToken, requireSuperAdmin, async (req, res) => {
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
      updateFutureInstances
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
    const normalizedRelativeDays = relativeDays === void 0 || relativeDays === null || relativeDays === "" ? null : Number(relativeDays);
    if (relativeDays !== void 0 && normalizedRelativeDays !== null && (!Number.isInteger(normalizedRelativeDays) || normalizedRelativeDays < 0 || normalizedRelativeDays > 3650)) {
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
        description !== void 0 ? description.trim() : null,
        shift || null,
        startDate || null,
        endDate !== void 0 ? endDate || null : existing.endDate,
        recurrenceType || null,
        relativeDays === void 0 ? null : normalizedRelativeDays,
        relativeDirection || null,
        taskId
      ]
    );
    if (updateFutureInstances) {
      const tomorrow = /* @__PURE__ */ new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split("T")[0];
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
router7.delete("/:id", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const taskId = Number(req.params.id);
    const db = await getDb();
    execute(db, "DELETE FROM tasks WHERE id = ?;", [taskId]);
    res.json({ message: "Task definition deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete task" });
  }
});
router7.get("/instances", authenticateToken, async (req, res) => {
  try {
    const { clinicId, date, shift } = req.query;
    if (!clinicId) {
      res.status(400).json({ error: "clinicId is required" });
      return;
    }
    const cId = Number(clinicId);
    if (!checkClinicAccess(req.user, cId)) {
      res.status(403).json({ error: "Access denied to this clinic" });
      return;
    }
    const targetDate = date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const db = await getDb();
    const currentUser = req.user;
    generateTaskInstancesForDateRange(db, targetDate, targetDate);
    let sql = `
      SELECT ti.id, ti.taskId, ti.clinicId, ti.shift, ti.date, ti.targetDate, ti.name, ti.description
      FROM task_instances ti
      WHERE ti.clinicId = ? AND ti.date = ?
    `;
    const params = [cId, targetDate];
    if (shift && ["MORNING", "EVENING"].includes(shift)) {
      sql += " AND ti.shift = ?";
      params.push(shift);
    }
    sql += " ORDER BY ti.shift ASC, ti.id ASC;";
    const instances = queryAll(db, sql, params);
    const instanceIds = instances.map((i) => i.id);
    const completionsMap = {};
    if (instanceIds.length > 0) {
      const placeholders = instanceIds.map(() => "?").join(",");
      const allCompletions = queryAll(
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
          completedAt: comp.completedAt
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
          isCompleted: isCompletedByMe,
          // Used by standard checklist checkmark for the current user
          completion: myCompletion || completions[0] || null
        };
      })
    });
  } catch (err) {
    console.error("Error fetching task instances:", err);
    res.status(500).json({ error: "Failed to fetch task instances" });
  }
});
router7.post("/instances/:id/complete", authenticateToken, async (req, res) => {
  try {
    const instanceId = Number(req.params.id);
    const db = await getDb();
    const user = req.user;
    if (user.role === "SUPER_ADMIN") {
      res.status(403).json({ error: "Super Admins can create and manage tasks, but cannot complete them" });
      return;
    }
    const instance = queryOne(
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
    const existing = queryOne(
      db,
      "SELECT id FROM task_completions WHERE taskInstanceId = ? AND userId = ?;",
      [instanceId, user.id]
    );
    if (existing) {
      res.status(400).json({ error: "You have already marked this task as completed" });
      return;
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
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
        completedAt: now
      }
    });
  } catch (err) {
    console.error("Error completing task:", err);
    res.status(500).json({ error: "Failed to complete task" });
  }
});
router7.post("/instances/:id/uncomplete", authenticateToken, async (req, res) => {
  try {
    const instanceId = Number(req.params.id);
    const db = await getDb();
    const user = req.user;
    if (user.role === "SUPER_ADMIN") {
      res.status(403).json({ error: "Super Admins cannot change task completion status" });
      return;
    }
    const targetUserId = user.id;
    const completion = queryOne(
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
var tasks_default = router7;

// server/routes/reports.ts
var import_express8 = __toESM(require("express"), 1);
var router8 = import_express8.default.Router();
router8.get("/completions", authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const {
      clinicId,
      startDate,
      endDate,
      dateFrom,
      dateTo,
      shift,
      taskId,
      userId,
      status
    } = req.query;
    const db = await getDb();
    const today = /* @__PURE__ */ new Date();
    const defaultFrom = new Date(today);
    defaultFrom.setDate(today.getDate() - 7);
    const fromDate = startDate || dateFrom || defaultFrom.toISOString().split("T")[0];
    const toDate = endDate || dateTo || today.toISOString().split("T")[0];
    generateTaskInstancesForDateRange(db, fromDate, toDate);
    let sql = `
      SELECT 
        ti.id as instanceId,
        ti.date,
        ti.shift,
        ti.name as taskName,
        ti.description as taskDescription,
        c.id as clinicId,
        c.name as clinicName,
        t.recurrenceType,
        CASE WHEN tc.id IS NOT NULL THEN 'COMPLETED' ELSE 'PENDING' END as status,
        tc.completedAt,
        u.id as userId,
        u.name as employeeName,
        u.nationalId as employeeNationalId
      FROM task_instances ti
      JOIN clinics c ON c.id = ti.clinicId
      LEFT JOIN tasks t ON t.id = ti.taskId
      LEFT JOIN task_completions tc ON tc.taskInstanceId = ti.id
      LEFT JOIN users u ON u.id = tc.userId
      WHERE ti.date >= ? AND ti.date <= ?
    `;
    const params = [fromDate, toDate];
    if (clinicId && clinicId !== "ALL" && !isNaN(Number(clinicId))) {
      sql += " AND ti.clinicId = ?";
      params.push(Number(clinicId));
    }
    if (shift && shift !== "ALL" && ["MORNING", "EVENING"].includes(shift)) {
      sql += " AND ti.shift = ?";
      params.push(shift);
    }
    if (taskId && taskId !== "ALL" && !isNaN(Number(taskId))) {
      sql += " AND ti.taskId = ?";
      params.push(Number(taskId));
    }
    if (userId && userId !== "ALL" && !isNaN(Number(userId))) {
      sql += " AND tc.userId = ?";
      params.push(Number(userId));
    }
    if (status && status !== "ALL") {
      if (status === "COMPLETED") {
        sql += " AND tc.id IS NOT NULL";
      } else if (status === "PENDING") {
        sql += " AND tc.id IS NULL";
      }
    }
    sql += " ORDER BY ti.date DESC, ti.shift ASC, ti.id ASC;";
    const rawReports = queryAll(db, sql, params);
    const reports = rawReports.map((r) => ({
      id: r.instanceId,
      instanceId: r.instanceId,
      date: r.date,
      shift: r.shift,
      taskName: r.taskName,
      taskDescription: r.taskDescription,
      clinicId: r.clinicId,
      clinicName: r.clinicName,
      status: r.status,
      isCompleted: r.status === "COMPLETED",
      completedAt: r.completedAt,
      userId: r.userId,
      employeeName: r.employeeName,
      completedByUserName: r.employeeName,
      employeeNationalId: r.employeeNationalId
    }));
    const totalCount = reports.length;
    const completedCount = reports.filter((r) => r.isCompleted).length;
    const pendingCount = totalCount - completedCount;
    const completionRate = totalCount > 0 ? Math.round(completedCount / totalCount * 100) : 0;
    res.json({
      filters: { clinicId, dateFrom: fromDate, dateTo: toDate, startDate: fromDate, endDate: toDate, shift, taskId, userId, status },
      summary: {
        total: totalCount,
        totalCount,
        completed: completedCount,
        completedCount,
        pending: pendingCount,
        pendingCount,
        completionRate
      },
      reports,
      records: reports
    });
  } catch (err) {
    console.error("Error generating report:", err);
    res.status(500).json({ error: "Failed to generate completion report" });
  }
});
router8.get("/dashboard-stats", authenticateToken, async (req, res) => {
  try {
    const db = await getDb();
    const user = req.user;
    const todayDate = /* @__PURE__ */ new Date();
    const today = todayDate.toISOString().split("T")[0];
    const todayDayOfWeek = todayDate.getDay();
    generateTaskInstancesForDateRange(db, today, today);
    if (user.role === "SUPER_ADMIN") {
      const clinicCount = queryOne(db, "SELECT COUNT(*) as c FROM clinics;")?.c || 0;
      const userCount = queryOne(db, "SELECT COUNT(*) as c FROM users WHERE role = 'USER';")?.c || 0;
      const doctorCount = queryOne(db, "SELECT COUNT(*) as c FROM doctors;")?.c || 0;
      const roomCount = queryOne(db, "SELECT COUNT(*) as c FROM rooms;")?.c || 0;
      const todayTasks = queryOne(db, "SELECT COUNT(*) as c FROM task_instances WHERE date = ?;", [today])?.c || 0;
      const todayCompleted = queryOne(
        db,
        `SELECT COUNT(*) as c FROM task_completions tc JOIN task_instances ti ON ti.id = tc.taskInstanceId WHERE ti.date = ?;`,
        [today]
      )?.c || 0;
      const todaySchedules = queryOne(
        db,
        `SELECT COUNT(*) as c
           FROM (
             -- Master templates active today with no date override
             SELECT dst.roomId, dst.shift
             FROM doctor_schedule_templates dst
             LEFT JOIN doctor_schedules ds ON ds.roomId = dst.roomId AND ds.date = ? AND ds.shift = dst.shift
             WHERE dst.dayOfWeek = ? AND ds.id IS NULL
             UNION ALL
             -- Explicit date schedules active today (with doctor assigned and not cancelled)
             SELECT ds.roomId, ds.shift
             FROM doctor_schedules ds
             WHERE ds.date = ? AND ds.doctorId IS NOT NULL AND (ds.status IS NULL OR ds.status != 'CANCELLED')
           );`,
        [today, todayDayOfWeek, today]
      )?.c || 0;
      const recentCompletions = queryAll(
        db,
        `SELECT ti.name as taskName, ti.shift, c.name as clinicName, u.name as employeeName, tc.completedAt
         FROM task_completions tc
         JOIN task_instances ti ON ti.id = tc.taskInstanceId
         JOIN clinics c ON c.id = ti.clinicId
         JOIN users u ON u.id = tc.userId
         ORDER BY tc.completedAt DESC
         LIMIT 5;`
      );
      res.json({
        role: "SUPER_ADMIN",
        metrics: {
          clinics: clinicCount,
          employees: userCount,
          doctors: doctorCount,
          rooms: roomCount,
          todayTasks,
          todayCompleted,
          todayPending: todayTasks - todayCompleted,
          todaySchedules
        },
        recentCompletions
      });
    } else {
      const assignedIds = user.assignedClinics || [];
      if (assignedIds.length === 0) {
        res.json({
          role: "USER",
          metrics: {
            assignedClinicsCount: 0,
            todayTasks: 0,
            todayCompleted: 0,
            todayPending: 0,
            todayDoctorSchedules: 0
          },
          recentCompletions: []
        });
        return;
      }
      const placeholders = assignedIds.map(() => "?").join(",");
      const todayTasks = queryOne(
        db,
        `SELECT COUNT(*) as c FROM task_instances WHERE clinicId IN (${placeholders}) AND date = ?;`,
        [...assignedIds, today]
      )?.c || 0;
      const todayCompleted = queryOne(
        db,
        `SELECT COUNT(*) as c 
           FROM task_completions tc 
           JOIN task_instances ti ON ti.id = tc.taskInstanceId 
           WHERE ti.clinicId IN (${placeholders}) AND ti.date = ?;`,
        [...assignedIds, today]
      )?.c || 0;
      const todayDoctorSchedules = queryOne(
        db,
        `SELECT COUNT(*) as c
           FROM (
             -- Master templates active today for assigned clinics with no date override
             SELECT dst.roomId, dst.shift
             FROM doctor_schedule_templates dst
             JOIN rooms r ON r.id = dst.roomId
             LEFT JOIN doctor_schedules ds ON ds.roomId = dst.roomId AND ds.date = ? AND ds.shift = dst.shift
             WHERE r.clinicId IN (${placeholders}) AND dst.dayOfWeek = ? AND ds.id IS NULL
             UNION ALL
             -- Explicit date schedules active today for assigned clinics (not cancelled)
             SELECT ds.roomId, ds.shift
             FROM doctor_schedules ds
             JOIN rooms r ON r.id = ds.roomId
             WHERE r.clinicId IN (${placeholders}) AND ds.date = ? AND ds.doctorId IS NOT NULL AND (ds.status IS NULL OR ds.status != 'CANCELLED')
           );`,
        [today, ...assignedIds, todayDayOfWeek, ...assignedIds, today]
      )?.c || 0;
      const myCompletedToday = queryOne(
        db,
        `SELECT COUNT(*) as c 
           FROM task_completions tc 
           JOIN task_instances ti ON ti.id = tc.taskInstanceId 
           WHERE tc.userId = ? AND ti.date = ?;`,
        [user.id, today]
      )?.c || 0;
      res.json({
        role: "USER",
        metrics: {
          assignedClinicsCount: assignedIds.length,
          todayTasks,
          todayCompleted,
          todayPending: todayTasks - todayCompleted,
          todayDoctorSchedules,
          myCompletedToday
        }
      });
    }
  } catch (err) {
    console.error("Error fetching dashboard stats:", err);
    res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
});
var reports_default = router8;

// server.ts
async function startServer() {
  await getDb();
  const app = (0, import_express9.default)();
  const PORT = 3e3;
  app.use(import_express9.default.json());
  app.use(import_express9.default.urlencoded({ extended: true }));
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  });
  app.use("/api/auth", auth_default);
  app.use("/api/clinics", clinics_default);
  app.use("/api/users", users_default);
  app.use("/api/doctors", doctors_default);
  app.use("/api/rooms", rooms_default);
  app.use("/api/schedules", schedules_default);
  app.use("/api/tasks", tasks_default);
  app.use("/api/reports", reports_default);
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path2.default.join(process.cwd(), "dist");
    app.use(import_express9.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path2.default.join(distPath, "index.html"));
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
//# sourceMappingURL=server.cjs.map
