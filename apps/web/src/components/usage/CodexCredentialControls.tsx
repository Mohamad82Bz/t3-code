import { useAtomValue } from "@effect/atom-react";
import {
  type EnvironmentId,
  type UsageLimitSourceAccount,
  type UsageLimitSourceId,
  type UsageLimitSourceAccountActionInput,
} from "@t3tools/contracts";
import { formatResetsIn, remainingPercent } from "@t3tools/shared/usageLimits";
import { PlayIcon, PowerOffIcon } from "lucide-react";
import { useRef, useState } from "react";

import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";

export function useCodexCredentialAction(
  account: UsageLimitSourceAccount,
  environmentId: EnvironmentId,
  sourceId: UsageLimitSourceId,
) {
  const command = serverEnvironment.usageLimitSourceAccountAction;
  const permitted = useAtomValue(command.permissionAtom(environmentId));
  const run = useAtomCommand(command, { reportFailure: false });
  const pending = useRef(false);
  const [busy, setBusy] = useState<"toggle" | "startQuota" | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const available = Boolean(permitted && account.canManage && account.authIndex);
  const act = async (action: UsageLimitSourceAccountActionInput["action"]) => {
    if (pending.current || !available) return;
    pending.current = true;
    setBusy(action.type);
    setStatus(null);
    const result = await run({
      environmentId,
      input: { sourceId, accountId: account.id, authIndex: account.authIndex!, action },
    });
    pending.current = false;
    setBusy(null);
    setStatus(
      result._tag === "Success"
        ? result.value.message
        : "error" in result.cause && result.cause.error instanceof Error
          ? result.cause.error.message
          : "Could not update the credential. Refresh to check its state.",
    );
  };
  return { busy, status, available, act };
}

export function CompactCodexCredentialCard({
  account,
  environmentId,
  sourceId,
  now,
}: {
  readonly account: UsageLimitSourceAccount;
  readonly environmentId: EnvironmentId;
  readonly sourceId: UsageLimitSourceId;
  readonly now: number;
}) {
  const { busy, status, available, act } = useCodexCredentialAction(
    account,
    environmentId,
    sourceId,
  );
  const session = account.usageLimits.windows.find((window) => window.kind === "session");
  const weekly = account.usageLimits.windows.find((window) => window.kind === "weekly");
  const sessionLeft = session ? remainingPercent(session) : null;
  const weeklyLeft = weekly ? remainingPercent(weekly) : null;
  const resetsIn = session ? formatResetsIn(session, now) : null;
  const state = busy === "toggle" ? "Updating…" : account.disabled ? "Disabled" : "Enabled";
  const summary = `Account ${account.identifier}: ${state}. Session ${sessionLeft === null ? "unavailable" : `${sessionLeft}% left`}, weekly ${weeklyLeft === null ? "unavailable" : `${weeklyLeft}% left`}.`;
  return (
    <article
      className={cn(
        "min-w-0 rounded-md border bg-card",
        account.disabled ? "border-dashed border-border/70" : "border-border",
        account.commented && "bg-muted/20",
      )}
    >
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                disabled={Boolean(busy) || !available}
                aria-label={`${summary} Click to ${account.disabled ? "enable" : "disable"}.`}
                aria-pressed={!account.disabled}
                onClick={() =>
                  void act({ type: "toggle", expectedDisabled: account.disabled ?? false })
                }
                className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-md px-2 py-2 text-start outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default"
              />
            }
          >
            <span className="flex w-full min-w-0 items-center gap-1.5 text-xs tabular-nums">
              <span className="shrink-0 font-semibold text-foreground">{account.identifier}</span>
              {account.disabled ? (
                <PowerOffIcon aria-hidden className="size-3 shrink-0 text-muted-foreground" />
              ) : null}
              <span className="shrink-0 text-foreground">
                {sessionLeft === null ? "—" : `${sessionLeft}%`}{" "}
                <span className="text-muted-foreground">/</span>{" "}
                {weeklyLeft === null ? "—" : `${weeklyLeft}%`}
              </span>
              <span className="ms-auto min-w-0 truncate text-2xs text-muted-foreground">
                {busy === "toggle" ? "…" : (resetsIn?.replace("resets in ", "↻ ") ?? "—")}
              </span>
            </span>
            <span aria-hidden className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-r bg-foreground/60 forced-colors:bg-[Highlight]"
                style={{ width: `${sessionLeft ?? 0}%` }}
              />
            </span>
          </TooltipTrigger>
          <TooltipPopup side="right">
            <div className="flex max-w-64 flex-col gap-1">
              <span>{summary}</span>
              {resetsIn ? <span>Session {resetsIn}</span> : null}
              {weekly ? (
                <span>Weekly {formatResetsIn(weekly, now) ?? "reset time unavailable"}</span>
              ) : null}
              {account.commented ? <span>Has a CPA comment</span> : null}
              <span>
                {available
                  ? `Click the card to ${account.disabled ? "enable" : "disable"} this credential.`
                  : "Credential controls are unavailable."}
              </span>
            </div>
          </TooltipPopup>
        </Tooltip>
        <div className="me-1 shrink-0">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost-muted"
                  size="icon-micro"
                  aria-label={`Start Quota for account ${account.identifier}`}
                  disabled={Boolean(busy) || !available}
                  onClick={() => void act({ type: "startQuota" })}
                />
              }
            >
              {busy === "startQuota" ? <span aria-hidden>…</span> : <PlayIcon aria-hidden />}
            </TooltipTrigger>
            <TooltipPopup side="right">Start Quota for account {account.identifier}</TooltipPopup>
          </Tooltip>
        </div>
      </div>
      {status ? (
        <p role="status" className="px-2 pb-2 text-2xs text-muted-foreground">
          {status}
        </p>
      ) : null}
    </article>
  );
}
