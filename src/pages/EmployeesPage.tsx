import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useClinic } from "../context/ClinicContext";
import { User, Role } from "../types";
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
  Users,
  Plus,
  Edit2,
  Trash2,
  ShieldCheck,
  UserCheck,
  Building2,
  CreditCard,
  Calendar,
  Search,
  Eye,
  EyeOff,
  Power,
} from "lucide-react";

export const EmployeesPage: React.FC = () => {
  const { getAuthHeaders, user: currentUser } = useAuth();
  const { t } = useLanguage();
  const { clinics } = useClinic();

  const [employees, setEmployees] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [username, setUsername] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<Role>("USER");
  const [selectedClinicIds, setSelectedClinicIds] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchEmployeesList = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/users", {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setEmployees(data.users || []);
      }
    } catch (err) {
      console.error("Failed to load employees:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmployeesList();
  }, [fetchEmployeesList]);

  const handleOpenCreate = () => {
    setEditingEmployee(null);
    setName("");
    setDob("1995-01-01");
    setUsername("");
    setNationalId("");
    setPassword("");
    setRole("USER");
    setSelectedClinicIds([]);
    setFormError(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (emp: User) => {
    setEditingEmployee(emp);
    setName(emp.name);
    setDob(emp.dob);
    setUsername(emp.username);
    setNationalId(emp.nationalId);
    setPassword("");
    setRole(emp.role);
    setSelectedClinicIds(emp.assignedClinics ? emp.assignedClinics.map((c) => c.id) : []);
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
    if (!name.trim() || !dob || !username.trim() || !nationalId.trim() || (!editingEmployee && !password)) {
      setFormError("All required fields must be filled");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const url = editingEmployee ? `/api/users/${editingEmployee.id}` : "/api/users";
      const method = editingEmployee ? "PUT" : "POST";

      const payload: any = {
        name: name.trim(),
        dob,
        username: username.trim(),
        nationalId: nationalId.trim(),
        role,
        clinicIds: selectedClinicIds,
      };

      if (password) {
        payload.password = password;
      }

      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        setModalOpen(false);
        fetchEmployeesList();
      } else {
        setFormError(data.error || "Failed to save employee");
      }
    } catch (err) {
      setFormError("Failed to save employee");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/users/${deleteTarget.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setDeleteTarget(null);
        fetchEmployeesList();
      }
    } catch (err) {
      console.error("Failed to delete user:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleActivation = async (employee: User) => {
    if (currentUser?.id === employee.id) return;
    try {
      const res = await fetch(`/api/users/${employee.id}/activation`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ isActive: !Boolean(employee.isActive) }),
      });
      if (res.ok) {
        fetchEmployeesList();
      } else {
        const data = await res.json();
        setFormError(data.error || "Failed to update user activation");
      }
    } catch (err) {
      console.error("Failed to update user activation:", err);
      setFormError("Failed to update user activation");
    }
  };

  const filteredEmployees = employees.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.nationalId.includes(search)
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {t("employeesTitle")}
          </h2>
          <p className="text-xs text-slate-500 mt-1">{t("employeesSubtitle")}</p>
        </div>
        <Button variant="primary" onClick={handleOpenCreate} leftIcon={<Plus className="w-4 h-4" />}>
          {t("addEmployee")}
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

      {/* Employees Table / Cards */}
      {isLoading ? (
        <LoadingState message={t("loading")} />
      ) : filteredEmployees.length === 0 ? (
        <EmptyState
          title={t("noData")}
          description="No employee accounts found."
          actionText={t("addEmployee")}
          onAction={handleOpenCreate}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredEmployees.map((emp) => {
            const isSuper = emp.role === "SUPER_ADMIN";
            const isSelf = currentUser?.id === emp.id;

            return (
              <Card key={emp.id} className="p-5 flex flex-col justify-between hoverable">
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div
                      className={`p-2.5 rounded-xl border shrink-0 ${isSuper
                        ? "bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400 border-purple-100 dark:border-purple-900/50"
                        : "bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400 border-teal-100 dark:border-teal-900/50"
                        }`}
                    >
                      {isSuper ? (
                        <ShieldCheck className="w-5 h-5" />
                      ) : (
                        <Users className="w-5 h-5" />
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {!isSelf && (
                        <button
                          onClick={() => handleToggleActivation(emp)}
                          className={`p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 ${Boolean(emp.isActive)
                            ? "text-emerald-500 hover:text-rose-600"
                            : "text-rose-500 hover:text-emerald-600"
                            }`}
                          title={Boolean(emp.isActive) ? t("deactivateUser") : t("activateUser")}
                          aria-label={Boolean(emp.isActive) ? t("deactivateUser") : t("activateUser")}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenEdit(emp)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                        title={t("edit")}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {!isSelf && (
                        <button
                          onClick={() => setDeleteTarget(emp)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          title={t("delete")}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                      {emp.name}
                    </h3>
                    <Badge variant={isSuper ? "purple" : "teal"} size="sm">
                      {isSuper ? t("superAdminRole") : t("userRole")}
                    </Badge>
                    <Badge variant={Boolean(emp.isActive) ? "teal" : "rose"} size="sm">
                      {Boolean(emp.isActive) ? t("active") : t("inactive")}
                    </Badge>
                  </div>

                  <div className="space-y-1 mt-3 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <span className="w-3.5 text-center text-slate-400">@</span>
                      <span className="font-mono">{emp.username}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-mono">{emp.nationalId}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{emp.dob}</span>
                    </div>
                  </div>
                </div>

                {/* Assigned Clinics Badges */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-1.5">
                    {t("assignedClinics")}
                  </span>
                  {isSuper ? (
                    <Badge variant="purple" size="sm">
                      {t("allClinicsAssigned")}
                    </Badge>
                  ) : emp.assignedClinics && emp.assignedClinics.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {emp.assignedClinics.map((c) => (
                        <Badge key={c.id} variant="slate" size="sm">
                          {c.name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-rose-500 italic">
                      {t("noAssignedClinics")}
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Employee Form Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingEmployee ? t("edit") : t("addEmployee")}
        maxWidth="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-lg border border-rose-200">
              {formError}
            </div>
          )}

          <Input
            label={t("employeeName")}
            placeholder={t("employeeNamePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label={t("username")}
              placeholder={t("usernamePlaceholder")}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />

            <Input
              label={t("nationalId")}
              placeholder={t("nationalIdPlaceholder")}
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value)}
              required
            />

            <Input
              label={t("dob")}
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label={t("role")}
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              options={[
                { value: "USER", label: t("userRole") },
                { value: "SUPER_ADMIN", label: t("superAdminRole") },
              ]}
            />

            <Input
              label={t("password")}
              type={showPassword ? "text" : "password"}
              placeholder={editingEmployee ? t("userPasswordNote") : t("passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="flex items-center justify-center text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
              required={!editingEmployee}
            />
          </div>

          {/* Clinic Assignments (only needed for USER role) */}
          {role === "USER" && (
            <div className="pt-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                {t("selectAssignedClinics")}
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
          )}

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
        message={`Are you sure you want to delete employee account "${deleteTarget?.name}"?`}
      />
    </div>
  );
};
