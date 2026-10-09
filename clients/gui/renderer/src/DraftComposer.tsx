import { profileKey } from "./ProfileDetails.js";
import { useApplicationPreferences } from "./settings/applicationPreferences.js";
import { ComposerModelMenu } from "./ComposerModelMenu.js";
import { ComposerPermissionMenu } from "./ComposerPermissionMenu.js";
import { permissionOptions, planModeOptions, type PermissionMode } from "./permissions.js";
import { ComposerPlanMode } from "./ComposerPlanMode.js";
import { Settings, Plugin, PlanModeIcon as Lightbulb } from "./interfaceIcons.js";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChatPromptEditor } from "./prompt-editor/ChatPromptEditor.js";
import { DraftAttachment } from "./MessageAttachment.js";
import type { LexicalChatInputHandle } from "./LexicalChatInput.js";
import type { Action, Data } from "./services.js";
import { attachedReviewComments, detachReviewComments, reviewCommentKey, transferNewReviewComments, useReviewComments } from "./reviewComments.js";
import { ReviewCommentAttachment } from "./ReviewCommentViews.js";
import {
  attachmentDrafts,
  sending,
  subscribeSending,
  markSending,
  stageThreadDraft,
  submitMessage,
} from "./Composer.js";

export function DraftComposer({
  project,
  action,
  onOpen,
  onPanel,
  draftKey,
  prepareProject,
}: {
  project: Data;
  action: Action;
  onOpen: (pid: string, tid: string) => Promise<void>;
  onPanel: (panel: string) => void;
  draftKey?: string;
  prepareProject?: () => Promise<Data>;
}) {
  const prefs = useApplicationPreferences();
  const key = draftKey ?? `areal-gui:draft:${project.id}:new`;
  const reviewKey = reviewCommentKey(project.id, "new");
  const reviewDraft = useReviewComments(reviewKey);
  const comments = attachedReviewComments(reviewDraft.draft);
  const api = useRef<LexicalChatInputHandle | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [text, setText] = useState(() => localStorage.getItem(key) ?? "");
  const [draftError, setDraftError] = useState("");
  useEffect(() => {
    const refreshDraft = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== key || sending.has(key)) return;
      const draft = localStorage.getItem(key) ?? "";
      api.current?.setText(draft); setText(draft); api.current?.focus();
    };
    window.addEventListener("areal-draft-change", refreshDraft);
    return () => window.removeEventListener("areal-draft-change", refreshDraft);
  }, [key]);
  const [files, setFiles] = useState<File[]>(() => attachmentDrafts.get(key) ?? []);
  const [permission, setPermission] = useState<PermissionMode>(() => localStorage.getItem(`${key}:permission`) === "ask" ? "ask" : "auto");
  const [plan, setPlan] = useState(() => localStorage.getItem(`${key}:plan`) === "true");
  const [profileSelection, setProfileSelection] = useState(() => localStorage.getItem(`${key}:profile`) ?? "");
  const chosenProfile = profileSelection
    ? project.profiles.find((p: Data) => profileKey(p) === profileSelection)
    : project.profiles.find((p: Data) => p.id === "areal-standard") ?? project.profiles[0];
  const unavailableProfile = !!profileSelection && !chosenProfile;
  const setPlanMode = (enabled: boolean) => { setPlan(enabled); localStorage.setItem(`${key}:plan`, String(enabled)); };
  const [model, setModel] = useState(
    () => localStorage.getItem(`areal-gui:model:${project.id}`) ?? "",
  );
  const selectedModel = project.models.find(
    (m: Data) => `${m.providerId}/${m.modelId}` === model && m.available !== false,
  );
  const hasDefaultModel = project.models.some((m: Data) => !m.providerId);
  const effectiveModel = !model && chosenProfile?.model ? "" : selectedModel
    ? model
    : hasDefaultModel
      ? ""
      : (() => {
          const m = project.models.find((m: Data) => m.providerId && m.available !== false);
          return m ? `${m.providerId}/${m.modelId}` : "";
        })();
  const [unknown, setUnknown] = useState(() => localStorage.getItem(`${key}:pending-create`));
  const busy = useSyncExternalStore(subscribeSending, () => sending.has(key));
  const disabled =
    busy ||
    (!hasDefaultModel && !effectiveModel && !chosenProfile?.model) ||
    !project.state?.connected ||
    !!project.pending.length ||
    !!unknown || !!reviewDraft.error || unavailableProfile;
  useEffect(() => {
    attachmentDrafts.set(key, files);
  }, [key, files]);
  const clear = () => {
    detachReviewComments(reviewKey);
    localStorage.removeItem(key);
    localStorage.removeItem(`${key}:permission`);
    localStorage.removeItem(`${key}:plan`);
    attachmentDrafts.delete(key);
    api.current?.clear();
    setText("");
    setFiles([]);
  };
  useEffect(() => {
    if (!unknown || project.pending.length) return;
    const outcome = project.outcomes?.[unknown];
    if (!outcome?.threadId || outcome.accepted !== true) return;
    try { transferNewReviewComments(project.id, outcome.threadId); }
    catch (cause) { setDraftError((cause as Error).message); return; }
    // A recovered creation opens the preserved draft; it never sends it automatically.
    stageThreadDraft(
      project.id,
      outcome.threadId,
      localStorage.getItem(key) ?? "",
      attachmentDrafts.get(key) ?? [],
    );
    localStorage.removeItem(`${key}:pending-create`);
    setUnknown(null);
    clear();
    void onOpen(project.id, outcome.threadId);
  }, [unknown, project.pending.length, project.outcomes]);
  const submit = async (value: string) => {
    if (disabled || sending.has(key) || (!value.trim() && !files.length && !comments.length)) return;
    markSending(key, true);
    setDraftError("");
    let targetKey: string | undefined;
    let creationAttempted = false;
    try {
      const owner = prepareProject ? await prepareProject() : project;
      const profile = profileSelection
        ? owner.profiles.find((p: Data) => profileKey(p) === profileSelection)
        : owner.profiles.find((p: Data) => p.id === "areal-standard") ?? owner.profiles[0];
      if (profileSelection && !profile) throw new Error("当前任务配置不可用，输入已保留。");
      const chosenModel = !effectiveModel && profile?.model ? undefined : owner.models.find(
        (m: Data) => `${m.providerId}/${m.modelId}` === effectiveModel,
      ) ?? (!owner.models.some((m: Data) => !m.providerId) ? owner.models.find((m: Data) => m.available !== false) : undefined);
      creationAttempted = true;
      const result = await action("create", {
        projectId: owner.id,
        ...(profile
          ? { profile: { id: profile.id, revision: profile.revision } }
          : {}),
        ...(chosenModel
          ? { model: { providerId: chosenModel.providerId, modelId: chosenModel.modelId } }
          : {}),
      });
      targetKey = stageThreadDraft(owner.id, result.threadId, value, files);
      transferNewReviewComments(owner.id, result.threadId);
      markSending(targetKey, true);
      clear();
      // Show the accepted task immediately, including while the first model request waits.
      if (mounted.current) void onOpen(owner.id, result.threadId);
      // Configure before the first turn; on failure the accepted task keeps its draft for explicit retry.
      if (!profile?.readOnly && (permission !== "auto" || plan)) {
        await action("configure", { projectId: owner.id, threadId: result.threadId, options: planModeOptions(plan, permissionOptions(permission)) });
      }
      await submitMessage(action, owner.id, result.threadId, value, files);
      localStorage.removeItem(targetKey);
      attachmentDrafts.delete(targetKey);
    } catch (e) {
      setDraftError((e as Error).message);
      const error = e as Error & { submissionUnknown?: boolean; requestId?: string };
      if (creationAttempted && error.submissionUnknown && error.requestId) {
        if (targetKey) localStorage.setItem(`${targetKey}:pending`, error.requestId);
        else {
          localStorage.setItem(`${key}:pending-create`, error.requestId);
          setUnknown(error.requestId);
        }
      }
      // action reports the error. Known-created tasks keep text and files for explicit retry.
    } finally {
      if (targetKey) markSending(targetKey, false);
      markSending(key, false);
    }
  };
  return (
    <div className="composer-dock" data-v4-composer-dock="true">
      <input
        ref={upload}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const selectedFiles = Array.from(e.currentTarget.files ?? []);
          setFiles((f) => [...f, ...selectedFiles]);
          e.currentTarget.value = "";
        }}
      />
      {unknown && (
        <div role="status" className="notice">
          任务创建结果待确认，草稿已保留，不会重复创建。
          <button
            onClick={() => void action("reconcile", { projectId: project.id }).catch(() => {})}
          >
            刷新受理状态
          </button>
        </div>
      )}
      {unavailableProfile && <div role="alert" className="notice">
        当前任务配置不可用，输入已保留。
        <button onClick={() => { setProfileSelection(""); localStorage.removeItem(`${key}:profile`); }}>恢复默认配置</button>
      </div>}
      {project.root && !project.state?.connected && <p role="alert" className="notice">连接不可用，输入已保留。{project.error || project.state?.error}</p>}
      {draftError && <p role="alert" className="px-3 py-2 text-ui-sm text-destructive">{draftError}</p>}
      {reviewDraft.error && <p role="alert" className="px-3 py-2 text-ui-sm text-destructive">{reviewDraft.error}</p>}
      <ChatPromptEditor
        shellClassName="@container/composer"
        workspacePath={project.root}
        taskId={null}
        initialValue={text}
        inputApiRef={api}
        inputTestId="chat-input"
        submitTestId="chat-send-button"
        placeholder={plan ? "描述任务，生成计划…" : "随心输入"}
        disabled={disabled}
        submitDisabled={disabled || (!text.trim() && !files.length && !comments.length)}
        submitting={busy}
        submitLabel="发送"
        enterSubmits={prefs.sendShortcut === "enter"}
        enableMentionPanel={false}
        appSlashCommands={[
          ...(chosenProfile?.readOnly ? [] : [{ value: "plan", label: "计划模式", icon: <Lightbulb />, description: plan ? "关闭计划模式" : "开启计划模式", run: () => setPlanMode(!plan) }]),
          { value: "model", label: "模型", icon: <Settings />, description: "模型与权限设置", run: () => onPanel("设置") },
          { value: "skills", label: "Skills", icon: <Plugin />, description: "查看 Skills", run: () => onPanel("Skills") },
        ]}
        onChange={(value) => {
          setText(value);
          localStorage.setItem(key, value);
        }}
        onSubmit={(value) => {
          void submit(value);
          return false;
        }}
        onPaste={(e) => {
          const pasted = Array.from(e.clipboardData?.files ?? []);
          if (pasted.length) {
            e.preventDefault();
            setFiles((f) => [...f, ...pasted]);
          }
        }}
        attachmentAction={{ label: "添加附件", onSelect: () => upload.current?.click() }}
        menuActions={[{ id: "skills", label: "Skills", description: "查看可用技能", icon: <Plugin />, onSelect: () => onPanel("Skills") },
          { id: "plan", label: "计划模式", description: plan ? "关闭计划模式" : "开启计划模式", icon: <Lightbulb />,
          disabled: disabled || chosenProfile?.readOnly === true, onSelect: () => setPlanMode(!plan) }]}
        topContent={
          <><ReviewCommentAttachment comments={comments} disabled={disabled} onRemove={() => detachReviewComments(reviewKey)} />
          {files.length ? (
            <div className="composer-attachments" data-testid="composer-attachments">
              {files.map((file, i) => <DraftAttachment key={`${file.name}-${file.lastModified}-${i}`} file={file}
                onRemove={() => setFiles((current) => current.filter((_, at) => at !== i))} />)}
            </div>
          ) : null}</>
        }
        leadingActions={
          <><ComposerPermissionMenu value={chosenProfile?.readOnly ? "readOnly" : permission} disabled={disabled}
            lockedReadOnly={chosenProfile?.readOnly === true}
            onChange={value => { setPermission(value); localStorage.setItem(`${key}:permission`, value); }} onClose={() => api.current?.focus()} />
          {plan && <ComposerPlanMode disabled={disabled || chosenProfile?.readOnly === true} onExit={() => setPlanMode(false)} />}</>
        }
        betweenCancelAndSubmitAction={<ComposerModelMenu
          value={effectiveModel} disabled={disabled}
          options={[
            ...(chosenProfile?.model ? [{ value: "", label: `预设模型：${chosenProfile.model.modelId}` }] : hasDefaultModel ? [{ value: "", label: "默认模型" }] : !effectiveModel ? [{ value: "", label: "请先配置模型" }] : []),
            ...project.models.filter((model: Data) => model.providerId && model.available !== false)
              .map((model: Data) => ({ value: `${model.providerId}/${model.modelId}`, label: model.displayName ?? model.modelId })),
          ]}
          onChange={value => { setModel(value); localStorage.setItem(`areal-gui:model:${project.id}`, value); }}
          onClose={() => api.current?.focus()}
        />}
      />
    </div>
  );
}
