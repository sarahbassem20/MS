import React from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { AlertTriangle } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  isLoading?: boolean;
  confirmVariant?: "danger" | "primary" | "success";
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  isLoading = false,
  confirmVariant = "danger",
}) => {
  const { t } = useLanguage();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title || t("confirmDeleteTitle")}
      maxWidth="sm"
    >
      <div className="flex flex-col items-center text-center">
        <div className="p-3 bg-rose-50 dark:bg-rose-950/60 rounded-full text-rose-600 dark:text-rose-400 mb-4 border border-rose-100 dark:border-rose-900/50">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
          {message || t("confirmDelete")}
        </p>
        <div className="flex items-center justify-center gap-3 w-full">
          <Button variant="secondary" onClick={onClose} disabled={isLoading} className="flex-1">
            {t("cancel")}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={onConfirm}
            isLoading={isLoading}
            className="flex-1"
          >
            {t("delete")}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
