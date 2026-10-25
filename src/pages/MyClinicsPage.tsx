import React from "react";
import { useLanguage } from "../context/LanguageContext";
import { useClinic } from "../context/ClinicContext";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { Button } from "../components/common/Button";
import { EmptyState } from "../components/common/EmptyState";
import { Building2, Check, DoorOpen, UserRound, ArrowRight } from "lucide-react";

interface MyClinicsPageProps {
  onNavigateToTasks: () => void;
  onNavigateToSchedule: () => void;
}

export const MyClinicsPage: React.FC<MyClinicsPageProps> = ({
  onNavigateToTasks,
  onNavigateToSchedule,
}) => {
  const { t, isRtl } = useLanguage();
  const { clinics, activeClinicId, setActiveClinicId } = useClinic();

  if (clinics.length === 0) {
    return (
      <EmptyState
        title={t("noAssignedClinics")}
        description="You currently have no assigned clinics. Please ask your administrator to grant you access."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          {t("myClinicsTitle")}
        </h2>
        <p className="text-xs text-slate-500 mt-1">{t("myClinicsSubtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {clinics.map((clinic) => {
          const isActive = clinic.id === activeClinicId;

          return (
            <Card
              key={clinic.id}
              className={`p-5 flex flex-col justify-between transition-all ${
                isActive
                  ? "border-teal-500 ring-2 ring-teal-500/20 bg-teal-50/20 dark:bg-teal-950/20"
                  : "hoverable"
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div
                    className={`p-2.5 rounded-xl border ${
                      isActive
                        ? "bg-teal-500 text-white border-teal-600"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    <Building2 className="w-5 h-5" />
                  </div>

                  {isActive ? (
                    <Badge variant="teal" size="sm" icon={<Check className="w-3 h-3 me-0.5" />}>
                      {t("activeClinic")}
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveClinicId(clinic.id)}
                    >
                      {t("switchClinic")}
                    </Button>
                  )}
                </div>

                <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                  {clinic.name}
                </h3>
              </div>

              {/* Resource Counts */}
              <div className="grid grid-cols-2 gap-2 my-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
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
              </div>

              {/* Action shortcuts */}
              <div className="flex items-center gap-2 pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setActiveClinicId(clinic.id);
                    onNavigateToTasks();
                  }}
                  className="flex-1 text-xs"
                >
                  {t("navTodayTasks")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setActiveClinicId(clinic.id);
                    onNavigateToSchedule();
                  }}
                  className="flex-1 text-xs"
                >
                  {t("navSchedule")}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
