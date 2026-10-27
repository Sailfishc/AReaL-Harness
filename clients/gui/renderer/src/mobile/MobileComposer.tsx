import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@areal/ui";
import { Dialog, DialogContent, DialogTitle } from "@areal/ui/experimental";
import { ConversationComposer } from "../ConversationComposer.js";
import { ComposerPermissionMenu } from "../ComposerPermissionMenu.js";
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
  const selectedModel = models.find(
    (value) => value.providerId === sheetModel?.providerId && value.modelId === sheetModel?.modelId,
  );
  const selectedEffort =
    sheet?.parameters?.reasoningEffort !== undefined
      ? sheet.parameters.reasoningEffort
      : config?.resolvedParameters?.reasoningEffort;
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
        className="mobile-composer composer-dock"
        data-field="composer"
        data-config-revision={snapshot?.configRevision}
        data-active-turn={snapshot?.activeTurnId ?? ""}
      >
        {command.error && <p role="alert">{t(errors[command.error] ?? "mobile.commandFailed")}</p>}
        {pending.map((value) => (
          <div
            className="mobile-command-notice"
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
                className="mobile-touch"
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
        {intent && (
          <div className="mobile-header">
            <p className="text-fixed-caption text-foreground-subtle">{t("mobile.applyOnSend")}</p>
            <Button
              className="mobile-touch"
              variant="ghost"
              disabled={blocked || command.busy}
              onClick={() => commands.setIntent(projectId, threadId, undefined)}
            >
              {t("mobile.resetIntent")}
            </Button>
          </div>
        )}
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
          modelControl={
            <Button
              variant="ghost"
              className="mobile-touch text-fixed-caption"
              data-action="model-sheet"
              disabled={disabled || command.busy || blocked}
              onClick={choose}
            >
              {modelName}
            </Button>
          }
          leadingActions={
            <Button
              variant="ghost"
              className="mobile-touch text-fixed-caption"
              data-action="permission-sheet"
              disabled={disabled || command.busy || blocked}
              onClick={choose}
            >
              {t("mobile.permissions")}
            </Button>
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
                className="mobile-touch composer-primary-action composer-stop-action"
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
                className="mobile-touch composer-primary-action"
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
          className="mobile-model-sheet translate-x-0 translate-y-0 top-auto bottom-0 left-0 rounded-t-[var(--radius-card)] rounded-b-none"
          closeLabel={t("mobile.cancel")}
          showCloseButton={false}
        >
          <DialogTitle>{t("mobile.modelSettings")}</DialogTitle>
          {isNew && view.catalog?.unsupported && <p role="status">{t("mobile.modelsUpgrade")}</p>}
          {running && <p role="status">{t("mobile.configureAfterTurn")}</p>}
          {isNew && (
            <p className="text-fixed-caption text-foreground-subtle">{t("mobile.applyOnSend")}</p>
          )}
          <div className="mobile-sheet-scroll mobile-stack">
            <div className="mobile-stack" role="group" aria-label={t("mobile.models")}>
              {models.map((value) => (
                <Button
                  key={`${value.providerId}/${value.modelId}`}
                  className="mobile-touch mobile-model-choice"
                  variant={
                    value.providerId === sheetModel?.providerId &&
                    value.modelId === sheetModel?.modelId
                      ? "secondary"
                      : "ghost"
                  }
                  aria-pressed={
                    value.providerId === sheetModel?.providerId &&
                    value.modelId === sheetModel?.modelId
                  }
                  data-model-id={value.modelId}
                  disabled={running || command.busy || value.available === false}
                  onClick={() =>
                    setSheet({
                      ...sheet,
                      model: value.providerId
                        ? { providerId: value.providerId, modelId: value.modelId }
                        : null,
                      parameters: { reasoningEffort: null },
                    })
                  }
                >
                  {value.displayName || value.modelId}
                  {value.available === false && <span>{t("mobile.modelUnavailable")}</span>}
                </Button>
              ))}
            </div>
            {!!selectedModel?.reasoningEffortOptions?.length && (
              <div className="mobile-stack">
                <h3 className="text-fixed-label">{t("mobile.reasoning")}</h3>
                <div className="mobile-efforts" role="group" aria-label={t("mobile.reasoning")}>
                  {selectedModel.reasoningEffortOptions.map((value: string) => (
                    <Button
                      className="mobile-touch"
                      key={value}
                      variant={selectedEffort === value ? "secondary" : "ghost"}
                      aria-pressed={selectedEffort === value}
                      disabled={running || command.busy}
                      onClick={() => setSheet({ ...sheet, parameters: { reasoningEffort: value } })}
                    >
                      {effortLabels[value] ? t(effortLabels[value]) : value}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <h3 className="text-fixed-label">{t("mobile.permissions")}</h3>
            <ComposerPermissionMenu
              presentation="inline"
              value={
                sheet?.options?.permissionPreset ??
                (isNew ? "custom" : permissionMode(config ?? {}))
              }
              configuration={isNew ? undefined : config}
              permissionsSupported={isNew ? !view.catalog?.unsupported : !!config?.permissions}
              fullAccessAvailable={isNew || config?.permissions?.fullAccessAvailable}
              disabled={running || command.busy}
              lockedReadOnly={!isNew && config?.profile?.readOnly}
              onChange={(mode) => setSheet({ ...sheet, options: permissionOptions(mode) })}
              onClose={() => {}}
            />
          </div>
          <Button
            className="mobile-touch"
            data-action="model-done"
            disabled={command.busy || (running && !!Object.keys(sheet ?? {}).length)}
            onClick={() => void save()}
          >
            {t("mobile.done")}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
