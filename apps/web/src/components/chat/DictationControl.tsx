import { MicIcon, SquareIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { DictationState } from "../../dictation/useDictation";

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function DictationControl({
  state,
  elapsedSeconds,
  error,
  disabled,
  onToggle,
}: {
  readonly state: DictationState;
  readonly elapsedSeconds: number;
  readonly error: string | null;
  readonly disabled: boolean;
  readonly onToggle: () => void;
}) {
  const active = state === "starting" || state === "listening" || state === "finishing";
  const label = active ? `Stop dictation${error ? `: ${error}` : ""}` : "Start dictation";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant={active ? "secondary" : "ghost-muted"}
            disabled={disabled || state === "finishing"}
            aria-label={label}
            aria-pressed={active}
            onPointerDown={(event) => event.preventDefault()}
            onClick={onToggle}
          />
        }
      >
        <span className="flex items-center gap-1.5">
          {active ? (
            <SquareIcon className="size-3 fill-current" aria-hidden="true" />
          ) : (
            <MicIcon className="size-4" aria-hidden="true" />
          )}
          {active ? (
            <span className="tabular-nums text-xs">{formatElapsed(elapsedSeconds)}</span>
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipPopup>
        {error ?? (active ? "Dictation is listening" : "Dictate into the composer")}
      </TooltipPopup>
    </Tooltip>
  );
}
