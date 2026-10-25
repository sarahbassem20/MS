import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useClinic } from "../context/ClinicContext";
import { TaskInstance, Shift } from "../types";
import { Button } from "../components/common/Button";
import { Badge } from "../components/common/Badge";
import { Card } from "../components/common/Card";
import { Select } from "../components/common/Select";
import { Input } from "../components/common/Input";
import { LoadingState } from "../components/common/LoadingState";
import { EmptyState } from "../components/common/EmptyState";
import {
  Layers,
  ShieldCheck,
  Calendar,
  Sun,
  Moon,
  Clock,
  UserCheck,
  Building2,
  CheckCircle2,
  AlertCircle,
  Search,
} from "lucide-react";

export const TaskInstancesPage: React.FC = () => {
  const { getAuthHeaders } = useAuth();
  const { t } = useLanguage();
  const { clinics, activeClinicId } = useClinic();

  const [selectedClinicId, setSelectedClinicId] = useState<string>(
    activeClinicId ? String(activeClinicId) : clinics[0]?.id ? String(clinics[0].id) : ""
  );
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [selectedShift, setSelectedShift] = useState<Shift | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [instances, setInstances] = useState<TaskInstance[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchInstances = useCallback(async () => {
    if (!selectedClinicId) return;
    setIsLoading(true);
    try {
      let url = `/api/tasks/instances?clinicId=${selectedClinicId}&date=${selectedDate}`;
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
  }, [selectedClinicId, selectedDate, selectedShift]);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  const filteredInstances = instances.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.description && i.description.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-teal-600" />
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {t("taskInstancesTitle")}
          </h2>
        </div>
        <p className="text-xs text-slate-500 mt-1">{t("taskInstancesSubtitle")}</p>
      </div>

      {/* Snapshot Guarantee Information Box */}
      <div className="p-4 bg-teal-50/80 dark:bg-teal-950/40 border border-teal-200/80 dark:border-teal-800/60 rounded-xl flex items-start gap-3 text-xs text-teal-900 dark:text-teal-200">
        <ShieldCheck className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
        <div>
          <h4 className="font-bold">{t("snapshotGuaranteeTitle")}</h4>
          <p className="mt-0.5 text-teal-800 dark:text-teal-300 leading-relaxed">
            {t("snapshotGuaranteeDesc")}
          </p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Select
          label={t("belongingClinic")}
          value={selectedClinicId}
          onChange={(e) => setSelectedClinicId(e.target.value)}
          options={clinics.map((c) => ({ value: c.id, label: c.name }))}
        />

        <Input
          label={t("date")}
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />

        <Select
          label={t("shift")}
          value={selectedShift}
          onChange={(e) => setSelectedShift(e.target.value as any)}
          options={[
            { value: "ALL", label: t("allShifts") },
            { value: "MORNING", label: t("morning") },
            { value: "EVENING", label: t("evening") },
          ]}
        />

        <Input
          label={t("search")}
          placeholder={t("search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<Search className="w-4 h-4" />}
        />
      </div>

      {/* Instances Table */}
      {isLoading ? (
        <LoadingState message={t("loading")} />
      ) : filteredInstances.length === 0 ? (
        <EmptyState
          title={t("noData")}
          description="No generated task instances match the selected criteria."
        />
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                  <th className="p-3.5 text-start">{t("taskName")} (Snapshot)</th>
                  <th className="p-3.5 text-start">{t("taskDescription")}</th>
                  <th className="p-3.5 text-start">{t("shift")}</th>
                  <th className="p-3.5 text-start">{t("date")}</th>
                  <th className="p-3.5 text-start">{t("status")}</th>
                  <th className="p-3.5 text-start">{t("completedBy")}</th>
                  <th className="p-3.5 text-start">{t("completedAt")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredInstances.map((inst) => {
                  const isMorning = inst.shift === "MORNING";
                  const isCompleted = inst.isCompleted;

                  return (
                    <tr
                      key={inst.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="p-3.5 font-bold text-slate-900 dark:text-slate-100">
                        {inst.name}
                      </td>
                      <td className="p-3.5 text-slate-600 dark:text-slate-400 max-w-xs truncate">
                        {inst.description || "—"}
                      </td>
                      <td className="p-3.5">
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
                      </td>
                      <td className="p-3.5 text-slate-700 dark:text-slate-300 font-mono">
                        {inst.date}
                      </td>
                      <td className="p-3.5">
                        <Badge
                          variant={(inst.completions && inst.completions.length > 0) || isCompleted ? "emerald" : "amber"}
                          size="sm"
                        >
                          {inst.completions && inst.completions.length > 0
                            ? `${inst.completions.length} ${t("completedTasks")}`
                            : isCompleted
                            ? t("completedTasks")
                            : t("pendingTasks")}
                        </Badge>
                      </td>
                      <td className="p-3.5 text-slate-800 dark:text-slate-200 font-medium">
                        {inst.completions && inst.completions.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {inst.completions.map((c) => (
                              <span
                                key={c.id}
                                className="inline-block px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px]"
                              >
                                {c.userName}
                              </span>
                            ))}
                          </div>
                        ) : inst.completion?.userName ? (
                          inst.completion.userName
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-3.5 text-slate-500 font-mono text-[11px]">
                        {inst.completions && inst.completions.length > 0
                          ? inst.completions.map((c) => new Date(c.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })).join(", ")
                          : inst.completion
                          ? new Date(inst.completion.completedAt).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
