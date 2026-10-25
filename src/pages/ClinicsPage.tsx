import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useClinic } from "../context/ClinicContext";
import { Clinic } from "../types";
import { Button } from "../components/common/Button";
import { Input } from "../components/common/Input";
import { Modal } from "../components/common/Modal";
import { Card } from "../components/common/Card";
import { LoadingState } from "../components/common/LoadingState";
import { EmptyState } from "../components/common/EmptyState";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import {
  Building2,
  Plus,
  Edit2,
  Trash2,
  DoorOpen,
  UserRound,
  Users,
  Search,
} from "lucide-react";

export const ClinicsPage: React.FC = () => {
  const { getAuthHeaders } = useAuth();
  const { t } = useLanguage();
  const { refreshClinics } = useClinic();

  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Form modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClinic, setEditingClinic] = useState<Clinic | null>(null);
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Clinic | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchClinicsList = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/clinics", {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setClinics(data.clinics || []);
      }
    } catch (err) {
      console.error("Failed to load clinics:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClinicsList();
  }, [fetchClinicsList]);

  const handleOpenCreate = () => {
    setEditingClinic(null);
    setName("");
    setFormError(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (clinic: Clinic) => {
    setEditingClinic(clinic);
    setName(clinic.name);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError("Clinic name is required");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const url = editingClinic ? `/api/clinics/${editingClinic.id}` : "/api/clinics";
      const method = editingClinic ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify({ name: name.trim() }),
      });

      const data = await res.json();

      if (res.ok) {
        setModalOpen(false);
        fetchClinicsList();
        refreshClinics();
      } else {
        setFormError(data.error || "Failed to save clinic");
      }
    } catch (err) {
      setFormError("Failed to save clinic");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/clinics/${deleteTarget.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setDeleteTarget(null);
        fetchClinicsList();
        refreshClinics();
      }
    } catch (err) {
      console.error("Failed to delete clinic:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredClinics = clinics.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {t("clinicsTitle")}
          </h2>
          <p className="text-xs text-slate-500 mt-1">{t("clinicsSubtitle")}</p>
        </div>
        <Button
          variant="primary"
          onClick={handleOpenCreate}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          {t("addClinic")}
        </Button>
      </div>

      {/* Search Bar */}
      <div className="max-w-md">
        <Input
          placeholder={t("search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<Search className="w-4 h-4" />}
        />
      </div>

      {/* Clinics Grid */}
      {isLoading ? (
        <LoadingState message={t("loading")} />
      ) : filteredClinics.length === 0 ? (
        <EmptyState
          title={t("noData")}
          description="No clinics match your criteria. Add your first clinic to start configuring rooms and staff."
          actionText={t("addClinic")}
          onAction={handleOpenCreate}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredClinics.map((clinic) => (
            <Card key={clinic.id} className="p-5 flex flex-col justify-between hoverable">
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="p-2.5 bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 rounded-xl border border-teal-100 dark:border-teal-900/50">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(clinic)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                      title={t("edit")}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(clinic)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      title={t("delete")}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                  {clinic.name}
                </h3>
              </div>

              {/* Resource Counts */}
              <div className="grid grid-cols-3 gap-2 mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
                <div className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                    {t("roomsCount")}
                  </span>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    {clinic.roomCount || 0}
                  </span>
                </div>
                <div className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                    {t("doctorsCount")}
                  </span>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    {clinic.doctorCount || 0}
                  </span>
                </div>
                <div className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                    {t("employeesCount")}
                  </span>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    {clinic.employeeCount || 0}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Clinic Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingClinic ? t("edit") : t("addClinic")}
        maxWidth="sm"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-lg border border-rose-200">
              {formError}
            </div>
          )}

          <Input
            label={t("clinicName")}
            placeholder={t("clinicNamePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />

          <div className="flex items-center justify-end gap-2 pt-2">
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
        message={`Are you sure you want to delete clinic "${deleteTarget?.name}"? All associated rooms, schedules, and task definitions will also be removed.`}
      />
    </div>
  );
};
