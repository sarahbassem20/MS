import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useClinic } from "../context/ClinicContext";
import { User, Shift } from "../types";
import { Button } from "../components/common/Button";
import { Badge } from "../components/common/Badge";
import { Card } from "../components/common/Card";
import { Select } from "../components/common/Select";
import { Input } from "../components/common/Input";
import { StatCard } from "../components/common/StatCard";
import { LoadingState } from "../components/common/LoadingState";
import { EmptyState } from "../components/common/EmptyState";
import {
  FileSpreadsheet,
  Download,
  Printer,
  CheckCircle2,
  Clock,
  Sun,
  Moon,
  Building2,
  Filter,
} from "lucide-react";

export const ReportsPage: React.FC = () => {
  const { getAuthHeaders } = useAuth();
  const { t } = useLanguage();
  const { clinics } = useClinic();

  const [users, setUsers] = useState<User[]>([]);

  // Filters
  const [selectedClinicId, setSelectedClinicId] = useState<string>("ALL");
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [selectedShift, setSelectedShift] = useState<Shift | "ALL">("ALL");
  const [selectedUserId, setSelectedUserId] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "COMPLETED" | "PENDING">("ALL");

  const [reportData, setReportData] = useState<{
    summary?: {
      total?: number;
      totalCount?: number;
      completed?: number;
      completedCount?: number;
      pending?: number;
      pendingCount?: number;
      completionRate?: number;
    };
    records?: any[];
    reports?: any[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch employees for filter dropdown
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch("/api/users", { headers: getAuthHeaders() });
        if (res.ok) {
          const data = await res.json();
          setUsers(data.users || []);
        }
      } catch (err) {
        console.error("Failed to load users for filter:", err);
      }
    };
    fetchUsers();
  }, []);

  const fetchReports = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedClinicId && selectedClinicId !== "ALL") params.append("clinicId", selectedClinicId);
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      if (selectedShift && selectedShift !== "ALL") params.append("shift", selectedShift);
      if (selectedUserId && selectedUserId !== "ALL") params.append("userId", selectedUserId);
      if (statusFilter && statusFilter !== "ALL") params.append("status", statusFilter);

      const res = await fetch(`/api/reports/completions?${params.toString()}`, {
        headers: getAuthHeaders(),
      });

      if (res.ok) {
        const data = await res.json();
        setReportData(data);
      }
    } catch (err) {
      console.error("Failed to load reports:", err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedClinicId, startDate, endDate, selectedShift, selectedUserId, statusFilter]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const records = reportData?.records || reportData?.reports || [];
  const summary = {
    total: reportData?.summary?.total ?? reportData?.summary?.totalCount ?? records.length,
    completed:
      reportData?.summary?.completed ??
      reportData?.summary?.completedCount ??
      records.filter((r) => r.isCompleted || r.status === "COMPLETED").length,
    pending:
      reportData?.summary?.pending ??
      reportData?.summary?.pendingCount ??
      records.filter((r) => !r.isCompleted && r.status !== "COMPLETED").length,
    completionRate: reportData?.summary?.completionRate ?? 0,
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (!records || records.length === 0) return;

    const headers = ["Clinic", "Date", "Shift", "Task Name", "Status", "Completed By", "Completed At"];
    const rows = records.map((r) => [
      `"${r.clinicName || ""}"`,
      `"${r.date || ""}"`,
      `"${r.shift || ""}"`,
      `"${(r.taskName || "").replace(/"/g, '""')}"`,
      `"${r.isCompleted || r.status === "COMPLETED" ? "COMPLETED" : "PENDING"}"`,
      `"${r.completedByUserName || r.employeeName || ""}"`,
      `"${r.completedAt ? new Date(r.completedAt).toISOString() : ""}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `task_completion_report_${startDate}_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-teal-600" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {t("reportsTitle")}
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">{t("reportsSubtitle")}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={records.length === 0}
            leftIcon={<Download className="w-4 h-4" />}
          >
            {t("exportReport")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handlePrint}
            leftIcon={<Printer className="w-4 h-4" />}
          >
            Print
          </Button>
        </div>
      </div>

      {/* Filter Card */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3 text-xs font-bold text-slate-700 dark:text-slate-300">
          <Filter className="w-4 h-4 text-teal-600" />
          <span>{t("filterByStatus")} & Parameters</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <Select
            label={t("belongingClinic")}
            value={selectedClinicId}
            onChange={(e) => setSelectedClinicId(e.target.value)}
            options={[
              { value: "ALL", label: t("allClinics") },
              ...clinics.map((c) => ({ value: String(c.id), label: c.name })),
            ]}
          />

          <Input
            label={t("startDate")}
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />

          <Input
            label={t("endDate")}
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
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

          <Select
            label={t("filterByStatus")}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            options={[
              { value: "ALL", label: t("allStatuses") },
              { value: "COMPLETED", label: t("completedTasks") },
              { value: "PENDING", label: t("pendingTasks") },
            ]}
          />

          <Select
            label={t("completedBy")}
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            options={[
              { value: "ALL", label: "All Staff" },
              ...users.map((u) => ({ value: String(u.id), label: u.name })),
            ]}
          />
        </div>
      </Card>

      {/* Summary Stat Cards */}
      {reportData && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title={t("totalTasksReport")}
            value={summary.total}
            icon={<FileSpreadsheet className="w-6 h-6" />}
            color="teal"
          />
          <StatCard
            title={t("completedTasks")}
            value={summary.completed}
            icon={<CheckCircle2 className="w-6 h-6" />}
            color="emerald"
          />
          <StatCard
            title={t("pendingTasks")}
            value={summary.pending}
            icon={<Clock className="w-6 h-6" />}
            color="amber"
          />
          <StatCard
            title={t("completionRate")}
            value={`${summary.completionRate}%`}
            icon={<Building2 className="w-6 h-6" />}
            color="purple"
          />
        </div>
      )}

      {/* Report Records Table */}
      {isLoading ? (
        <LoadingState message={t("loading")} />
      ) : records.length === 0 ? (
        <EmptyState
          title={t("noData")}
          description="No completion audit records match the current filter selection."
        />
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                  <th className="p-3.5 text-start">{t("belongingClinic")}</th>
                  <th className="p-3.5 text-start">{t("date")}</th>
                  <th className="p-3.5 text-start">{t("shift")}</th>
                  <th className="p-3.5 text-start">{t("taskName")}</th>
                  <th className="p-3.5 text-start">{t("status")}</th>
                  <th className="p-3.5 text-start">{t("completedBy")}</th>
                  <th className="p-3.5 text-start">{t("completedAt")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {records.map((rec: any, index: number) => {
                  const isMorning = rec.shift === "MORNING";
                  const isCompleted = rec.isCompleted || rec.status === "COMPLETED";

                  return (
                    <tr
                      key={rec.id || rec.instanceId || `report-${index}`}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="p-3.5 font-semibold text-slate-800 dark:text-slate-200">
                        {rec.clinicName || "—"}
                      </td>
                      <td className="p-3.5 text-slate-600 dark:text-slate-400 font-mono">
                        {rec.date}
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
                      <td className="p-3.5 font-bold text-slate-900 dark:text-slate-100">
                        {rec.taskName}
                      </td>
                      <td className="p-3.5">
                        <Badge variant={isCompleted ? "emerald" : "amber"} size="sm">
                          {isCompleted ? t("completedTasks") : t("pendingTasks")}
                        </Badge>
                      </td>
                      <td className="p-3.5 text-slate-800 dark:text-slate-200 font-medium">
                        {rec.completedByUserName || rec.employeeName || "—"}
                      </td>
                      <td className="p-3.5 text-slate-500 font-mono text-[11px]">
                        {rec.completedAt
                          ? new Date(rec.completedAt).toLocaleString()
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
