export type Role = "SUPER_ADMIN" | "USER";
export type Shift = "MORNING" | "EVENING";
export type RecurrenceType = "NONE" | "DAILY";
export type Language = "en" | "ar";

export interface Clinic {
  id: number;
  name: string;
  roomCount?: number;
  doctorCount?: number;
  employeeCount?: number;
}

export interface User {
  id: number;
  name: string;
  dob: string;
  username: string;
  nationalId: string;
  role: Role;
  isActive?: boolean | number;
  canAddTasks?: boolean | number;
  assignedClinics?: Array<{ id: number; name: string }>;
}

export interface Doctor {
  id: number;
  name: string;
  specialist: string;
  assignedClinics?: Array<{ id: number; name: string }>;
  clinics?: Array<{ id: number; name: string }>;
}

export interface Room {
  id: number;
  clinicId: number;
  name: string;
  clinicName?: string;
}

export interface DoctorSchedule {
  id: number;
  doctorId: number | null;
  doctorName?: string | null;
  doctorSpecialist?: string | null;
  roomId: number;
  roomName: string;
  date: string;
  shift: Shift;
  status?: "SCHEDULED" | "CANCELLED";
  isTemplate?: boolean;
  isException?: boolean;
  isOff?: boolean;
  isCancelled?: boolean;
  note?: string | null;
  additionalDoctors?: Array<{
    doctorId: number;
    doctorName: string;
    doctorSpecialist: string;
  }>;
}

export interface DoctorScheduleTemplate {
  id: number;
  clinicId: number;
  roomId: number;
  roomName?: string;
  dayOfWeek: number;
  dayName?: string;
  shift: Shift;
  doctorId: number;
  doctorName: string;
  doctorSpecialist: string;
  additionalDoctors?: Array<{
    doctorId: number;
    doctorName: string;
    doctorSpecialist: string;
  }>;
}

export interface TemplateDay {
  dayOfWeek: string;
  dayIndex: number;
  shifts: {
    MORNING: Record<number, DoctorScheduleTemplate | null>;
    EVENING: Record<number, DoctorScheduleTemplate | null>;
  };
}

export interface WeeklyTemplateResponse {
  clinic: Clinic;
  rooms: Room[];
  days: Array<{ dayOfWeek: string; dayIndex: number }>;
  templates: DoctorScheduleTemplate[];
  matrix: TemplateDay[];
}

export interface Task {
  id: number;
  name: string;
  description: string;
  clinicId: number;
  clinicName?: string;
  shift: Shift;
  startDate: string;
  endDate?: string | null;
  recurrenceType: RecurrenceType;
  relativeDays?: number | null;
  relativeDirection?: "AFTER" | "BEFORE" | null;
  isFixed?: boolean | number;
  instanceCount?: number;
}

export interface TaskCompletion {
  id: number;
  taskInstanceId?: number;
  userId: number;
  userName: string;
  completedAt: string;
}

export interface TaskInstance {
  id: number;
  taskId: number | null;
  clinicId: number;
  shift: Shift;
  date: string;
  targetDate?: string;
  name: string;
  description: string;
  isCompleted: boolean;
  isCompletedByMe?: boolean;
  myCompletion?: TaskCompletion | null;
  completions?: TaskCompletion[];
  completionCount?: number;
  completion: TaskCompletion | null;
}

export interface ScheduleDay {
  date: string;
  dayOfWeek: string;
  dayIndex: number;
  shifts: {
    MORNING: Record<number, DoctorSchedule | null>;
    EVENING: Record<number, DoctorSchedule | null>;
  };
}

export interface WeeklyScheduleResponse {
  clinic: Clinic;
  rooms: Room[];
  startDate?: string;
  endDate?: string;
  weekStart: string;
  weekEnd: string;
  days: Array<{ date: string; dayOfWeek: string; dayIndex: number }>;
  schedules: DoctorSchedule[];
  matrix: ScheduleDay[];
}

export interface CompletionReportItem {
  instanceId: number;
  date: string;
  shift: Shift;
  taskName: string;
  taskDescription: string;
  clinicId: number;
  clinicName: string;
  recurrenceType: RecurrenceType | null;
  status: "COMPLETED" | "PENDING";
  completedAt: string | null;
  userId: number | null;
  employeeName: string | null;
  employeeNationalId: string | null;
}

export interface DashboardStats {
  role: Role;
  metrics: {
    clinics?: number;
    employees?: number;
    doctors?: number;
    rooms?: number;
    todayTasks: number;
    todayCompleted: number;
    todayPending: number;
    todaySchedules?: number;
    todayDoctorSchedules?: number;
    assignedClinicsCount?: number;
    myCompletedToday?: number;
  };
  recentCompletions?: Array<{
    taskName: string;
    shift: Shift;
    clinicName: string;
    employeeName: string;
    completedAt: string;
  }>;
}
