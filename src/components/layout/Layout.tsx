import React, { useState } from "react";
import { Header } from "./Header";
import { Sidebar, NavItemKey } from "./Sidebar";
import { useLanguage } from "../../context/LanguageContext";

interface LayoutProps {
  activeTab: NavItemKey;
  onSelectTab: (tab: NavItemKey) => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ activeTab, onSelectTab, children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isRtl } = useLanguage();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col w-full max-w-full overflow-x-hidden">
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Wrapper */}
      <div className={`flex-1 flex flex-col min-w-0 w-full max-w-full overflow-x-hidden transition-all duration-300 lg:w-[calc(100%-16rem)] ${isRtl ? "lg:mr-64" : "lg:ml-64"}`}>
        {/* Header */}
        <Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

        {/* Page Content */}
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
};
