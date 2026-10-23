import { useI18n } from "./i18n/IntlProvider.js";
import { CloseIcon } from "./interfaceIcons.js";
import { Button } from "./components/ui/button.js";

export function ConversationSelectionReferences({ references, disabled, onRemove }: {
  references: readonly { id?: string; text: string }[];
  disabled?: boolean;
  onRemove?: (id: string) => void;
}) {
  const { t } = useI18n();
  if (!references.length) return null;
  return <div className="conversation-selection-references" aria-label={t("chat.selection.references")}>
    {references.map((reference, index) => <div className="conversation-selection-reference" key={reference.id ?? index}
      data-testid="conversation-selection-reference" data-reference-id={reference.id}>
      <details><summary title={reference.text}>{reference.text}</summary><blockquote>{reference.text}</blockquote></details>
      {onRemove && reference.id && <Button type="button" variant="ghost" size="icon-sm" aria-label={t("chat.selection.removeReference")} disabled={disabled}
        onClick={() => onRemove(reference.id!)}><CloseIcon /></Button>}
    </div>)}
  </div>;
}
