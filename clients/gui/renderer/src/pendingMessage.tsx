import { useSyncExternalStore } from "react";
import { useI18n } from "./i18n/IntlProvider.js";

// 仅表示本地在途输入；草稿和 Core 回执继续由原提交链路管理。
export type PendingMessage = {
  text: string;
  files: readonly { name: string }[];
  previousUserIds: readonly string[];
  starting?: boolean;
};
const messages = new Map<string, PendingMessage>();
const listeners = new Set<() => void>();
export function setPendingMessage(key: string, message?: PendingMessage) {
  if (message) messages.set(key, message);
  else messages.delete(key);
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function usePendingMessage(key: string) {
  return useSyncExternalStore(subscribe, () => messages.get(key));
}
export function PendingMessageView({ message }: { message: PendingMessage }) {
  const { t } = useI18n();
  return (
    <section className="pending-message" data-testid="pending-message" aria-busy="true">
      <div className="user-message">
        <div className="user-message-content">
          {!!message.files.length && (
            <div className="user-attachments">
              {message.files.map((file, index) => (
                <span key={index}>{file.name}</span>
              ))}
            </div>
          )}
          <div className="user-bubble whitespace-pre-wrap break-words">
            {message.text || (!message.files.length && t("chat.submission.context"))}
          </div>
        </div>
      </div>
      <p className="turn-status" role="status">
        {t(message.starting ? "chat.submission.starting" : "chat.submission.sending")}
      </p>
    </section>
  );
}
