import { useState, type CSSProperties, type ComponentType } from "react";
import { Check, Code2, Copy, WrapText } from "lucide-react";
import { Button } from "../../components/button/button.js";
import { CodeViewer, type CodeViewerProps } from "../../components/code-viewer/code-viewer.js";

const codeStyle: CSSProperties & Record<`--${string}`, string> = {
  "--diffs-bg": "transparent",
  "--diffs-light-bg": "transparent",
  "--diffs-dark-bg": "transparent",
  "--diffs-gap-block": "0px",
  "--diffs-gap-inline": "0px",
};

/** Presentation only: the existing viewer owns highlighting and line wrapping. */
export function MessageCodeBlock({ code, language, streaming, fontSizePx, CodeComponent = CodeViewer }: { code: string; language: string; streaming: boolean; fontSizePx: number; CodeComponent?: ComponentType<CodeViewerProps> }) {
  const [wrap, setWrap] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const viewerStyle: typeof codeStyle = { ...codeStyle, "--diffs-line-height": `${fontSizePx + 8}px` };
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopyState("copied"); }
    catch { setCopyState("failed"); }
  };
  return <section className="conversation-code-block" aria-label={`${language} 代码`}>
    <div className="conversation-code-header">
      <Code2 size={20} aria-hidden="true" /><span>{language}</span>
      <div className="conversation-code-actions">
        <Button variant="ghost" aria-label={wrap ? "禁用自动换行" : "启用自动换行"} title="自动换行" aria-pressed={wrap} onClick={() => setWrap(value => !value)}><WrapText size={16} /></Button>
        <Button variant="ghost" aria-label="复制代码" title="复制代码" onClick={() => void copy()}>{copyState === "copied" ? <Check size={16} /> : <Copy size={16} />}</Button>
      </div>
    </div>
    {copyState !== "idle" && <span className="sr-only" role="status">{copyState === "copied" ? "代码已复制" : "复制失败，请选择代码手动复制"}</span>}
    <div className="conversation-code-content"><CodeComponent code={code} language={language} fontSizePx={fontSizePx} showLineNumbers={false} transparentBackground wrapLongLines={wrap} enableSyntaxHighlighting={!streaming} style={viewerStyle} /></div>
  </section>;
}
