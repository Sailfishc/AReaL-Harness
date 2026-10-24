import { useEffect, useRef, useState } from "react";
import { NotificationToast } from "@areal/ui/wip";
import { useI18n } from "./i18n/IntlProvider.js";
import type { ToastMessage } from "./components/ui/toast.js";
import "@areal/ui/notifications.css";

type ActiveToast = ToastMessage & { id: number };

export function ToastHost() {
  const { t } = useI18n();
  const [active, setActive] = useState<ActiveToast | null>(null);
  const sequence = useRef(0);
  useEffect(() => {
    const show = (event: Event) => {
      const detail: unknown = (event as CustomEvent).detail;
      const value = typeof detail === "string" ? { message: detail, tone: "info" as const } : detail;
      if (!value || typeof value !== "object" || !("message" in value) || typeof value.message !== "string" || !value.message.trim()) return;
      const tone = "tone" in value && (value.tone === "warning" || value.tone === "error" || value.tone === "success") ? value.tone : "info";
      setActive({ id: ++sequence.current, message: value.message, tone });
    };
    document.addEventListener("areal:toast", show);
    return () => document.removeEventListener("areal:toast", show);
  }, []);
  return <div data-testid={active ? "toast" : undefined} data-tone={active?.tone} className="areal-toast-viewport">
    {active && <NotificationToast key={active.id} message={active.message} tone={active.tone} dismissLabel={t("recovery.dismiss")} onDismiss={() => setActive(null)} />}
  </div>;
}
