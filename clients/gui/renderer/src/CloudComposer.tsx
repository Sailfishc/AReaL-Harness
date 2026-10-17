import { useRef, useState } from "react";
import type { Action, Data } from "./services.js";
import { Button } from "./components/ui/button.js";
import { ChatPromptEditor } from "./prompt-editor/ChatPromptEditor.js";
import type { LexicalChatInputHandle } from "./LexicalChatInput.js";
import { useApplicationPreferences } from "./settings/applicationPreferences.js";

export function CloudComposer({
    project,
    thread,
    action,
    onOpen,
}: {
    project: Data;
    thread?: Data;
    action: Action;
    onOpen?: (projectId: string, threadId: string) => Promise<void>;
}) {
    const input = useRef<LexicalChatInputHandle | null>(null);
    const prefs = useApplicationPreferences();
    const key = `areal-cloud-draft:${project.id}:${thread?.id ?? "new"}`;
    const [text, setText] = useState(() => localStorage.getItem(key) ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [unknown, setUnknown] = useState(() => localStorage.getItem(`${key}:unknown`) === "true");
    const running = thread?.turns?.find((turn: Data) => turn.status === "inProgress");
    const send = async () => {
        if (busy || running || unknown || !text.trim()) return;
        setBusy(true);
        setError("");
        let target = thread?.id;
        try {
            if (!target) {
                const requestId = localStorage.getItem(`${key}:create`) ?? crypto.randomUUID();
                localStorage.setItem(`${key}:create`, requestId);
                const created = await action("cloudSession", {
                    operation: "create",
                    projectId: project.id,
                    requestId,
                });
                target = created.threadId;
                localStorage.setItem(`areal-cloud-draft:${project.id}:${target}`, text);
                // 先在原组件提交首轮，再切换；避免两个 Composer 同时拥有同一草稿。
            }
            await action("cloudSession", {
                operation: "send",
                projectId: project.id,
                threadId: target,
                text,
            });
            localStorage.removeItem(key);
            localStorage.removeItem(`${key}:create`);
            localStorage.removeItem(`areal-cloud-draft:${project.id}:${target}`);
            setText("");
            input.current?.setText("");
            if (!thread) await onOpen?.(project.id, target);
        } catch (cause) {
            const failure = cause as Error & { submissionUnknown?: boolean };
            setError(failure.message);
            if (failure.submissionUnknown) {
                setUnknown(true);
                localStorage.setItem(`${key}:unknown`, "true");
                if (target)
                    localStorage.setItem(
                        `areal-cloud-draft:${project.id}:${target}:unknown`,
                        "true",
                    );
            }
            if (target && !thread) await onOpen?.(project.id, target);
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="cloud-composer">
            <ChatPromptEditor
                workspacePath=""
                taskId={thread?.id ?? null}
                initialValue={text}
                inputApiRef={input}
                inputTestId="cloud-chat-input"
                submitTestId="cloud-chat-send"
                placeholder="随心输入"
                disabled={busy || !!running || unknown}
                submitDisabled={busy || !!running || unknown || !text.trim()}
                submitting={busy}
                enterSubmits={prefs.sendShortcut === "enter"}
                enableMentionPanel={false}
                submitLabel="发送"
                onChange={(value) => { setText(value); localStorage.setItem(key, value); }}
                onSubmit={() => { void send(); return false; }}
                submitControl={running ? <Button type="button" disabled={busy} onClick={() => {
                    void action("cloudSession", { operation: "stop", projectId: project.id,
                        threadId: thread?.id, turnId: running.id }).catch(cause => setError(cause.message));
                }}>停止</Button> : undefined}
            />
            {unknown && (
                <p role="alert">
                    提交结果未知，不会自动重发。请重新打开会话并核对历史。
                    <button
                        type="button"
                        onClick={() => {
                            setUnknown(false);
                            localStorage.removeItem(`${key}:unknown`);
                        }}
                    >
                        已核对，编辑后续消息
                    </button>
                </p>
            )}
            {(error || thread?.cloud?.error) && <p role="alert">{error || thread?.cloud?.error}</p>}
        </div>
    );
}
