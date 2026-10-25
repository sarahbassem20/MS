import React, { useState, useEffect } from "react";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import { Select } from "../common/Select";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { useClinic } from "../../context/ClinicContext";
import { Task, Shift, RecurrenceType } from "../../types";
import { ShieldCheck, Info, CalendarDays } from "lucide-react";

interface TaskFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  taskToEdit?: Task | null;
}

export const TaskFormModal: React.FC<TaskFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  taskToEdit,
}) => {
  const { getAuthHeaders } = useAuth();
  const { t } = useLanguage();
  const { clinics, activeClinicId } = useClinic();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [clinicId, setClinicId] = useState<string>(activeClinicId ? String(activeClinicId) : "");
  const [shift, setShift] = useState<Shift>("MORNING");
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("DAILY");
  const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [daysFromToday, setDaysFromToday] = useState("0");
  const [relativeDirection, setRelativeDirection] = useState<"NONE" | "AFTER" | "BEFORE">("AFTER");
  const [endDate, setEndDate] = useState<string>("");
  const [updateFutureInstances, setUpdateFutureInstances] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (taskToEdit) {
      setName(taskToEdit.name);
      setDescription(taskToEdit.description || "");
      setClinicId(String(taskToEdit.clinicId));
      setShift(taskToEdit.shift);
      setRecurrenceType(taskToEdit.recurrenceType);
      setStartDate(taskToEdit.startDate);
      setDaysFromToday(taskToEdit.relativeDays?.toString() || "");
      setRelativeDirection(taskToEdit.relativeDirection || "NONE");
      setEndDate(taskToEdit.endDate || "");
    } else {
      setName("");
      setDescription("");
      setClinicId(activeClinicId ? String(activeClinicId) : clinics[0]?.id ? String(clinics[0].id) : "");
      setShift("MORNING");
      setRecurrenceType("DAILY");
      setStartDate(new Date().toISOString().split("T")[0]);
      setDaysFromToday("0");
      setRelativeDirection("AFTER");
      setEndDate("");
    }
    setError(null);
  }, [taskToEdit, isOpen, activeClinicId, clinics]);

  const handleDaysFromTodayChange = (value: string, direction = relativeDirection) => {
    setDaysFromToday(value);
    const days = Number(value);
    if (!Number.isInteger(days) || days < 0) return;

    const date = new Date(`${new Date().toISOString().split("T")[0]}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + (direction === "BEFORE" ? -days : days));
    setStartDate(date.toISOString().split("T")[0]);
  };

  const getTargetDateLabel = () => {
    const baseDate = new Date(`${new Date().toISOString().split("T")[0]}T00:00:00Z`);
    if (relativeDirection === "NONE") {
      if (!startDate) return "";
      return new Date(`${startDate}T00:00:00Z`).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      });
    }

    const days = Number(daysFromToday);
    if (!Number.isInteger(days) || days < 0) return "";
    baseDate.setUTCDate(baseDate.getUTCDate() + (relativeDirection === "BEFORE" ? -days : days));
    return baseDate.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !clinicId || !startDate) {
      setError("Task Title, Clinic, and Start Date are required");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        clinicId: Number(clinicId),
        shift,
        startDate: relativeDirection === "NONE"
          ? startDate
          : new Date().toISOString().split("T")[0],
        endDate: recurrenceType === "DAILY" && endDate ? endDate : null,
        recurrenceType,
        relativeDays: relativeDirection === "NONE" ? null : Number(daysFromToday),
        relativeDirection: relativeDirection === "NONE" ? null : relativeDirection,
        updateFutureInstances: !!taskToEdit && updateFutureInstances,
      };

      const url = taskToEdit ? `/api/tasks/${taskToEdit.id}` : "/api/tasks";
      const method = taskToEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        setError(data.error || "Failed to save task");
      }
    } catch (err) {
      setError("Failed to communicate with server");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={taskToEdit ? t("edit") + ": " + taskToEdit.name : t("addTask")}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-lg border border-rose-200">
            {error}
          </div>
        )}

        <Input
          label={t("taskName")}
          placeholder={t("taskNamePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
            {t("taskDescription")}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("taskDescriptionPlaceholder")}
            rows={3}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-200 dark:focus:ring-teal-900/40"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label={t("belongingClinic")}
            value={clinicId}
            onChange={(e) => setClinicId(e.target.value)}
            disabled={!!taskToEdit}
            options={clinics.map((c) => ({ value: c.id, label: c.name }))}
            required
          />

          <Select
            label={t("shift")}
            value={shift}
            onChange={(e) => setShift(e.target.value as Shift)}
            options={[
              { value: "MORNING", label: t("morning") },
              { value: "EVENING", label: t("evening") },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label={t("recurrence")}
            value={recurrenceType}
            onChange={(e) => setRecurrenceType(e.target.value as RecurrenceType)}
            options={[
              { value: "DAILY", label: t("recurrenceDaily") },
              { value: "NONE", label: t("recurrenceNone") },
            ]}
          />

          <Input
            label={t("startDate")}
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={relativeDirection !== "NONE"}
            required
          />
        </div>

        {!taskToEdit && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label={t("targetDateMode")}
              value={relativeDirection}
              onChange={(e) => {
                const direction = e.target.value as "NONE" | "AFTER" | "BEFORE";
                setRelativeDirection(direction);
                if (direction !== "NONE") handleDaysFromTodayChange(daysFromToday || "0", direction);
              }}
              options={[
                { value: "NONE", label: t("specificDate") },
                { value: "AFTER", label: t("afterDays") },
                { value: "BEFORE", label: t("beforeDays") },
              ]}
            />
            {relativeDirection !== "NONE" ? (
              <Input
                label={t("daysFromToday")}
                type="number"
                min="0"
                value={daysFromToday}
                onChange={(e) => handleDaysFromTodayChange(e.target.value)}
                helperText={t("daysFromTodayHint")}
              />
            ) : (
              <div className="flex items-end text-xs text-slate-500 pb-2">
                {t("specificDateHint")}
              </div>
            )}
          </div>
        )}

        {getTargetDateLabel() && (
          <div className="flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-800 dark:border-teal-800 dark:bg-teal-950/30 dark:text-teal-200">
            <CalendarDays className="h-4 w-4 shrink-0" />
            <span>
              {t("targetDatePreview")}: <strong>{getTargetDateLabel()}</strong>
            </span>
          </div>
        )}

        {recurrenceType === "DAILY" && (
          <Input
            label={t("endDate")}
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            helperText="Leave empty for indefinite daily recurrence"
          />
        )}

        {/* Snapshot Guarantee Note */}
        <div className="p-3.5 bg-teal-50/80 dark:bg-teal-950/40 border border-teal-200/80 dark:border-teal-800/60 rounded-xl flex items-start gap-2.5 text-xs text-teal-800 dark:text-teal-200">
          <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">{t("futureInstancesNotice")}</p>
            {taskToEdit && (
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={updateFutureInstances}
                  onChange={(e) => setUpdateFutureInstances(e.target.checked)}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
                <span className="text-[11px] text-teal-900 dark:text-teal-100 font-medium">
                  {t("updateFutureInstances")}
                </span>
              </label>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            {t("save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
