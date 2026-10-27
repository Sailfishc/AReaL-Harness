import { App } from "@capacitor/app";
import type { ProbeBridge } from "../mobile.js";
import { keychain } from "./platform.js";

const wait = async <T>(read: () => T | null | undefined | false): Promise<T> => {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    const value = read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("ProductConditionTimeout");
};
const state = (value: string) => document.querySelector(`[data-state="${value}"]`);
const click = async (action: string) => {
  const button = await wait(() =>
    document.querySelector<HTMLButtonElement>(`[data-action="${action}"]`),
  );
  button.click();
};

export async function runProduct(
  config: { mode: string; link?: string; projectId?: string; threadId?: string },
  bridge: ProbeBridge,
) {
  try {
    const observations: {
      projects?: number;
      history?: boolean;
      historyAutoload?: boolean;
      live?: boolean;
    } = {};
    if (config.mode === "pair") {
      await wait(() => state("unpaired"));
      await click("paste");
      const input = await wait(() =>
        document.querySelector<HTMLInputElement>('[data-field="pairing-link"]'),
      );
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        config.link,
      );
      delete config.link;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await wait(
        () => !document.querySelector<HTMLButtonElement>('[data-action="pair"]')?.disabled,
      );
      await click("pair");
      await wait(() => state("pairing"));
      bridge.postMessage({
        kind: "pairing",
        peer: document.querySelector('[data-field="fingerprint"]')?.textContent,
      });
    }
    if (!["unpaired", "clear"].includes(config.mode)) await wait(() => state("connected"));
    if (["projects", "sessions", "baseline", "history", "live", "release"].includes(config.mode)) {
      await wait(
        () =>
          document.querySelectorAll("[data-project-id]").length === 2 &&
          !document.querySelector('[data-project-id][aria-busy="true"]'),
      );
      observations.projects = document.querySelectorAll("[data-project-id]").length;
      if (config.mode !== "projects") {
        document
          .querySelector<HTMLButtonElement>(`[data-project-id="${config.projectId}"]`)!
          .click();
        const thread = await wait(() =>
          document.querySelector<HTMLButtonElement>(`[data-thread-id="${config.threadId}"]`),
        );
        if (config.mode !== "sessions") {
          thread.click();
          await wait(() =>
            document.querySelector(".messages")?.textContent?.includes("MOBILE_HISTORY_052"),
          );
          if (document.querySelector(".messages")?.textContent?.includes("MOBILE_HISTORY_001"))
            throw new Error("HistoryFixtureTooSmall");
          const messages = document.querySelector<HTMLElement>(".messages")!;
          if (["history", "live"].includes(config.mode)) {
            const older = await wait(() =>
              [
                ...document.querySelectorAll<HTMLButtonElement>(".message-history-controls button"),
              ].find((button) => !button.disabled),
            );
            if (config.mode === "history") {
              messages.scrollTop = messages.scrollHeight;
              messages.dispatchEvent(new Event("scroll"));
              const bounds = messages.getBoundingClientRect();
              messages.dispatchEvent(
                new PointerEvent("pointerdown", {
                  bubbles: true,
                  pointerType: "touch",
                  clientX: bounds.left + bounds.width / 2,
                }),
              );
              messages.scrollTop = 0;
              messages.dispatchEvent(new Event("scroll"));
            } else older.click();
            await wait(() =>
              document.querySelector(".messages")?.textContent?.includes("MOBILE_HISTORY_001"),
            );
            observations.history = true;
            if (config.mode === "history") observations.historyAutoload = true;
            messages.scrollTop = 0;
            messages.dispatchEvent(new Event("scroll"));
          }
          if (config.mode === "live") {
            bridge.postMessage({ kind: "ready" });
            await wait(() =>
              document.querySelector(".messages")?.textContent?.includes("MOBILE_LIVE_UPDATE"),
            );
            if (!document.querySelector(".messages")?.textContent?.includes("MOBILE_HISTORY_003"))
              throw new Error("HistoryBoundaryLost");
            observations.live = true;
            messages.scrollTop = messages.scrollHeight;
            messages.dispatchEvent(new Event("scroll"));
          }
          if (config.mode === "release") {
            await click("workspace-back");
            await wait(() => document.querySelector('[data-page="work"]'));
          }
        }
      }
    }
    if (config.mode === "lifecycle") {
      let background = false;
      let foreground = false;
      const listener = await App.addListener("appStateChange", ({ isActive }) => {
        if (!isActive) {
          background = true;
          bridge.postMessage({ kind: "background" });
        } else if (background) foreground = true;
      });
      bridge.postMessage({ kind: "ready" });
      await wait(() => foreground && state("connected"));
      await listener.remove();
    }
    if (config.mode === "revoked") {
      bridge.postMessage({ kind: "ready" });
      await wait(() => state("revoked"));
    }
    if (config.mode === "clear") {
      await wait(() => state("connected") || state("revoked"));
      await click("settings");
      await click("clear");
      await click("confirm-clear");
    }
    if (["clear", "unpaired"].includes(config.mode)) await wait(() => state("unpaired"));
    const saved = await keychain.load();
    const record = saved.value ? JSON.parse(saved.value) : null;
    bridge.postMessage({
      kind: "result",
      result: {
        status: "success",
        ...observations,
        mode: config.mode,
        origin: location.origin,
        state: document.querySelector("[data-state]")?.getAttribute("data-state"),
        remembered: document.querySelector("[data-state]")?.getAttribute("data-remembered"),
        keychainPresent: record !== null,
        identityPresent: typeof record?.client?.credential?.identity === "string",
        grantRevision: record?.grantRevision ?? null,
        peer: record?.client?.credential?.peerId ?? null,
      },
    });
  } catch (error) {
    let keychainDiagnostic: Record<string, string | number | boolean | null>;
    try {
      const result = await keychain.load();
      keychainDiagnostic = { valueIsNull: result.value === null, valueType: typeof result.value };
    } catch (failure) {
      const native = failure as { code?: string; status?: number; data?: { status?: number } };
      const status = native.status ?? native.data?.status;
      keychainDiagnostic = {
        code:
          typeof native.code === "string" && /^[A-Z0-9_-]{1,64}$/.test(native.code)
            ? native.code
            : "UNKNOWN",
        status: Number.isSafeInteger(status) ? status! : null,
      };
    }
    bridge.postMessage({
      kind: "result",
      result: {
        status: "failure",
        origin: location.origin,
        keychainDiagnostic,
        mode: config.mode,
        state: document.querySelector("[data-state]")?.getAttribute("data-state"),
        error: error instanceof Error ? error.name : "UnknownError",
      },
    });
  }
}
