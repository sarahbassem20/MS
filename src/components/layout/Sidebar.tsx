import React from "react";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import {
  LayoutDashboard,
  Building2,
  Users,
  UserRound,
  DoorOpen,
  CalendarCheck,
  CheckSquare,
  FileSpreadsheet,
  Layers,
  Activity,
  X,
} from "lucide-react";

export type NavItemKey =
  | "dashboard"
  | "clinics"
  | "employees"
  | "doctors"
  | "rooms"
  | "schedule"
  | "tasks"
  | "task-instances"
  | "reports"
  | "my-clinics";

interface SidebarProps {
  activeTab: NavItemKey;
  onSelectTab: (tab: NavItemKey) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isOpen,
  onClose,
}) => {
  const { user } = useAuth();
  const { t, isRtl } = useLanguage();

  if (!user) return null;

  const isSuperAdmin = user.role === "SUPER_ADMIN";

  const adminNavItems: Array<{ key: NavItemKey; labelKey: keyof typeof import("../../i18n/translations").translations.en; icon: React.ReactNode }> = [
    { key: "dashboard", labelKey: "navDashboard", icon: <LayoutDashboard className="w-4 h-4" /> },
    { key: "clinics", labelKey: "navClinics", icon: <Building2 className="w-4 h-4" /> },
    { key: "employees", labelKey: "navEmployees", icon: <Users className="w-4 h-4" /> },
    { key: "doctors", labelKey: "navDoctors", icon: <UserRound className="w-4 h-4" /> },
    { key: "rooms", labelKey: "navRooms", icon: <DoorOpen className="w-4 h-4" /> },
    { key: "schedule", labelKey: "navSchedule", icon: <CalendarCheck className="w-4 h-4" /> },
    { key: "tasks", labelKey: "navTasks", icon: <CheckSquare className="w-4 h-4" /> },
    { key: "task-instances", labelKey: "navTaskInstances", icon: <Layers className="w-4 h-4" /> },
    { key: "reports", labelKey: "navReports", icon: <FileSpreadsheet className="w-4 h-4" /> },
  ];

  const userNavItems: Array<{ key: NavItemKey; labelKey: keyof typeof import("../../i18n/translations").translations.en; icon: React.ReactNode }> = [
    { key: "dashboard", labelKey: "navDashboard", icon: <LayoutDashboard className="w-4 h-4" /> },
    { key: "my-clinics", labelKey: "navMyClinics", icon: <Building2 className="w-4 h-4" /> },
    { key: "tasks", labelKey: "navTodayTasks", icon: <CheckSquare className="w-4 h-4" /> },
    { key: "schedule", labelKey: "navSchedule", icon: <CalendarCheck className="w-4 h-4" /> },
  ];

  const navItems = isSuperAdmin ? adminNavItems : userNavItems;

  const handleItemClick = (key: NavItemKey) => {
    onSelectTab(key);
    onClose();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 lg:hidden cursor-pointer"
          onClick={onClose}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 bottom-0 z-50 w-64 bg-slate-900 text-slate-100 flex flex-col transition-transform duration-300 ease-in-out ${isRtl ? "right-0" : "left-0"
          } ${isOpen
            ? "translate-x-0"
            : isRtl
              ? "translate-x-full lg:translate-x-0"
              : "-translate-x-full lg:translate-x-0"
          }`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between px-6 h-16 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <img
              src="/assets/logo.jpg"
              alt={t("appTitle")}
              className="w-10 h-10 rounded-full object-cover border border-white/30 shrink-0"
            />
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white">{t("appTitle")}</h1>
              <p className="text-[10px] text-teal-400 font-medium">{t("appSubtitle")}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation List */}
        <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            {t("overview")}
          </div>

          {navItems.map((item) => {
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => handleItemClick(item.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all text-start cursor-pointer ${isActive
                    ? "bg-teal-600 text-white shadow-xs"
                    : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                  }`}
              >
                <span className={isActive ? "text-white" : "text-slate-400"}>{item.icon}</span>
                <span className="flex-1">{t(item.labelKey)}</span>
              </button>
            );
          })}
        </div>

        {/* Bottom User Info Card */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-teal-600/30 border border-teal-500/40 flex items-center justify-center text-teal-400 font-bold text-xs">
              {user.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate">{user.name}</p>
              <p className="text-[11px] text-slate-400 truncate">ID: {user.nationalId}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
