import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

import { useSidebarThreadSpectators } from "../../state/threadPresence";
import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function SidebarThreadSpectators({
  environmentId,
  threadId,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const spectators = useSidebarThreadSpectators(environmentId, threadId);
  if (spectators.length === 0) return null;
  const names = spectators.map((spectator) => spectator.label).join(", ");
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            aria-label={`Viewing this session: ${names}`}
            className="inline-flex max-w-40 shrink-0 items-center gap-1 text-3xs text-muted-foreground"
          />
        }
      >
        {spectators.slice(0, 2).map((spectator) => (
          <span
            key={spectator.environmentId}
            className="inline-flex h-4.5 min-w-0 max-w-20 items-center gap-1 rounded border border-border/50 bg-foreground/4 px-1"
          >
            <EnvironmentMachineIcon kind={spectator.machine} className="size-3 shrink-0" />
            <span className="min-w-0 truncate">{spectator.label}</span>
            <span aria-hidden className="size-1 shrink-0 rounded-full bg-success/80" />
          </span>
        ))}
        {spectators.length > 2 ? <span>+{spectators.length - 2}</span> : null}
      </TooltipTrigger>
      <TooltipPopup>
        {names} {spectators.length === 1 ? "is" : "are"} viewing this session
      </TooltipPopup>
    </Tooltip>
  );
}
