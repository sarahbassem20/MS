import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useClinic } from "../context/ClinicContext";
import { Task } from "../types";
import { TaskChecklist } from "../components/tasks/TaskChecklist";
import { TaskFormModal } from "../components/tasks/TaskFormModal";
import { Button } from "../components/common/Button";
import { Badge } from "../components/common/Badge";
import { Card } from "../components/common/Card";
import { Select } from "../components/common/Select";
import { Input } from "../components/common/Input";
import { LoadingState } from "../components/common/LoadingState";
import { EmptyState } from "../components/common/EmptyState";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import {
  CheckSquare,
  ListTodo,
  Plus,
  Edit2,
  Trash2,
  Sun,
  Moon,
  Repeat,
  Calendar,
  Building2,
  Layers,
  Search,
} from "lucide-react";

export const TasksPage: React.FC = () => {
  const { user, getAuthHeaders } = useAuth();
  const { t } = useLanguage();
  const { activeClinicId, activeClinic, clinics } = useClinic();

  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const canManageTaskDefinitions = isSuperAdmin || Boolean(user?.canAddTasks);

  // Tab mode for super admin: 'checklist' or 'definitions'
  const [activeSubTab, setActiveSubTab] = useState<"checklist" | "definitions">("definitions");

  // Task definitions list (Admin)
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedClinicFilter, setSelectedClinicFilter] = useState<string>(activeClinicId ? String(activeClinicId) : "ALL");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Form modal
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchTasksList = useCallback(async () => {
    if (!canManageTaskDefinitions) return;
    setIsLoading(true);
    try {
      let url = "/api/tasks";
      if (selectedClinicFilter !== "ALL") {
        url += `?clinicId=${selectedClinicFilter}`;
      }

      const res = await fetch(url, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch (err) {
      console.error("Failed to load task definitions:", err);
    } finally {
      setIsLoading(false);
    }
  }, [canManageTaskDefinitions, selectedClinicFilter]);

  useEffect(() => {
    if (canManageTaskDefinitions && activeSubTab === "definitions") {
      fetchTasksList();
    }
  }, [canManageTaskDefinitions, activeSubTab, fetchTasksList]);

  const handleOpenCreate = () => {
    setEditingTask(null);
    setFormModalOpen(true);
  };

  const handleOpenEdit = (task: Task) => {
    setEditingTask(task);
    setFormModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/tasks/${deleteTarget.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setDeleteTarget(null);
        fetchTasksList();
      }
    } catch (err) {
      console.error("Failed to delete task:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!activeClinicId || !activeClinic) {
    return (
      <EmptyState
        title={t("noAssignedClinics")}
        description="No active clinic selected. Please select a clinic to view tasks."
      />
    );
  }

  const filteredTasks = tasks.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      (t.description && t.description.toLowerCase().includes(search.toLowerCase())) ||
      (t.clinicName && t.clinicName.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {t("tasksTitle")} — {activeClinic.name}
          </h2>
          <p className="text-xs text-slate-500 mt-1">{t("tasksSubtitle")}</p>
        </div>

        {canManageTaskDefinitions && (
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={handleOpenCreate}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              {t("addTask")}
            </Button>
          </div>
        )}
      </div>

      {/* Sub-tab navigation for Super Admin */}
      {canManageTaskDefinitions && (
        <div className="flex items-center gap-2 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-xl w-fit">
          <button
            onClick={() => setActiveSubTab("definitions")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${activeSubTab === "definitions"
              ? "bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-400 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
          >
            <ListTodo className="w-4 h-4" />
            <span>{t("taskDefinitions")}</span>
          </button>
        </div>
      )}

      {/* Mode 1: Daily Task Checklist */}
      {!canManageTaskDefinitions && (
        <TaskChecklist clinicId={activeClinicId} clinicName={activeClinic.name} />
      )}

      {/* Mode 2: Task Definitions Management (Super Admin) */}
      {canManageTaskDefinitions && activeSubTab === "definitions" && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="w-full sm:w-64">
              <Select
                value={selectedClinicFilter}
                onChange={(e) => setSelectedClinicFilter(e.target.value)}
                options={[
                  { value: "ALL", label: t("allClinics") },
                  ...clinics.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
            </div>
            <div className="flex-1">
              <Input
                placeholder={t("search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>
          </div>

          {/* Task Definitions List */}
          {isLoading ? (
            <LoadingState message={t("loading")} />
          ) : filteredTasks.length === 0 ? (
            <EmptyState
              title={t("noData")}
              description="No task definitions found. Create recurring or one-time tasks for clinics."
              actionText={t("addTask")}
              onAction={handleOpenCreate}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredTasks.map((task) => {
                const isDaily = task.recurrenceType === "DAILY";
                const isMorning = task.shift === "MORNING";

                return (
                  <Card key={task.id} className="p-5 flex flex-col justify-between hoverable">
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
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
                          <Badge variant={isDaily ? "teal" : "slate"} size="sm">
                            {isDaily ? t("recurrenceDaily") : t("recurrenceNone")}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-1">
                          {isSuperAdmin && (
                            <>
                              <button
                                onClick={() => handleOpenEdit(task)}
                                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                                title={t("edit")}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeleteTarget(task)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                title={t("delete")}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 mb-1">
                        {task.name}
                      </h3>
                      {task.description && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                          {task.description}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">{t("belongingClinic")}:</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {task.clinicName}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">{t("startDate")}:</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {task.startDate}
                        </span>
                      </div>
                      {task.endDate && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">{t("endDate")}:</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {task.endDate}
                          </span>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Task Form Modal */}
      <TaskFormModal
        isOpen={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        onSuccess={() => {
          fetchTasksList();
        }}
        taskToEdit={editingTask}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        isLoading={isDeleting}
        message={`Are you sure you want to delete task "${deleteTarget?.name}"? Future uncompleted instances will also be removed. Past completion history remains intact.`}
      />
    </div>
  );
};
