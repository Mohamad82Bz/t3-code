import { useAtomValue } from "@effect/atom-react";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { useEffect } from "react";

import { appAtomRegistry } from "../../rpc/atomRegistry";
import { serverEnvironment } from "../../state/server";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function SessionCostIndicator({
  threadRef,
  running,
}: {
  readonly threadRef: ScopedThreadRef;
  readonly running: boolean;
}) {
  const query = serverEnvironment.sessionCost({
    environmentId: threadRef.environmentId,
    input: { threadId: threadRef.threadId },
  });
  const result = useAtomValue(query);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- A new run must restart a settled background RPC query; transcripts can flush after completion.
  useEffect(() => {
    appAtomRegistry.refresh(query);
    if (running) return;
    const timer = setTimeout(() => appAtomRegistry.refresh(query), 2_000);
    return () => clearTimeout(timer);
  }, [query, running]);
  const cost = AsyncResult.getOrElse(result, () => null);
  const failed = result._tag === "Failure" || cost?.status === "failed";
  const calculating = !failed && (cost === null || cost.status === "calculating");
  const value = failed
    ? "Failed"
    : calculating
      ? "Calculating"
      : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: (cost?.costUsd ?? 0) < 0.01 ? 4 : 2, minimumFractionDigits: 0 }).format(cost?.costUsd ?? 0)}$`;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            data-session-cost
            data-session-cost-status={failed ? "failed" : calculating ? "calculating" : "ready"}
            aria-label={`Estimated session cost: ${value}`}
            className="shrink-0 cursor-default px-1 text-xs text-muted-foreground tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          />
        }
      >
        {value}
      </TooltipTrigger>
      <TooltipPopup side="top">
        <div className="max-w-72 space-y-1">
          <p className="font-medium">Estimated session cost</p>
          <p>
            {result._tag === "Failure"
              ? "Session cost could not be calculated. It will retry when the session runs or is reopened."
              : (cost?.message ?? "Reading session usage in the background.")}
          </p>
          {cost && cost.unpricedModels.length > 0 ? (
            <p>Missing prices: {cost.unpricedModels.join(", ")}</p>
          ) : null}
          <p>
            Includes recorded requests and native child sessions, not a subscription bill. Updates
            after provider usage is saved.
          </p>
        </div>
      </TooltipPopup>
    </Tooltip>
  );
}
