import { useEffect, useRef, useState } from "react";
import { GitBranch, GitFork } from "lucide-react";
import { Button } from "./components/ui/button.js";
import { Input } from "./components/ui/input.js";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "./components/ui/dialog.js";
import { SettingsSelect } from "./settings/SettingsPageParts.js";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "./components/ui/select.js";
import { SettingsDisclosure } from "./settings/SettingsDisclosure.js";
import { useI18n } from "./i18n/IntlProvider.js";
import type { Action, Data } from "./services.js";

export type WorktreeSelection = {
    sourceRoot: string;
    ref: string;
    worktreeRoot: string;
    branch: string;
    branchPrefix: string;
};
type Options = {
    worktrees: { root: string; branch?: string; head?: string }[];
    branches: string[];
    settings: { worktreeRoot: string; branchPrefix: string };
};

function WorktreeChoice({
    label,
    value,
    items,
    disabled,
    onChange,
}: {
    label: string;
    value: string;
    items: { value: string; label: string }[];
    disabled: boolean;
    onChange: (value: string) => void;
}) {
    return (
        <Select
            value={value}
            items={items}
            disabled={disabled}
            onValueChange={(next) => {
                if (next !== null) onChange(next);
            }}
        >
            <SelectTrigger
                aria-label={label}
                variant="secondary"
                size="sm"
                className="w-full max-w-full"
            >
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                        {item.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

export function worktreeSelectionKey(projectId: string) {
    return `areal-gui:worktree-selection:${projectId}`;
}
export function readWorktreeSelection(projectId: string): WorktreeSelection | undefined {
    try {
        const value: unknown = JSON.parse(
            localStorage.getItem(worktreeSelectionKey(projectId)) ?? "null",
        );
        if (
            value &&
            typeof value === "object" &&
            ["sourceRoot", "ref", "worktreeRoot", "branch", "branchPrefix"].every(
                (key) => typeof (value as Record<string, unknown>)[key] === "string",
            )
        )
            return value as WorktreeSelection;
    } catch {
        /* 无效本地草稿不影响新会话。 */
    }
    return undefined;
}

export function WorktreeStarter({
    project,
    action,
    value,
    onChange,
    disabled = false,
}: {
    project: Data;
    action: Action;
    value?: WorktreeSelection;
    onChange: (value: WorktreeSelection | undefined) => void;
    disabled?: boolean;
}) {
    const { t } = useI18n();
    const sourceRoot = project.logicalRoot ?? project.root;
    const empty = (): WorktreeSelection => ({
        sourceRoot,
        ref: "HEAD",
        worktreeRoot: "",
        branch: "",
        branchPrefix: "areal",
    });
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<"automatic" | "worktree">(value ? "worktree" : "automatic");
    const [draft, setDraft] = useState<WorktreeSelection>(value ?? empty);
    const [options, setOptions] = useState<Options>();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [saved, setSaved] = useState(false);
    const request = useRef(action);
    request.current = action;
    useEffect(() => {
        if (!open) return;
        let active = true;
        setLoading(true);
        setError("");
        void request
            .current("workspace", {
                projectId: project.id,
                operation: "worktreeOptions",
                sourceRoot: draft.sourceRoot,
            })
            .then(
                (result: Options) => {
                    if (!active) return;
                    setOptions(result);
                    if (!value)
                        setDraft((previous) => ({
                            ...previous,
                            worktreeRoot:
                                previous.worktreeRoot || result.settings.worktreeRoot || "",
                            branchPrefix:
                                previous.branchPrefix === "areal"
                                    ? result.settings.branchPrefix || "areal"
                                    : previous.branchPrefix,
                        }));
                },
                (cause) => {
                    if (active) setError((cause as Error).message);
                },
            )
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [open, project.id, draft.sourceRoot]);
    const busy = disabled || loading || saving;
    const saveDefaults = async () => {
        if (busy) return;
        setSaving(true);
        setError("");
        setSaved(false);
        try {
            await action("workspace", {
                projectId: project.id,
                operation: "worktreeSettings",
                worktreeRoot: draft.worktreeRoot,
                branchPrefix: draft.branchPrefix,
            });
            setSaved(true);
        } catch (cause) {
            setError((cause as Error).message);
        } finally {
            setSaving(false);
        }
    };
    const sources = options?.worktrees ?? [];
    const branches = [...new Set(["HEAD", ...(options?.branches ?? [])])];
    return (
        <>
            <Button
                variant="ghost"
                size="sm"
                disabled={disabled || !project.state?.connected}
                onClick={() => {
                    setDraft(value ?? empty());
                    setMode(value ? "worktree" : "automatic");
                    setSaved(false);
                    setOpen(true);
                }}
                aria-label={t("worktree.configure")}
            >
                <GitFork className="size-3.5" aria-hidden="true" />
                {t(value ? "worktree.new" : "worktree.automatic")}
            </Button>
            <Dialog
                open={open}
                onOpenChange={(next) => {
                    if (!saving) setOpen(next);
                }}
            >
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{t("worktree.configure")}</DialogTitle>
                        <DialogDescription>{t("worktree.createOnSend")}</DialogDescription>
                    </DialogHeader>
                    <div className="grid min-w-0 gap-3">
                        <SettingsSelect
                            aria-label={t("worktree.mode")}
                            value={mode}
                            disabled={busy}
                            onValueChange={(next) => setMode(next as typeof mode)}
                        >
                            <option value="automatic">{t("worktree.automatic")}</option>
                            <option value="worktree">{t("worktree.new")}</option>
                        </SettingsSelect>
                        {mode === "automatic" ? (
                            <p className="text-ui-caption text-foreground-subtle">
                                {t("worktree.automaticDescription")}
                            </p>
                        ) : (
                            <>
                                <label className="grid min-w-0 gap-2 text-ui-caption">
                                    {t("worktree.source")}
                                    <WorktreeChoice
                                        label={t("worktree.source")}
                                        value={draft.sourceRoot}
                                        disabled={busy || !sources.length}
                                        items={sources.map((source) => ({
                                            value: source.root,
                                            label: [source.branch, source.root]
                                                .filter(Boolean)
                                                .join(" · "),
                                        }))}
                                        onChange={(next) =>
                                            setDraft((previous) => ({
                                                ...previous,
                                                sourceRoot: next,
                                                ref: "HEAD",
                                            }))
                                        }
                                    />
                                </label>
                                <label className="grid min-w-0 gap-2 text-ui-caption">
                                    {t("worktree.startBranch")}
                                    <WorktreeChoice
                                        label={t("worktree.startBranch")}
                                        value={draft.ref}
                                        disabled={busy}
                                        items={branches.map((branch) => ({
                                            value: branch,
                                            label: branch,
                                        }))}
                                        onChange={(next) =>
                                            setDraft((previous) => ({ ...previous, ref: next }))
                                        }
                                    />
                                </label>
                                <label className="grid gap-2 text-ui-caption">
                                    {t("worktree.branchName")}
                                    <Input
                                        aria-label={t("worktree.branchName")}
                                        value={draft.branch}
                                        disabled={busy}
                                        placeholder={t("worktree.generatedBranch")}
                                        onChange={(event) =>
                                            setDraft((previous) => ({
                                                ...previous,
                                                branch: event.target.value,
                                            }))
                                        }
                                    />
                                </label>
                                <p className="text-ui-caption text-foreground-subtle">
                                    {t("worktree.commitOnly")}
                                </p>
                            </>
                        )}
                        <SettingsDisclosure title={t("worktree.defaults")}>
                            <div className="grid gap-3">
                                <label className="grid gap-2 text-ui-caption">
                                    {t("worktree.root")}
                                    <Input
                                        aria-label={t("worktree.root")}
                                        value={draft.worktreeRoot}
                                        disabled={busy}
                                        placeholder={t("worktree.defaultRoot")}
                                        onChange={(event) => {
                                            setSaved(false);
                                            setDraft((previous) => ({
                                                ...previous,
                                                worktreeRoot: event.target.value,
                                            }));
                                        }}
                                    />
                                </label>
                                <label className="grid gap-2 text-ui-caption">
                                    {t("worktree.prefix")}
                                    <Input
                                        aria-label={t("worktree.prefix")}
                                        value={draft.branchPrefix}
                                        disabled={busy}
                                        placeholder={t("worktree.defaultPrefix")}
                                        onChange={(event) => {
                                            setSaved(false);
                                            setDraft((previous) => ({
                                                ...previous,
                                                branchPrefix: event.target.value,
                                            }));
                                        }}
                                    />
                                </label>
                                <p className="text-ui-caption text-foreground-subtle">
                                    {t("worktree.futureOnly")}
                                </p>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled={busy}
                                    onClick={() => void saveDefaults()}
                                >
                                    {t(saving ? "worktree.saving" : "worktree.saveDefaults")}
                                </Button>
                                {saved && (
                                    <p
                                        role="status"
                                        className="text-ui-caption text-foreground-subtle"
                                    >
                                        {t("worktree.defaultsSaved")}
                                    </p>
                                )}
                            </div>
                        </SettingsDisclosure>
                        {loading && (
                            <p role="status" className="text-ui-caption text-foreground-subtle">
                                {t("worktree.loading")}
                            </p>
                        )}
                        {error && (
                            <p
                                role="alert"
                                className="break-words text-ui-caption text-destructive"
                            >
                                {error}
                            </p>
                        )}
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" disabled={saving} onClick={() => setOpen(false)}>
                            {t("worktree.cancel")}
                        </Button>
                        <Button
                            disabled={
                                busy || (mode === "worktree" && (!options || !!error || !draft.ref))
                            }
                            onClick={() => {
                                onChange(mode === "worktree" ? { ...draft } : undefined);
                                setOpen(false);
                            }}
                        >
                            <GitBranch className="size-3.5" aria-hidden="true" />
                            {t("worktree.useSelection")}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
