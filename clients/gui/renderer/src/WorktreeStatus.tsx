import { GitBranch, GitFork } from "lucide-react";
import { useI18n } from "./i18n/IntlProvider.js";
import type { Data } from "./services.js";

export function WorktreeStatus({ events = [], current }: { events?: Data[]; current?: Data }) {
    const { t } = useI18n();
    if (!events.length && !current) return null;
    const facts = events.length ? events : [current!];
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
                    const record = event.record ?? current ?? event;
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
                                    {t(
                                        ready
                                            ? "worktree.ready"
                                            : state === "created"
                                              ? "worktree.created"
                                              : state === "binding"
                                                ? "worktree.binding"
                                                : failed
                                                  ? "worktree.failed"
                                                  : state === "unknown"
                                                    ? "worktree.unknown"
                                                    : "worktree.creating",
                                    )}
                                </span>
                            </div>
                            {event.message && <p className="mt-1 break-words">{event.message}</p>}
                            {(directory || branch || ready) && (
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
        </section>
    );
}
