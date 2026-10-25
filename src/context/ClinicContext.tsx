import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Clinic } from "../types";
import { useAuth } from "./AuthContext";

interface ClinicContextType {
  clinics: Clinic[];
  activeClinicId: number | null;
  activeClinic: Clinic | null;
  setActiveClinicId: (id: number) => void;
  isLoadingClinics: boolean;
  refreshClinics: () => Promise<void>;
}

const ClinicContext = createContext<ClinicContextType | undefined>(undefined);

export const ClinicProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, getAuthHeaders, user } = useAuth();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [activeClinicId, setActiveClinicIdState] = useState<number | null>(() => {
    const saved = localStorage.getItem("clinic_active_clinic_id");
    return saved ? Number(saved) : null;
  });
  const [isLoadingClinics, setIsLoadingClinics] = useState<boolean>(false);

  const fetchClinics = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoadingClinics(true);
    try {
      const res = await fetch("/api/clinics", {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        const loadedClinics: Clinic[] = data.clinics || [];
        setClinics(loadedClinics);

        // Auto-select clinic if none selected or if selected is no longer accessible
        if (loadedClinics.length > 0) {
          const currentValid = loadedClinics.find((c) => c.id === activeClinicId);
          if (!currentValid) {
            const firstId = loadedClinics[0].id;
            setActiveClinicIdState(firstId);
            localStorage.setItem("clinic_active_clinic_id", String(firstId));
          }
        } else {
          setActiveClinicIdState(null);
          localStorage.removeItem("clinic_active_clinic_id");
        }
      }
    } catch (err) {
      console.error("Failed to fetch clinics:", err);
    } finally {
      setIsLoadingClinics(false);
    }
  }, [isAuthenticated, activeClinicId, user]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchClinics();
    } else {
      setClinics([]);
      setActiveClinicIdState(null);
    }
  }, [isAuthenticated, user?.id]);

  const setActiveClinicId = (id: number) => {
    setActiveClinicIdState(id);
    localStorage.setItem("clinic_active_clinic_id", String(id));
  };

  const activeClinic = clinics.find((c) => c.id === activeClinicId) || null;

  return (
    <ClinicContext.Provider
      value={{
        clinics,
        activeClinicId,
        activeClinic,
        setActiveClinicId,
        isLoadingClinics,
        refreshClinics: fetchClinics,
      }}
    >
      {children}
    </ClinicContext.Provider>
  );
};

export const useClinic = (): ClinicContextType => {
  const context = useContext(ClinicContext);
  if (!context) {
    throw new Error("useClinic must be used within a ClinicProvider");
  }
  return context;
};
