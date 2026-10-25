import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { TaskInstance, Shift } from "../../types";
import { Button } from "../common/Button";
import { Badge } from "../common/Badge";
import { LoadingState } from "../common/LoadingState";
import { EmptyState } from "../common/EmptyState";
import confetti from "canvas-confetti";
import {
  CheckCircle2,
  Circle,
  Clock,
  User as UserIcon,
  Users,
  Sun,
  Moon,
  Calendar,
  Sparkles,
  RefreshCw,
  RotateCcw,
  Check,
  Info,
} from "lucide-react";

interface TaskChecklistProps {
  clinicId: number;
  clinicName: string;
}

export const TaskChecklist: React.FC<TaskChecklistProps> = ({ clinicId, clinicName }) => {
  const { user, getAuthHeaders } = useAuth();
  const { t } = useLanguage();

  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [selectedShift, setSelectedShift] = useState<Shift | "ALL">("ALL");
  const [instances, setInstances] = useState<TaskInstance[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  const fetchInstances = useCallback(async () => {
    if (!clinicId) return;
    setIsLoading(true);
    try {
      let url = `/api/tasks/instances?clinicId=${clinicId}&date=${selectedDate}`;
      if (selectedShift !== "ALL") {
        url += `&shift=${selectedShift}`;
      }

      const res = await fetch(url, {
        headers: getAuthHeaders(),
      });

      if (res.ok) {
        const data = await res.json();
        setInstances(data.instances || []);
      }
    } catch (err) {
      console.error("Failed to load task instances:", err);
    } finally {
      setIsLoading(false);
    }
  }, [clinicId, selectedDate, selectedShift]);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  const handleToggleComplete = async (instance: TaskInstance) => {
    setActionLoadingId(instance.id);
    const isCompletedByMe = !!instance.isCompletedByMe;
    try {
      if (isCompletedByMe) {
        // Uncomplete my completion
        const res = await fetch(`/api/tasks/instances/${instance.id}/uncomplete`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ userId: user?.id }),
        });
        if (res.ok) {
          fetchInstances();
        }
      } else {
        // Complete by me
        const res = await fetch(`/api/tasks/instances/${instance.id}/complete`, {
          method: "POST",
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          // Trigger celebratory confetti
          try {
            confetti({
              particleCount: 40,
              spread: 50,
              origin: { y: 0.7 },
            });
          } catch (e) {
            // Ignore if in iframe without canvas
          }
          fetchInstances();
        }
      }
    } catch (err) {
      console.error("Error toggling task completion:", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const myCompletedCount = instances.filter((i) => i.isCompletedByMe).length;
  const totalCount = instances.length;
  const myProgressPercent = totalCount > 0 ? Math.round((myCompletedCount / totalCount) * 100) : 0;

  // Total collective completions count across all employees
  const totalTeamCompletions = instances.reduce((acc, curr) => acc + (curr.completions?.length || 0), 0);

  // Format ISO timestamp nicely
  const formatTimestamp = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return isoString;
    }
  };

  const formatTaskDate = (dateString: string) => {
    try {
      return new Date(`${dateString}T00:00:00Z`).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Banner: Multi-user shared task information */}
      <div className="p-3.5 sm:p-4 bg-teal-50/80 dark:bg-teal-950/40 rounded-xl border border-teal-200/80 dark:border-teal-800/60 flex items-start gap-3">
        <Users className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
        <div className="text-xs">
          <p className="font-bold text-teal-900 dark:text-teal-200">
            {t("allStaffTaskNotice")}
          </p>
          <p className="text-teal-700 dark:text-teal-300/90 mt-0.5 leading-relaxed">
            {t("todayChecklistSubtitle")} — يتم تسجيل إنجاز كل موظف على حدة مع الوقت والتاريخ الدقيق.
          </p>
        </div>
      </div>

      {/* Top Filter and Date Selector Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        {/* Shift selector tabs */}
        <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button
            onClick={() => setSelectedShift("ALL")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${selectedShift === "ALL"
                ? "bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-400 shadow-2xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
          >
            {t("allShifts")}
          </button>
          <button
            onClick={() => setSelectedShift("MORNING")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${selectedShift === "MORNING"
                ? "bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 shadow-2xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
          >
            <Sun className="w-3.5 h-3.5 text-amber-500" />
            <span>{t("morning")}</span>
          </button>
          <button
            onClick={() => setSelectedShift("EVENING")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${selectedShift === "EVENING"
                ? "bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-2xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
          >
            <Moon className="w-3.5 h-3.5 text-indigo-500" />
            <span>{t("evening")}</span>
          </button>
        </div>

        {/* Date Selector & Refresh */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="bg-transparent text-slate-800 dark:text-slate-200 font-semibold focus:outline-none cursor-pointer"
            />
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={fetchInstances}
            disabled={isLoading}
            title={t("refresh")}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Progress Stats Card */}
      {totalCount > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between mb-2 text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <UserIcon className="w-3.5 h-3.5 text-teal-600" />
                {t("myProgress")} ({myCompletedCount} / {totalCount})
              </span>
              <span className="font-bold text-teal-600 dark:text-teal-400">{myProgressPercent}%</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-teal-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${myProgressPercent}%` }}
              />
            </div>
          </div>

          <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-teal-50 dark:bg-teal-950/60 text-teal-600 rounded-lg">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs text-slate-500 block">{t("staffCompletions")}</span>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {totalTeamCompletions} {t("completedTasks")}
                </span>
              </div>
            </div>
            <Badge variant="teal" size="sm">
              {clinicName}
            </Badge>
          </div>
        </div>
      )}

      {/* Task Checklist Items */}
      {isLoading ? (
        <LoadingState message={t("loading")} />
      ) : instances.length === 0 ? (
        <EmptyState
          title={t("noTasksForShift")}
          description="There are no active task instances scheduled for this clinic, date, and shift."
        />
      ) : (
        <div className="space-y-3.5">
          {instances.map((instance) => {
            const isCompletedByMe = !!instance.isCompletedByMe;
            const completions = instance.completions || [];
            const completionCount = completions.length;
            const isMorning = instance.shift === "MORNING";
            const isActionLoading = actionLoadingId === instance.id;

            return (
              <div
                key={instance.id}
                className={`p-4 sm:p-5 rounded-xl border transition-all ${isCompletedByMe
                    ? "bg-teal-50/20 dark:bg-teal-950/10 border-teal-200/90 dark:border-teal-800/80 shadow-2xs"
                    : "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-teal-200 dark:hover:border-teal-800/60"
                  }`}
              >
                <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                  {/* Left: Checkbox & Info */}
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    <button
                      onClick={() => handleToggleComplete(instance)}
                      disabled={isActionLoading}
                      className="mt-0.5 text-teal-600 hover:text-teal-700 dark:text-teal-400 focus:outline-none cursor-pointer transition-transform active:scale-95 shrink-0"
                      title={isCompletedByMe ? t("undoMyCompletion") : t("markCompletedByMe")}
                    >
                      {isCompletedByMe ? (
                        <CheckCircle2 className="w-6 h-6 fill-teal-100 text-teal-600 dark:fill-teal-950 dark:text-teal-400" />
                      ) : (
                        <Circle className="w-6 h-6 text-slate-300 hover:text-teal-500" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span
                          className={`text-sm font-bold ${isCompletedByMe
                              ? "text-teal-900 dark:text-teal-100"
                              : "text-slate-900 dark:text-slate-100"
                            }`}
                        >
                          {instance.name}
                        </span>

                        <span className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-2 py-1 text-[11px] font-semibold text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-200">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatTaskDate(instance.targetDate || instance.date)}
                        </span>

                        <Badge
                          variant={isMorning ? "amber" : "purple"}
                          size="sm"
                          icon={
                            isMorning ? (
                              <Sun className="w-3 h-3 me-0.5" />
                            ) : (
                              <Moon className="w-3 h-3 me-0.5" />
                            )
                          }
                        >
                          {isMorning ? t("morning") : t("evening")}
                        </Badge>

                        {isCompletedByMe ? (
                          <Badge variant="emerald" size="sm" icon={<Check className="w-3 h-3" />}>
                            {t("completedByYou")}
                          </Badge>
                        ) : (
                          <Badge variant="neutral" size="sm">
                            {t("notCompletedByYou")}
                          </Badge>
                        )}
                      </div>

                      {instance.description && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-2.5">
                          {instance.description}
                        </p>
                      )}

                      {/* Staff Completions Details List */}
                      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                            <Users className="w-3.5 h-3.5 text-teal-600" />
                            {completionCount > 0
                              ? t("completedByStaffCount").replace("{count}", String(completionCount))
                              : t("noStaffCompletedYet")}
                          </span>
                        </div>

                        {completionCount > 0 ? (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {completions.map((comp) => {
                              const isMe = comp.userId === user?.id;
                              return (
                                <span
                                  key={comp.id}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border ${isMe
                                      ? "bg-teal-50 dark:bg-teal-950/60 border-teal-300 dark:border-teal-700 text-teal-800 dark:text-teal-200 font-bold"
                                      : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                                    }`}
                                >
                                  <UserIcon className="w-3 h-3 text-teal-600" />
                                  <span>{comp.userName} {isMe ? `(${t("you")})` : ""}</span>
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                                    • {formatTimestamp(comp.completedAt)}
                                  </span>
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-400 italic">
                            {t("noStaffCompletedYet")} — يمكنك الضغط على الزر لتسجيل إنجازك.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Personal Action Button */}
                  <div className="self-end sm:self-center shrink-0">
                    <Button
                      size="sm"
                      variant={isCompletedByMe ? "outline" : "primary"}
                      onClick={() => handleToggleComplete(instance)}
                      isLoading={isActionLoading}
                      leftIcon={
                        isCompletedByMe ? (
                          <RotateCcw className="w-3.5 h-3.5" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )
                      }
                    >
                      {isCompletedByMe ? t("undoMyCompletion") : t("markCompletedByMe")}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

