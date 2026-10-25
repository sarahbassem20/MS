import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useClinic } from "../context/ClinicContext";
import { DashboardStats } from "../types";
import { StatCard } from "../components/common/StatCard";
import { Card, CardHeader, CardContent } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { Button } from "../components/common/Button";
import { LoadingState } from "../components/common/LoadingState";
import { NavItemKey } from "../components/layout/Sidebar";
import {
  Building2,
  Users,
  UserRound,
  DoorOpen,
  CheckSquare,
  CalendarCheck,
  Clock,
  Sun,
  Moon,
  ArrowUpRight,
  TrendingUp,
  PlusCircle,
} from "lucide-react";

interface DashboardProps {
  onNavigate: (tab: NavItemKey) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { user, getAuthHeaders } = useAuth();
  const { t } = useLanguage();
  const { activeClinic } = useClinic();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/reports/dashboard-stats", {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to load dashboard stats:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (isLoading || !stats) {
    return <LoadingState message={t("loading")} />;
  }

  const metrics = stats.metrics;

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="p-6 bg-gradient-to-r from-teal-600 to-teal-800 rounded-2xl text-white shadow-md shadow-teal-700/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-teal-200 uppercase tracking-wider">
            {isSuperAdmin ? t("superAdminRole") : t("userRole")}
          </span>
          <h2 className="text-xl sm:text-2xl font-bold mt-1">
            {t("welcome")}, {user?.name}
          </h2>
          <p className="text-xs text-teal-100 mt-1 max-w-xl">
            {activeClinic
              ? `${t("activeClinic")}: ${activeClinic.name}`
              : t("appSubtitle")}
          </p>
        </div>

        {/* Quick buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onNavigate("tasks")}
            leftIcon={<CheckSquare className="w-4 h-4 text-teal-700" />}
            className="bg-white text-teal-800 hover:bg-teal-50"
          >
            {t("navTodayTasks")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onNavigate("schedule")}
            leftIcon={<CalendarCheck className="w-4 h-4 text-teal-700" />}
            className="bg-white text-teal-800 hover:bg-teal-50"
          >
            {t("navSchedule")}
          </Button>
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isSuperAdmin ? (
          <>
            <StatCard
              title={t("totalClinics")}
              value={metrics.clinics || 0}
              icon={<Building2 className="w-6 h-6" />}
              color="teal"
              onClick={() => onNavigate("clinics")}
            />
            <StatCard
              title={t("totalEmployees")}
              value={metrics.employees || 0}
              icon={<Users className="w-6 h-6" />}
              color="purple"
              onClick={() => onNavigate("employees")}
            />
            <StatCard
              title={t("totalDoctors")}
              value={metrics.doctors || 0}
              icon={<UserRound className="w-6 h-6" />}
              color="blue"
              onClick={() => onNavigate("doctors")}
            />
            <StatCard
              title={t("totalRooms")}
              value={metrics.rooms || 0}
              icon={<DoorOpen className="w-6 h-6" />}
              color="amber"
              onClick={() => onNavigate("rooms")}
            />
          </>
        ) : (
          <>
            <StatCard
              title={t("assignedClinics")}
              value={metrics.assignedClinicsCount || 0}
              icon={<Building2 className="w-6 h-6" />}
              color="teal"
              onClick={() => onNavigate("my-clinics")}
            />
            <StatCard
              title={t("todayTasksCount")}
              value={metrics.todayTasks || 0}
              icon={<CheckSquare className="w-6 h-6" />}
              color="purple"
              onClick={() => onNavigate("tasks")}
            />
            <StatCard
              title={t("myCompletedToday")}
              value={metrics.myCompletedToday !== undefined ? metrics.myCompletedToday : metrics.todayCompleted || 0}
              icon={<TrendingUp className="w-6 h-6" />}
              color="emerald"
              onClick={() => onNavigate("tasks")}
            />
            <StatCard
              title={t("todayDoctorSessions")}
              value={metrics.todayDoctorSchedules || 0}
              icon={<CalendarCheck className="w-6 h-6" />}
              color="blue"
              onClick={() => onNavigate("schedule")}
            />
          </>
        )}
      </div>

      {/* Secondary Row: Operational Task Status & Doctor Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Task Completion Overview Card */}
        <Card className="lg:col-span-1">
          <CardHeader title={t("todayTasksCount")} subtitle={t("todayChecklistSubtitle")} />
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                {t("todayTasksCount")}
              </span>
              <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {metrics.todayTasks}
              </span>
            </div>

            <div className="flex items-center justify-between p-3.5 bg-emerald-50/60 dark:bg-emerald-950/40 rounded-xl border border-emerald-100 dark:border-emerald-900/50">
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                {t("completedTasks")}
              </span>
              <span className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                {metrics.todayCompleted}
              </span>
            </div>

            <div className="flex items-center justify-between p-3.5 bg-amber-50/60 dark:bg-amber-950/40 rounded-xl border border-amber-100 dark:border-amber-900/50">
              <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                {t("pendingTasks")}
              </span>
              <span className="text-lg font-bold text-amber-700 dark:text-amber-400">
                {metrics.todayPending}
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate("tasks")}
              className="w-full mt-2"
              rightIcon={<ArrowUpRight className="w-3.5 h-3.5" />}
            >
              {t("navTodayTasks")}
            </Button>
          </CardContent>
        </Card>

        {/* Super Admin Recent Completions / Employee Quick Links */}
        <Card className="lg:col-span-2">
          <CardHeader
            title={isSuperAdmin ? t("recentCompletions") : t("quickActions")}
            subtitle={
              isSuperAdmin
                ? "Live audit log of recently completed operational tasks"
                : "Fast navigation to your daily operational responsibilities"
            }
          />
          <CardContent>
            {isSuperAdmin ? (
              stats.recentCompletions && stats.recentCompletions.length > 0 ? (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {stats.recentCompletions.map((comp, idx) => (
                    <div key={idx} className="py-3 flex items-center justify-between gap-4 text-xs">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 dark:text-slate-200 truncate">
                          {comp.taskName}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                          <span>{comp.clinicName}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            {comp.shift === "MORNING" ? (
                              <Sun className="w-3 h-3 text-amber-500" />
                            ) : (
                              <Moon className="w-3 h-3 text-indigo-500" />
                            )}
                            {comp.shift === "MORNING" ? t("morning") : t("evening")}
                          </span>
                        </div>
                      </div>
                      <div className="text-end shrink-0">
                        <span className="font-semibold text-teal-700 dark:text-teal-400 block">
                          {comp.employeeName}
                        </span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1 justify-end">
                          <Clock className="w-3 h-3" />
                          {new Date(comp.completedAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 py-6 text-center">{t("noData")}</p>
              )
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div
                  onClick={() => onNavigate("tasks")}
                  className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 hover:border-teal-500 cursor-pointer bg-slate-50/50 dark:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-teal-500/10 text-teal-600 rounded-lg">
                      <CheckSquare className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                        {t("navTodayTasks")}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {t("todayChecklistSubtitle")}
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  onClick={() => onNavigate("schedule")}
                  className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 hover:border-teal-500 cursor-pointer bg-slate-50/50 dark:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-500/10 text-blue-600 rounded-lg">
                      <CalendarCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                        {t("navSchedule")}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {t("scheduleSubtitle")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
