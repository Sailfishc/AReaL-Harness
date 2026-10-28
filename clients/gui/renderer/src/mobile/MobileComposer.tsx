import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@areal/ui";
import { Dialog, DialogContent, DialogTitle } from "@areal/ui";
import { ConversationComposer } from "../ConversationComposer.js";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Radio } from "@base-ui/react/radio";
import { Check, ChevronDown, Shield } from "lucide-react";
import { ComposerQueue } from "../ComposerQueue.js";
import { SendMessageIcon, StopIcon } from "../interfaceIcons.js";
import { permissionMode, permissionOptions } from "../permissions.js";
import { useI18n, type MessageId } from "../i18n/IntlProvider.js";
import type { Data, Action } from "../services.js";
import type { LexicalChatInputHandle } from "../LexicalChatInput.js";
import type { MobileClient } from "./mobile-client.mjs";
import type { MobileWorkspace } from "./mobile-workspace.mjs";
import type { MobileCommands } from "./mobile-commands.mjs";

const errors: Record<string, MessageId> = {
  DEVICE_SAVE_FAILED: "mobile.deviceSaveBeforeSend",
  LOCAL_NOT_SENT: "mobile.notSent",
  CONFIGURATION_UNAVAILABLE: "mobile.configurationUnavailable",
  UNSUPPORTED_PROFILE: "mobile.unsupportedProfile",
  TASK_CONTROL_REQUIRED: "mobile.taskControlRequired",
  SUBMISSION_UNKNOWN: "mobile.commandUnknown",
  RECOVERY_FAILED: "mobile.commandRecoveryFailed",
};
const effortLabels: Record<string, MessageId> = {
  none: "mobile.effort.none",
  minimal: "mobile.effort.minimal",
  low: "mobile.effort.low",
  medium: "mobile.effort.medium",
  high: "mobile.effort.high",
  xhigh: "mobile.effort.xhigh",
  max: "mobile.effort.max",
};
export function MobileComposer({
  client,
  workspace,
  commands,
}: {
  client: MobileClient;
  workspace: MobileWorkspace;
  commands: MobileCommands;
}) {
  const { t } = useI18n();
  const view = useSyncExternalStore(workspace.subscribe, workspace.snapshot);
  const command = useSyncExternalStore(commands.subscribe, commands.snapshot);
  const connection = useSyncExternalStore(client.subscribe, client.snapshot);
  const input = useRef<LexicalChatInputHandle | null>(null);
  const [sheet, setSheet] = useState<Data | null>(null);
  const page = view.page;
  const projectId = page.kind === "projects" ? "" : page.projectId;
  const threadId = page.kind === "session" ? page.threadId : "";
  const draft = commands.draft(projectId, threadId);
  useEffect(() => {
    if (input.current && input.current.getMarkdown() !== draft) input.current.setText(draft);
  }, [draft, projectId, threadId]);
  if (!["new", "session"].includes(page.kind)) return null;
  const isNew = page.kind === "new";
  const snapshot = view.detail?.snapshot;
  const config = snapshot?.configuration;
  const catalog: Data[] = (isNew ? view.catalog?.models : snapshot?.models) ?? [];
  const models = catalog.filter(
    (item) =>
      item.providerId || !catalog.some((candidate) => candidate.providerId && candidate.isDefault),
  );
  const intent = commands.intent(projectId, threadId);
  const pending = commands.unresolved(projectId, threadId);
  const running = !!snapshot?.activeTurnId;
  const connected = connection.kind === "connected";
  const canSubmit = connected && connection.ready.capabilities.includes("submit");
  const canInterrupt = connected && connection.ready.capabilities.includes("interrupt");
  const ordinary = isNew || snapshot?.ownership.kind === "ordinary";
  const blocked = commands.blocksSend(projectId, threadId);
  const disabled =
    !canSubmit || !ordinary || command.recovering || (isNew ? !view.catalog : !snapshot);
  const model = intent && "model" in intent ? intent.model : config?.model;
  const modelName =
    models.find(
      (value) => value.providerId === model?.providerId && value.modelId === model?.modelId,
    )?.displayName ??
    model?.modelId ??
    t("mobile.computerDefault");
  const project: Data = {
    id: projectId,
    root: "",
    models,
    pending: [],
    core: { features: {} },
    state: {
      connected: canSubmit,
      queues: { [threadId]: snapshot?.queue },
      interactions: {},
      threads: {},
    },
  };
  const thread: Data = { id: threadId, turns: [], desktop: { archived: false } };
  const queueAction = (async () => {
    throw new Error(t("mobile.queueDesktop"));
  }) as Action;
  const choose = () => setSheet(structuredClone(intent ?? {}));
  const sheetModel = sheet && "model" in sheet ? sheet.model : config?.model;
  const selectedModel =
    models.find(
      (value) =>
        value.providerId === sheetModel?.providerId && value.modelId === sheetModel?.modelId,
    ) ??
    models.find((value) => value.isDefault) ??
    models.find((value) => !value.providerId);
  const selectedEffort =
    sheet?.parameters?.reasoningEffort !== undefined
      ? sheet.parameters.reasoningEffort
      : (config?.resolvedParameters?.reasoningEffort ?? config?.parameters?.reasoningEffort);
  const reasoningOptions: string[] = selectedModel?.reasoningEffortOptions ?? [];
  const commonEfforts = reasoningOptions.filter(
    (value) => ["low", "medium", "high"].includes(value) || value === selectedEffort,
  );
  const visibleEfforts = commonEfforts.length ? commonEfforts : reasoningOptions;
  const selectedPermission = (options: Data | undefined) => {
    if (
      config?.profile?.readOnly ||
      (options?.readOnly ?? config?.options?.readOnly ?? config?.readOnly)
    )
      return "readOnly";
    const mode = options?.permissionPreset ?? permissionMode(config ?? {});
    return mode === "fullAccess" ? "fullAccess" : "workspace";
  };
  const permissionLabel = (value: string) =>
    t(
      value === "readOnly"
        ? "mobile.permissionReadOnly"
        : value === "fullAccess"
          ? "mobile.permissionFullAccess"
          : "mobile.permissionWorkspace",
    );
  const currentPermission = selectedPermission(intent?.options);
  const currentEffort =
    intent?.parameters?.reasoningEffort ??
    config?.resolvedParameters?.reasoningEffort ??
    config?.parameters?.reasoningEffort;
  const save = async () => {
    if (!sheet) return;
    if (!Object.keys(sheet).length || (await commands.configure(projectId, threadId, sheet)))
      setSheet(null);
  };
  const stopPending = pending.some(
    (value) =>
      value.method === "turn.stop" && value.params.expectedTurnId === snapshot?.activeTurnId,
  );
  return (
    <>
      <div
        className="mobile-composer [&_.composer-editor]:rounded-none [&_.composer-editor]:shadow-none flex-[0_0_auto] min-w-0 composer-dock"
        data-field="composer"
        data-config-revision={snapshot?.configRevision}
        data-active-turn={snapshot?.activeTurnId ?? ""}
      >
        {command.error && <p role="alert">{t(errors[command.error] ?? "mobile.commandFailed")}</p>}
        {pending.map((value) => (
          <div
            className="mobile-command-notice flex items-center gap-inline"
            key={value.commandId}
            data-command-state={value.admissionState}
            data-command-id={value.commandId}
          >
            <p role="status">
              {t(
                value.admissionState === "pending"
                  ? "mobile.commandPending"
                  : "mobile.commandUnknown",
              )}
            </p>
            {value.admissionState !== "pending" && (
              <Button
                className="mobile-touch min-h-[var(--size-touch-target)] min-w-[var(--size-touch-target)]"
                variant="outline"
                data-action="query-command"
                disabled={!connected || command.recovering}
                onClick={() => void commands.query(value)}
              >
                {t("mobile.queryCommand")}
              </Button>
            )}
          </div>
        ))}
        {!isNew && snapshot?.queue && (
          <ComposerQueue
            project={project}
            thread={thread}
            action={queueAction}
            disabled
            onEdit={() => {}}
          />
        )}
        <ConversationComposer
          project={project}
          touchInput
          modelConfig={config}
          onConfigureModel={() => {}}
          modelControl={<></>}
          leadingActions={
            <>
              <Button
                variant="ghost"
                className="mobile-composer-chip [border-radius:var(--radius-pill)] bg-hover text-fixed-caption"
                data-action="model-sheet"
                disabled={disabled || command.busy || blocked}
                onClick={choose}
              >
                <span>
                  {modelName}
                  {currentEffort && effortLabels[currentEffort]
                    ? ` · ${t(effortLabels[currentEffort])}`
                    : ""}
                </span>
                <ChevronDown />
              </Button>
              <Button
                variant="ghost"
                className="mobile-composer-chip [border-radius:var(--radius-pill)] bg-hover text-fixed-caption"
                data-action="permission-sheet"
                aria-label={t("mobile.permissions")}
                disabled={disabled || command.busy || blocked}
                onClick={choose}
              >
                <Shield />
                <span>{permissionLabel(currentPermission)}</span>
              </Button>
            </>
          }
          workspacePath=""
          taskId={threadId || null}
          inputApiRef={input}
          inputTestId="mobile-chat-input"
          submitTestId="mobile-chat-send"
          initialValue={draft}
          placeholder={t(
            isNew
              ? "mobile.newMessagePlaceholder"
              : running
                ? "mobile.queuePlaceholder"
                : "mobile.messagePlaceholder",
          )}
          disabled={!canSubmit || !ordinary}
          submitDisabled={disabled || blocked || command.busy || !draft.trim()}
          submitLabel={t(running ? "mobile.enqueue" : "mobile.send")}
          enterSubmits={false}
          showMentionButton={false}
          showSlashButton={false}
          enableMentionPanel={false}
          enableWorkspaceFileDrop={false}
          enableExternalFileDrop={false}
          onChange={(text) => commands.setDraft(projectId, threadId, text)}
          onSubmit={() => {
            void commands.send();
            return false;
          }}
          onCancel={running && canInterrupt ? () => void commands.stop() : undefined}
          submitControl={
            running && !draft.trim() ? (
              <Button
                className="mobile-touch min-h-[var(--size-touch-target)] min-w-[var(--size-touch-target)] composer-primary-action [border-radius:var(--radius-pill)] composer-stop-action"
                size="icon"
                variant="secondary"
                aria-label={t("mobile.stop")}
                data-action="stop"
                disabled={!canInterrupt || command.busy || stopPending}
                onClick={() => void commands.stop()}
              >
                <StopIcon />
              </Button>
            ) : (
              <Button
                className="mobile-touch min-h-[var(--size-touch-target)] min-w-[var(--size-touch-target)] composer-primary-action [border-radius:var(--radius-pill)]"
                size="icon"
                aria-label={t(running ? "mobile.enqueue" : "mobile.send")}
                data-testid="mobile-chat-send"
                data-action="send"
                disabled={disabled || blocked || command.busy || !draft.trim()}
                onClick={() => void commands.send()}
              >
                <SendMessageIcon />
              </Button>
            )
          }
        />
      </div>
      <Dialog
        open={sheet !== null}
        onOpenChange={(open) => {
          if (!open) setSheet(null);
        }}
      >
        <DialogContent
          className="mobile-model-sheet [&_h2]:[line-height:1.3] [&_h2]:font-semibold [&_h3]:[line-height:1.3] [&_h3]:font-semibold border-0 [border-radius:var(--radius-overlay)_var(--radius-overlay)_0_0] shadow-none [transition:translate_var(--motion-normal)_var(--ease-standard)]"
          overlayClassName="mobile-sheet-overlay bg-dialog-backdrop supports-backdrop-filter:backdrop-blur-none"
          closeLabel={t("mobile.cancel")}
          showCloseButton={false}
        >
          <div
            className="mobile-sheet-handle bg-border [border-radius:var(--radius-pill)]"
            aria-hidden="true"
          />
          <div className="mobile-sheet-header [&_h2]:text-fixed-emphasis">
            <DialogTitle>{t("mobile.modelSettings")}</DialogTitle>
            <Button
              variant="ghost"
              className="mobile-sheet-done text-fixed-body font-semibold"
              data-action="model-done"
              disabled={command.busy || (running && !!Object.keys(sheet ?? {}).length)}
              onClick={() => void save()}
            >
              {t("mobile.done")}
            </Button>
          </div>
          <div className="mobile-sheet-scroll">
            {isNew && view.catalog?.unsupported && <p role="status">{t("mobile.modelsUpgrade")}</p>}
            <section className="mobile-sheet-section [&_h3]:text-fixed-label [&_h3]:font-normal [&_h3]:text-foreground-subtle">
              <h3>{t("mobile.models")}</h3>
              <RadioGroup
                className="mobile-choice-group [border-radius:var(--radius-card)] bg-hover"
                aria-label={t("mobile.models")}
                value={
                  selectedModel ? `${selectedModel.providerId ?? ""}/${selectedModel.modelId}` : ""
                }
                onValueChange={(key) => {
                  const value = models.find(
                    (item) => `${item.providerId ?? ""}/${item.modelId}` === key,
                  );
                  if (value)
                    setSheet({
                      ...sheet,
                      model: value.providerId
                        ? { providerId: value.providerId, modelId: value.modelId }
                        : null,
                    });
                }}
              >
                {models.map((value) => (
                  <Radio.Root
                    key={`${value.providerId}/${value.modelId}`}
                    value={`${value.providerId ?? ""}/${value.modelId}`}
                    className="mobile-model-choice mobile-choice-row border-0 [border-bottom:var(--border-width-default)_solid_var(--color-border)] bg-transparent text-foreground [font-family:inherit] text-fixed-body [line-height:1.4] cursor-pointer [&:last-child]:[border-bottom:0] [&_small]:text-fixed-caption [&_small]:text-foreground-subtle [&[data-disabled]]:opacity-50 [&[data-disabled]]:cursor-default [&:focus-visible]:[outline:var(--focus-width)_solid_var(--color-ring)] [&:focus-visible]:[outline-offset:calc(-1_*_var(--focus-width))]"
                    data-model-id={value.modelId}
                    disabled={running || command.busy || value.available === false}
                  >
                    <span className="mobile-choice-copy [&_>_span]:font-semibold">
                      <span>{value.displayName || value.modelId}</span>
                      {(value.isDefault || !value.providerId) && (
                        <small>{t("mobile.computerDefault")}</small>
                      )}
                      {value.available === false && <small>{t("mobile.modelUnavailable")}</small>}
                    </span>
                    <Radio.Indicator className="mobile-choice-check text-brand">
                      <Check />
                    </Radio.Indicator>
                  </Radio.Root>
                ))}
              </RadioGroup>
            </section>
            {selectedModel &&
              selectedModel.capabilities?.reasoning !== false &&
              visibleEfforts.length > 0 && (
                <section className="mobile-sheet-section [&_h3]:text-fixed-label [&_h3]:font-normal [&_h3]:text-foreground-subtle">
                  <h3>{t("mobile.reasoning")}</h3>
                  <RadioGroup
                    className="mobile-efforts [border-radius:var(--radius-control)] bg-hover"
                    aria-label={t("mobile.reasoning")}
                    value={selectedEffort ?? "default"}
                    onValueChange={(value) =>
                      setSheet({ ...sheet, parameters: { reasoningEffort: value } })
                    }
                  >
                    {visibleEfforts.map((value: string) => (
                      <Radio.Root
                        key={value}
                        value={value}
                        className="mobile-effort-choice border-0 [border-radius:var(--radius-inset)] bg-transparent text-foreground-subtle text-fixed-label [&[data-checked]]:bg-background [&[data-checked]]:text-foreground [&[data-checked]]:[box-shadow:var(--shadow-raised-control)] [&:focus-visible]:[outline:var(--focus-width)_solid_var(--color-ring)] [&:focus-visible]:[outline-offset:calc(-1_*_var(--focus-width))]"
                        disabled={running || command.busy}
                      >
                        {value === "default"
                          ? t("chat.composer.serviceDefault")
                          : effortLabels[value]
                            ? t(effortLabels[value])
                            : value}
                      </Radio.Root>
                    ))}
                  </RadioGroup>
                </section>
              )}
            <section className="mobile-sheet-section [&_h3]:text-fixed-label [&_h3]:font-normal [&_h3]:text-foreground-subtle">
              <h3>{t("mobile.executionPermissions")}</h3>
              <RadioGroup
                className="mobile-choice-group [border-radius:var(--radius-card)] bg-hover"
                aria-label={t("mobile.permissions")}
                value={selectedPermission(sheet?.options)}
                onValueChange={(mode) =>
                  setSheet({
                    ...sheet,
                    options: {
                      ...permissionOptions(mode === "fullAccess" ? "fullAccess" : "ask"),
                      readOnly: mode === "readOnly",
                    },
                  })
                }
              >
                {["readOnly", "workspace", "fullAccess"].map((mode) => (
                  <Radio.Root
                    key={mode}
                    value={mode}
                    className="mobile-choice-row border-0 [border-bottom:var(--border-width-default)_solid_var(--color-border)] bg-transparent text-foreground [font-family:inherit] text-fixed-body [line-height:1.4] cursor-pointer [&:last-child]:[border-bottom:0] [&_small]:text-fixed-caption [&_small]:text-foreground-subtle [&[data-disabled]]:opacity-50 [&[data-disabled]]:cursor-default [&:focus-visible]:[outline:var(--focus-width)_solid_var(--color-ring)] [&:focus-visible]:[outline-offset:calc(-1_*_var(--focus-width))]"
                    data-permission-preset={mode === "workspace" ? "ask" : mode}
                    disabled={
                      running ||
                      command.busy ||
                      (!isNew && (!config?.permissions || config?.profile?.readOnly)) ||
                      (mode === "fullAccess" && !isNew && !config?.permissions?.fullAccessAvailable)
                    }
                  >
                    <span>{permissionLabel(mode)}</span>
                    {mode === "fullAccess" && <small>{t("mobile.fullComputerAccess")}</small>}
                    <Radio.Indicator className="mobile-choice-check text-brand">
                      <Check />
                    </Radio.Indicator>
                  </Radio.Root>
                ))}
              </RadioGroup>
            </section>
            <p className="mobile-sheet-note text-fixed-caption leading-normal text-foreground-subtle">
              {t("mobile.configureAfterTurn")} {t("mobile.applyOnSend")}
            </p>
            {intent && command.error && (
              <Button
                variant="ghost"
                onClick={() => {
                  commands.setIntent(projectId, threadId, undefined);
                  setSheet({});
                }}
              >
                {t("mobile.resetIntent")}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
