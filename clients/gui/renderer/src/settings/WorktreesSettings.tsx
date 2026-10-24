import { useEffect, useRef, useState } from "react";
import { GitFork, Plus, Trash2 } from "lucide-react";
import { Button } from "../components/ui/button.js";
import { Input } from "../components/ui/input.js";
import { Textarea } from "../components/ui/textarea.js";
import { useI18n } from "../i18n/IntlProvider.js";
import type { Action, Data } from "../services.js";
import { SettingsGroupCard, SettingsRow, SettingsSection, SettingsSelect, SettingsSwitch } from "./SettingsPageParts.js";
import { SettingsSegmentedTabs } from "./SettingsSegmentedTabs.js";
import { useDraftBlocker, useGuardedNavigation } from "./UnsavedChanges.js";

type Script = { default: string; macos?: string; linux?: string };
type Environment = { id: string; name: string; setup: Script; cleanup: Script; actions: { id: string; name: string; script: Script }[] };
type Defaults = { worktreeRoot: string; branchPrefix: string; fetchBeforeCreate: boolean; autoCleanup: boolean; keepCount: number };
type Project = { id: string; root: string; name: string; environments: Environment[]; environmentRevision: number };
type Listing = { settings: Defaults; defaultRoot: string; revision: number; projects: Project[]; worktrees: Data[] };

export function WorktreesSettings({ action, projects, initialProjectId, initialTab = "general" }: {
    action: Action; projects: Data[]; initialProjectId?: string; initialTab?: "general" | "environments";
}) {
    const { t } = useI18n();
    const navigate = useGuardedNavigation();
    const routeId = projects.find(project => !project.projectless)?.id;
    const [tab, setTab] = useState(initialTab);
    const [projectId, setProjectId] = useState(initialProjectId ?? routeId ?? "");
    const [listing, setListing] = useState<Listing>();
    const [defaults, setDefaults] = useState<Defaults>();
    const [environment, setEnvironment] = useState<Environment>();
    const [environmentRevision, setEnvironmentRevision] = useState(0);
    const [platform, setPlatform] = useState<keyof Script>("default");
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const active = useRef(true);
    const locked = useRef(false);
    const request = useRef(action); request.current = action;
    const currentProject = listing?.projects.find(project => project.id === projectId);
    const originalEnvironment = currentProject?.environments.find(item => item.id === environment?.id);
    const dirty = !!defaults && !!listing && JSON.stringify(defaults) !== JSON.stringify(listing.settings)
        || !!environment && JSON.stringify(environment) !== JSON.stringify(originalEnvironment);
    const refresh = async () => {
        if (!routeId) return;
        const result = await request.current("workspace", { projectId: routeId, operation: "worktreeList" }) as Listing;
        if (active.current) { setListing(result); setDefaults(result.settings); }
        return result;
    };
    useEffect(() => {
        active.current = true;
        if (routeId) {
            setLoading(true);
            void refresh().catch(cause => { if (active.current) setError(cause.message); }).finally(() => { if (active.current) setLoading(false); });
        }
        return () => { active.current = false; };
    }, [routeId]);
    const save = async () => {
        if (!routeId || !listing || !defaults) return;
        if (environment && tab === "environments") {
            await action("workspace", { projectId, operation: "worktreeEnvironmentSave", environment, expectedRevision: environmentRevision });
            setEnvironment(undefined);
        } else await action("workspace", { projectId: routeId, operation: "worktreeSettings", ...defaults, expectedRevision: listing.revision });
        await refresh(); setNotice(t("worktree.saved"));
    };
    useDraftBlocker({ label: t("settings.worktrees.title"), dirty, busy,
        save, discard: () => { setDefaults(listing?.settings); setEnvironment(undefined); } });
    const run = async (work: () => Promise<unknown>) => {
        if (locked.current) return;
        locked.current = true; setBusy(true); setError(""); setNotice("");
        try { await work(); } catch (cause) { setError((cause as Error).message); }
        finally { locked.current = false; setBusy(false); }
    };
    const edit = (value?: Environment) => {
        setEnvironment(value ? structuredClone(value) : { id: crypto.randomUUID(), name: "", setup: { default: "" }, cleanup: { default: "" }, actions: [] });
        setEnvironmentRevision(currentProject?.environmentRevision ?? 0); setPlatform("default"); setError(""); setNotice("");
    };
    const scriptEditor = (label: string, script: Script, change: (value: Script) => void) => <label className="grid gap-2 text-ui-sm">
        {label}<Textarea aria-label={label} className="min-h-28 font-mono text-ui-caption" spellCheck={false} disabled={busy}
            value={script[platform] ?? ""} onChange={event => change({ ...script, [platform]: event.target.value })} />
    </label>;
    if (!routeId) return <p className="settings-section-desc">{t("worktree.noProjects")}</p>;
    const disabled = loading || busy || !listing;
    return <div className="settings-sections" data-testid="worktrees-settings">
        <SettingsSegmentedTabs ariaLabel={t("settings.worktrees.title")} value={tab} disabled={busy} activateOnFocus={false}
            items={[{ value: "general", label: t("worktree.general") }, { value: "environments", label: t("worktree.environments") }]}
            onValueChange={next => { void navigate(() => setTab(next)); }} />
        {error && <p role="alert" className="text-ui-sm text-destructive break-words">{error}</p>}
        {notice && <p role="status" className="text-ui-sm text-foreground-subtle">{notice}</p>}
        {loading && <p role="status" className="settings-section-desc">{t("worktree.loading")}</p>}
        {tab === "general" ? <>
            <SettingsSection description={t("worktree.futureOnly")}>
                <SettingsGroupCard>
                    <SettingsRow label={t("worktree.root")} control={<Input aria-label={t("worktree.root")} disabled={disabled} value={defaults?.worktreeRoot ?? ""} placeholder={listing?.defaultRoot}
                        onChange={event => setDefaults(previous => previous && ({ ...previous, worktreeRoot: event.target.value }))} />} />
                    <SettingsRow label={t("worktree.prefix")} control={<Input aria-label={t("worktree.prefix")} disabled={disabled} value={defaults?.branchPrefix ?? "areal"}
                        onChange={event => setDefaults(previous => previous && ({ ...previous, branchPrefix: event.target.value }))} />} />
                    <SettingsRow label={t("worktree.fetchBeforeCreate")} description={t("worktree.fetchDescription")} control={<SettingsSwitch aria-label={t("worktree.fetchBeforeCreate")} checked={defaults?.fetchBeforeCreate ?? false} disabled={disabled}
                        onCheckedChange={fetchBeforeCreate => setDefaults(previous => previous && ({ ...previous, fetchBeforeCreate }))} />} />
                    <SettingsRow label={t("worktree.autoCleanup")} description={t("worktree.autoCleanupDescription")} control={<SettingsSwitch aria-label={t("worktree.autoCleanup")} checked={defaults?.autoCleanup ?? false} disabled={disabled}
                        onCheckedChange={autoCleanup => setDefaults(previous => previous && ({ ...previous, autoCleanup }))} />} />
                    <SettingsRow label={t("worktree.keepCount")} control={<Input aria-label={t("worktree.keepCount")} type="number" min={1} max={1000} className="w-24" disabled={disabled} value={defaults?.keepCount ?? 10}
                        onChange={event => setDefaults(previous => previous && ({ ...previous, keepCount: Number(event.target.value) }))} />} />
                </SettingsGroupCard>
                <div className="mt-3 flex justify-end"><Button disabled={disabled || !dirty || !defaults?.branchPrefix.trim() || !Number.isInteger(defaults.keepCount) || defaults.keepCount < 1 || defaults.keepCount > 1000} onClick={() => void run(save)}>{t("worktree.save")}</Button></div>
            </SettingsSection>
            <SettingsSection title={t("worktree.managed")}>
                {listing?.projects.map(project => {
                    const worktrees = listing.worktrees.filter(item => item.projectId === project.id && !item.deleted);
                    if (!worktrees.length) return null;
                    return <SettingsSection key={project.id} title={project.name || project.root.split("/").pop()} description={project.root}>
                        <SettingsGroupCard>{worktrees.map(item => <SettingsRow key={item.requestId} label={<span className="flex items-center gap-2"><GitFork className="size-3.5" />{item.branch || item.requestId}</span>}
                            description={item.directory} control={<Button variant="ghost" size="sm" disabled={disabled} aria-label={`${t("worktree.delete")} ${item.branch || item.requestId}`}
                                onClick={() => { if (window.confirm(t("worktree.deleteConfirm"))) void run(async () => { const result = await action("workspace", { projectId: project.id, operation: "worktreeDelete", requestId: crypto.randomUUID(), worktreeRequestId: item.requestId });
                                    await refresh();
                                    if (!result.deleted) throw new Error(result.deletion?.blockers?.join("\n") || result.deletion?.message || t("worktree.deleteBlocked")); }); }}><Trash2 className="size-3.5" />{t("worktree.delete")}</Button>} />)}</SettingsGroupCard>
                    </SettingsSection>;
                })}
                {listing && !listing.worktrees.some(item => !item.deleted) && <p className="settings-section-desc">{t("worktree.empty")}</p>}
            </SettingsSection>
        </> : <>
            <SettingsSection>
                <SettingsGroupCard><SettingsRow label={t("worktree.project")} control={<SettingsSelect aria-label={t("worktree.project")} disabled={disabled} value={projectId}
                    onValueChange={id => { void navigate(() => { setProjectId(id); setEnvironment(undefined); }); }}>
                    {(listing?.projects ?? []).map(project => <option key={project.id} value={project.id}>{project.name || project.root.split("/").pop()}</option>)}
                </SettingsSelect>} /></SettingsGroupCard>
            </SettingsSection>
            <SettingsSection title={t("worktree.environments")} action={<Button size="sm" variant="secondary" disabled={disabled || !currentProject || !!environment} onClick={() => edit()}><Plus className="size-3.5" />{t("worktree.addEnvironment")}</Button>}>
                <SettingsGroupCard>{currentProject?.environments.map(item => <SettingsRow key={item.id} label={item.name} control={<Button variant="ghost" size="sm" disabled={disabled || !!environment} onClick={() => edit(item)}>{t("worktree.configureEnvironments")}</Button>} />)}</SettingsGroupCard>
            </SettingsSection>
            {environment && <SettingsSection title={environment.name || t("worktree.newEnvironment")}>
                <div className="grid gap-4">
                    <label className="grid gap-2 text-ui-sm">{t("worktree.environmentName")}<Input aria-label={t("worktree.environmentName")} disabled={busy} value={environment.name} onChange={event => setEnvironment({ ...environment, name: event.target.value })} /></label>
                    <SettingsSegmentedTabs ariaLabel={t("worktree.platform")} value={platform} disabled={busy} items={[{ value: "default", label: t("worktree.platformDefault") }, { value: "macos", label: t("worktree.platformMacos") }, { value: "linux", label: t("worktree.platformLinux") }]} onValueChange={setPlatform} />
                    <p className="settings-section-desc">{t("worktree.overrideHint")}</p>
                    <div className="grid gap-2">{scriptEditor(t("worktree.setupScript"), environment.setup, setup => setEnvironment({ ...environment, setup }))}<p className="settings-section-desc">{t("worktree.setupDescription")}</p></div>
                    <div className="grid gap-2">{scriptEditor(t("worktree.cleanupScript"), environment.cleanup, cleanup => setEnvironment({ ...environment, cleanup }))}<p className="settings-section-desc">{t("worktree.cleanupDescription")}</p></div>
                    <SettingsSection title={t("worktree.actions")} action={<Button variant="ghost" size="sm" disabled={busy || environment.actions.length >= 50} onClick={() => setEnvironment({ ...environment, actions: [...environment.actions, { id: crypto.randomUUID(), name: "", script: { default: "" } }] })}><Plus className="size-3.5" />{t("worktree.addAction")}</Button>}>
                        <div className="grid gap-4">{environment.actions.map((item, index) => <div key={item.id} className="grid gap-3 rounded-lg border border-border p-3">
                            <div className="flex items-center gap-2"><Input aria-label={t("worktree.actionName")} placeholder={t("worktree.actionName")} value={item.name} disabled={busy} onChange={event => setEnvironment({ ...environment, actions: environment.actions.map((action, at) => at === index ? { ...action, name: event.target.value } : action) })} /><Button variant="ghost" size="icon" aria-label={t("worktree.removeAction")} disabled={busy} onClick={() => setEnvironment({ ...environment, actions: environment.actions.filter(action => action.id !== item.id) })}><Trash2 className="size-3.5" /></Button></div>
                            {scriptEditor(t("worktree.actionScript"), item.script, script => setEnvironment({ ...environment, actions: environment.actions.map((action, at) => at === index ? { ...action, script } : action) }))}
                        </div>)}</div>
                    </SettingsSection>
                    <div className="flex justify-end gap-2">
                        {originalEnvironment && <Button variant="destructive" disabled={disabled} onClick={() => { if (window.confirm(t("worktree.deleteEnvironmentConfirm"))) void run(async () => { await action("workspace", { projectId, operation: "worktreeEnvironmentDelete", environmentId: environment.id, expectedRevision: environmentRevision }); setEnvironment(undefined); await refresh(); }); }}>{t("worktree.deleteEnvironment")}</Button>}
                        <Button variant="ghost" disabled={busy} onClick={() => { void navigate(() => setEnvironment(undefined)); }}>{t("worktree.cancel")}</Button>
                        <Button disabled={disabled || !environment.name.trim() || environment.actions.some(item => !item.name.trim())} onClick={() => void run(save)}>{t("worktree.save")}</Button>
                    </div>
                </div>
            </SettingsSection>}
        </>}
    </div>;
}
