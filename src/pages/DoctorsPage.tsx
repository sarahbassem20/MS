import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useClinic } from "../context/ClinicContext";
import { Doctor } from "../types";
import { Button } from "../components/common/Button";
import { Input } from "../components/common/Input";
import { Select } from "../components/common/Select";
import { Modal } from "../components/common/Modal";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { LoadingState } from "../components/common/LoadingState";
import { EmptyState } from "../components/common/EmptyState";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import {
  UserRound,
  Plus,
  Edit2,
  Trash2,
  Stethoscope,
  Building2,
  Search,
} from "lucide-react";

export const DoctorsPage: React.FC = () => {
  const { getAuthHeaders } = useAuth();
  const { t } = useLanguage();
  const { clinics } = useClinic();

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedClinicFilter, setSelectedClinicFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Form modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [doctorName, setDoctorName] = useState("");
  const [specialist, setSpecialist] = useState("");
  const [selectedClinicIds, setSelectedClinicIds] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Doctor | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchDoctorsList = useCallback(async () => {
    setIsLoading(true);
    try {
      let url = "/api/doctors";
      if (selectedClinicFilter !== "ALL") {
        url += `?clinicId=${selectedClinicFilter}`;
      }

      const res = await fetch(url, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setDoctors(data.doctors || []);
      }
    } catch (err) {
      console.error("Failed to load doctors:", err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedClinicFilter]);

  useEffect(() => {
    fetchDoctorsList();
  }, [fetchDoctorsList]);

  const handleOpenCreate = () => {
    setEditingDoctor(null);
    setDoctorName("");
    setSpecialist("");
    setSelectedClinicIds(
      selectedClinicFilter !== "ALL"
        ? [Number(selectedClinicFilter)]
        : clinics.length > 0
          ? [clinics[0].id]
          : []
    );
    setFormError(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (doc: Doctor) => {
    setEditingDoctor(doc);
    setDoctorName(doc.name);
    setSpecialist(doc.specialist);
    setSelectedClinicIds(doc.assignedClinics ? doc.assignedClinics.map((c) => c.id) : []);
    setFormError(null);
    setModalOpen(true);
  };

  const handleToggleClinic = (clinicId: number) => {
    setSelectedClinicIds((prev) =>
      prev.includes(clinicId) ? prev.filter((id) => id !== clinicId) : [...prev, clinicId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doctorName.trim() || !specialist.trim()) {
      setFormError("Doctor name and specialty are required");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const url = editingDoctor ? `/api/doctors/${editingDoctor.id}` : "/api/doctors";
      const method = editingDoctor ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: doctorName.trim(),
          specialist: specialist.trim(),
          clinicIds: selectedClinicIds,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setModalOpen(false);
        fetchDoctorsList();
      } else {
        setFormError(data.error || "Failed to save doctor");
      }
    } catch (err) {
      setFormError("Failed to save doctor");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/doctors/${deleteTarget.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setDeleteTarget(null);
        fetchDoctorsList();
      }
    } catch (err) {
      console.error("Failed to delete doctor:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredDoctors = doctors.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.specialist.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {t("doctorsTitle")}
          </h2>
          <p className="text-xs text-slate-500 mt-1">{t("doctorsSubtitle")}</p>
        </div>
        <Button variant="primary" onClick={handleOpenCreate} leftIcon={<Plus className="w-4 h-4" />}>
          {t("addDoctor")}
        </Button>
      </div>

      {/* Filter and Search Bar */}
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

      {/* Doctors Grid */}
      {isLoading ? (
        <LoadingState message={t("loading")} />
      ) : filteredDoctors.length === 0 ? (
        <EmptyState
          title={t("noData")}
          description="No medical specialists registered yet."
          actionText={t("addDoctor")}
          onAction={handleOpenCreate}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredDoctors.map((doc) => (
            <Card key={doc.id} className="p-5 flex flex-col justify-between hoverable">
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="p-2.5 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-xl border border-blue-100 dark:border-blue-900/50">
                    <Stethoscope className="w-5 h-5" />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(doc)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                      title={t("edit")}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(doc)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      title={t("delete")}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                  {doc.name}
                </h3>
                <p className="text-xs font-semibold text-teal-600 dark:text-teal-400 mt-0.5">
                  {doc.specialist}
                </p>
              </div>

              {/* Affiliated Clinics */}
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-1.5">
                  {t("affiliatedClinics")}
                </span>
                {doc.assignedClinics && doc.assignedClinics.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {doc.assignedClinics.map((c) => (
                      <Badge key={c.id} variant="slate" size="sm">
                        {c.name}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-rose-500 italic">No clinics affiliated</span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Doctor Form Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingDoctor ? t("edit") : t("addDoctor")}
        maxWidth="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-lg border border-rose-200">
              {formError}
            </div>
          )}

          <Input
            label={t("doctorName")}
            placeholder={t("doctorNamePlaceholder")}
            value={doctorName}
            onChange={(e) => setDoctorName(e.target.value)}
            required
            autoFocus
          />

          <Input
            label={t("specialist")}
            placeholder={t("specialistPlaceholder")}
            value={specialist}
            onChange={(e) => setSpecialist(e.target.value)}
            required
          />

          <div className="pt-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
              {t("selectAffiliatedClinics")}
            </label>
            <div className="space-y-2 max-h-40 overflow-y-auto p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
              {clinics.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2.5 text-xs text-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedClinicIds.includes(c.id)}
                    onChange={() => handleToggleClinic(c.id)}
                    className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4"
                  />
                  <span>{c.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              {t("save")}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        isLoading={isDeleting}
        message={`Are you sure you want to delete doctor "${deleteTarget?.name}"? Scheduled shifts will also be cleared.`}
      />
    </div>
  );
};