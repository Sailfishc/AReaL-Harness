import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./components/ui/button.js";
import type { Action, Data } from "./services.js";
import { useI18n } from "./i18n/IntlProvider.js";

/** 阅读视图只持有显示缓存；关闭或切换不发送停止、继续或任何任务写入。 */
export function useConversationHistory(projectId: string, thread: Data, action: Action) {
  const { t } = useI18n();
  const [viewId] = useState(() => crypto.randomUUID());
  const owner = `${projectId}:${thread.id}`;
  const generation = `${owner}:${thread.displayHistory?.viewGeneration ?? ""}`;
  const current = useRef<string | undefined>(generation);
  current.current = generation;
  const supported = thread.displayHistory?.supported === true;
  const [failure, setFailure] = useState<{
    generation: string;
    itemId?: string;
    message: string;
  }>();
  useEffect(() => {
    if (!supported) return;
    const request = { projectId, threadId: thread.id, viewId };

    return () => {
      current.current = undefined;
      void action("history", { ...request, operation: "release" }).catch(() => {});
    };
  }, [action, owner, projectId, supported, thread.id, viewId]);
  // 重新观察会换新的历史窗口（viewGeneration 变化），视图登记随窗口沿用。这里只重新登记，
  // 不先释放：释放会清空已加载页并中断补全，随后再补回，顶部内容会反复消失、出现。
  useEffect(() => {
    if (!supported) return;
    current.current = generation;
    let active = true;
    void action("history", { projectId, threadId: thread.id, viewId, operation: "acquire" }).then(
      () => {
        if (active && current.current === generation) setFailure(undefined);
      },
      () => {
        if (active && current.current === generation)
          setFailure({ generation, message: t("chat.history.loadFailed") });
      },
    );
    return () => {
      active = false;
    };
  }, [action, generation, projectId, supported, thread.id, viewId, t]);
  const load = useCallback(
    async (itemId?: string, pageId?: string) => {
      setFailure(undefined);
      try {
        await action("history", {
          projectId,
          threadId: thread.id,
          viewId,
          ...(itemId
            ? { operation: "loadItem", itemId }
            : { operation: "loadOlder", ...(pageId ? { pageId } : {}) }),
        });
      } catch {
        if (current.current === generation)
          setFailure({
            generation,
            itemId,
            message: t("chat.history.loadFailed"),
          });
      }
    },
    [action, generation, projectId, thread.id, viewId, t],
  );
  return { load, failure: failure?.generation === generation ? failure : undefined };
}

export function DeferredHistoryItem({
  item,
  loading,
  error,
  onLoad,
}: {
  item: Data;
  loading?: { bytes: number; totalBytes: number };
  error?: string;
  onLoad: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="notice" data-history-item-id={item.id}>
      <p role="status">
        {loading
          ? t("chat.history.loadingFull", {
              progress: Math.floor((loading.bytes / loading.totalBytes) * 100),
            })
          : t("chat.history.deferred", {
              kind: item.originalType,
              size: Math.ceil(item.totalBytes / 1048576),
            })}
      </p>
      {error && <p role="alert">{error}</p>}
      <Button type="button" variant="ghost" size="sm" disabled={!!loading} onClick={onLoad}>
        {t("chat.history.loadFull")}
      </Button>
    </div>
  );
}
