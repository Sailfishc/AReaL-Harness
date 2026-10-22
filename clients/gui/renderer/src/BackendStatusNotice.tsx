import { useEffect, useState } from "react";
import { Button } from "./components/ui/button.js";
import { FeedbackNotice } from "./FeedbackNotice.js";
import { useI18n } from "./i18n/IntlProvider.js";
import type { Snapshot } from "./services.js";

export const BACKEND_STATUS_ID = "backend-status";
export type BackendStatusAction = "update" | "check" | "reconnect" | "recover" | "status";

export function BackendStatusNotice({ connection, update, lifecycle, summary, currentCommands, pending, error, detail, onAction }: {
  connection: Snapshot["connection"];
  update: Snapshot["backendUpdate"];
  lifecycle?: Snapshot["lifecycle"];
  summary?: Snapshot["serviceSummary"];
  currentCommands?: boolean;
  pending: boolean;
  error: string;
  detail?: string;
  onAction: (action: BackendStatusAction) => void;
}) {
  const { t } = useI18n();
  const [connectionNoticeReady, setConnectionNoticeReady] = useState(false);
  const reconnecting = connection?.recovery !== "check" && connection?.state === "connecting";
  useEffect(() => {
    setConnectionNoticeReady(false);
    if (!reconnecting) return;
    const timer = window.setTimeout(() => setConnectionNoticeReady(true), 1200);
    return () => window.clearTimeout(timer);
  }, [reconnecting]);
  let message: string;
  let diagnostic: string | undefined;
  let tone: "info" | "warning" | "error" = "warning";
  let action: BackendStatusAction | undefined;
  if (lifecycle?.error) {
    message = t("backend.operationFailed");
    diagnostic = error || lifecycle.error;
    tone = "error";
    action = "check";
  } else if (lifecycle?.recovery) {
    message = t("backend.operationUnconfirmed");
    diagnostic = error || lifecycle.recovery.message;
    action = 'check';
  } else if (lifecycle?.phase === "completed" && lifecycle.desktopExit === "requested"
    && ["updateDesktop", "stopDesktop"].includes(lifecycle.kind ?? "")) {
    const updateCompleted = lifecycle.kind === "updateDesktop";
    message = t(updateCompleted ? "backend.updateStopped" : "backend.stoppedConfirmed");
    diagnostic = error;
    tone = "info";
    action = updateCompleted ? "update" : "reconnect";
  } else if (lifecycle?.phase && ["acceptedPending", "admissionUnconfirmed", "partial", "settlementIncomplete"].includes(lifecycle.phase)) {
    message = t(lifecycle.phase === "acceptedPending" ? "backend.operationPending" : "backend.operationUnconfirmed");
    diagnostic = error || lifecycle.message;
    action = "check";
  } else if (connection?.recovery === "check") {
    message = t("backend.operationUnconfirmed");
    diagnostic = error || connection.message || detail;
    action = "check";
  } else if (update?.state === "applying") {
    message = t("backend.updating");
    tone = "info";
    action = "update";
  } else if (connection?.state === "connecting") {
    if (!connectionNoticeReady) return null;
    message = t("backend.reconnecting");
    diagnostic = error || connection.message || detail;
    tone = "info";
  } else if (connection?.state === "unavailable") {
    message = t("backend.unavailable");
    diagnostic = error || connection.message || detail;
    action = "reconnect";
  } else if (connection?.state === "ready" && update?.state === "failed") {
    message = t("backend.updateFailed");
    diagnostic = error || update.message;
    tone = "error";
    action = "update";
  } else if (connection?.state === "ready" && currentCommands === false) {
    message = t("backend.updateRequired");
    diagnostic = error;
    action = "update";
  } else if (connection?.state === "ready" && update?.state === "pending") {
    message = t("backend.updatePending");
    diagnostic = error;
    tone = "info";
    action = "update";
  } else if (connection?.state === "ready") {
    return null;
  } else {
    message = t(summary?.state === "stopped" ? "backend.stopped" : "backend.checkState");
    diagnostic = error || detail;
    action = "status";
  }
  const retryUpdate = action === "check" && lifecycle?.kind === "updateDesktop"
    && lifecycle.desktopExit !== "requested" && lifecycle.targets !== undefined
    && lifecycle.targets.every(target => ["completed", "blocked", "settlementIncomplete"].includes(target.phase))
    && ["partial", "settlementIncomplete", "acceptedPending"].includes(lifecycle.phase ?? "");
  const applying = action === "update" && (pending || update?.state === "applying");
  return <FeedbackNotice id={BACKEND_STATUS_ID} tone={tone} message={applying ? t("backend.updating") : message}
    detail={diagnostic} actions={<>
    {lifecycle?.recovery && <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => onAction("recover")}>
      {t("backend.recover")}
    </Button>}
    {retryUpdate && <Button type="button" variant="outline" size="sm" disabled={pending || update?.state === "applying"} onClick={() => onAction("update")}>
      {t("backend.update")}
    </Button>}
    {action !== "status" && <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => onAction("status")}>{t("backend.details")}</Button>}
    {action && <Button type="button" variant="outline" size="sm" disabled={pending || update?.state === "applying"} onClick={() => onAction(action)}>
      {t(applying ? "backend.updatingAction" : action === "update" ? "backend.update" : action === "check" ? "backend.check" : action === "status" ? "backend.details" : "backend.reconnect")}
    </Button>}
  </>} />;
}
