import React, { useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { useClinic } from "../context/ClinicContext";
import { useAuth } from "../context/AuthContext";
import { WeeklyScheduleMatrix } from "../components/schedule/WeeklyScheduleMatrix";
import { WeeklyTemplateMatrix } from "../components/schedule/WeeklyTemplateMatrix";
import { EmptyState } from "../components/common/EmptyState";
import { CalendarCheck, CalendarDays, Sliders, Sparkles } from "lucide-react";

export const SchedulePage: React.FC = () => {
  const { t } = useLanguage();
  const { activeClinicId, activeClinic } = useClinic();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const [activeTab, setActiveTab] = useState<"WEEKLY" | "TEMPLATE">("WEEKLY");

  if (!activeClinicId || !activeClinic) {
    return (
      <EmptyState
        title={t("noAssignedClinics")}
        description="No active clinic selected. Please select a clinic from the header or contact your administrator."
        icon={<CalendarCheck className="w-10 h-10 text-slate-400" />}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Header with Title and Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            {t("scheduleTitle")}
            <span className="text-sm font-semibold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 px-2.5 py-0.5 rounded-full border border-teal-200 dark:border-teal-800">
              {activeClinic.name}
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {activeTab === "WEEKLY" ? t("scheduleSubtitle") : t("scheduleTemplateSubtitle")}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab("WEEKLY")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "WEEKLY"
                ? "bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            <span>{t("scheduleTabWeekly")}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("TEMPLATE")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "TEMPLATE"
                ? "bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span>{t("scheduleTabTemplate")}</span>
          </button>
        </div>
      </div>

      {/* Main Tab Views */}
      {activeTab === "WEEKLY" ? (
        <WeeklyScheduleMatrix
          clinicId={activeClinicId}
          onSwitchToTemplate={() => setActiveTab("TEMPLATE")}
        />
      ) : (
        <WeeklyTemplateMatrix
          clinicId={activeClinicId}
          onSwitchToCalendar={() => setActiveTab("WEEKLY")}
        />
      )}
    </div>
  );
};
