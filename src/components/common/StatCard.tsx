import React from "react";
import { Card } from "./Card";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color?: "teal" | "emerald" | "amber" | "blue" | "purple" | "rose";
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  color = "teal",
  onClick,
}) => {
  const colorMap = {
    teal: "bg-teal-50 text-teal-600 dark:bg-teal-950/60 dark:text-teal-400 border-teal-100 dark:border-teal-900/50",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/50",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 border-amber-100 dark:border-amber-900/50",
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 border-blue-100 dark:border-blue-900/50",
    purple: "bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400 border-purple-100 dark:border-purple-900/50",
    rose: "bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 border-rose-100 dark:border-rose-900/50",
  };

  return (
    <Card
      hoverable={!!onClick}
      onClick={onClick}
      className={`p-5 relative overflow-hidden ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{title}</p>
          <p className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 mt-1">
            {value}
          </p>
          {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-3.5 rounded-xl border ${colorMap[color]} shrink-0`}>
          {icon}
        </div>
      </div>
    </Card>
  );
};
