import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { WeeklyTemplateResponse, Room, Shift, DoctorScheduleTemplate } from "../../types";
import { DoctorScheduleModal } from "./DoctorScheduleModal";
import { Button } from "../common/Button";
import { Badge } from "../common/Badge";
import { LoadingState } from "../common/LoadingState";
import { EmptyState } from "../common/EmptyState";
import {
  Sun,
  Moon,
  Plus,
  RefreshCw,
  DoorOpen,
  Calendar,
  Sparkles,
} from "lucide-react";

interface WeeklyTemplateMatrixProps {
  clinicId: number;
  onSwitchToCalendar?: () => void;
}

export const WeeklyTemplateMatrix: React.FC<WeeklyTemplateMatrixProps> = ({
  clinicId,
  onSwitchToCalendar,
}) => {
  const { user, getAuthHeaders } = useAuth();
  const { t } = useLanguage();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const [templateData, setTemplateData] = useState<WeeklyTemplateResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Modal state for editing master template
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    room: Room | null;
    dayOfWeek: number;
    dayName: string;
    shift: Shift;
    currentDoctorId?: number | null;
  }>({
    isOpen: false,
    room: null,
    dayOfWeek: 0,
    dayName: "",
    shift: "MORNING",
  });

  const fetchTemplate = useCallback(async () => {
    if (!clinicId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/schedules/template?clinicId=${clinicId}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setTemplateData(data);
      }
    } catch (err) {
      console.error("Failed to load schedule template:", err);
    } finally {
      setIsLoading(false);
    }
  }, [clinicId]);

  useEffect(() => {
    fetchTemplate();
  }, [fetchTemplate]);

  const handleCellClick = (
    room: Room,
    dayOfWeek: number,
    dayName: string,
    shift: Shift,
    existing: DoctorScheduleTemplate | null
  ) => {
    if (!isSuperAdmin) return;
    setModalState({
      isOpen: true,
      room,
      dayOfWeek,
      dayName,
      shift,
      currentDoctorId: existing ? existing.doctorId : null,
    });
  };

  const rooms = templateData?.rooms || [];
  const matrix = templateData?.matrix || [];
  const clinic = templateData?.clinic;

  return (
    <div className="space-y-4">
      {/* Top Banner explaining Master Template */}
      <div className="p-4 bg-teal-50/80 dark:bg-teal-950/40 rounded-xl border border-teal-200/80 dark:border-teal-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300 rounded-lg shrink-0 mt-0.5">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-teal-950 dark:text-teal-100">
              {t("scheduleTemplateTitle")} ({clinic?.name})
            </h3>
            <p className="text-xs text-teal-700 dark:text-teal-300/90 mt-0.5 leading-relaxed">
              {t("templateLegend")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchTemplate}
            disabled={isLoading}
            title={t("refresh")}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </Button>

          {onSwitchToCalendar && (
            <Button
              variant="outline"
              size="sm"
              onClick={onSwitchToCalendar}
              leftIcon={<Calendar className="w-3.5 h-3.5" />}
            >
              {t("backToCalendar")}
            </Button>
          )}
        </div>
      </div>

      {/* Instructions & Shift Indicators */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-lg text-xs text-slate-700 dark:text-slate-300">
        <div className="flex items-center gap-2">
          <DoorOpen className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
          <span className="font-medium">
            {isSuperAdmin
              ? t("scheduleLegend")
              : t("scheduleReadonlyLegend")}
          </span>
        </div>
        <div className="flex items-center gap-3 font-medium text-[11px]">
          <span className="flex items-center gap-1">
            <Sun className="w-3.5 h-3.5 text-amber-500" /> {t("morning")}
          </span>
          <span className="flex items-center gap-1">
            <Moon className="w-3.5 h-3.5 text-indigo-500" /> {t("evening")}
          </span>
        </div>
      </div>

      {/* Main Template Table */}
      {isLoading && !templateData ? (
        <LoadingState message={t("loading")} />
      ) : rooms.length === 0 ? (
        <EmptyState
          title={t("noData")}
          description="No rooms are configured for this clinic yet. Add rooms first to configure the weekly master schedule template."
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
                    {t("day")}
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
                      key={`tmpl-m-${r.id}`}
                      className="p-2.5 text-center min-w-[140px] max-w-[180px] border-e border-slate-200 dark:border-slate-700/60 bg-amber-50/30 dark:bg-amber-950/20 truncate"
                      title={r.name}
                    >
                      {r.name}
                    </th>
                  ))}
                  {/* Evening Rooms */}
                  {rooms.map((r, idx) => (
                    <th
                      key={`tmpl-e-${r.id}`}
                      className={`p-2.5 text-center min-w-[140px] max-w-[180px] bg-indigo-50/30 dark:bg-indigo-950/20 truncate ${idx < rooms.length - 1 ? "border-e border-slate-200 dark:border-slate-700/60" : ""
                        }`}
                      title={r.name}
                    >
                      {r.name}
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Body: Template Days */}
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {matrix.map((day) => {
                  return (
                    <tr
                      key={`tmpl-day-${day.dayIndex}`}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Day Name */}
                      <td className="p-3 border-e border-slate-200 dark:border-slate-700/80 bg-slate-50/60 dark:bg-slate-900/80 whitespace-nowrap">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                              {t(day.dayOfWeek as any)}
                            </p>
                            <span className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold">
                              {t("fromTemplate")}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Morning Shift Cells */}
                      {rooms.map((room) => {
                        const sched = day.shifts.MORNING[room.id];
                        return (
                          <td
                            key={`tmpl-m-cell-${room.id}-${day.dayIndex}`}
                            onClick={() =>
                              handleCellClick(room, day.dayIndex, day.dayOfWeek, "MORNING", sched)
                            }
                            className={`p-2.5 text-center border-e border-slate-200 dark:border-slate-700/60 align-middle ${isSuperAdmin
                              ? "cursor-pointer hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-colors"
                              : ""
                              }`}
                          >
                            {sched ? (
                              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/70 text-start group">
                                <div className="space-y-1.5">
                                  <div className="rounded-md border border-amber-300/80 dark:border-amber-700/80 bg-white/50 dark:bg-slate-900/30 p-1.5">
                                    <p className="font-bold text-slate-900 dark:text-slate-100 text-xs truncate">{sched.doctorName}</p>
                                    <p className="text-[10px] text-amber-700 dark:text-amber-300 truncate">{sched.doctorSpecialist}</p>
                                  </div>
                                  {sched.additionalDoctors?.map((doctor) => (
                                    <div key={doctor.doctorId} className="rounded-md border border-amber-300/80 dark:border-amber-700/80 bg-white/50 dark:bg-slate-900/30 p-1.5">
                                      <p className="font-bold text-slate-900 dark:text-slate-100 text-xs truncate">{doctor.doctorName}</p>
                                      <p className="text-[10px] text-amber-700 dark:text-amber-300 truncate">{doctor.doctorSpecialist}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
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
                            key={`tmpl-e-cell-${room.id}-${day.dayIndex}`}
                            onClick={() =>
                              handleCellClick(room, day.dayIndex, day.dayOfWeek, "EVENING", sched)
                            }
                            className={`p-2.5 text-center align-middle ${idx < rooms.length - 1 ? "border-e border-slate-200 dark:border-slate-700/60" : ""
                              } ${isSuperAdmin
                                ? "cursor-pointer hover:bg-indigo-100/50 dark:hover:bg-indigo-900/30 transition-colors"
                                : ""
                              }`}
                          >
                            {sched ? (
                              <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/70 text-start group">
                                <div className="space-y-1.5">
                                  <div className="rounded-md border border-indigo-300/80 dark:border-indigo-700/80 bg-white/50 dark:bg-slate-900/30 p-1.5">
                                    <p className="font-bold text-slate-900 dark:text-slate-100 text-xs truncate">{sched.doctorName}</p>
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

      {/* Doctor Slot Modal for Master Template */}
      {modalState.room && (
        <DoctorScheduleModal
          isOpen={modalState.isOpen}
          onClose={() => setModalState((prev) => ({ ...prev, isOpen: false }))}
          onSuccess={fetchTemplate}
          clinicId={clinicId}
          clinicName={clinic?.name || ""}
          room={modalState.room}
          shift={modalState.shift}
          isTemplateMode={true}
          dayOfWeek={modalState.dayOfWeek}
          dayName={modalState.dayName}
          currentDoctorId={modalState.currentDoctorId}
        />
      )}
    </div>
  );
};
