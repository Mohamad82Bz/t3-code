import type { ReactNode } from "react";

export function ToolCodeSurface({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="diff-render-surface max-h-80 overflow-auto overscroll-contain rounded-md border border-border/60 bg-background select-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      {children}
    </div>
  );
}
