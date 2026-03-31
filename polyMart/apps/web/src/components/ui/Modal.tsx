import { useEffect, type PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
}

export default function Modal({ open, onClose, title, children }: PropsWithChildren<ModalProps>) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(2,7,11,0.72)] px-4 py-8 backdrop-blur-md" onClick={onClose}>
      <div
        className="glass-panel max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-[28px] p-6 sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          {title ? <h2 className="font-display text-2xl font-bold text-[var(--color-text)]">{title}</h2> : <div />}
          <button
            type="button"
            className="rounded-full border border-[var(--color-border)] px-3 py-1 text-sm text-[var(--color-muted)] transition hover:text-[var(--color-text)]"
            onClick={onClose}
          >
            {t("common.close")}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
