interface LexicalEnterSubmitOptions {
  allowSubmitWhenEmpty?: boolean;
  ctrlKey?: boolean;
  enterSubmits: boolean;
  isComposing?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  text: string;
}

interface LexicalModifiedEnterSubmitOptions {
  allowSubmitWhenEmpty?: boolean;
  ctrlKey?: boolean;
  isComposing?: boolean;
  metaKey?: boolean;
  modifiedEnterSubmits: boolean;
  shiftKey?: boolean;
  text: string;
}

export type LexicalSubmitResult = boolean | void;

interface LeadingChineseSlashAliasInputOptions {
  data: string | null;
  inputType: string;
  isAtEditorStart: boolean;
  isComposing?: boolean;
}

export const CHINESE_SLASH_ALIAS = "、";
export const STANDARD_SLASH_TRIGGER = "/";

export function shouldSubmitLexicalEnter({
  allowSubmitWhenEmpty = false,
  ctrlKey = false,
  enterSubmits,
  isComposing = false,
  metaKey = false,
  shiftKey = false,
  text,
}: LexicalEnterSubmitOptions): boolean {
  if (!enterSubmits) {
    return false;
  }
  if (shiftKey || ctrlKey || metaKey || isComposing) {
    return false;
  }
  return Boolean(text.trim() || allowSubmitWhenEmpty);
}

export function shouldSubmitLexicalModifiedEnter({
  allowSubmitWhenEmpty = false,
  ctrlKey = false,
  isComposing = false,
  metaKey = false,
  modifiedEnterSubmits,
  shiftKey = false,
  text,
}: LexicalModifiedEnterSubmitOptions): boolean {
  return (
    modifiedEnterSubmits &&
    (ctrlKey || metaKey) &&
    !shiftKey &&
    !isComposing &&
    Boolean(text.trim() || allowSubmitWhenEmpty)
  );
}

export function shouldResetLexicalEditorAfterSubmit(result: LexicalSubmitResult): boolean {
  return result !== false;
}

export function shouldNormalizeLeadingChineseSlashAliasInput({
  data,
  inputType,
  isAtEditorStart,
  isComposing = false,
}: LeadingChineseSlashAliasInputOptions): boolean {
  return (
    data === CHINESE_SLASH_ALIAS && inputType === "insertText" && isAtEditorStart && !isComposing
  );
}
