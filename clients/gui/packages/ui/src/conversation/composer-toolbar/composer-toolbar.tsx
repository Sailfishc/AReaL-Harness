import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/utils.js";

/** Leading and trailing actions are supplied by the host. */
export function ComposerToolbar({ leading, trailing, className, ...props }: Omit<ComponentProps<"div">, "children"> & { leading: ReactNode; trailing: ReactNode }) {
  return <div {...props} className={cn("group/toolbar composer-toolbar", className)}>
    <div className="flex min-w-0 flex-1 items-center" data-composer-leading-actions>
      <div className="flex shrink-0 items-center gap-1" data-composer-leading-content>{leading}</div>
    </div>
    <div className="ml-auto flex shrink-0 items-center justify-end gap-1.5" data-composer-trailing-actions>{trailing}</div>
  </div>;
}
