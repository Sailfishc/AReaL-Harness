import { useEffect, useRef, useState } from "react";

/** Visible text remains readable without animation, observers or scripting. */
export function ThinkingStatus({ label = "Thinking" }: { label?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [animating, setAnimating] = useState(false);
  useEffect(() => {
    let intersecting = false;
    const update = () => setAnimating(intersecting && document.visibilityState === "visible");
    const observer = new IntersectionObserver(([entry]) => { intersecting = entry.isIntersecting; update(); });
    if (ref.current) observer.observe(ref.current);
    document.addEventListener("visibilitychange", update);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, []);
  return <span ref={ref} className="areal-thinking" role="status" data-animating={animating}>
    <span>{label}</span><span className="areal-thinking-sweep" aria-hidden="true">{label}</span>
  </span>;
}
