import * as React from "react";
import { cn } from "../../lib/utils.js";

// 操作区必须是行的直接子元素；显隐只改透明度，弹出层的锚点位置因此始终不变。
function HoverActions({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span data-slot="hover-actions" className={cn("areal-hover-actions", className)} {...props} />
  );
}

export { HoverActions };
