import React from "react";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { useTheme } from "../../context/ThemeContext";
import { useClinic } from "../../context/ClinicContext";
import { Badge } from "../common/Badge";
import logo from "../../../assets/logo.jpg";
import {
  Globe,
  Building2,
  LogOut,
  ShieldCheck,
  UserCheck,
  Menu,
  Sun,
  Moon,
} from "lucide-react";

export const Header: React.FC<{ onToggleSidebar?: () => void }> = ({ onToggleSidebar }) => {
  const { user, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { clinics, activeClinicId, setActiveClinicId } = useClinic();

  const toggleLanguage = () => {
    setLanguage(language === "ar" ? "en" : "ar");
  };

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs border-b border-slate-200/80 dark:border-slate-800 transition-colors w-full max-w-full">
      <div className="flex items-center justify-between px-3 sm:px-6 h-16 max-w-full">
        {/* Left Side: Mobile Menu Button & Clinic Selector */}
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1 me-2">
          <img src={logo} alt="Mystique Clinic Logo" />
          <button
            onClick={onToggleSidebar}
            className="lg:hidden p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
            aria-label="Toggle menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Active Clinic Switcher */}
          {user && (
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 bg-teal-50 dark:bg-teal-950/60 rounded-lg text-teal-600 dark:text-teal-400 hidden sm:flex shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
              <div className="flex flex-col min-w-0">
                <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider hidden sm:block">
                  {t("activeClinic")}
                </label>
                {clinics.length > 0 ? (
                  <select
                    value={activeClinicId || ""}
                    onChange={(e) => setActiveClinicId(Number(e.target.value))}
                    className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 bg-transparent border-0 focus:ring-0 cursor-pointer p-0 pe-4 max-w-[130px] sm:max-w-[220px] truncate"
                  >
                    {clinics.map((c) => (
                      <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-slate-400 truncate">{t("noAssignedClinics")}</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Theme Switcher, Language Switcher, User Info, Logout */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Theme Toggle (Light / Dark Mode) */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1.5 p-2 sm:px-2.5 sm:py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
            title={theme === "dark" ? t("themeLight") : t("themeDark")}
          >
            {theme === "dark" ? (
              <>
                <Sun className="w-4 h-4 text-amber-400" />
                <span className="hidden md:inline">{t("themeLight")}</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-indigo-500" />
                <span className="hidden md:inline">{t("themeDark")}</span>
              </>
            )}
          </button>

          {/* Language Switcher */}
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
            title={language === "ar" ? "Switch to English" : "التحويل للعربية"}
          >
            <Globe className="w-3.5 h-3.5 text-teal-600" />
            <span>{language === "ar" ? "English" : "العربية"}</span>
          </button>

          {/* User Profile & Role */}
          {user && (
            <div className="flex items-center gap-2.5 ps-2 sm:ps-3 border-s border-slate-200 dark:border-slate-800">
              <div className="hidden md:flex flex-col items-end text-start">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[150px]">
                  {user.name}
                </span>
                <Badge
                  variant={user.role === "SUPER_ADMIN" ? "purple" : "teal"}
                  size="sm"
                  className="mt-0.5"
                  icon={
                    user.role === "SUPER_ADMIN" ? (
                      <ShieldCheck className="w-3 h-3 me-0.5" />
                    ) : (
                      <UserCheck className="w-3 h-3 me-0.5" />
                    )
                  }
                >
                  {user.role === "SUPER_ADMIN" ? t("superAdminRole") : t("userRole")}
                </Badge>
              </div>

              {/* Logout button */}
              <button
                onClick={logout}
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                title={t("logout")}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
