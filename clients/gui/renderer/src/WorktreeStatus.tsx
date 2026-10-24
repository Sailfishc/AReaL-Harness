import { useEffect, useRef, useState } from "react";
import { Button } from "./components/ui/button.js";
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover.js";
import { GitBranch, GitFork } from "lucide-react";
import { useI18n } from "./i18n/IntlProvider.js";
import type { Action, Data } from "./services.js";

const stateMessages = {
    ready: "worktree.ready", created: "worktree.created", binding: "worktree.binding",
    settingUp: "worktree.settingUp", cancelling: "worktree.cancelling", cancelled: "worktree.cancelled",
    failed: "worktree.failed", unknown: "worktree.unknown", creating: "worktree.creating",
} as const;

export function WorktreeStatus({ events = [], current }: { events?: Data[]; current?: Data }) {
    const { t } = useI18n();
    const [details, setDetails] = useState(false);
    if (!events.length && !current) return null;
    const facts = events.length ? details ? events : events.slice(-1) : [current!];
    const expandable = events.length > 1 || facts.some(event => (event.state ?? event.status) === "ready");
    return (
        <section
            aria-label={t("worktree.events")}
            className="mb-3 min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-ui-caption text-foreground-subtle"
            data-testid="worktree-status"
        >
            <ol className="grid list-none gap-2">
                {facts.map((event, index) => {
                    const state = event.state ?? event.status;
                    const ready = state === "ready";
                    const failed = state === "failed";
                    const record = event.record ?? current?.record ?? current ?? event;
                    const setup = event.setup ?? current?.setup ?? record.setup;
                    const directory = event.directory ?? record.directory;
                    const branch = event.branch ?? record.branch;
                    return (
                        <li
                            key={event.id ?? `${event.requestId ?? "worktree"}:${index}`}
                            className="min-w-0"
                            role={failed ? "alert" : "status"}
                            data-worktree-state={state}
                        >
                            <div className="flex items-start gap-2">
                                <GitFork className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                                <span className={failed ? "text-destructive" : undefined}>
                                    {t(stateMessages[state as keyof typeof stateMessages] ?? "worktree.creating")}
                                </span>
                            </div>
                            {setup?.output && <pre aria-label={t("worktree.output")} className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-ui-caption">{setup.output}</pre>}
                            {event.message && <p className="mt-1 break-words">{event.message}</p>}
                            {(!ready || details) && (directory || branch || ready) && (
                                <>
                                    {branch && (
                                        <p className="mt-1 flex items-center gap-2">
                                            <GitBranch
                                                className="size-3.5 shrink-0"
                                                aria-hidden="true"
                                            />
                                            <span className="break-all">{branch}</span>
                                        </p>
                                    )}
                                    {directory && (
                                        <code className="mt-1 block break-all">{directory}</code>
                                    )}
                                    {ready && (
                                        <p className="mt-1">
                                            {t(
                                                (event.automatic ?? current?.automatic)
                                                    ? "worktree.automaticEvent"
                                                    : "worktree.commitOnly",
                                            )}
                                        </p>
                                    )}
                                </>
                            )}
                        </li>
                    );
                })}
            </ol>
            {expandable && <Button variant="ghost" size="sm" aria-expanded={details} className="mt-1" onClick={() => setDetails(value => !value)}>
                {t(details ? "worktree.hideDetails" : "worktree.showDetails")}
            </Button>}
        </section>
    );
}

export function WorktreeActions({ projectId, threadId, worktree, action }: { projectId: string; threadId: string; worktree: Data; action: Action }) {
    const { t } = useI18n();
    const [record, setRecord] = useState<Data>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [output, setOutput] = useState("");
    const request = useRef(action); request.current = action;
    useEffect(() => {
        let active = true;
        void request.current("workspace", { projectId, operation: "worktreeList" }).then(result => {
            if (active) setRecord(result.worktrees?.find((item: Data) => item.threadId === threadId && !item.deleted));
        }, cause => { if (active) setError(cause.message); });
        return () => { active = false; };
    }, [projectId, threadId]);
    const run = async (actionId: string) => {
        if (busy || !record) return;
        setBusy(true); setError(""); setOutput("");
        try {
            const result = await action("workspace", { projectId, operation: "worktreeAction", requestId: crypto.randomUUID(), worktreeRequestId: record.requestId, actionId });
            setOutput(result.output ?? result.stdout ?? result.result?.output ?? "");
            if (result.status !== "succeeded") setError(result.message || t(result.status === "unknown" ? "worktree.unknown" : "worktree.failed"));
        } catch (cause) { setError((cause as Error).message); }
        finally { setBusy(false); }
    };
    return <Popover>
        <PopoverTrigger render={<Button variant="ghost" size="sm" aria-label={t("worktree.threadWorkspace", { branch: worktree.branch })} title={worktree.directory} />}>
            <GitFork className="size-3.5" /><span className="max-w-36 truncate">{worktree.branch}</span>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80">
            <p className="text-ui-sm font-medium">{record ? t(stateMessages[record.state as keyof typeof stateMessages] ?? "worktree.unknown") : worktree.branch}</p>
            <code className="break-all text-ui-caption text-foreground-subtle">{worktree.directory}</code>
            {(record?.environment?.actions ?? []).map((item: Data) => <Button variant="secondary" size="sm" key={item.id} disabled={busy || record?.state !== "ready"} onClick={() => void run(item.id)}>{item.name}</Button>)}
            {busy && <p role="status" className="text-ui-caption">{t("worktree.actionRunning")}</p>}
            {error && <p role="alert" className="text-ui-caption text-destructive break-words">{error}</p>}
            {output && <pre aria-label={t("worktree.output")} className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-ui-caption">{output}</pre>}
        </PopoverContent>
    </Popover>;
}
