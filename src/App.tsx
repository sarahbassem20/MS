
import React, { useEffect, useState } from "react";
import { watermark } from "watermark-lite";
import { ThemeProvider } from "./context/ThemeContext";
import { LanguageProvider, useLanguage } from "./context/LanguageContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ClinicProvider } from "./context/ClinicContext";
import { Layout } from "./components/layout/Layout";
import { NavItemKey } from "./components/layout/Sidebar";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { ClinicsPage } from "./pages/ClinicsPage";
import { RoomsPage } from "./pages/RoomsPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { DoctorsPage } from "./pages/DoctorsPage";
import { SchedulePage } from "./pages/SchedulePage";
import { TasksPage } from "./pages/TasksPage";
import { TaskInstancesPage } from "./pages/TaskInstancesPage";
import { ReportsPage } from "./pages/ReportsPage";
import { MyClinicsPage } from "./pages/MyClinicsPage";
import { LoadingState } from "./components/common/LoadingState";
import { EmptyState } from "./components/common/EmptyState";
import { ShieldAlert } from "lucide-react";

const MainAppContent: React.FC = () => {
  const { user, isLoading } = useAuth();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<NavItemKey>("dashboard");

  useEffect(() => {
    if (!user) {
      watermark.unmount();
      return;
    }

    const watermarkText = `${user.username} • ${user.nationalId}`;

    watermark.mount({
      text: watermarkText,
      color: "#17140a",
      opacity: 0.12,
      fontSize: "14px",
      rotate: 20,
      zIndex: 20,
      monitor: true,
    });

    return () => watermark.unmount();
  }, [user?.username, user?.id]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <LoadingState message={t("loading")} />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const isSuperAdmin = user.role === "SUPER_ADMIN";

  // Role protection guard
  const adminOnlyTabs: NavItemKey[] = [
    "clinics",
    "employees",
    "doctors",
    "rooms",
    "task-instances",
    "reports",
  ];

  const isRestricted = !isSuperAdmin && adminOnlyTabs.includes(activeTab);

  const renderContent = () => {
    if (isRestricted) {
      return (
        <EmptyState
          title={t("accessDenied")}
          description={t("accessDeniedDesc")}
          icon={<ShieldAlert className="w-10 h-10 text-rose-500" />}
          actionText={t("navDashboard")}
          onAction={() => setActiveTab("dashboard")}
        />
      );
    }

    switch (activeTab) {
      case "dashboard":
        return <Dashboard onNavigate={(tab) => setActiveTab(tab)} />;
      case "clinics":
        return <ClinicsPage />;
      case "rooms":
        return <RoomsPage />;
      case "employees":
        return <EmployeesPage />;
      case "doctors":
        return <DoctorsPage />;
      case "schedule":
        return <SchedulePage />;
      case "tasks":
        return <TasksPage />;
      case "task-instances":
        return <TaskInstancesPage />;
      case "reports":
        return <ReportsPage />;
      case "my-clinics":
        return (
          <MyClinicsPage
            onNavigateToTasks={() => setActiveTab("tasks")}
            onNavigateToSchedule={() => setActiveTab("schedule")}
          />
        );
      default:
        return <Dashboard onNavigate={(tab) => setActiveTab(tab)} />;
    }
  };

  return (
    <ClinicProvider>
      <Layout activeTab={activeTab} onSelectTab={setActiveTab}>
        {renderContent()}
      </Layout>
    </ClinicProvider>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <MainAppContent />
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
