import { useAtomValue } from "@effect/atom-react";
import { threadRuntimeIsActive } from "@t3tools/client-runtime/state/models";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { BotProfile, EnvironmentId, ThreadId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import { AsyncResult, Atom } from "effect/reactivity";
import { useGT } from "gt-react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BotIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  GripIcon,
} from "lucide-react";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { cn } from "../../lib/utils";
import { useEffect, useState } from "react";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { botAvatarActivity } from "../bots/avatarActivity";
import { useAtomCommand } from "../../state/use-atom-command";
import { botsSnapshotAtom, mutateBot } from "../../state/bots";
import * as Option from "effect/Option";
import { environmentThreadShells, useEnvironmentThread } from "../../state/threads";
import { buildThreadRouteParams } from "../../threadRoutes";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { BotAvatar, botAppearance } from "./BotAvatar";
import { useChatCanvas } from "./ChatCanvasContext";
import { resolveBotsDockLayout } from "./botsDockLayout";

const pinnedBotActivity = Atom.family((environmentId: EnvironmentId) =>
  Atom.make((get) => {
    const snapshot = AsyncResult.getOrElse(get(botsSnapshotAtom(environmentId)), () => null);
    if (!snapshot?.enabled) return null;
    return snapshot.bots
      .filter((bot) => bot.pinned)
      .slice(0, 6)
      .map((bot) => {
        const thread = get(
          environmentThreadShells.quietThreadShellAtom(scopeThreadRef(environmentId, bot.threadId)),
        );
        const state = thread?.hasPendingApprovals
          ? "approval"
          : thread?.hasPendingUserInput
            ? "question"
            : threadRuntimeIsActive(thread?.runtime)
              ? "working"
              : null;
        return { bot, state, thread } as const;
      });
  }),
);

export function BotsDock({
  environmentId,
  threadId,
}: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
}) {
  const gt = useGT();
  const canvas = useChatCanvas();
  const bots = useAtomValue(pinnedBotActivity(environmentId));
  const canReorder = useAtomValue(mutateBot.permissionAtom(environmentId));
  const mutate = useAtomCommand(mutateBot);
  const [orderMode, setOrderMode] = useState(false);
  const [dragId, setDragId] = useState<ThreadId | null>(null);
  const [collapsed, setCollapsed] = useLocalStorage("bots-dock-collapsed", false, Schema.Boolean);
  const layout =
    canvas &&
    resolveBotsDockLayout({
      ...canvas.container,
      chatLeft: canvas.layout.chat.left,
      preview: canvas.layout.frame,
    });
  if (layout === null || bots === null) return null;
  const open = !layout.inline || !collapsed;
  const move = (threadId: ThreadId, before: ThreadId | null) => {
    if (before !== threadId)
      void mutate({ environmentId, input: { type: "move", threadId, before } });
  };
  const attentionThread = bots.find(({ state }) => state === "approval" || state === "question")
    ?.bot.threadId;
  const statusLabel = (state: (typeof bots)[number]["state"]) => {
    switch (state) {
      case "approval":
        return gt("Needs approval");
      case "question":
        return gt("Has a question");
      case "working":
        return gt("Working");
      case null:
        return null;
    }
  };
  const contents = (
    <>
      <div className="flex min-h-8 items-center gap-1.5 px-2.5 py-1.5">
        <BotIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="me-auto text-xs font-medium text-foreground">{gt("Bots")}</span>
        {!open ? null : (
          <Button
            size="xs"
            variant="ghost-muted"
            render={<Link to="/settings/bots" search={{ machine: environmentId }} />}
          >
            {gt("All bots")}
          </Button>
        )}
        {open && canReorder && bots.length > 1 ? (
          <Button
            variant="ghost-muted"
            size="icon-micro"
            aria-label={gt("Reorder bots")}
            aria-pressed={orderMode}
            onClick={() => setOrderMode(!orderMode)}
          >
            <GripIcon />
          </Button>
        ) : null}
        {layout.inline ? (
          <Button
            variant="ghost-muted"
            size="icon-micro"
            aria-label={collapsed ? gt("Expand bot launcher") : gt("Collapse bot launcher")}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronDownIcon /> : <ChevronUpIcon />}
          </Button>
        ) : null}
      </div>
      {open &&
        (bots.length === 0 ? (
          <div className="border-t border-border/60 px-3 py-2.5 text-xs text-muted-foreground">
            <Link
              to="/settings/bots"
              search={{ machine: environmentId }}
              className="underline-offset-4 hover:underline focus-visible:underline"
            >
              {gt("Set up your bot launcher")}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1 border-t border-border/60 p-2">
            {bots.map(({ bot, state, thread }, index) => {
              const status = statusLabel(state);
              return (
                <div
                  key={bot.threadId}
                  className="min-w-0"
                  onDragOver={(event) => {
                    if (dragId !== null) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    if (dragId === null) return;
                    event.preventDefault();
                    const from = bots.findIndex(({ bot }) => bot.threadId === dragId);
                    if (from >= 0 && from !== index)
                      move(
                        dragId,
                        (from < index ? bots[index + 1] : bots[index])?.bot.threadId ?? null,
                      );
                    setDragId(null);
                  }}
                >
                  <BotTile
                    bot={bot}
                    environmentId={environmentId}
                    selected={bot.threadId === threadId}
                    status={status}
                    thread={thread}
                    draggable={canReorder && bots.length > 1}
                    onDragStart={() => setDragId(bot.threadId)}
                    onDragEnd={() => setDragId(null)}
                    attention={state === "approval" || state === "question"}
                    showBubble={bot.threadId === attentionThread}
                  />
                  {orderMode && canReorder ? (
                    <div className="flex justify-center gap-1">
                      <Button
                        size="icon-micro"
                        variant="ghost-muted"
                        aria-label={gt("Move bot earlier")}
                        disabled={index === 0}
                        onClick={() => move(bot.threadId, bots[index - 1]?.bot.threadId ?? null)}
                      >
                        <ArrowLeftIcon />
                      </Button>
                      <Button
                        size="icon-micro"
                        variant="ghost-muted"
                        aria-label={gt("Move bot later")}
                        disabled={index === bots.length - 1}
                        onClick={() => move(bot.threadId, bots[index + 2]?.bot.threadId ?? null)}
                      >
                        <ArrowRightIcon />
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
    </>
  );
  return (
    <aside aria-label={gt("Bot launcher")} className="absolute left-3 top-3 z-20">
      {layout.inline ? (
        <div
          className="rounded-lg border border-border/70 bg-background shadow-sm"
          style={{ width: open ? layout.width : undefined }}
        >
          {contents}
        </div>
      ) : (
        <Popover>
          <PopoverTrigger
            render={
              <Button variant="outline" size="icon-sm" aria-label={gt("Expand bot launcher")} />
            }
          >
            <BotIcon aria-hidden />
          </PopoverTrigger>
          <PopoverPopup side="right" align="start" className="w-60">
            {contents}
          </PopoverPopup>
        </Popover>
      )}
    </aside>
  );
}

function BotTile({
  bot,
  environmentId,
  selected,
  status,
  thread,
  draggable,
  onDragStart,
  onDragEnd,
  attention,
  showBubble,
}: {
  bot: BotProfile;
  environmentId: EnvironmentId;
  selected: boolean;
  status: string | null;
  thread: EnvironmentThreadShell | null;
  draggable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  attention: boolean;
  showBubble: boolean;
}) {
  const [now, setNow] = useState(Date.now);
  const latestStamp = Math.max(
    Date.parse(thread?.latestRun?.completedAt ?? "") || 0,
    Date.parse(thread?.latestUserMessageAt ?? "") || 0,
  );
  const currentThread = useEnvironmentThread(
    selected ? environmentId : null,
    selected ? bot.threadId : null,
  );
  const state = botAvatarActivity(
    thread,
    Math.max(now, latestStamp),
    Option.getOrUndefined(currentThread.data),
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- moods also change on elapsed idle time, without a server event
  useEffect(() => {
    if (state.until === undefined) return;
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(0, state.until - Date.now()) + 15,
    );
    return () => window.clearTimeout(timer);
  }, [state.until]);
  return (
    <Link
      to="/$environmentId/$threadId"
      params={buildThreadRouteParams(scopeThreadRef(environmentId, bot.threadId))}
      aria-current={selected ? "page" : undefined}
      draggable={draggable}
      onDragStart={(event) => {
        if (!draggable) return;
        event.dataTransfer.setData("application/x-t3-bot", bot.threadId);
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "relative flex min-w-0 flex-col items-center gap-1 rounded-md px-1.5 pb-1.5 pt-5 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        selected && "bg-accent text-accent-foreground",
      )}
    >
      <span className="relative">
        <BotAvatar
          appearance={botAppearance(bot)}
          state={state.state}
          size={40}
          animate={
            selected ||
            (state.state !== "idle" && state.state !== "sleeping" && state.state !== "drowsy")
          }
        />
        {attention ? (
          <span
            aria-hidden
            className="absolute end-0 top-0 size-2.5 rounded-full border-2 border-background bg-warning"
          />
        ) : null}
      </span>
      <span className="w-full truncate text-center font-medium">{bot.name}</span>
      {status &&
        (showBubble ? (
          <span className="pointer-events-none absolute top-0.5 z-10 max-w-[calc(100%+0.75rem)] truncate rounded-md bg-warning-surface px-1.5 py-0.5 text-3xs leading-none font-semibold text-warning-foreground">
            {status}
          </span>
        ) : (
          <span className="sr-only">{status}</span>
        ))}
    </Link>
  );
}
