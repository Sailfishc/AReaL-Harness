import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeft, Check, ChevronRight, GitBranch, GitFork, Settings } from "lucide-react";
import { Button } from "./components/ui/button.js";
import { SettingsSearchInput } from "./settings/SettingsSearchInput.js";
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover.js";
import { SettingsSwitch } from "./settings/SettingsPageParts.js";
import { useI18n } from "./i18n/IntlProvider.js";
import type { Action, Data } from "./services.js";
import "./Worktree.css";

export type WorktreeSelection = {
    sourceRoot: string;
    ref: string;
    worktreeRoot: string;
    branch: string;
    branchPrefix: string;
    mode?: "source" | "worktree";
    environmentId?: string;
    environmentRevision?: number;
};
type Options = {
    worktrees?: { root: string; branch?: string }[];
    branches: string[];
    settings: { worktreeRoot: string; branchPrefix: string };
    environments?: { id: string; name: string }[];
    environmentRevision?: number;
};

export function worktreeSelectionKey(projectId: string) {
    return `areal-gui:worktree-selection:${projectId}`;
}
export function readWorktreeSelection(projectId: string): WorktreeSelection | undefined {
    try {
        const value: unknown = JSON.parse(localStorage.getItem(worktreeSelectionKey(projectId)) ?? "null");
        if (value && typeof value === "object" && ["sourceRoot", "ref", "worktreeRoot", "branch", "branchPrefix"].every(
            key => typeof (value as Record<string, unknown>)[key] === "string")) return value as WorktreeSelection;
    } catch {}
    return undefined;
}

type PickerPage = "main" | "branch" | "environment";

function moveOptionFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)'));
    if (!items.length) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
        : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
    items[next]?.focus();
}

export function WorktreeStarter({ project, action, value, onChange, onConfigureEnvironments, disabled = false }: {
    project: Data;
    action: Action;
    value?: WorktreeSelection;
    onChange: (value: WorktreeSelection | undefined) => void;
    onConfigureEnvironments?: () => void;
    disabled?: boolean;
}) {
    const { t } = useI18n();
    const sourceRoot = project.logicalRoot ?? project.root;
    const [open, setOpen] = useState(false);
    const [page, setPage] = useState<PickerPage>("main");
    const [query, setQuery] = useState("");
    const [response, setResponse] = useState<{ owner: string; options: Options }>();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [retry, setRetry] = useState(0);
    const search = useRef<HTMLInputElement>(null);
    const branchTrigger = useRef<HTMLButtonElement>(null);
    const environmentTrigger = useRef<HTMLButtonElement>(null);
    const request = useRef(action); request.current = action;
    const owner = JSON.stringify([project.id, sourceRoot]);
    const options = response?.owner === owner ? response.options : undefined;
    useEffect(() => {
        if (!open) return;
        let active = true;
        setLoading(true); setError("");
        void request.current("workspace", { projectId: project.id, operation: "worktreeOptions", sourceRoot }).then(
            (options: Options) => { if (active) setResponse({ owner, options }); },
            cause => { if (active) setError((cause as Error).message); },
        ).finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [open, owner, retry]);
    useEffect(() => { if (page === "branch") search.current?.focus(); }, [page]);
    const selected: WorktreeSelection = value ?? {
        sourceRoot, ref: "HEAD", worktreeRoot: options?.settings.worktreeRoot ?? "",
        branch: "", branchPrefix: options?.settings.branchPrefix ?? "areal", mode: "source",
    };
    const enabled = !!value && value.mode !== "source";
    const change = (patch: Partial<WorktreeSelection>) => {
        const next = { ...selected, ...patch };
        if (next.environmentId === undefined) delete next.environmentId;
        if (next.environmentRevision === undefined) delete next.environmentRevision;
        onChange(next);
    };
    const busy = disabled || loading || !options || !!error;
    const allBranches = [...new Set(["HEAD", ...(options?.branches ?? [])])];
    const branches = allBranches.filter(branch => branch.toLowerCase().includes(query.toLowerCase()));
    const environments = options?.environments ?? [];
    const selectedEnvironment = environments.find(item => item.id === selected.environmentId);
    const staleEnvironment = !!selected.environmentId && !selectedEnvironment;
    const sourceBranch = options?.worktrees?.find(item => sourceRoot === item.root || sourceRoot.startsWith(item.root + "/"))?.branch;
    const back = () => {
        const previous = page;
        setPage("main"); setQuery("");
        requestAnimationFrame(() => (previous === "branch" ? branchTrigger : environmentTrigger).current?.focus());
    };
    return <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) { setPage("main"); setQuery(""); } }}>
        <PopoverTrigger render={<Button variant="ghost" size="icon" disabled={disabled || !project.state?.connected}
            aria-label={t("worktree.configure")} title={t("worktree.configure")} className="worktree-picker-trigger" />}>
            <Settings className="size-4" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent side="top" align="end" variant="menu" className="worktree-picker" aria-label={t("worktree.configure")}
            onKeyDownCapture={event => { if (event.key === "Escape" && page !== "main" && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); back(); } }}>
            {page === "main" ? <>
                <p className="worktree-picker-heading">{t("worktree.configureLocal")}</p>
                <div className="worktree-picker-row">
                    <GitFork aria-hidden="true" /><span>{t("worktree.new")}</span>
                    <SettingsSwitch className="worktree-picker-toggle" aria-label={t("worktree.workInNew")} checked={enabled} disabled={busy}
                        onCheckedChange={checked => change({ mode: checked ? "worktree" : "source", ...(checked ? {} : { environmentId: undefined, environmentRevision: undefined }) })} />
                </div>
                <Button ref={branchTrigger} variant="ghost" className="worktree-picker-row" disabled={busy} aria-label={t("worktree.startBranch")}
                    onClick={() => setPage("branch")}>
                    <GitBranch aria-hidden="true" /><span>{t("worktree.branchLabel")}</span>
                    <span className="worktree-picker-value" title={selected.ref === "HEAD" ? sourceBranch : selected.ref}>{selected.ref === "HEAD" ? sourceBranch ?? selected.ref : selected.ref}</span><ChevronRight aria-hidden="true" />
                </Button>
                <Button ref={environmentTrigger} variant="ghost" className="worktree-picker-row" disabled={busy || !enabled} aria-label={t("worktree.environment")}
                    onClick={() => setPage("environment")}>
                    <Settings aria-hidden="true" /><span>{t("worktree.environments")}</span>
                    <span className="worktree-picker-value">{staleEnvironment ? t("worktree.selectedUnavailable") : selectedEnvironment?.name ?? t("worktree.noEnvironment")}</span><ChevronRight aria-hidden="true" />
                </Button>
                {staleEnvironment && enabled && <p role="alert" className="worktree-picker-feedback">{t("worktree.selectedUnavailable")}</p>}
            </> : <>
                <Button variant="ghost" className="worktree-picker-back" aria-label={t("worktree.back")} onClick={back}>
                    <ArrowLeft aria-hidden="true" /><span>{t(page === "branch" ? "worktree.branchLabel" : "worktree.environments")}</span>
                </Button>
                {page === "branch" ? <>
                    <SettingsSearchInput ref={search} aria-label={t("worktree.searchBranches")} placeholder={t("worktree.searchBranches")} value={query}
                        onChange={event => setQuery(event.target.value)} onClear={() => { setQuery(""); search.current?.focus(); }} clearLabel={t("worktree.clearSearch")} containerClassName="worktree-branch-search" />
                    <p className="worktree-picker-note">{t("worktree.commitOnly")}</p>
                    <div className="worktree-picker-list" role="listbox" aria-label={t("worktree.startBranch")} onKeyDown={moveOptionFocus}>
                        {branches.length > 0 && <p className="worktree-picker-group">{t("worktree.branches")}</p>}
                        {branches.map((branch, index) => <Button key={branch} variant="ghost" role="option" aria-selected={selected.ref === branch} disabled={busy}
                            tabIndex={selected.ref === branch || !branches.includes(selected.ref) && index === 0 ? 0 : -1}
                            className="worktree-picker-option" title={branch} onClick={() => { change({ ref: branch }); back(); }}>
                            <GitBranch aria-hidden="true" /><span>{branch === "HEAD" ? sourceBranch ? `${branch} · ${sourceBranch}` : branch : branch}</span>{selected.ref === branch && <Check aria-hidden="true" />}
                        </Button>)}
                        {!branches.length && <p className="worktree-picker-feedback">{t("worktree.noBranches")}</p>}
                    </div>
                </> : <>
                    <div className="worktree-picker-list" role="listbox" aria-label={t("worktree.environment")} onKeyDown={moveOptionFocus}>
                        {[{ id: "none", name: t("worktree.noEnvironment") }, ...environments].map((item, index) => {
                            const checked = item.id === (selected.environmentId ?? "none");
                            return <Button key={item.id} variant="ghost" role="option" aria-selected={checked} disabled={busy} tabIndex={checked || staleEnvironment && index === 0 ? 0 : -1}
                                className="worktree-picker-option" title={item.name} onClick={() => { change({ environmentId: item.id === "none" ? undefined : item.id, environmentRevision: item.id === "none" ? undefined : options?.environmentRevision }); back(); }}>
                                <Settings aria-hidden="true" /><span>{item.name}</span>{checked && <Check aria-hidden="true" />}
                            </Button>;
                        })}
                    </div>
                    {!environments.length && <p className="worktree-picker-note">{t("worktree.noEnvironment")}</p>}
                    {onConfigureEnvironments && <Button variant="ghost" className="worktree-picker-configure" onClick={() => { setOpen(false); setPage("main"); onConfigureEnvironments(); }}><Settings aria-hidden="true" />{t("worktree.configureEnvironments")}</Button>}
                </>}
            </>}
            {loading && <p role="status" className="worktree-picker-feedback">{t("worktree.loading")}</p>}
            {error && <div className="worktree-picker-feedback"><p role="alert">{error}</p><Button variant="ghost" size="sm" onClick={() => setRetry(value => value + 1)}>{t("worktree.retryOptions")}</Button></div>}
        </PopoverContent>
    </Popover>;
}
