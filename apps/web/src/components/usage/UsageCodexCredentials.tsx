import {
  type EnvironmentId,
  type UsageLimitSourceAccount,
  type UsageLimitSourceId,
} from "@t3tools/contracts";
import {
  collectCodexCredentialSources,
  formatResetsIn,
  remainingPercent,
  type LimitPresentations,
} from "@t3tools/shared/usageLimits";
import { MessageSquareIcon, PlayIcon, PowerIcon } from "lucide-react";

import { useCodexCredentialAction } from "./CodexCredentialControls";
import { cn } from "../../lib/utils";
import { OpenAI } from "../Icons";
import { RedactedSensitiveText } from "../settings/RedactedSensitiveText";
import { Button } from "../ui/button";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { ResetCredits } from "./UsageLimits";

function CredentialCard({
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
  return (
    <article
      className={cn(
        "flex w-44 min-w-0 max-w-full flex-col rounded-lg border bg-card",
        account.disabled ? "border-dashed border-border/60" : "border-border",
        account.commented && "bg-muted/20",
      )}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={`Account ${account.identifier}: ${account.disabled ? "disabled, enable" : "enabled, disable"}`}
              aria-pressed={!account.disabled}
              disabled={Boolean(busy) || !available}
              onClick={() =>
                void act({ type: "toggle", expectedDisabled: account.disabled ?? false })
              }
              className="flex flex-col gap-4 rounded-t-lg p-3 text-start outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default"
            />
          }
        >
          <span className="flex items-center justify-between gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-muted text-base font-semibold text-foreground">
              {account.identifier}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <PowerIcon className="size-3" />
              {busy === "toggle" ? "Updating…" : account.disabled ? "Disabled" : "Enabled"}
            </span>
          </span>
          <span className="flex w-full flex-col gap-3">
            {(["session", "weekly"] as const).map((kind) => {
              const window = account.usageLimits.windows.find((window) => window.kind === kind);
              const remaining = window ? remainingPercent(window) : null;
              return (
                <span key={kind} className="flex flex-col gap-1.5">
                  <span className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">
                      {kind === "session" ? "Session" : "Weekly"}
                    </span>
                    <span className="font-semibold text-foreground tabular-nums">
                      {remaining === null ? "Unavailable" : `${remaining}% left`}
                    </span>
                  </span>
                  <span
                    className="h-1 overflow-hidden rounded-full bg-muted"
                    role="meter"
                    aria-label={`${kind === "session" ? "Session" : "Weekly"} quota remaining`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={remaining ?? undefined}
                    aria-valuetext={remaining === null ? "Unavailable" : `${remaining}% left`}
                  >
                    <span
                      className="block h-full rounded-r bg-foreground/60 forced-colors:bg-[Highlight]"
                      style={{ width: `${remaining ?? 0}%` }}
                    />
                  </span>
                  <span className="text-2xs text-muted-foreground tabular-nums">
                    {window
                      ? (formatResetsIn(window, now) ?? "Reset time unavailable")
                      : "No quota data"}
                  </span>
                </span>
              );
            })}
          </span>
        </TooltipTrigger>
        <TooltipPopup>
          {available
            ? `Click to ${account.disabled ? "enable" : "disable"} this credential in CPA`
            : "Credential management requires provider-management permission and a physical CPA auth file"}
        </TooltipPopup>
      </Tooltip>
      <div className="flex flex-col gap-2 border-t border-border/60 p-3">
        {account.email ? (
          <RedactedSensitiveText
            value={account.email}
            ariaLabel="Toggle account email visibility"
            revealTooltip="Click to reveal email"
            hideTooltip="Click to hide email"
            className="w-fit max-w-full"
          />
        ) : null}
        {account.commented ? (
          <span className="flex items-center gap-1.5 text-2xs text-muted-foreground">
            <MessageSquareIcon className="size-3" />
            Has comment
          </span>
        ) : null}
        <Button
          variant="outline"
          size="xs"
          disabled={Boolean(busy) || !available}
          onClick={() => void act({ type: "startQuota" })}
        >
          <PlayIcon aria-hidden />
          {busy === "startQuota" ? "Starting quota…" : "Start Quota"}
        </Button>
        {!account.disabled && account.usageLimits.resetCredits?.nextCreditId ? (
          <ResetCredits
            environmentId={environmentId}
            input={{
              sourceId,
              accountId: account.id,
              creditId: account.usageLimits.resetCredits.nextCreditId,
            }}
            credits={account.usageLimits.resetCredits}
            now={now}
          />
        ) : null}
        {status ? (
          <p role="status" className="text-xs text-muted-foreground">
            {status}
          </p>
        ) : null}
        {account.usageLimits.unavailable ? (
          <p className="text-xs text-muted-foreground">
            {account.usageLimits.unavailable.message ??
              "Quota unavailable. You can still manage this credential."}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export function UsageCodexCredentials({
  presentations,
  now,
}: {
  readonly presentations: LimitPresentations;
  readonly now: number;
}) {
  return collectCodexCredentialSources(presentations).map(
    ({ environmentId, environmentLabel, source, accounts }) => (
      <section key={`${environmentId}:${source.id}`} className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
          <OpenAI className="size-4" aria-hidden />
          Codex
          <span className="font-normal text-muted-foreground">
            · {presentations.size > 1 ? `${environmentLabel} · ` : ""}
            {source.label}
          </span>
        </h2>
        <p className="text-xs text-muted-foreground">
          Click a card to enable or disable its CPA credential. Start Quota sends one small request,
          then restores its enabled state and routing prefix.
        </p>
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex flex-1 flex-wrap items-start gap-3">
            {accounts
              .filter((account) => !account.commented)
              .map((account) => (
                <CredentialCard
                  key={account.id}
                  account={account}
                  environmentId={environmentId}
                  sourceId={source.id}
                  now={now}
                />
              ))}
          </div>
          {accounts.some((account) => account.commented) ? (
            <div className="ms-auto flex flex-wrap items-start justify-end gap-3">
              {accounts
                .filter((account) => account.commented)
                .map((account) => (
                  <CredentialCard
                    key={account.id}
                    account={account}
                    environmentId={environmentId}
                    sourceId={source.id}
                    now={now}
                  />
                ))}
            </div>
          ) : null}
        </div>
      </section>
    ),
  );
}
