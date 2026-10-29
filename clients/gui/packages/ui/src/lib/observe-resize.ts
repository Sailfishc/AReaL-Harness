import { flushSync } from "react-dom";

/** 在尺寸通知阶段提交布局状态，避免下一帧才更新依赖尺寸的 DOM。 */
export function observeResize(
  targets: Element | readonly Element[],
  callback: ResizeObserverCallback,
  options?: ResizeObserverOptions,
): () => void {
  const observer = new ResizeObserver((entries, source) => {
    flushSync(() => callback(entries, source));
  });
  const elements = Array.isArray(targets) ? targets : [targets];
  for (const target of elements) observer.observe(target, options);
  return () => observer.disconnect();
}
