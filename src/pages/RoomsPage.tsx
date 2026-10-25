import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useClinic } from "../context/ClinicContext";
import { Room } from "../types";
import { Button } from "../components/common/Button";
import { Input } from "../components/common/Input";
import { Select } from "../components/common/Select";
import { Modal } from "../components/common/Modal";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { LoadingState } from "../components/common/LoadingState";
import { EmptyState } from "../components/common/EmptyState";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { DoorOpen, Plus, Edit2, Trash2, Building2, Search } from "lucide-react";

export const RoomsPage: React.FC = () => {
  const { getAuthHeaders } = useAuth();
  const { t } = useLanguage();
  const { clinics } = useClinic();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedClinicFilter, setSelectedClinicFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Form modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [roomName, setRoomName] = useState("");
  const [roomClinicId, setRoomClinicId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Room | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchRoomsList = useCallback(async () => {
    setIsLoading(true);
    try {
      let url = "/api/rooms";
      if (selectedClinicFilter !== "ALL") {
        url += `?clinicId=${selectedClinicFilter}`;
      }

      const res = await fetch(url, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setRooms(data.rooms || []);
      }
    } catch (err) {
      console.error("Failed to load rooms:", err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedClinicFilter]);

  useEffect(() => {
    fetchRoomsList();
  }, [fetchRoomsList]);

  const handleOpenCreate = () => {
    setEditingRoom(null);
    setRoomName("");
    setRoomClinicId(selectedClinicFilter !== "ALL" ? selectedClinicFilter : clinics[0]?.id ? String(clinics[0].id) : "");
    setFormError(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (room: Room) => {
    setEditingRoom(room);
    setRoomName(room.name);
    setRoomClinicId(String(room.clinicId));
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomName.trim() || !roomClinicId) {
      setFormError("Room name and clinic are required");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const url = editingRoom ? `/api/rooms/${editingRoom.id}` : "/api/rooms";
      const method = editingRoom ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: roomName.trim(),
          clinicId: Number(roomClinicId),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setModalOpen(false);
        fetchRoomsList();
      } else {
        setFormError(data.error || "Failed to save room");
      }
    } catch (err) {
      setFormError("Failed to save room");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/rooms/${deleteTarget.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setDeleteTarget(null);
        fetchRoomsList();
      }
    } catch (err) {
      console.error("Failed to delete room:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredRooms = rooms.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.clinicName && r.clinicName.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{t("roomsTitle")}</h2>
          <p className="text-xs text-slate-500 mt-1">{t("roomsSubtitle")}</p>
        </div>
        <Button variant="primary" onClick={handleOpenCreate} leftIcon={<Plus className="w-4 h-4" />}>
          {t("addRoom")}
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

      {/* Rooms Grid */}
      {isLoading ? (
        <LoadingState message={t("loading")} />
      ) : filteredRooms.length === 0 ? (
        <EmptyState
          title={t("noData")}
          description="No clinic examination rooms configured yet."
          actionText={t("addRoom")}
          onAction={handleOpenCreate}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRooms.map((room) => (
            <Card key={room.id} className="p-4 flex items-center justify-between gap-3 hoverable">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 rounded-xl border border-amber-100 dark:border-amber-900/50 shrink-0">
                  <DoorOpen className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                    {room.name}
                  </h4>
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                    <Building2 className="w-3 h-3 text-slate-400" />
                    <span>{room.clinicName}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleOpenEdit(room)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                  title={t("edit")}
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setDeleteTarget(room)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  title={t("delete")}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Room Form Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingRoom ? t("edit") : t("addRoom")}
        maxWidth="sm"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-lg border border-rose-200">
              {formError}
            </div>
          )}

          <Select
            label={t("belongingClinic")}
            value={roomClinicId}
            onChange={(e) => setRoomClinicId(e.target.value)}
            options={clinics.map((c) => ({ value: c.id, label: c.name }))}
            required
          />

          <Input
            label={t("roomName")}
            placeholder={t("roomNamePlaceholder")}
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
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
        message={`Are you sure you want to delete room "${deleteTarget?.name}"? Scheduled shifts in this room will be cleared.`}
      />
    </div>
  );
};
