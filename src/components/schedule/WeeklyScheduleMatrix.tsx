import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { WeeklyScheduleResponse, Room, Shift, DoctorSchedule } from "../../types";
import { DoctorScheduleModal } from "./DoctorScheduleModal";
import { Button } from "../common/Button";
import { Badge } from "../common/Badge";
import { LoadingState } from "../common/LoadingState";
import { EmptyState } from "../common/EmptyState";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Sun,
  Moon,
  Plus,
  RefreshCw,
  DoorOpen,
  Sparkles,
  RotateCcw,
  Ban,
  Sliders,
} from "lucide-react";

interface WeeklyScheduleMatrixProps {
  clinicId: number;
  onSwitchToTemplate?: () => void;
}

// Helper: Format Date to YYYY-MM-DD local string (timezone safe)
function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Helper: Parse YYYY-MM-DD string to local Date at noon (prevents midnight/DST edge cases)
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

// Helper: Calculate last Saturday relative to a given date (default: today)
function getSaturdayOfWeek(d: Date = new Date()): string {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
  const day = date.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diff = (day + 1) % 7; // if Sat (6) -> 0; Sun (0) -> 1; Mon (1) -> 2, ..., Fri (5) -> 6
  date.setDate(date.getDate() - diff);
  return formatLocalDate(date);
}

// Helper: Calculate upcoming Friday (6 days after Saturday) -> full 7-day span: Sat, Sun, Mon, Tue, Wed, Thu, Fri
function getFridayOfWeek(satDateStr: string): string {
  const sat = parseLocalDate(satDateStr);
  sat.setDate(sat.getDate() + 6);
  return formatLocalDate(sat);
}

export const WeeklyScheduleMatrix: React.FC<WeeklyScheduleMatrixProps> = ({
  clinicId,
  onSwitchToTemplate,
}) => {
  const { user, getAuthHeaders } = useAuth();
  const { t, isRtl } = useLanguage();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  // Date range state (Default: Saturday to Friday -> 7 full days)
  const [startDate, setStartDate] = useState<string>(() => getSaturdayOfWeek(new Date()));
  const [endDate, setEndDate] = useState<string>(() => getFridayOfWeek(getSaturdayOfWeek(new Date())));

  const [scheduleData, setScheduleData] = useState<WeeklyScheduleResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResettingWeek, setIsResettingWeek] = useState(false);

  // Modal state
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    room: Room | null;
    date: string;
    shift: Shift;
    currentScheduleId?: number | null;
    currentDoctorId?: number | null;
    isTemplate?: boolean;
    isException?: boolean;
    isOff?: boolean;
  }>({
    isOpen: false,
    room: null,
    date: "",
    shift: "MORNING",
  });

  const fetchSchedule = useCallback(async () => {
    if (!clinicId || !startDate || !endDate) return;
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/schedules/weekly?clinicId=${clinicId}&startDate=${startDate}&endDate=${endDate}`,
        {
          headers: getAuthHeaders(),
        }
      );
      if (res.ok) {
        const data = await res.json();
        setScheduleData(data);
      }
    } catch (err) {
      console.error("Failed to load schedule:", err);
    } finally {
      setIsLoading(false);
    }
  }, [clinicId, startDate, endDate]);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  // Navigate 1 week back
  const handlePrevWeek = () => {
    const s = parseLocalDate(startDate);
    s.setDate(s.getDate() - 7);
    const newStart = formatLocalDate(s);

    const e = parseLocalDate(endDate);
    e.setDate(e.getDate() - 7);
    const newEnd = formatLocalDate(e);

    setStartDate(newStart);
    setEndDate(newEnd);
  };

  // Navigate 1 week forward
  const handleNextWeek = () => {
    const s = parseLocalDate(startDate);
    s.setDate(s.getDate() + 7);
    const newStart = formatLocalDate(s);

    const e = parseLocalDate(endDate);
    e.setDate(e.getDate() + 7);
    const newEnd = formatLocalDate(e);

    setStartDate(newStart);
    setEndDate(newEnd);
  };

  // Reset to current standard week (Saturday to Friday)
  const handleResetToCurrentWeek = () => {
    const sat = getSaturdayOfWeek(new Date());
    const fri = getFridayOfWeek(sat);
    setStartDate(sat);
    setEndDate(fri);
  };

  // Reset all date exceptions for this week
  const handleResetWeekToTemplate = async () => {
    if (!confirm(t("resetWeekConfirm"))) return;
    setIsResettingWeek(true);
    try {
      const res = await fetch("/api/schedules/reset-week", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          clinicId,
          startDate,
          endDate,
        }),
      });
      if (res.ok) {
        fetchSchedule();
      }
    } catch (err) {
      console.error("Failed to reset week to template:", err);
    } finally {
      setIsResettingWeek(false);
    }
  };

  const handleCellClick = (room: Room, date: string, shift: Shift, existing: DoctorSchedule | null) => {
    if (!isSuperAdmin) return;
    setModalState({
      isOpen: true,
      room,
      date,
      shift,
      currentScheduleId: existing ? existing.id : null,
      currentDoctorId: existing ? existing.doctorId : null,
      isTemplate: existing ? existing.isTemplate : false,
      isException: existing ? existing.isException : false,
      isOff: existing ? existing.isOff : false,
    });
  };

  const rooms = scheduleData?.rooms || [];
  const matrix = scheduleData?.matrix || [];
  const clinic = scheduleData?.clinic;

  // Format date helper: e.g. "28/08"
  const formatDateDisplay = (dateStr: string) => {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}`;
    }
    return dateStr;
  };

  // Check if date is today (timezone safe)
  const isToday = (dateStr: string) => {
    return dateStr === formatLocalDate(new Date());
  };

  return (
    <div className="space-y-4">
      {/* Schedule Top Navigation & Date Selection Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        {/* Week navigation buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevWeek}
            leftIcon={isRtl ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          >
            {t("previousWeek")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextWeek}
            rightIcon={isRtl ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          >
            {t("nextWeek")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleResetToCurrentWeek}
            leftIcon={<Calendar className="w-3.5 h-3.5" />}
          >
            {t("currentWeek")}
          </Button>
        </div>

        {/* Custom Start & End Date Pickers & Actions */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 max-w-full">
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-semibold text-slate-500 px-1">
                {t("startDate")}:
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  if (e.target.value) {
                    setStartDate(e.target.value);
                    if (e.target.value > endDate) {
                      setEndDate(e.target.value);
                    }
                  }
                }}
                className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <span className="text-slate-400 font-bold hidden sm:inline">→</span>

            <div className="flex items-center gap-1">
              <span className="text-[11px] font-semibold text-slate-500 px-1">
                {t("endDate")}:
              </span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => {
                  if (e.target.value) {
                    setEndDate(e.target.value);
                  }
                }}
                className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={fetchSchedule}
            disabled={isLoading}
            title={t("refresh")}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </Button>

          {isSuperAdmin && onSwitchToTemplate && (
            <Button
              variant="outline"
              size="sm"
              onClick={onSwitchToTemplate}
              leftIcon={<Sliders className="w-3.5 h-3.5 text-teal-600" />}
            >
              {t("editTemplate")}
            </Button>
          )}

          {isSuperAdmin && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetWeekToTemplate}
              disabled={isResettingWeek}
              leftIcon={<RotateCcw className="w-3.5 h-3.5 text-slate-500" />}
              title={t("resetWeekToTemplate")}
            >
              <span className="hidden sm:inline">{t("resetWeekToTemplate")}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Legend and Shift Indicators */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-lg text-xs text-slate-700 dark:text-slate-300">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 font-medium">
            <DoorOpen className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
            <span>{isSuperAdmin ? t("scheduleLegend") : t("scheduleReadonlyLegend")}</span>
          </div>
          {/* Visual Legend Tags */}
          <div className="flex items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400">
              <span className="w-2 h-2 rounded-full bg-teal-500" />
              {t("fromTemplate")}
            </span>
            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              {t("dateException")}
            </span>
            <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              {t("roomOff")}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 font-medium text-[11px] self-end sm:self-center">
          <span className="flex items-center gap-1">
            <Sun className="w-3.5 h-3.5 text-amber-500" /> {t("morning")}
          </span>
          <span className="flex items-center gap-1">
            <Moon className="w-3.5 h-3.5 text-indigo-500" /> {t("evening")}
          </span>
        </div>
      </div>

      {/* Main Schedule Table */}
      {isLoading && !scheduleData ? (
        <LoadingState message={t("loading")} />
      ) : rooms.length === 0 ? (
        <EmptyState
          title={t("noData")}
          description="No rooms are configured for this clinic yet. Add rooms first to begin doctor scheduling."
        />
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start border-collapse">
              {/* Header Row 1: Shift Groupings */}
              <thead>
                <tr className="bg-slate-100/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                  <th
                    rowSpan={2}
                    className="p-3 text-start min-w-[130px] border-e border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800"
                  >
                    {t("date")} / {t("overview")}
                  </th>
                  {/* Morning Shift Group */}
                  <th
                    colSpan={rooms.length}
                    className="p-2.5 text-center bg-amber-50/80 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-e border-slate-200 dark:border-slate-700 font-bold"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <Sun className="w-4 h-4 text-amber-500" />
                      <span>{t("morningShiftHeader")}</span>
                    </div>
                  </th>
                  {/* Evening Shift Group */}
                  <th
                    colSpan={rooms.length}
                    className="p-2.5 text-center bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 font-bold"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <Moon className="w-4 h-4 text-indigo-500" />
                      <span>{t("eveningShiftHeader")}</span>
                    </div>
                  </th>
                </tr>

                {/* Header Row 2: Room Sub-columns */}
                <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700">
                  {/* Morning Rooms */}
                  {rooms.map((r) => (
                    <th
                      key={`m-${r.id}`}
                      className="p-2.5 text-center min-w-[140px] max-w-[180px] border-e border-slate-200 dark:border-slate-700/60 bg-amber-50/30 dark:bg-amber-950/20 truncate"
                      title={r.name}
                    >
                      {r.name}
                    </th>
                  ))}
                  {/* Evening Rooms */}
                  {rooms.map((r, idx) => (
                    <th
                      key={`e-${r.id}`}
                      className={`p-2.5 text-center min-w-[140px] max-w-[180px] bg-indigo-50/30 dark:bg-indigo-950/20 truncate ${idx < rooms.length - 1 ? "border-e border-slate-200 dark:border-slate-700/60" : ""
                        }`}
                      title={r.name}
                    >
                      {r.name}
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Body: Schedule Day Rows */}
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {matrix.map((day) => {
                  const todayActive = isToday(day.date);
                  return (
                    <tr
                      key={day.date}
                      className={`transition-colors ${todayActive
                        ? "bg-teal-50/30 dark:bg-teal-950/20"
                        : "hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                        }`}
                    >
                      {/* Date & Day Label */}
                      <td className="p-3 border-e border-slate-200 dark:border-slate-700/80 bg-slate-50/60 dark:bg-slate-900/80 whitespace-nowrap">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                              {t(day.dayOfWeek as any)}
                            </p>
                            <p className="text-[11px] text-slate-500 font-medium font-mono">
                              {formatDateDisplay(day.date)}
                            </p>
                          </div>
                          {todayActive && (
                            <Badge variant="teal" size="sm">
                              {t("overview")}
                            </Badge>
                          )}
                        </div>
                      </td>

                      {/* Morning Shift Cells */}
                      {rooms.map((room) => {
                        const sched = day.shifts.MORNING[room.id];
                        return (
                          <td
                            key={`m-cell-${room.id}-${day.date}`}
                            onClick={() => handleCellClick(room, day.date, "MORNING", sched)}
                            className={`p-2.5 text-center border-e border-slate-200 dark:border-slate-700/60 align-middle ${isSuperAdmin
                              ? "cursor-pointer hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-colors"
                              : ""
                              }`}
                          >
                            {sched ? (
                              sched.isOff ? (
                                <div className="p-2 rounded-lg bg-rose-50/85 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 text-start shadow-2xs">
                                  <div className="flex items-center justify-between gap-1 mb-0.5">
                                    <p
                                      className="font-bold text-rose-950 dark:text-rose-200 text-xs truncate line-through opacity-85"
                                      title={sched.doctorName || t("roomOff")}
                                    >
                                      {sched.doctorName || t("roomOff")}
                                    </p>
                                    <span
                                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500 text-white shrink-0 flex items-center gap-0.5 shadow-2xs"
                                      title={t("doctorApologizedHelp")}
                                    >
                                      <Ban className="w-2.5 h-2.5" />
                                      {t("apology")}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-1 text-[10px]">
                                    <p className="text-rose-600 dark:text-rose-400 truncate text-[10px]">
                                      {sched.doctorSpecialist || t("roomOff")}
                                    </p>
                                    {sched.note && sched.note !== "Marked off" && (
                                      <span className="text-[9px] text-rose-500 dark:text-rose-400 font-medium truncate" title={sched.note}>
                                        {sched.note}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className={`p-2 rounded-lg border text-start transition-shadow ${sched.isException
                                    ? "bg-amber-100/80 dark:bg-amber-900/50 border-amber-400 dark:border-amber-600 shadow-xs"
                                    : "bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/70"
                                    }`}
                                >
                                  <div className="space-y-1.5">
                                    <div className="rounded-md border border-amber-300/80 dark:border-amber-700/80 bg-white/50 dark:bg-slate-900/30 p-1.5">
                                      <div className="flex items-center justify-between gap-1 mb-0.5">
                                        <p className="font-bold text-slate-900 dark:text-slate-100 text-xs truncate">
                                          {sched.doctorName}
                                        </p>
                                        {sched.isException ? (
                                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-amber-500 text-white shrink-0" title={t("dateException")}>
                                            {t("dateException")}
                                          </span>
                                        ) : (
                                          <span className="text-[9px] font-semibold text-teal-600 dark:text-teal-400 shrink-0" title={t("fromTemplate")}>•</span>
                                        )}
                                      </div>
                                      <p className="text-[10px] text-amber-700 dark:text-amber-300 truncate">
                                        {sched.doctorSpecialist}
                                      </p>
                                    </div>
                                    {sched.additionalDoctors?.map((doctor) => (
                                      <div key={doctor.doctorId} className="rounded-md border border-amber-300/80 dark:border-amber-700/80 bg-white/50 dark:bg-slate-900/30 p-1.5">
                                        <p className="font-bold text-slate-900 dark:text-slate-100 text-xs truncate">{doctor.doctorName}</p>
                                        <p className="text-[10px] text-amber-700 dark:text-amber-300 truncate">{doctor.doctorSpecialist}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )
                            ) : (
                              <div className="py-2 text-slate-300 dark:text-slate-600 flex items-center justify-center">
                                {isSuperAdmin ? (
                                  <span className="text-[11px] text-slate-400 hover:text-teal-600 flex items-center gap-1">
                                    <Plus className="w-3 h-3" />
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}

                      {/* Evening Shift Cells */}
                      {rooms.map((room, idx) => {
                        const sched = day.shifts.EVENING[room.id];
                        return (
                          <td
                            key={`e-cell-${room.id}-${day.date}`}
                            onClick={() => handleCellClick(room, day.date, "EVENING", sched)}
                            className={`p-2.5 text-center align-middle ${idx < rooms.length - 1 ? "border-e border-slate-200 dark:border-slate-700/60" : ""
                              } ${isSuperAdmin
                                ? "cursor-pointer hover:bg-indigo-100/50 dark:hover:bg-indigo-900/30 transition-colors"
                                : ""
                              }`}
                          >
                            {sched ? (
                              sched.isOff ? (
                                <div className="p-2 rounded-lg bg-rose-50/85 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 text-start shadow-2xs">
                                  <div className="flex items-center justify-between gap-1 mb-0.5">
                                    <p
                                      className="font-bold text-rose-950 dark:text-rose-200 text-xs truncate line-through opacity-85"
                                      title={sched.doctorName || t("roomOff")}
                                    >
                                      {sched.doctorName || t("roomOff")}
                                    </p>
                                    <span
                                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500 text-white shrink-0 flex items-center gap-0.5 shadow-2xs"
                                      title={t("doctorApologizedHelp")}
                                    >
                                      <Ban className="w-2.5 h-2.5" />
                                      {t("apology")}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-1 text-[10px]">
                                    <p className="text-rose-600 dark:text-rose-400 truncate text-[10px]">
                                      {sched.doctorSpecialist || t("roomOff")}
                                    </p>
                                    {sched.note && sched.note !== "Marked off" && (
                                      <span className="text-[9px] text-rose-500 dark:text-rose-400 font-medium truncate" title={sched.note}>
                                        {sched.note}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className={`p-2 rounded-lg border text-start transition-shadow ${sched.isException
                                    ? "bg-indigo-100/80 dark:bg-indigo-900/50 border-indigo-400 dark:border-indigo-600 shadow-xs"
                                    : "bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800/70"
                                    }`}
                                >
                                  <div className="space-y-1.5">
                                    <div className="rounded-md border border-indigo-300/80 dark:border-indigo-700/80 bg-white/50 dark:bg-slate-900/30 p-1.5">
                                      <div className="flex items-center justify-between gap-1 mb-0.5">
                                        <p className="font-bold text-slate-900 dark:text-slate-100 text-xs truncate">{sched.doctorName}</p>
                                        {sched.isException ? (
                                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-indigo-500 text-white shrink-0" title={t("dateException")}>{t("dateException")}</span>
                                        ) : (
                                          <span className="text-[9px] font-semibold text-teal-600 dark:text-teal-400 shrink-0" title={t("fromTemplate")}>•</span>
                                        )}
                                      </div>
                                      <p className="text-[10px] text-indigo-700 dark:text-indigo-300 truncate">{sched.doctorSpecialist}</p>
                                    </div>
                                    {sched.additionalDoctors?.map((doctor) => (
                                      <div key={doctor.doctorId} className="rounded-md border border-indigo-300/80 dark:border-indigo-700/80 bg-white/50 dark:bg-slate-900/30 p-1.5">
                                        <p className="font-bold text-slate-900 dark:text-slate-100 text-xs truncate">{doctor.doctorName}</p>
                                        <p className="text-[10px] text-indigo-700 dark:text-indigo-300 truncate">{doctor.doctorSpecialist}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )
                            ) : (
                              <div className="py-2 text-slate-300 dark:text-slate-600 flex items-center justify-center">
                                {isSuperAdmin ? (
                                  <span className="text-[11px] text-slate-400 hover:text-teal-600 flex items-center gap-1">
                                    <Plus className="w-3 h-3" />
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Doctor Slot Assignment Modal */}
      {modalState.room && (
        <DoctorScheduleModal
          isOpen={modalState.isOpen}
          onClose={() => setModalState((prev) => ({ ...prev, isOpen: false }))}
          onSuccess={fetchSchedule}
          clinicId={clinicId}
          clinicName={clinic?.name || ""}
          room={modalState.room}
          date={modalState.date}
          shift={modalState.shift}
          currentDoctorId={modalState.currentDoctorId}
          isTemplate={modalState.isTemplate}
          isException={modalState.isException}
          isOff={modalState.isOff}
        />
      )}
    </div>
  );
};
