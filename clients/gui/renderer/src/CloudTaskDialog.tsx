import { useCallback, useEffect, useRef, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "./components/ui/dialog.js";
import { Button } from "./components/ui/button.js";
import { Input } from "./components/ui/input.js";
import { Textarea } from "./components/ui/textarea.js";
import { DiffViewer } from "./components/ui/diff-viewer.js";
import { splitCloudPatch, projectCloudTask } from "./cloud-task-view.js";
import type { Action } from "./services.js";

export type CloudModel = { providerId: string; modelId: string };
type Task = {
    id: string;
    sequence: number;
    phase: string;
    resource: string;
    prompt: string;
    commit: string;
    modelName: string;
    resultsAvailable: boolean;
    cleanupConfirmed: boolean;
    exitCode: number | null;
};
type TaskEvent = { taskId: string; sequence: number; phase: string; message: string };
type Plan = {
    planId: string;
    commit: string;
    modelName: string;
    files: string[];
    bytes: number;
    location: string;
};
type Review = {
    taskId: string;
    diff: string;
    newFiles: string[];
    testReport: {
        agentExitCode: number;
        testExitCode: number | null;
        testCommand: string | null;
        stdout: string;
        stderr: string;
    };
};
const labels: Record<string, string> = {
    accepted: "已受理",
    starting: "准备环境",
    running: "运行中",
    collecting: "保存结果",
    saveFailed: "结果待保存",
    cleanupPending: "结果可取 · 待清理",
    ready: "结果可取 · 已清理",
    cancelRequested: "正在停止",
    cancelled: "已停止",
    failed: "启动失败",
    unknown: "状态待核对",
};
const terminal = (task: Task) => ["ready", "cancelled", "failed"].includes(task.phase);

export function CloudTaskDialog({
    projectId,
    projectName,
    initialPrompt = "",
    model,
    action,
    onClose,
}: {
    projectId: string;
    projectName: string;
    initialPrompt?: string;
    model?: CloudModel;
    action: Action;
    onClose: () => void;
}) {
    const key = `areal-gui:cloud:${projectId}`;
    const [prompt, setPrompt] = useState(
        () => initialPrompt || localStorage.getItem(`${key}:prompt`) || "",
    );
    const [testCommand, setTestCommand] = useState(() => localStorage.getItem(`${key}:test`) || "");
    const [image, setImage] = useState("");
    const [tasks, setTasks] = useState<Task[]>([]);
    const [selected, setSelected] = useState(() => localStorage.getItem(`${key}:selected`) || "");
    const [task, setTask] = useState<Task>();
    const [events, setEvents] = useState<TaskEvent[]>([]);
    const [plan, setPlan] = useState<Plan>();
    const [review, setReview] = useState<Review>();
    const [pending, setPending] = useState(() => localStorage.getItem(`${key}:pending`) || "");
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [cancelConfirm, setCancelConfirm] = useState(false);
    const [applyConfirm, setApplyConfirm] = useState(false);
    const mounted = useRef(true),
        selectedRef = useRef(selected),
        cursor = useRef(0);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    useEffect(() => {
        localStorage.setItem(`${key}:prompt`, prompt);
    }, [key, prompt]);
    useEffect(() => {
        localStorage.setItem(`${key}:test`, testCommand);
    }, [key, testCommand]);
    const choose = useCallback(
        (id: string) => {
            selectedRef.current = id;
            cursor.current = 0;
            setSelected(id);
            setTask(undefined);
            setEvents([]);
            setReview(undefined);
            setPlan(undefined);
            setCancelConfirm(false);
            setApplyConfirm(false);
            setError("");
            setNotice("");
            localStorage.setItem(`${key}:selected`, id);
        },
        [key],
    );
    const acceptTask = useCallback((next: Task) => {
        if (selectedRef.current !== next.id) return;
        setTask((previous) => projectCloudTask(previous, next, selectedRef.current));
        setTasks((previous) => {
            const old = previous.find((t) => t.id === next.id);
            const value = projectCloudTask(old, next, selectedRef.current);
            return value ? [value, ...previous.filter((t) => t.id !== next.id)] : previous;
        });
    }, []);
    useEffect(() => {
        let active = true;
        void action("cloudTask", { projectId, operation: "list" })
            .then((result) => {
                if (!active) return;
                setTasks(result.tasks);
                setImage((current) => current || result.image);
                if (
                    selectedRef.current &&
                    !result.tasks.some((t: Task) => t.id === selectedRef.current)
                )
                    choose("");
            })
            .catch((cause) => {
                if (active) setError(cause.message);
            });
        return () => {
            active = false;
        };
    }, [action, projectId, choose]);
    useEffect(() => {
        if (!selected) return;
        let active = true,
            timer: ReturnType<typeof setTimeout>;
        const poll = async () => {
            const after = cursor.current;
            try {
                const reply: { task: Task; events: TaskEvent[] } = await action("cloudTask", {
                    projectId,
                    operation: "read",
                    id: selected,
                    after,
                });
                if (!active || selectedRef.current !== reply.task.id) return;
                acceptTask(reply.task);
                setEvents((old) => {
                    const merged = new Map(old.map((event) => [event.sequence, event]));
                    for (const event of reply.events)
                        if (event.taskId === selected && event.sequence > after)
                            merged.set(event.sequence, event);
                    return [...merged.values()].sort((a, b) => a.sequence - b.sequence);
                });
                cursor.current = Math.max(cursor.current, reply.task.sequence);
                if (!terminal(reply.task)) timer = setTimeout(() => void poll(), 1000);
            } catch (cause) {
                if (active) {
                    setError((cause as Error).message);
                    timer = setTimeout(() => void poll(), 2000);
                }
            }
        };
        void poll();
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [action, projectId, selected, acceptTask]);
    const run = async (label: string, operation: () => Promise<void>) => {
        if (busy) return;
        setBusy(label);
        setError("");
        setNotice("");
        try {
            await operation();
        } catch (cause) {
            if (mounted.current) setError((cause as Error).message);
        } finally {
            if (mounted.current) setBusy("");
        }
    };
    const recover = async () => {
        const result = await action("cloudTask", {
            projectId,
            operation: "recover",
            requestId: pending,
        });
        if (!mounted.current) return;
        setPending("");
        localStorage.removeItem(`${key}:pending`);
        if (result.task) {
            choose(result.task.id);
            acceptTask(result.task);
        } else {
            setPlan(undefined);
            setNotice("未找到受理记录，请重新预览后提交。");
        }
    };
    const submit = async () => {
        if (!plan) return;
        const requestId = plan.planId;
        setPending(requestId);
        localStorage.setItem(`${key}:pending`, requestId);
        try {
            const next: Task = await action("cloudTask", {
                projectId,
                operation: "submit",
                planId: plan.planId,
                requestId,
            });
            if (!mounted.current) return;
            setPending("");
            localStorage.removeItem(`${key}:pending`);
            choose(next.id);
            acceptTask(next);
        } catch (cause) {
            throw new Error(`提交待核对：${(cause as Error).message}`);
        }
    };
    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <DialogContent
                className="max-w-[min(900px,calc(100%-2rem))] max-h-[85vh] overflow-auto"
                data-testid="cloud-task-dialog"
            >
                <DialogHeader>
                    <DialogTitle>独立环境任务</DialogTitle>
                    <DialogDescription>{projectName} · 本机 Docker</DialogDescription>
                </DialogHeader>
                <div className="flex items-center gap-2">
                    <select
                        aria-label="独立任务历史"
                        className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1"
                        value={selected}
                        onChange={(e) => choose(e.target.value)}
                    >
                        <option value="">新任务</option>
                        {tasks.map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.prompt.slice(0, 50)} · {labels[t.phase] || t.phase}
                            </option>
                        ))}
                    </select>
                    <Button variant="ghost" size="sm" onClick={() => choose("")} disabled={!!busy}>
                        新任务
                    </Button>
                </div>
                {error && (
                    <p role="alert" className="text-ui-sm text-destructive">
                        {error}
                    </p>
                )}
                {notice && (
                    <p role="status" className="text-ui-sm text-muted-foreground">
                        {notice}
                    </p>
                )}
                {pending && (
                    <div role="status" className="flex items-center justify-between gap-3">
                        <span>提交待核对，不会自动重发。</span>
                        <Button
                            size="sm"
                            disabled={!!busy}
                            onClick={() => void run("核对", recover)}
                        >
                            核对提交
                        </Button>
                    </div>
                )}
                {!selected && (
                    <div className="grid gap-3">
                        <Textarea
                            aria-label="独立任务内容"
                            placeholder="描述新任务…"
                            value={prompt}
                            disabled={!!busy || !!pending}
                            onChange={(e) => {
                                setPrompt(e.target.value);
                                setPlan(undefined);
                            }}
                        />
                        <Input
                            aria-label="独立任务测试命令"
                            placeholder="测试命令（可选）"
                            value={testCommand}
                            disabled={!!busy || !!pending}
                            onChange={(e) => {
                                setTestCommand(e.target.value);
                                setPlan(undefined);
                            }}
                        />
                        <details className="text-ui-sm text-muted-foreground">
                            <summary>运行选项与帮助</summary>
                            <div className="grid gap-2 pt-2">
                                <Input
                                    aria-label="任务镜像"
                                    value={image}
                                    disabled={!!busy || !!pending}
                                    onChange={(e) => {
                                        setImage(e.target.value);
                                        setPlan(undefined);
                                    }}
                                />
                                <p>
                                    仅发送已提交代码，不发送未跟踪文件或附件。关闭窗口继续运行，Mac
                                    关机会停止 Docker。
                                </p>
                                <p>默认最多 8 轮、10 分钟。状态未知时先核对，不重跑副作用。</p>
                            </div>
                        </details>
                        {plan ? (
                            <section
                                data-testid="cloud-task-plan"
                                className="grid gap-2 rounded-md border p-3"
                            >
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-ui-sm">
                                    <span>{plan.location}</span>
                                    <code title={plan.commit}>代码 {plan.commit.slice(0, 12)}</code>
                                    <span>{plan.modelName}</span>
                                </div>
                                <details className="text-ui-sm">
                                    <summary>
                                        发送 {plan.files.length} 个文件 ·{" "}
                                        {(plan.bytes / 1024).toFixed(0)} KiB
                                    </summary>
                                    <ul className="max-h-40 overflow-auto font-mono text-ui-xs">
                                        {plan.files.map((path) => (
                                            <li key={path}>{path}</li>
                                        ))}
                                    </ul>
                                </details>
                                <Button
                                    disabled={!!busy || !!pending}
                                    onClick={() => void run("提交", submit)}
                                >
                                    {busy === "提交" ? "提交中…" : "创建独立任务"}
                                </Button>
                            </section>
                        ) : (
                            <Button
                                disabled={!!busy || !!pending || !prompt.trim() || !image.trim()}
                                onClick={() =>
                                    void run("预览", async () => {
                                        const next = await action("cloudTask", {
                                            projectId,
                                            operation: "plan",
                                            prompt,
                                            image,
                                            testCommand,
                                            ...(model ? { model } : {}),
                                        });
                                        if (mounted.current) setPlan(next);
                                    })
                                }
                            >
                                {busy === "预览" ? "检查中…" : "预览发送计划"}
                            </Button>
                        )}
                    </div>
                )}
                {selected && task && (
                    <section className="grid gap-3" data-testid="cloud-task-status">
                        <div className="flex flex-wrap items-center gap-3">
                            <strong role="status" data-testid="cloud-task-phase">
                                {labels[task.phase] || task.phase}
                            </strong>
                            <code title={task.commit}>代码 {task.commit.slice(0, 12)}</code>
                            <span className="text-ui-sm text-muted-foreground">
                                {task.modelName}
                            </span>
                        </div>
                        <p className="text-ui-sm">{task.prompt}</p>
                        <details className="text-ui-sm">
                            <summary>进度记录 · {events.length}</summary>
                            <ol
                                data-testid="cloud-task-events"
                                className="max-h-40 overflow-auto text-muted-foreground"
                            >
                                {events.map((event) => (
                                    <li key={event.sequence}>
                                        {event.sequence} · {event.message}
                                    </li>
                                ))}
                            </ol>
                        </details>
                        <div className="flex flex-wrap gap-2">
                            {task.resultsAvailable && (
                                <>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={!!busy}
                                        onClick={() =>
                                            void run("审阅", async () => {
                                                const next = await action("cloudTask", {
                                                    projectId,
                                                    operation: "review",
                                                    id: task.id,
                                                });
                                                if (
                                                    mounted.current &&
                                                    selectedRef.current === task.id
                                                )
                                                    setReview(next);
                                            })
                                        }
                                    >
                                        审阅结果
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={!!busy}
                                        onClick={() =>
                                            void run("下载", async () => {
                                                const result = await action("cloudTask", {
                                                    projectId,
                                                    operation: "download",
                                                    id: task.id,
                                                });
                                                if (mounted.current)
                                                    setNotice(`已校验并保存：${result.directory}`);
                                            })
                                        }
                                    >
                                        下载结果
                                    </Button>
                                </>
                            )}
                            {["saveFailed", "cleanupPending"].includes(task.phase) && (
                                <Button
                                    size="sm"
                                    disabled={!!busy}
                                    onClick={() =>
                                        void run("重试", async () =>
                                            acceptTask(
                                                await action("cloudTask", {
                                                    projectId,
                                                    operation: "retry",
                                                    id: task.id,
                                                }),
                                            ),
                                        )
                                    }
                                >
                                    {task.resultsAvailable ? "重试清理" : "重试保存"}
                                </Button>
                            )}
                            {task.phase === "cancelRequested" && task.resource === "unknown" && (
                                <Button
                                    size="sm"
                                    disabled={!!busy}
                                    onClick={() =>
                                        void run("停止", async () =>
                                            acceptTask(
                                                await action("cloudTask", {
                                                    projectId,
                                                    operation: "cancel",
                                                    id: task.id,
                                                }),
                                            ),
                                        )
                                    }
                                >
                                    重试停止
                                </Button>
                            )}
                            {task.phase === "unknown" && (
                                <Button
                                    size="sm"
                                    disabled={!!busy}
                                    onClick={() =>
                                        void run("核对", async () =>
                                            acceptTask(
                                                await action("cloudTask", {
                                                    projectId,
                                                    operation: "reconcile",
                                                    id: task.id,
                                                }),
                                            ),
                                        )
                                    }
                                >
                                    核对状态
                                </Button>
                            )}
                            {!terminal(task) && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={!!busy || task.phase === "cancelRequested"}
                                    onClick={() => setCancelConfirm(true)}
                                >
                                    取消任务
                                </Button>
                            )}
                        </div>
                        {cancelConfirm && (
                            <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                                <span>停止并删除临时环境？未保存的结果会丢失。</span>
                                <Button
                                    size="sm"
                                    disabled={!!busy}
                                    onClick={() =>
                                        void run("停止", async () => {
                                            const next = await action("cloudTask", {
                                                projectId,
                                                operation: "cancel",
                                                id: task.id,
                                            });
                                            if (mounted.current) {
                                                acceptTask(next);
                                                setCancelConfirm(false);
                                            }
                                        })
                                    }
                                >
                                    确认停止
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setCancelConfirm(false)}
                                >
                                    继续运行
                                </Button>
                            </div>
                        )}
                    </section>
                )}
                {review && selected === review.taskId && (
                    <section className="grid gap-2" data-testid="cloud-task-review">
                        <div className="flex flex-wrap gap-3 text-ui-sm">
                            <strong>已校验</strong>
                            <span>{review.newFiles.length} 个新增文件</span>
                            <span>
                                {review.testReport.agentExitCode === 0
                                    ? "执行完成"
                                    : `执行退出 ${review.testReport.agentExitCode}`}
                            </span>
                            <span>
                                {review.testReport.testExitCode === null
                                    ? "未指定测试"
                                    : review.testReport.testExitCode === 0
                                      ? "测试通过"
                                      : `测试退出 ${review.testReport.testExitCode}`}
                            </span>
                        </div>
                        <details className="text-ui-sm">
                            <summary>测试报告</summary>
                            <pre className="max-h-40 overflow-auto whitespace-pre-wrap">
                                {review.testReport.testCommand}
                                {"\n"}
                                {review.testReport.stdout}
                                {review.testReport.stderr}
                            </pre>
                        </details>
                        {review.diff ? (
                            <div className="max-h-72 min-w-0 overflow-auto rounded-md border">
                                {splitCloudPatch(review.diff).map((patch, index) => (
                                    <DiffViewer
                                        key={index}
                                        className="h-auto"
                                        patch={patch}
                                        options={{ disableFileHeader: false }}
                                    />
                                ))}
                            </div>
                        ) : (
                            <p>没有代码改动。</p>
                        )}
                        <Button
                            disabled={!!busy || !review.diff}
                            onClick={() => setApplyConfirm(true)}
                        >
                            应用到当前工作区
                        </Button>
                        {applyConfirm && (
                            <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                                <span>应用已审阅的改动？本地冲突会被拒绝。</span>
                                <Button
                                    disabled={!!busy}
                                    size="sm"
                                    onClick={() =>
                                        void run("应用", async () => {
                                            await action("cloudTask", {
                                                projectId,
                                                operation: "apply",
                                                id: review.taskId,
                                            });
                                            if (mounted.current) {
                                                setApplyConfirm(false);
                                                setNotice("已应用到当前工作区。");
                                            }
                                        })
                                    }
                                >
                                    确认应用
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setApplyConfirm(false)}
                                >
                                    取消
                                </Button>
                            </div>
                        )}
                    </section>
                )}
            </DialogContent>
        </Dialog>
    );
}
