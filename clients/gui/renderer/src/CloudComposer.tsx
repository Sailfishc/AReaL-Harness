import { useState } from "react";
import type { Action, Data } from "./services.js";
import { Button } from "./components/ui/button.js";

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
    const refresh = async () => {
        setBusy(true);
        setError("");
        try {
            await action("cloudSession", {
                operation: "open",
                projectId: project.id,
                threadId: thread?.id,
            });
            // 只刷新历史，未知提交由用户核对后决定后续输入，不自动重发。
        } catch (cause) {
            setError((cause as Error).message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <form
            className="cloud-composer"
            onSubmit={(event) => {
                event.preventDefault();
                void send();
            }}
        >
            <div className="cloud-composer-status">
                Cloud · {thread?.cloud?.sessionId ?? "新会话"}
            </div>
            <textarea
                aria-label="Cloud 消息"
                value={text}
                disabled={busy || !!running || unknown}
                rows={4}
                placeholder="在云端执行任务；本地项目与 Harness 不会上传"
                onChange={(event) => {
                    setText(event.target.value);
                    localStorage.setItem(key, event.target.value);
                }}
            />
            <div className="cloud-composer-actions">
                {thread && (
                    <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void refresh()}
                    >
                        刷新连接与历史
                    </Button>
                )}
                {running ? (
                    <Button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                            void action("cloudSession", {
                                operation: "stop",
                                projectId: project.id,
                                threadId: thread?.id,
                                turnId: running.id,
                            }).catch((cause) => setError(cause.message));
                        }}
                    >
                        停止
                    </Button>
                ) : (
                    <Button type="submit" disabled={busy || unknown || !text.trim()}>
                        {busy ? "连接中…" : "发送"}
                    </Button>
                )}
            </div>
            {unknown && (
                <p role="alert">
                    提交结果未知，不会自动重发。请刷新并核对历史。
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
        </form>
    );
}
