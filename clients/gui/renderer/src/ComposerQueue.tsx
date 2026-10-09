// ZCode ConversationQueuePanel: pending rows sit behind the composer; empty queues stay hidden.
import { useState } from "react";
import { ChevronRight, Play, Pause, X, Ellipsis } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "./components/ui/dropdown-menu.js";
import { queueEditRefusal, queueText, type QueueDraft } from "./Queue.js";
import type { Action, Data } from "./services.js";
export function ComposerQueue({
  project,
  thread,
  action,
  onOpen,
  disabled,
}: {
  project: Data;
  thread: Data;
  action: Action;
  onOpen: () => void;
  disabled: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<QueueDraft | null>(null);
  const [error, setError] = useState("");
  const queue = project.state?.queues?.[thread.id];
  const items = (queue?.items ?? []).filter((i: Data) => i.status === "pending");
  const retained = editing && !items.some((item: Data) => item.id === editing.id)
    ? (queue?.items ?? []).find((item: Data) => item.id === editing.id)
    : null;
  if (!queue || (!items.length && !editing)) return null;
  const reason = queue ? queueEditRefusal(queue, editing, error) : error;
  const edit = async (operation: string, extra: Data = {}, revision = queue?.revision) => {
    if (busy || revision === undefined) return;
    setBusy(true);
    setError("");
    try {
      await action("queueEdit", {
        projectId: project.id,
        threadId: thread.id,
        expectedRevision: revision,
        operation,
        ...extra,
      });
      if (operation === "update" || operation === "remove") setEditing(null);
    } catch (cause) {
      const failure = cause as Error & { submissionUnknown?: boolean };
      setError(failure.submissionUnknown
        ? "队列操作结果尚未确认，不会自动重发。请核对原队列。"
        : failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="composer-queue" aria-label="待发送消息">
      <div className="composer-queue-header">
        <button className="queue-summary" onClick={onOpen}>
          {queue.paused ? "队列已暂停" : "待发送"} · {items.length}
          <ChevronRight size={14} />
        </button>
        <button
          disabled={busy || disabled}
          onClick={() => void edit(queue.paused ? "resume" : "pause")}
        >
          {queue.paused ? <Play size={13} /> : <Pause size={13} />}{" "}
          {queue.paused ? "继续队列" : "暂停队列"}
        </button>
      </div>
      {reason && <p role="alert">{reason}</p>}
      {retained && editing && <div className="composer-queue-edit">
        <p>当前队列内容：<span>{queueText(retained)}</span></p>
        <textarea autoFocus aria-label="编辑排队消息" value={editing.text} disabled={busy || disabled}
          onChange={event => setEditing({ ...editing, text: event.target.value })} />
        <div><button disabled={busy} onClick={() => setEditing(null)}>取消</button></div>
      </div>}
      {items.slice(0, 3).map((item: Data) => (
        editing && editing.id === item.id ? <div className="composer-queue-edit" key={item.id}>
          {queueText(item) !== editing.text && <p>当前队列内容：<span>{queueText(item)}</span></p>}
          <textarea autoFocus aria-label="编辑排队消息" value={editing.text} disabled={busy || disabled}
            onChange={event => setEditing({ ...editing, text: event.target.value })} />
          <div><button disabled={busy} onClick={() => setEditing(null)}>取消</button>
            {queue.revision !== editing.revision && <button disabled={busy || disabled} onClick={() => setEditing({ ...editing, revision: queue.revision })}>在最新版本上提交</button>}
            <button aria-label="保存排队消息" disabled={busy || disabled || !editing.text.trim()} onClick={() => void edit("update", { queueItemId: item.id, text: editing.text }, editing.revision)}>保存</button></div>
        </div> : <div className="composer-queue-row" key={item.id}>
          <button onClick={onOpen} title={queueText(item)}>
            {queueText(item)}
          </button>
          <button
            aria-label={`移除排队消息 ${queueText(item)}`}
            disabled={busy || disabled}
            onClick={() => void edit("remove", { queueItemId: item.id })}
          >
            <X size={13} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<button aria-label="排队消息操作" disabled={busy || disabled}><Ellipsis size={14} /></button>} />
            <DropdownMenuContent align="end" side="top">
              <DropdownMenuItem disabled={!item.input?.every((part: Data) => part.type === "text")} onClick={() => { setError(""); setEditing({ id: item.id, text: queueText(item), revision: queue.revision }); }}>编辑消息</DropdownMenuItem>
              <DropdownMenuItem onClick={onOpen}>查看完整队列</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void edit(queue.paused ? "resume" : "pause")}>{queue.paused ? "继续队列" : "暂停队列"}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
      {items.length > 3 && <button onClick={onOpen}>查看全部 {items.length} 条消息</button>}
    </section>
  );
}
