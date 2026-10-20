import type { ThreadSpectators } from "@t3tools/contracts";

import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function ComposerSpectators({ spectators }: { readonly spectators: ThreadSpectators }) {
  if (spectators.length === 0) return null;
  const overflow = spectators.slice(2);
  return (
    <div
      role="group"
      aria-label="Session spectators"
      className="flex min-w-0 max-w-40 shrink items-center gap-1.5 px-2 sm:max-w-60"
    >
      {spectators.slice(0, 2).map((spectator) => (
        <Tooltip key={spectator.environmentId}>
          <TooltipTrigger
            render={
              <span
                tabIndex={0}
                className="inline-flex h-6 min-w-0 max-w-28 items-center gap-1.5 rounded-md border border-border/50 bg-foreground/4 px-2 text-xs text-muted-foreground opacity-100 transition-opacity duration-150 motion-reduce:transition-none starting:opacity-0"
                aria-label={`${spectator.label} is spectating`}
              />
            }
          >
            <EnvironmentMachineIcon kind={spectator.machine} className="size-3.5 shrink-0" />
            <span className="truncate">{spectator.label}</span>
            <span aria-hidden className="size-1 shrink-0 rounded-full bg-success/80" />
          </TooltipTrigger>
          <TooltipPopup>{spectator.label} is spectating this session</TooltipPopup>
        </Tooltip>
      ))}
      {overflow.length > 0 ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                tabIndex={0}
                className="text-xs tabular-nums text-muted-foreground"
                aria-label={`${overflow.length} more spectators`}
              />
            }
          >
            +{overflow.length}
          </TooltipTrigger>
          <TooltipPopup>{overflow.map((spectator) => spectator.label).join(", ")}</TooltipPopup>
        </Tooltip>
      ) : null}
    </div>
  );
}
