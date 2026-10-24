import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, GitBranch, Settings } from "lucide-react";
import { Button } from "./components/ui/button.js";
import { Input } from "./components/ui/input.js";
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select.js";
import { SettingsSwitch } from "./settings/SettingsPageParts.js";
import { useI18n } from "./i18n/IntlProvider.js";
import type { Action, Data } from "./services.js";

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
    const [branchOpen, setBranchOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [options, setOptions] = useState<Options>();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const request = useRef(action);
    request.current = action;
    useEffect(() => {
        if (!open) return;
        let active = true;
        setLoading(true); setError("");
        void request.current("workspace", { projectId: project.id, operation: "worktreeOptions", sourceRoot }).then(
            (result: Options) => { if (active) setOptions(result); },
            cause => { if (active) setError((cause as Error).message); },
        ).finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [open, project.id, sourceRoot]);
    const selected: WorktreeSelection = value ?? {
        sourceRoot, ref: "HEAD", worktreeRoot: options?.settings.worktreeRoot ?? "",
        branch: "", branchPrefix: options?.settings.branchPrefix ?? "areal",
    };
    const enabled = !!value && value.mode !== "source";
    const change = (patch: Partial<WorktreeSelection>) => {
        const next = { ...selected, ...patch };
        if (next.environmentId === undefined) delete next.environmentId;
        if (next.environmentRevision === undefined) delete next.environmentRevision;
        onChange(next);
    };
    const busy = disabled || loading;
    const branches = [...new Set([selected.ref, "HEAD", ...(options?.branches ?? [])])].filter(branch => branch.toLowerCase().includes(query.toLowerCase()));
    const environments = options?.environments ?? [];
    return <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button variant="ghost" size="icon" disabled={disabled || !project.state?.connected}
            aria-label={t("worktree.configure")} title={t("worktree.configure")} className="size-7 shrink-0" />}>
            <Settings className="size-3.5" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 gap-3 p-3" aria-label={t("worktree.configure")}>
            <div className="flex items-center justify-between gap-3">
                <span className="text-ui-sm font-medium">{t("worktree.workInNew")}</span>
                <SettingsSwitch aria-label={t("worktree.workInNew")} checked={enabled} disabled={busy}
                    onCheckedChange={checked => change({ mode: checked ? "worktree" : "source", ...(checked ? {} : { environmentId: undefined, environmentRevision: undefined }) })} />
            </div>
            <p className="text-ui-caption text-foreground-subtle">{t("worktree.createOnSend")}</p>
            {loading && <p role="status" className="text-ui-caption text-foreground-subtle">{t("worktree.loading")}</p>}
            {error && <p role="alert" className="text-ui-caption text-destructive break-words">{error}</p>}
            {enabled && <>
                <div className="grid gap-1.5">
                    <span className="text-ui-caption text-foreground-subtle">{t("worktree.startBranch")}</span>
                    <Popover open={branchOpen} onOpenChange={next => { setBranchOpen(next); setQuery(""); }}>
                        <PopoverTrigger render={<Button variant="secondary" size="sm" disabled={busy} aria-label={t("worktree.startBranch")} className="w-full justify-between" />}>
                            <span className="flex min-w-0 items-center gap-2"><GitBranch className="size-3.5 shrink-0" /><span className="truncate">{selected.ref}</span></span><ChevronDown className="size-3.5" />
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-72">
                            <Input type="search" aria-label={t("worktree.searchBranches")} placeholder={t("worktree.searchBranches")} value={query} onChange={event => setQuery(event.target.value)} />
                            <div role="listbox" aria-label={t("worktree.startBranch")} className="grid max-h-56 overflow-auto">
                                {branches.map(branch => <Button variant="ghost" size="sm" type="button" role="option" aria-selected={selected.ref === branch} key={branch}
                                    className="w-full justify-between text-left"
                                    onClick={() => { change({ ref: branch }); setBranchOpen(false); }}>{branch}{selected.ref === branch && <Check className="size-3.5" />}</Button>)}
                                {!branches.length && <p className="p-2 text-ui-caption text-foreground-subtle">{t("worktree.noBranches")}</p>}
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>
                <div className="grid gap-1.5">
                    <span className="text-ui-caption text-foreground-subtle">{t("worktree.environment")}</span>
                    <Select value={selected.environmentId ?? "none"} disabled={busy} items={[{ value: "none", label: t("worktree.noEnvironment") }, ...environments.map(item => ({ value: item.id, label: item.name }))]}
                        onValueChange={id => { if (id) change({ environmentId: id === "none" ? undefined : id, environmentRevision: id === "none" ? undefined : options?.environmentRevision }); }}>
                        <SelectTrigger aria-label={t("worktree.environment")} variant="secondary" size="sm" className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>{[{ id: "none", name: t("worktree.noEnvironment") }, ...environments].map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
            </>}
            {onConfigureEnvironments && <Button variant="ghost" size="sm" className="justify-start" onClick={() => { setOpen(false); onConfigureEnvironments(); }}>{t("worktree.configureEnvironments")}</Button>}
        </PopoverContent>
    </Popover>;
}
