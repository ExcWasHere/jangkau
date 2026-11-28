import { createContext, useCallback, useContext, useMemo, useState } from "react";

type Toast = { id: number; message: string; tone: "info" | "success" | "error" };

type ToastApi = {
  push: (message: string, tone?: Toast["tone"]) => void;
};

const ToastContext = createContext<ToastApi>({ push: () => {} });

const DISMISS_MS = 4000;

/**
 * Toast singkat untuk umpan balik aksi. `aria-live="polite"` supaya pembaca
 * layar mengumumkan tanpa memotong ucapan pengguna. Tidak dipakai untuk galat
 * yang butuh tindakan — itu tempatnya di dalam form.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, DISMISS_MS);
  }, []);

  const api = useMemo<ToastApi>(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-70 flex w-[min(92vw,360px)] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <p
            key={toast.id}
            className={`pointer-events-auto rounded-lg border px-4 py-3 text-[13px] shadow-lg ${
              toast.tone === "success"
                ? "border-ok/40 bg-surface text-ok"
                : toast.tone === "error"
                  ? "border-danger/40 bg-surface text-danger"
                  : "border-line bg-surface text-ink"
            }`}
          >
            {toast.message}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
