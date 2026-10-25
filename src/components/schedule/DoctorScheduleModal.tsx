import React, { useState, useEffect } from "react";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { Select } from "../common/Select";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { Doctor, Room, Shift } from "../../types";
import {
  AlertCircle,
  Trash2,
  Sparkles,
  Calendar,
  RotateCcw,
  Ban,
  CheckCircle2,
} from "lucide-react";

interface DoctorScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  clinicId: number;
  clinicName: string;
  room: Room | null;
  shift: Shift;
  // If editing Date Calendar:
  date?: string;
  isTemplate?: boolean; // inherited from master template
  isException?: boolean; // overridden for this date
  isOff?: boolean; // marked off for this date
  // If editing Master Template:
  isTemplateMode?: boolean;
  dayOfWeek?: number;
  dayName?: string;
  currentDoctorId?: number | null;
}

export const DoctorScheduleModal: React.FC<DoctorScheduleModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  clinicId,
  clinicName,
  room,
  shift,
  date,
  isTemplate,
  isException,
  isOff,
  isTemplateMode = false,
  dayOfWeek,
  dayName,
  currentDoctorId,
}) => {
  const { getAuthHeaders } = useAuth();
  const { t } = useLanguage();

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(
    currentDoctorId ? String(currentDoctorId) : ""
  );
  const [applyScope, setApplyScope] = useState<"DATE_ONLY" | "TEMPLATE">("DATE_ONLY");
  const [isLoadingDoctors, setIsLoadingDoctors] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !clinicId) return;

    setSelectedDoctorId(currentDoctorId ? String(currentDoctorId) : "");
    setApplyScope("DATE_ONLY");
    setErrorMessage(null);

    const fetchClinicDoctors = async () => {
      setIsLoadingDoctors(true);
      try {
        const res = await fetch(`/api/doctors?clinicId=${clinicId}`, {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          setDoctors(data.doctors || []);
          if (!currentDoctorId && data.doctors && data.doctors.length > 0) {
            setSelectedDoctorId(String(data.doctors[0].id));
          }
        }
      } catch (err) {
        console.error("Failed to load clinic doctors:", err);
      } finally {
        setIsLoadingDoctors(false);
      }
    };

    fetchClinicDoctors();
  }, [isOpen, clinicId, currentDoctorId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoctorId || !room) {
      setErrorMessage("Please select a doctor");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (selectedDoctorId === "OFF") {
        // Direct mark off
        const res = await fetch("/api/schedules/slot/off", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            roomId: room.id,
            date,
            shift,
          }),
        });

        const data = await res.json();
        if (res.ok) {
          onSuccess();
          onClose();
        } else {
          setErrorMessage(data.error || "Failed to mark slot off");
        }
        return;
      }

      if (isTemplateMode) {
        // Direct Master Template edit
        const res = await fetch("/api/schedules/template", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            clinicId,
            roomId: room.id,
            dayOfWeek,
            shift,
            doctorId: Number(selectedDoctorId),
          }),
        });

        const data = await res.json();
        if (res.ok) {
          onSuccess();
          onClose();
        } else {
          setErrorMessage(data.error || "Failed to save weekly template slot");
        }
      } else {
        // Calendar Date edit (with option to apply as exception or apply to template)
        const res = await fetch("/api/schedules", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            doctorId: Number(selectedDoctorId),
            roomId: room.id,
            date,
            shift,
            applyToTemplate: applyScope === "TEMPLATE",
          }),
        });

        const data = await res.json();
        if (res.ok) {
          onSuccess();
          onClose();
        } else {
          setErrorMessage(data.error || "Failed to schedule doctor");
        }
      }
    } catch (err) {
      setErrorMessage("Network error occurred while saving schedule");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Clear slot from master template
  const handleClearTemplateSlot = async () => {
    if (!room || dayOfWeek === undefined) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/schedules/template/slot", {
        method: "DELETE",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          roomId: room.id,
          dayOfWeek,
          shift,
        }),
      });

      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        const data = await res.json();
        setErrorMessage(data.error || "Failed to clear template slot");
      }
    } catch (err) {
      setErrorMessage("Failed to clear template slot");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Revert date exception back to master template
  const handleRevertToTemplate = async () => {
    if (!room || !date) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/schedules/slot/remove", {
        method: "DELETE",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          roomId: room.id,
          date,
          shift,
        }),
      });

      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        const data = await res.json();
        setErrorMessage(data.error || "Failed to revert to template");
      }
    } catch (err) {
      setErrorMessage("Failed to revert to template");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveSelectedDoctor = async () => {
    const doctorId = Number(selectedDoctorId || currentDoctorId);
    if (!room || !doctorId) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const url = isTemplateMode ? "/api/schedules/template/slot" : "/api/schedules/slot/remove";
      const body = isTemplateMode
        ? { roomId: room.id, dayOfWeek, shift, doctorId }
        : { roomId: room.id, date, shift, doctorId };
      const res = await fetch(url, {
        method: "DELETE",
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        setErrorMessage(data.error || "Failed to remove doctor");
      }
    } catch (err) {
      setErrorMessage("Failed to remove doctor");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Mark slot off / apology for this specific date
  const handleMarkOffForDate = async () => {
    if (!room || !date) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/schedules/slot/off", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          roomId: room.id,
          date,
          shift,
          doctorId: currentDoctorId || (selectedDoctorId && selectedDoctorId !== "OFF" ? Number(selectedDoctorId) : undefined),
          note: "اعتذار / ملغي",
        }),
      });

      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        const data = await res.json();
        setErrorMessage(data.error || "Failed to mark slot off");
      }
    } catch (err) {
      setErrorMessage("Failed to mark slot off");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!room) return null;

  const doctorOptions = doctors.map((d) => ({
    value: d.id,
    label: `${d.name} — ${d.specialist}`,
  }));

  const subtitleText = isTemplateMode
    ? `${clinicName} • ${room.name} • ${dayName ? t(dayName as any) : ""} • ${t(shift.toLowerCase() as any)}`
    : `${clinicName} • ${room.name} • ${date} • ${t(shift.toLowerCase() as any)}`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        isTemplateMode
          ? currentDoctorId
            ? t("changeDoctor") + " (" + t("scheduleTabTemplate") + ")"
            : t("assignDoctorToSlot") + " (" + t("scheduleTabTemplate") + ")"
          : currentDoctorId && !isOff
            ? t("changeDoctor")
            : t("assignDoctorToSlot")
      }
      subtitle={subtitleText}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMessage && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg flex items-start gap-2 text-rose-700 dark:text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{t("conflictErrorTitle")}</p>
              <p className="mt-0.5">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Slot Metadata Card */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200/80 dark:border-slate-700 text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-slate-500">{t("belongingClinic")}:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{clinicName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">{t("roomName")}:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{room.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">
              {isTemplateMode ? t("day") : t("date")}:
            </span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {isTemplateMode ? (dayName ? t(dayName as any) : "") : date}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">{t("shift")}:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {shift === "MORNING" ? t("morning") : t("evening")}
            </span>
          </div>

          {/* Current Source Badge (Template vs Exception vs Off) */}
          {!isTemplateMode && (
            <div className="flex justify-between items-center pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
              <span className="text-slate-500">{t("status")}:</span>
              {isOff ? (
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-semibold">
                  <Ban className="w-3 h-3" />
                  {t("roomOff")}
                </span>
              ) : isException ? (
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-semibold">
                  <Calendar className="w-3 h-3" />
                  {t("dateException")}
                </span>
              ) : isTemplate ? (
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 font-semibold">
                  <Sparkles className="w-3 h-3" />
                  {t("fromTemplate")}
                </span>
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </div>
          )}
        </div>

        {/* Doctor Selection */}
        {doctors.length === 0 && !isLoadingDoctors ? (
          <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-200">
            No doctors are affiliated with this clinic yet. Please assign doctors to this clinic first in the Doctors management tab.
          </div>
        ) : (
          <Select
            label={t("selectDoctor")}
            value={selectedDoctorId}
            onChange={(e) => setSelectedDoctorId(e.target.value)}
            options={[
              { value: "", label: `-- ${t("selectDoctor")} --` },
              ...doctorOptions,
            ]}
            required
          />
        )}

        {/* Scope Selector: Only in Date mode */}
        {!isTemplateMode && (
          <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {t("applyScopeLabel")}
            </p>

            <div className="grid grid-cols-1 gap-2">
              {/* Option 1: Date only (Exception) */}
              <label
                className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${applyScope === "DATE_ONLY"
                  ? "bg-amber-50/80 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-slate-900 dark:text-slate-100"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
              >
                <input
                  type="radio"
                  name="applyScope"
                  value="DATE_ONLY"
                  checked={applyScope === "DATE_ONLY"}
                  onChange={() => setApplyScope("DATE_ONLY")}
                  className="mt-0.5 text-teal-600 focus:ring-teal-500"
                />
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {t("applyToDateOnly")}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {t("applyToDateOnlyHelp")}
                  </p>
                </div>
              </label>

              {/* Option 2: Update Master Template */}
              <label
                className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${applyScope === "TEMPLATE"
                  ? "bg-teal-50/80 dark:bg-teal-950/40 border-teal-300 dark:border-teal-700 text-slate-900 dark:text-slate-100"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
              >
                <input
                  type="radio"
                  name="applyScope"
                  value="TEMPLATE"
                  checked={applyScope === "TEMPLATE"}
                  onChange={() => setApplyScope("TEMPLATE")}
                  className="mt-0.5 text-teal-600 focus:ring-teal-500"
                />
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    {t("applyToTemplate")}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {t("applyToTemplateHelp")}
                  </p>
                </div>
              </label>
            </div>
          </div>
        )}

        <p className="text-[11px] text-slate-500 italic">
          {t("roomConflictNote")}
        </p>

        {/* Quick Actions (Revert Exception or Mark Off for Date) */}
        {!isTemplateMode && (
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            {(isException || isOff) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRevertToTemplate}
                isLoading={isSubmitting}
                disabled={isSubmitting}
                leftIcon={<RotateCcw className="w-3.5 h-3.5 text-teal-600" />}
                title={t("revertToTemplateHelp")}
              >
                {t("revertToTemplate")}
              </Button>
            )}

            {!isOff ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleMarkOffForDate}
                isLoading={isSubmitting}
                disabled={isSubmitting}
                leftIcon={<Ban className="w-3.5 h-3.5 text-rose-500" />}
                className="border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                title={t("markOffForDateHelp")}
              >
                {t("markOffForDate")}
              </Button>
            ) : (
              <span className="text-xs text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
                <Ban className="w-3.5 h-3.5" />
                {t("roomOff")}
              </span>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
          {isTemplateMode && currentDoctorId ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={handleRemoveSelectedDoctor}
                disabled={isSubmitting || !selectedDoctorId}
                leftIcon={<Trash2 className="w-3.5 h-3.5" />}
              >
                Delete Doctor
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClearTemplateSlot}
                disabled={isSubmitting}
                leftIcon={<Trash2 className="w-3.5 h-3.5" />}
              >
                {t("clearSlot")}
              </Button>
            </div>
          ) : !isTemplateMode && currentDoctorId && !isOff ? (
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={handleRemoveSelectedDoctor}
              disabled={isSubmitting || !selectedDoctorId}
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Delete Doctor
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              disabled={doctors.length === 0 || !selectedDoctorId}
              leftIcon={<CheckCircle2 className="w-4 h-4" />}
            >
              {t("save")}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
