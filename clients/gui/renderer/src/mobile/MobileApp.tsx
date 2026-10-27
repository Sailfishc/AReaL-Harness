import { createRoot } from "react-dom/client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button, Input } from "@areal/ui";
import { FeedbackNotice } from "@areal/ui/experimental";
import { SettingsGroupCard, SettingsRow } from "@areal/ui/compositions";
import { ApplicationIntlProvider, useI18n, type MessageId } from "../i18n/IntlProvider.js";
import { MobileClient } from "./mobile-client.mjs";
import { keychain, observeLifecycle, scanPairingLink } from "./platform.js";
import { MobileWorkspace } from "./mobile-workspace.mjs";
import { MobileWorkspaceView } from "./MobileWorkspace.js";
import "../styles.css";
import "../workbench.css";
import "./mobile.layout.css";

const client = new MobileClient({ keychain });
const workspace = new MobileWorkspace(client);

function MobileApp() {
  const { t } = useI18n();
  const state = useSyncExternalStore(client.subscribe, client.snapshot);
  const view = useSyncExternalStore(workspace.subscribe, workspace.snapshot);
  const [name, setName] = useState(t("mobile.deviceFallback"));
  const [link, setLink] = useState("");
  const [paste, setPaste] = useState(false);
  const [settings, setSettings] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [error, setError] = useState<MessageId | null>(null);
  useEffect(() => {
    void keychain
      .deviceName()
      .then(({ name }) => setName(name))
      .catch(() => {});
    const lifecycle = observeLifecycle((active) => void client.setActive(active));
    const theme = matchMedia("(prefers-color-scheme: dark)");
    const update = () => document.documentElement.classList.toggle("dark", theme.matches);
    update();
    theme.addEventListener("change", update);
    return () => {
      void lifecycle.then((remove) => remove());
      theme.removeEventListener("change", update);
      workspace.dispose();
      client.disconnect();
    };
  }, []);
  const pair = (value: string) => {
    setError(null);
    setLink("");
    setPaste(false);
    void client.pair(value, name.trim() || t("mobile.deviceFallback"));
  };
  const scan = async () => {
    setError(null);
    try {
      const value = await scanPairingLink();
      if (value) pair(value);
    } catch {
      setError("mobile.scanFailed");
    }
  };
  const clear = async () => {
    try {
      await client.clear();
      setSettings(false);
      setClearConfirm(false);
      setError(null);
    } catch {
      setError("mobile.clearFailed");
    }
  };
  const statusKey: MessageId =
    state.kind === "connected"
      ? state.ready.capabilities.includes("submit")
        ? "mobile.connected"
        : "mobile.observer"
      : state.kind === "loading" || state.kind === "connecting"
        ? "mobile.connecting"
        : state.kind === "offline"
          ? "mobile.offline"
          : state.kind === "revoked"
            ? "mobile.revoked"
            : state.kind === "background"
              ? "mobile.background"
              : "mobile.blocked";
  return (
    <main
      className="mobile-page bg-background text-foreground font-sans text-fixed-body"
      data-state={state.kind}
      data-remembered={state.kind === "connected" ? state.remembered : undefined}
    >
      {(state.kind !== "connected" || settings || view.page.kind === "projects") && (
        <header className="mobile-header">
          <h1
            className={
              state.kind === "connected" && !settings
                ? "text-fixed-emphasis"
                : "text-fixed-page-title"
            }
          >
            {t(
              settings
                ? "mobile.settings"
                : state.kind === "unpaired"
                  ? "mobile.connect"
                  : state.kind === "pairing"
                    ? "mobile.waiting"
                    : state.kind === "connected"
                      ? "mobile.computer"
                      : "mobile.projects",
            )}
          </h1>
          {state.kind !== "unpaired" && state.kind !== "pairing" && (
            <Button
              className="mobile-touch"
              variant="ghost"
              data-action="settings"
              onClick={() => setSettings(!settings)}
            >
              {t(settings ? "mobile.back" : "mobile.settings")}
            </Button>
          )}
        </header>
      )}
      {error && <FeedbackNotice tone="error" message={t(error)} />}
      {state.kind === "unpaired" && !settings ? (
        <section className="mobile-stack">
          {state.cleared && <FeedbackNotice tone="info" message={t("mobile.cleared")} />}
          {state.error && (
            <FeedbackNotice tone="error" message={t(`mobile.${state.error}` as MessageId)} />
          )}
          <p>{t("mobile.instructions")}</p>
          <label className="mobile-field">
            {t("mobile.deviceName")}
            <Input
              className="mobile-touch text-mobile-input-safe md:text-mobile-input-safe"
              aria-label={t("mobile.deviceName")}
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <Button className="mobile-touch" onClick={() => void scan()}>
            {t("mobile.scan")}
          </Button>
          <Button
            className="mobile-touch"
            variant="outline"
            data-action="paste"
            onClick={() => setPaste(!paste)}
          >
            {t("mobile.paste")}
          </Button>
          {paste && (
            <form
              className="mobile-stack"
              onSubmit={(event) => {
                event.preventDefault();
                pair(link);
              }}
            >
              <label className="mobile-field">
                {t("mobile.link")}
                <Input
                  className="mobile-touch text-mobile-input-safe md:text-mobile-input-safe"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  data-field="pairing-link"
                  aria-label={t("mobile.link")}
                  value={link}
                  onChange={(event) => setLink(event.target.value)}
                />
              </label>
              <Button
                className="mobile-touch"
                data-action="pair"
                type="submit"
                disabled={!link.trim()}
              >
                {t("mobile.continue")}
              </Button>
            </form>
          )}
          <p className="text-foreground-subtle">{t("mobile.access")}</p>
        </section>
      ) : state.kind === "pairing" ? (
        <section className="mobile-stack">
          <p role="status">{t("mobile.fingerprint")}</p>
          <code
            className="mobile-fingerprint font-mono bg-hover rounded-[var(--radius-card)]"
            data-field="fingerprint"
          >
            {state.fingerprint}
          </code>
          <p>{t("mobile.access")}</p>
          <Button
            className="mobile-touch"
            variant="outline"
            onClick={() => {
              client.disconnect();
              void client.restore();
            }}
          >
            {t("mobile.cancel")}
          </Button>
        </section>
      ) : settings ? (
        <section className="mobile-stack">
          <SettingsGroupCard>
            <SettingsRow label={t("mobile.deviceName")} control={name} />
            <SettingsRow label={t("mobile.notificationUnavailable")} control={null} />
          </SettingsGroupCard>
          <Button
            className="mobile-touch"
            variant="outline"
            data-action="clear"
            onClick={() => setClearConfirm(true)}
          >
            {t("mobile.clear")}
          </Button>
          {clearConfirm && (
            <FeedbackNotice
              tone="warning"
              message={t("mobile.clearConfirm")}
              actions={
                <>
                  <Button
                    className="mobile-touch"
                    variant="destructive"
                    data-action="confirm-clear"
                    onClick={() => void clear()}
                  >
                    {t("mobile.clear")}
                  </Button>
                  <Button
                    className="mobile-touch"
                    variant="ghost"
                    onClick={() => setClearConfirm(false)}
                  >
                    {t("mobile.cancel")}
                  </Button>
                </>
              }
            />
          )}
        </section>
      ) : (
        <section className="mobile-stack">
          {(state.kind !== "connected" || view.page.kind === "projects") && (
            <p role="status" className="mobile-status">
              {state.kind === "connected" && (
                <span
                  aria-hidden="true"
                  className="mobile-status-dot rounded-[var(--radius-status-dot)] bg-success"
                />
              )}
              {t(statusKey)}
            </p>
          )}
          {state.kind === "connected" && !state.remembered && (
            <FeedbackNotice tone="warning" message={t("mobile.storageFailed")} />
          )}
          {state.kind === "connected" && <MobileWorkspaceView workspace={workspace} />}
          {["offline", "blocked"].includes(state.kind) && (
            <Button className="mobile-touch" onClick={() => void client.setActive(true)}>
              {t("mobile.retry")}
            </Button>
          )}
        </section>
      )}
    </main>
  );
}

export function mountMobileApp() {
  createRoot(document.getElementById("root")!).render(
    <ApplicationIntlProvider>
      <MobileApp />
    </ApplicationIntlProvider>,
  );
}
