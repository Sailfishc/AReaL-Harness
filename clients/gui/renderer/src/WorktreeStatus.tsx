import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "./components/ui/button.js";
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover.js";
import { Check, ChevronDown, ChevronUp, CircleDashed, GitBranch, GitFork } from "lucide-react";
import { useI18n } from "./i18n/IntlProvider.js";
import type { Action, Data } from "./services.js";
import "./Worktree.css";

const stateMessages = {
    ready: "worktree.ready", created: "worktree.created", binding: "worktree.binding",
    settingUp: "worktree.settingUp", cancelling: "worktree.cancelling", cancelled: "worktree.cancelled",
    failed: "worktree.failed", unknown: "worktree.unknown", creating: "worktree.creating",
} as const;

export function WorktreeStatus({ events = [], current, controls }: { events?: Data[]; current?: Data; controls?: ReactNode }) {
    const { t } = useI18n();
    const [details, setDetails] = useState(false);
    const detailsId = useId();
    if (!events.length && !current) return null;
    const latest = { ...events.at(-1), ...current };
    const state = latest.state ?? latest.status ?? "creating";
    const record = latest.record ?? latest;
    const setup = latest.setup ?? record.setup;
    const directory = latest.directory ?? record.directory;
    const branch = latest.branch ?? record.branch;
    const message = latest.message ?? setup?.message;
    const ready = state === "ready";
    const checkoutCreated = ready || ["created", "binding", "settingUp"].includes(state);
    const running = ["creating", "created", "binding", "settingUp", "cancelling"].includes(state);
    const phaseMessage = stateMessages[state as keyof typeof stateMessages] ?? "worktree.unknown";
    const stages = [...new Map([...events, latest].map(event => [event.state ?? event.status, event])).values()]
        .filter(event => stateMessages[(event.state ?? event.status) as keyof typeof stateMessages]);
    const hasDetails = !!(directory || branch || setup?.output || events.length || message);
    const panel = running || !!controls || details;
    return <section aria-label={t("worktree.events")} className="worktree-status" data-testid="worktree-status" data-worktree-state={state}>
        <div className="worktree-status-heading" role={state === "failed" ? "alert" : "status"}>
            <GitFork className="size-3.5" aria-hidden="true" />
            <p>{t(checkoutCreated ? "worktree.createdLabel" : phaseMessage)}</p>
        </div>
        {!running && message && <p className="worktree-picker-note">{message}</p>}
        {panel && <div className={running || controls ? "worktree-status-panel" : undefined}>
            {running && <ol className="worktree-status-stages">
                {(details ? stages : [latest]).map((event, index) => {
                    const eventState = event.state ?? event.status ?? "creating";
                    const currentStage = eventState === state;
                    return <li className="worktree-status-stage" key={eventState ?? index} data-current={currentStage}>
                        {currentStage ? <CircleDashed className="size-3" aria-hidden="true" /> : <Check className="size-3" aria-hidden="true" />}
                        <span>{t(eventState === "creating" ? "worktree.preparingWorkspace" : stateMessages[eventState as keyof typeof stateMessages] ?? "worktree.creating")}</span>
                    </li>;
                })}
            </ol>}
            <div className="worktree-status-controls">
                {hasDetails && <Button variant="ghost" size="sm" className="worktree-status-disclosure" aria-expanded={details} aria-controls={detailsId}
                    onClick={() => setDetails(value => !value)}>{details ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}{t(details ? "worktree.hideDetails" : "worktree.showDetails")}</Button>}
                {controls && <div className="worktree-status-actions">{controls}</div>}
            </div>
            {details && <div id={detailsId} className="worktree-status-details">
                {branch && <p className="flex items-center gap-2"><GitBranch className="size-3.5 shrink-0" aria-hidden="true" /><span>{branch}</span></p>}
                {directory && <code>{directory}</code>}
                {running && message && <p>{message}</p>}
                {setup?.output && <pre aria-label={t("worktree.output")} className="worktree-status-log">{setup.output}</pre>}
                {ready && <p>{t(latest.automatic ? "worktree.automaticEvent" : "worktree.commitOnly")}</p>}
            </div>}
        </div>}
        {!panel && hasDetails && <Button variant="ghost" size="sm" className="worktree-status-disclosure" aria-expanded={false} aria-controls={detailsId}
            onClick={() => setDetails(true)}><ChevronDown aria-hidden="true" />{t("worktree.showDetails")}</Button>}
    </section>;
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
        <PopoverContent align="end" className="w-80 worktree-workspace-details">
            <p className="text-ui-sm font-medium">{record ? t(stateMessages[record.state as keyof typeof stateMessages] ?? "worktree.unknown") : worktree.branch}</p>
            <code className="break-all text-ui-caption text-foreground-subtle">{worktree.directory}</code>
            {(record?.environment?.actions ?? []).map((item: Data) => <Button variant="secondary" size="sm" key={item.id} disabled={busy || record?.state !== "ready"} onClick={() => void run(item.id)}>{item.name}</Button>)}
            {busy && <p role="status" className="text-ui-caption">{t("worktree.actionRunning")}</p>}
            {error && <p role="alert" className="text-ui-caption text-destructive break-words">{error}</p>}
            {output && <pre aria-label={t("worktree.output")} className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-ui-caption">{output}</pre>}
        </PopoverContent>
    </Popover>;
}
