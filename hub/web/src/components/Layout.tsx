import { useEffect, useState, type ReactNode } from "react";
import Sidebar from "./Sidebar.tsx";
import Header from "./Header.tsx";
import { useWebSocket } from "../hooks/useWebSocket.tsx";

interface ActionToast {
  id: number;
  label: string;
  error?: string;
}

let toastSeq = 0;

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toasts, setToasts] = useState<ActionToast[]>([]);
  const { subscribe } = useWebSocket();

  useEffect(() => {
    function addToast(label: string, error?: string) {
      const toast: ActionToast = { id: ++toastSeq, label, error };
      setToasts((prev) => [...prev.slice(-4), toast]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toast.id)), 5000);
    }

    const unsubAction = subscribe("action:response", (msg) => {
      const d = msg.data as { action: string; success: boolean; error?: string };
      if (d.success) return; // successes are silent
      addToast(`${d.action} failed`, d.error);
    });

    const unsubConfig = subscribe("config:reload_failed", (msg) => {
      const d = msg.data as { file: string; error: string };
      addToast(`Config reload failed: ${d.file}`, d.error);
    });

    return () => { unsubAction(); unsubConfig(); };
  }, [subscribe]);

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <Header onMenuClick={() => setMobileMenuOpen(true)} />
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>

      {/* Action failure toasts */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="flex items-start gap-2 rounded border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive shadow-md"
            >
              <span className="shrink-0">⚠</span>
              <div className="min-w-0">
                <p className="font-medium truncate">{t.label}</p>
                {t.error && <p className="text-destructive/80 truncate">{t.error}</p>}
              </div>
              <button
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                className="ml-auto shrink-0 opacity-60 hover:opacity-100"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
