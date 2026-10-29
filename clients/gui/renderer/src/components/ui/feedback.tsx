import { formatUiMessage, useI18n, type UiMessage } from "../../i18n/IntlProvider.js";
import "./feedback.css";

export function Feedback({
  error,
  message,
  id,
}: {
  error?: string | UiMessage;
  message?: string | UiMessage;
  id?: string;
}) {
  const { t } = useI18n();
  const errorText = error ? formatUiMessage(t, error) : "";
  return errorText ? (
    <p id={id} role="alert" className="ui-feedback" data-tone="error">
      {errorText}
    </p>
  ) : message ? (
    <p id={id} role="status" className="ui-feedback">
      {formatUiMessage(t, message)}
    </p>
  ) : null;
}
