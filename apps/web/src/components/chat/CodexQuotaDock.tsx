import { useAtomValue } from "@effect/atom-react";
import { refreshUsageLimits } from "@t3tools/client-runtime/state/usage";
import { type EnvironmentId, type UsageLimitSourceSnapshot } from "@t3tools/contracts";
import { ChevronDownIcon, ChevronUpIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import * as Schema from "effect/Schema";
import { Atom } from "effect/reactivity";

import { useLocalStorage } from "../../hooks/useLocalStorage";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { OpenAI } from "../Icons";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { CompactCodexCredentialCard } from "../usage/CodexCredentialControls";
import { useChatCanvas } from "./ChatCanvasContext";
import { resolveCodexQuotaDockLayout } from "./codexQuotaDockLayout";

const EMPTY_SOURCES: readonly UsageLimitSourceSnapshot[] = [];
const quotaSourcesAtom = Atom.family((environmentId: EnvironmentId) =>
  Atom.make(
    (get) =>
      get(serverEnvironment.configValueAtom(environmentId))?.usageLimitSources ?? EMPTY_SOURCES,
  ).pipe(Atom.withLabel(`web-codex-quota-dock:${environmentId}`)),
);

export function CodexQuotaDock({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const canvas = useChatCanvas();
  const snapshots = useAtomValue(quotaSourcesAtom(environmentId));
  const refresh = useAtomCommand(serverEnvironment.refreshProviders, { reportFailure: false });
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useLocalStorage(
    "codex-quota-dock-collapsed",
    false,
    Schema.Boolean,
  );
  const sources = snapshots.flatMap((source) => {
    const accounts = source.accounts.filter(
      (account) => account.driver === "codex" && account.identifier,
    );
    return accounts.length || source.error ? [{ ...source, accounts }] : [];
  });
  const dock = canvas
    ? resolveCodexQuotaDockLayout({
        ...canvas.container,
        chatLeft: canvas.layout.chat.left,
        preview: canvas.layout.frame,
      })
    : null;
  const refreshQuotas = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);
    const result = await refreshUsageLimits(environmentId, () =>
      refresh({ environmentId, input: {} }),
    );
    setRefreshing(false);
    if (result?._tag === "Failure") setError("Could not refresh quotas. Showing the last reading.");
  };
  if (!dock || sources.length === 0) return null;
  const contents = (
    <div
      className="flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden p-2"
      style={{ maxHeight: dock.maxHeight }}
    >
      <div className="flex items-center gap-1.5 ps-1">
        <OpenAI className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="me-auto text-xs font-medium text-foreground">Codex quotas</span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost-muted"
                size="icon-micro"
                aria-label="Refresh Codex quotas"
                disabled={refreshing}
                onClick={() => void refreshQuotas()}
              />
            }
          >
            {refreshing ? <span aria-hidden>…</span> : <RefreshCwIcon aria-hidden />}
          </TooltipTrigger>
          <TooltipPopup>Refresh Codex quotas</TooltipPopup>
        </Tooltip>
        {dock.inline ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost-muted"
                  size="icon-micro"
                  aria-label="Collapse Codex quotas"
                  onClick={() => setCollapsed(true)}
                />
              }
            >
              <ChevronDownIcon aria-hidden />
            </TooltipTrigger>
            <TooltipPopup>Collapse Codex quotas</TooltipPopup>
          </Tooltip>
        ) : null}
      </div>
      <div
        className="flex min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain"
        style={{ maxHeight: dock.maxHeight - 52 }}
      >
        {sources.map((source) => (
          <section key={source.id} aria-label={source.label} className="flex flex-col gap-1.5">
            {sources.length > 1 ? (
              <h3 className="truncate px-1 text-2xs text-muted-foreground">{source.label}</h3>
            ) : null}
            <p className="px-1 text-2xs text-muted-foreground">
              Session / weekly left · session reset
            </p>
            {source.accounts.map((account, index) => (
              <div
                key={account.id}
                className={
                  account.commented && !source.accounts[index - 1]?.commented
                    ? "mt-1 border-t border-border/60 pt-2"
                    : undefined
                }
              >
                <CompactCodexCredentialCard
                  account={account}
                  environmentId={environmentId}
                  sourceId={source.id}
                  now={Date.parse(source.checkedAt)}
                />
              </div>
            ))}
            {source.error ? (
              <p role="status" className="px-1 text-2xs text-muted-foreground">
                {source.error}
              </p>
            ) : null}
          </section>
        ))}
      </div>
      {error ? (
        <p role="status" className="px-1 text-2xs text-muted-foreground">
          {error}
        </p>
      ) : null}
    </div>
  );
  return (
    <aside
      aria-label="Codex account quota dock"
      className="absolute bottom-3 left-3 z-20 hidden sm:block"
    >
      {dock.inline && !collapsed ? (
        <div
          className="rounded-lg border border-border/70 bg-background shadow-sm"
          style={{ width: dock.width, maxHeight: dock.maxHeight }}
        >
          {contents}
        </div>
      ) : dock.inline ? (
        <Button
          variant="outline"
          size="xs"
          onClick={() => setCollapsed(false)}
          aria-label="Expand Codex quotas"
        >
          <OpenAI aria-hidden />
          Codex
          <ChevronUpIcon aria-hidden />
        </Button>
      ) : (
        <Popover>
          <PopoverTrigger
            render={
              <Button variant="outline" size="icon-sm" aria-label="Show Codex account quotas" />
            }
          >
            <OpenAI aria-hidden />
          </PopoverTrigger>
          <PopoverPopup side="right" align="end" className="w-64">
            {contents}
          </PopoverPopup>
        </Popover>
      )}
    </aside>
  );
}
