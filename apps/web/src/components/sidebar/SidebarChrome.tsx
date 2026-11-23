import { ArrowLeftIcon, ArrowRightIcon, ChartNoAxesColumnIcon, SettingsIcon } from "lucide-react";
import type { ReactNode } from "react";
import { T, useGT } from "gt-react";
import { memo } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";

import { useAtomValue } from "@effect/atom-react";
import { useClientSettings, useEnvironmentIdentificationMode } from "../../hooks/useSettings";
import { useNowMinute } from "../../hooks/useNowMinute";
import { useThreadRouteTarget } from "../../hooks/useThreadRouteTarget";
import { useComposerDraftStore } from "../../composerDraftStore";
import { shortcutLabelForCommand } from "../../keybindings";
import {
  navigateHistory,
  useCanNavigateHistory,
  type HistoryDirection,
} from "../../navigationHistory";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { environmentPresentations } from "../../state/presentation";
import { cn } from "../../lib/utils";
import {
  useIssuesSupported,
  usePrimaryEnvironmentId,
  usePullRequestsSupported,
} from "../../state/environments";
import { T3Wordmark } from "../T3Wordmark";
import {
  resolveEnvironmentIdentificationPillLabel,
  resolveSidebarStageBackdropVariant,
  SidebarStageBackdrop,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { readPullRequestListPreferences } from "../pullRequest/pullRequestListPreferences";
import { readIssueListPreferences } from "../issue/issueListPreferences";
import { IssueGlyph } from "../issue/issuePresentation";
import { isSidebarUtilityPage, useNavigateToMainApp } from "./mainAppLocation";
import { SidebarThreadUndoNotice } from "./SidebarThreadUndoNotice";
import {
  formatCodexQuotaReplenishment,
  resolveEnvironmentCodexQuotaTotals,
} from "./codexQuotaTotals";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarUpdateArchitectureWarning, SidebarUpdatePill } from "./SidebarUpdatePill";
import { PullRequestGlyph } from "~/components/pullRequest/pullRequestIcons";
import { observeResize } from "~/lib/observeResize";

export const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
}: {
  isElectron: boolean;
}) {
  const stageLabel = useEnvironmentStageLabel();
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const gt = useGT();
  const backdropVariant = resolveSidebarStageBackdropVariant(
    stageLabel,
    environmentIdentificationMode,
  );
  const pillLabel =
    environmentIdentificationMode === "pill"
      ? resolveEnvironmentIdentificationPillLabel(stageLabel)
      : null;

  return (
    <div
      className={cn(
        "relative flex h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center gap-2 pr-3",
        isElectron && "drag-region",
      )}
    >
      {backdropVariant ? <SidebarStageBackdrop variant={backdropVariant} /> : null}
      <div className="relative top-[calc(var(--workspace-controls-top)-env(safe-area-inset-top))] z-10 ml-[calc(var(--workspace-controls-left)+1px-env(safe-area-inset-left))] flex shrink-0 items-center md:hidden">
        <SidebarTrigger
          variant={backdropVariant ? "media-navigation" : "ghost"}
          className="relative top-auto translate-y-0"
          aria-label={gt("Toggle main sidebar")}
        />
      </div>
      <div className="relative z-10 flex h-8 min-w-0 flex-1 flex-wrap content-start items-center gap-x-2 overflow-hidden py-0.5">
        <div className="flex shrink-0 items-center gap-1">
          <SidebarBrand onBackdrop={backdropVariant !== null} />
          {isElectron ? (
            <div className="hidden items-center md:flex">
              <HistoryNavigationButton direction="back" onBackdrop={backdropVariant !== null} />
              <HistoryNavigationButton direction="forward" onBackdrop={backdropVariant !== null} />
            </div>
          ) : null}
        </div>
        {pillLabel ? (
          <div className="ml-1 flex h-7 items-center">
            <Badge data-environment-identification="pill" size="sm" variant="secondary">
              {pillLabel}
            </Badge>
          </div>
        ) : null}
      </div>
    </div>
  );
});

export function SidebarBrandWidthProbe({
  isElectron,
  onWidthChange,
}: {
  isElectron: boolean;
  onWidthChange: (width: number) => void;
}) {
  const observeWidth = (probe: HTMLDivElement) => {
    return observeResize(probe, ([entry]) => {
      if (entry) onWidthChange(entry.borderBoxSize[0]?.inlineSize ?? probe.offsetWidth);
    });
  };

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none invisible fixed top-0 left-0 flex w-max border-r border-transparent pr-3"
      ref={observeWidth}
    >
      <div className="ml-[var(--workspace-titlebar-content-left)] flex gap-1">
        <SidebarBrandMark onBackdrop={false} />
        {isElectron ? <div className="w-[calc(2*var(--workspace-titlebar-control-size))]" /> : null}
      </div>
    </div>
  );
}

function HistoryNavigationButton({
  direction,
  onBackdrop,
}: {
  direction: HistoryDirection;
  onBackdrop: boolean;
}) {
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const enabled = useCanNavigateHistory(direction);
  const gt = useGT();
  const label = direction === "back" ? gt("Go back") : gt("Go forward");
  const shortcutLabel = shortcutLabelForCommand(
    keybindings,
    direction === "back" ? "navigation.back" : "navigation.forward",
  );
  const Icon = direction === "back" ? ArrowLeftIcon : ArrowRightIcon;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className={cn(
              "[-webkit-app-region:no-drag]",
              onBackdrop && "relative top-auto translate-y-0",
            )}
            disabled={!enabled}
            onClick={() => navigateHistory(direction)}
            size="icon-sm"
            variant={onBackdrop ? "media-navigation" : "ghost"}
          />
        }
      >
        <Icon className="size-3.5" />
      </TooltipTrigger>
      <TooltipPopup side="bottom">
        {label}
        {shortcutLabel ? ` (${shortcutLabel})` : ""}
      </TooltipPopup>
    </Tooltip>
  );
}

function SidebarBrand({ onBackdrop }: { onBackdrop: boolean }) {
  const gt = useGT();
  return (
    <Link
      aria-label={gt("T3 Code home")}
      className={cn(
        "relative z-10 ml-[var(--workspace-titlebar-content-left)] hidden h-7 w-fit min-w-0 shrink-0 items-center overflow-hidden rounded-md outline-hidden ring-ring focus-visible:ring-2 focus-visible:ring-inset md:flex",
        onBackdrop ? "text-white" : "text-foreground",
      )}
      to="/"
    >
      <SidebarBrandMark onBackdrop={onBackdrop} />
    </Link>
  );
}

function SidebarBrandMark({ onBackdrop }: { onBackdrop: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1 text-sm font-medium tracking-tight">
      <T3Wordmark aria-label="T3" className="h-[1cap] w-auto shrink-0" />
      <span
        className={cn(
          "truncate [text-box:trim-both_cap_alphabetic] supports-[text-box:trim-both_cap_alphabetic]:py-1",
          onBackdrop ? "text-white/70" : "text-muted-foreground",
        )}
      >
        {/* oxlint-disable-next-line t3code/no-untranslated-copy -- product wordmark */}
        {"Code"}
      </span>
    </span>
  );
}

function SidebarUtilityItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <SidebarMenuItem className="shrink-0">
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarMenuButton aria-label={label} onClick={onClick} size="icon">
              {icon}
            </SidebarMenuButton>
          }
        />
        <TooltipPopup side="top">{label}</TooltipPopup>
      </Tooltip>
    </SidebarMenuItem>
  );
}

function SidebarCodexQuotaTotals() {
  const display = useClientSettings((settings) => settings.sidebarCodexQuotaDisplay);
  return display === "hidden" ? null : (
    <SidebarCodexQuotaValues detailed={display === "detailed"} />
  );
}

function SidebarCodexQuotaValues({ detailed }: { detailed: boolean }) {
  const gt = useGT();
  const textSize = useClientSettings((settings) => settings.sidebarCodexQuotaTextSize);
  const serverConfigs = useAtomValue(environmentPresentations.serverConfigsAtom);
  const routeTarget = useThreadRouteTarget();
  const draftEnvironmentId = useComposerDraftStore((store) =>
    routeTarget?.kind === "draft"
      ? (store.getDraftSession(routeTarget.draftId)?.environmentId ?? null)
      : null,
  );
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const environmentId =
    routeTarget?.kind === "server"
      ? routeTarget.threadRef.environmentId
      : (draftEnvironmentId ?? primaryEnvironmentId);
  const now = Date.parse(useNowMinute());
  const totals = resolveEnvironmentCodexQuotaTotals(serverConfigs, environmentId, now);
  if (totals === null) return null;

  const session = totals.session;
  const weekly = totals.weekly;
  const sessionLabel = session === null ? "–" : `${session.remaining}%`;
  const weeklyLabel = weekly === null ? "–" : `${weekly.remaining}%`;
  const sessionReset = session?.replenishment
    ? formatCodexQuotaReplenishment(session.replenishment, now)
    : null;
  const weeklyReset = weekly?.replenishment
    ? formatCodexQuotaReplenishment(weekly.replenishment, now)
    : null;
  const exhausted = session?.weeklyExhaustedCount ?? 0;
  const description = gt("Codex quota remaining: {session} for 5 hours, {weekly} for the week.", {
    session: sessionLabel,
    weekly: weeklyLabel,
  });
  const detailClass =
    textSize === "large"
      ? "text-2xs/none"
      : textSize === "small"
        ? "text-5xs/none"
        : "text-4xs/none";

  return (
    <SidebarMenuItem className="min-w-0 flex-1">
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              role="img"
              aria-label={description}
              tabIndex={0}
              className={cn(
                "grid min-w-0 cursor-default grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-x-1 rounded-sm text-center tabular-nums text-sidebar-muted-foreground outline-hidden focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
                textSize === "large"
                  ? "text-sm/none"
                  : textSize === "small"
                    ? "text-3xs/none"
                    : "text-2xs/none",
              )}
            />
          }
        >
          <span className="truncate">
            {sessionLabel}
            {detailed && exhausted > 0 ? (
              <span className={cn("ms-0.5 text-destructive", detailClass)}>-{exhausted}</span>
            ) : null}
          </span>
          <span aria-hidden className="text-sidebar-muted-foreground/60">
            /
          </span>
          <span className="truncate">{weeklyLabel}</span>
          {detailed && (sessionReset || weeklyReset) ? (
            <>
              <span className={cn("mt-0.5 truncate", detailClass)}>{sessionReset}</span>
              <span className={cn("col-start-3 mt-0.5 truncate", detailClass)}>{weeklyReset}</span>
            </>
          ) : null}
        </TooltipTrigger>
        <TooltipPopup side="top">
          <div>{description}</div>
          {sessionReset ? (
            <div>{gt("Next 5-hour reset: {reset}", { reset: sessionReset })}</div>
          ) : null}
          {weeklyReset ? (
            <div>{gt("Next weekly reset: {reset}", { reset: weeklyReset })}</div>
          ) : null}
          {exhausted > 0 ? (
            <div>{gt("Accounts with exhausted weekly quota: {count}", { count: exhausted })}</div>
          ) : null}
          <div>{gt("Totals include disabled accounts in this environment.")}</div>
        </TooltipPopup>
      </Tooltip>
    </SidebarMenuItem>
  );
}

const SidebarUtilityMenu = memo(function SidebarUtilityMenu() {
  const navigate = useNavigate();
  const navigateToMainApp = useNavigateToMainApp();
  const gt = useGT();
  const { isMobile, setOpenMobile } = useSidebar();
  const isOnUtilityPage = useLocation({
    select: (location) => isSidebarUtilityPage(location.pathname),
  });
  const pullRequestsSupported = usePullRequestsSupported();
  const issuesSupported = useIssuesSupported();
  const closeMobileSidebar = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };
  const handlePullRequestsClick = () => {
    closeMobileSidebar();
    void navigate({
      to: "/pull-requests",
      search: readPullRequestListPreferences(),
    });
  };
  const handleIssuesClick = () => {
    closeMobileSidebar();
    void navigate({ to: "/issues", search: readIssueListPreferences() });
  };
  const handleSettingsClick = () => {
    closeMobileSidebar();
    void navigate({ to: "/settings" });
  };

  const handleUsageClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigate({ to: "/usage" });
  };

  const handleBackClick = () => {
    closeMobileSidebar();
    void navigateToMainApp();
  };

  return (
    <SidebarMenu className="flex-row items-center">
      {isOnUtilityPage ? (
        <SidebarMenuItem className="min-w-0 flex-1">
          <SidebarMenuButton onClick={handleBackClick}>
            <ArrowLeftIcon />
            <span>
              <T>Back</T>
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ) : (
        <>
          <SidebarUtilityItem
            icon={<SettingsIcon />}
            label={gt("Settings")}
            onClick={handleSettingsClick}
          />
          {pullRequestsSupported ? (
            <SidebarUtilityItem
              icon={<PullRequestGlyph.pullRequest />}
              label={gt("Pull requests")}
              onClick={handlePullRequestsClick}
            />
          ) : null}
          {issuesSupported ? (
            <SidebarUtilityItem
              icon={<IssueGlyph.issue />}
              label={gt("Issues", { $context: "sidebar link to the list of issues" })}
              onClick={handleIssuesClick}
            />
          ) : null}
          <SidebarUtilityItem
            icon={<ChartNoAxesColumnIcon />}
            label={gt("Usage")}
            onClick={handleUsageClick}
          />
        </>
      )}
      <SidebarCodexQuotaTotals />
      <SidebarThreadUndoNotice />
      <SidebarUpdatePill />
    </SidebarMenu>
  );
});

export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  return (
    <SidebarFooter>
      <SidebarProviderUpdatePill />
      <SidebarUpdateArchitectureWarning />
      <SidebarUtilityMenu />
    </SidebarFooter>
  );
});
