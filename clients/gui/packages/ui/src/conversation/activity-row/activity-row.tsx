import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { ActivityIcon } from "../../activity-icons.js";
import { cn } from "../../lib/utils.js";

type RowProps = { icon?: ReactNode } & HTMLAttributes<HTMLDivElement>;
type RowButtonProps = { icon?: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>;

/** One fact in the conversation timeline: icon, text, optional status and actions. */
export function ActivityRow({ icon, className, children, ...props }: RowProps) {
  return (
    <div {...props} className={cn("areal-activity-row", className)}>
      {icon}
      {children}
    </div>
  );
}

/** A row whose whole surface toggles its own details. */
export function ActivityRowButton({
  icon,
  className,
  children,
  type = "button",
  ...props
}: RowButtonProps) {
  return (
    <button {...props} type={type} className={cn("areal-activity-row", className)}>
      {icon}
      {children}
    </button>
  );
}

/** Verb stays whole; the object truncates first and its full value belongs to the details. */
export function ActivityRowText({
  action,
  detail,
  running,
  className,
}: {
  action: ReactNode;
  detail?: ReactNode;
  running?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("areal-activity-row-text", className)} data-running={running || undefined}>
      <span className="areal-activity-row-action">{action}</span>
      {detail != null && detail !== "" && (
        <span className="areal-activity-row-detail">{detail}</span>
      )}
    </span>
  );
}

/** Non-default outcomes stay visible on the row; a hidden status still reaches assistive tech. */
export function ActivityRowStatus({
  tone,
  hidden,
  className,
  children,
}: {
  tone?: "failed";
  hidden?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn("areal-activity-row-status", className)}
      data-tone={tone}
      data-visually-hidden={hidden || undefined}
    >
      {children}
    </span>
  );
}

/** Shown on hover, keyboard focus or while open; the direction alone says open or closed. */
export function ActivityRowChevron({ open, className }: { open?: boolean; className?: string }) {
  return (
    <span className={cn("areal-activity-row-chevron", className)} data-open={open || undefined}>
      <ActivityIcon kind="chevron" size={14} />
    </span>
  );
}
