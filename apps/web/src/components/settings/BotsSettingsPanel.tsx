import { useAtomValue } from "@effect/atom-react";
import {
  BOT_ACCENTS,
  DEFAULT_SERVER_SETTINGS,
  type BotProfile,
  type EnvironmentId,
} from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { randomUUID } from "../../lib/utils";
import type { ModelSelection } from "@t3tools/contracts";
import { pickModelSelection } from "@t3tools/shared/model";
import { Link, useNavigate } from "@tanstack/react-router";
import { AsyncResult } from "effect/reactivity";
import { T, useGT } from "gt-react";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import { useId, useState } from "react";
import { mergeEnvironmentSettings, useClientSettings } from "../../hooks/useSettings";
import { getCustomModelOptionsByInstance } from "../../modelSelection";
import { providerInstanceEntriesFor } from "../../providerInstances";
import { botsSnapshotAtom, mutateBot, setBotsEnabled } from "../../state/bots";
import { useEnvironmentProviders, type EnvironmentPresentation } from "../../state/environments";
import { EMPTY_SERVER_PROVIDERS } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { buildThreadRouteParams } from "../../threadRoutes";
import { BotAvatar } from "../chat/BotAvatar";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { useSettingsScope } from "./SettingsScopeContext";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import { useScopedModelDisabledReason } from "./useScopedModelAvailability";

export function BotsSettingsPanel() {
  const { environment } = useSettingsScope();
  return (
    <SettingsPageContainer>
      {environment?.serverConfig?.environment.capabilities.bots === true ? (
        <EnvironmentBots key={environment.environmentId} environment={environment} />
      ) : (
        <p className="text-sm text-muted-foreground">
          <T>Connect to an environment that supports Bots.</T>
        </p>
      )}
    </SettingsPageContainer>
  );
}

function EnvironmentBots({ environment }: { environment: EnvironmentPresentation }) {
  const gt = useGT();
  const { environmentId } = environment;
  const result = useAtomValue(botsSnapshotAtom(environmentId));
  const snapshot = AsyncResult.getOrElse(result, () => null);
  const canToggle = useAtomValue(setBotsEnabled.permissionAtom(environmentId));
  const canMutate = useAtomValue(mutateBot.permissionAtom(environmentId));
  const toggle = useAtomCommand(setBotsEnabled);
  const [toggling, setToggling] = useState(false);
  const [editing, setEditing] = useState<"new" | BotProfile | null>(null);
  const pinned = snapshot?.bots.filter((bot) => bot.pinned).slice(0, 6) ?? [];
  const changeEnabled = async (enabled: boolean) => {
    setToggling(true);
    try {
      await toggle({ environmentId, input: { enabled } });
    } finally {
      setToggling(false);
    }
  };
  return (
    <>
      <SettingsSection title={gt("Bots")}>
        <SettingsRow
          id="enable-bots"
          title={gt("Enable Bots")}
          description={gt(
            "Show the bot launcher on this environment. Turning it off keeps your bots, projects, and threads.",
          )}
          control={
            <Switch
              checked={snapshot?.enabled ?? false}
              disabled={snapshot === null || toggling || !canToggle}
              aria-label={gt("Enable Bots")}
              onCheckedChange={(value) => void changeEnabled(value)}
            />
          }
        />
      </SettingsSection>
      {snapshot === null ? (
        <p className="px-3 text-sm text-muted-foreground" role="status">
          {AsyncResult.isFailure(result) ? gt("Could not load bots.") : gt("Loading bots…")}
        </p>
      ) : null}
      {snapshot?.enabled ? (
        <SettingsSection
          title={gt("Bot roster")}
          headerAction={
            <Button size="sm" disabled={!canMutate} onClick={() => setEditing("new")}>
              <PlusIcon />
              {gt("Create bot")}
            </Button>
          }
        >
          {snapshot.bots.length === 0 ? (
            <SettingsRow
              title={gt("No bots yet")}
              description={gt(
                "Create a bot to give it a dedicated chat and workspace on this environment.",
              )}
            />
          ) : (
            snapshot.bots.map((bot) => (
              <SettingsRow
                key={bot.threadId}
                id={bot.threadId}
                title={
                  <span className="flex items-center gap-2.5">
                    <BotAvatar {...bot} />
                    {bot.name}
                  </span>
                }
                description={pinned.includes(bot) ? gt("Pinned to launcher") : undefined}
                control={
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!canMutate}
                      onClick={() => setEditing(bot)}
                    >
                      {gt("Edit bot")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      render={
                        <Link
                          to="/$environmentId/$threadId"
                          params={buildThreadRouteParams(
                            scopeThreadRef(environmentId, bot.threadId),
                          )}
                        />
                      }
                    >
                      {gt("Open chat")} <ChevronRightIcon />
                    </Button>
                  </div>
                }
              />
            ))
          )}
        </SettingsSection>
      ) : null}
      {editing !== null && snapshot?.enabled && canMutate ? (
        <BotProfileEditor
          environmentId={environmentId}
          bot={editing === "new" ? null : editing}
          canPin={pinned.length < 6 || (editing !== "new" && pinned.includes(editing))}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function BotProfileEditor({
  environmentId,
  bot,
  canPin,
  onClose,
}: {
  environmentId: EnvironmentId;
  bot: BotProfile | null;
  canPin: boolean;
  onClose: () => void;
}) {
  const gt = useGT();
  const navigate = useNavigate();
  const inputId = useId();
  const { target } = useSettingsScope();
  const settings = mergeEnvironmentSettings(
    target?.settings ?? DEFAULT_SERVER_SETTINGS,
    useClientSettings(),
  );
  const providers = useEnvironmentProviders().get(environmentId) ?? EMPTY_SERVER_PROVIDERS;
  const entries = providerInstanceEntriesFor(providers, settings, null);
  const modelDisabledReason = useScopedModelDisabledReason(settings, entries);
  const [name, setName] = useState(bot?.name ?? "");
  const [accent, setAccent] = useState<BotProfile["accent"]>(bot?.accent ?? "sky");
  const [instructions, setInstructions] = useState(bot?.instructions ?? "");
  const [memory, setMemory] = useState(bot?.memory ?? "");
  const [compact, setCompact] = useState(bot?.autoCompactWindow?.toString() ?? "");
  const validCompact = /^(?:|[1-9]d{5}|1000000)$/.test(compact);
  const [pinned, setPinned] = useState(bot?.pinned ?? canPin);
  const [selection, setSelection] = useState<ModelSelection | null>(settings.defaultModelSelection);
  const [id] = useState(randomUUID);
  const [busy, setBusy] = useState(false);
  const mutate = useAtomCommand(mutateBot);
  const options = getCustomModelOptionsByInstance(
    settings,
    providers,
    selection?.instanceId,
    selection?.model,
  );
  const defaultOption = entries.flatMap((entry) =>
    !entry.enabled || !entry.isAvailable
      ? []
      : (options.get(entry.instanceId) ?? []).flatMap((model) =>
          model.isUnavailable || modelDisabledReason(entry.instanceId, model.slug) !== null
            ? []
            : [{ instanceId: entry.instanceId, model: model.slug }],
        ),
  )[0];
  const modelSelection =
    selection ??
    (defaultOption === undefined
      ? null
      : pickModelSelection(null, defaultOption.instanceId, defaultOption.model));
  const modelUnavailable =
    modelSelection === null ||
    modelDisabledReason(modelSelection.instanceId, modelSelection.model) !== null;
  const save = async () => {
    const trimmed = name.trim();
    if (
      !trimmed ||
      busy ||
      !validCompact ||
      (bot === null && (modelSelection === null || modelUnavailable))
    )
      return;
    setBusy(true);
    try {
      const profileFields = {
        name: trimmed,
        accent,
        pinned,
        instructions: instructions.trim(),
        memory: memory.trim(),
        autoCompactWindow: compact === "" ? null : Number(compact),
      };
      const result = await mutate({
        environmentId,
        input:
          bot !== null
            ? { type: "update", threadId: bot.threadId, ...profileFields }
            : { type: "create", id, modelSelection: modelSelection!, ...profileFields },
      });
      if (result._tag === "Success") onClose();
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (bot === null || busy) return;
    setBusy(true);
    try {
      const result = await mutate({
        environmentId,
        input: { type: "remove", threadId: bot.threadId },
      });
      if (result._tag === "Success") onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{bot === null ? gt("Create bot") : gt("Edit bot")}</DialogTitle>
          <DialogDescription>
            {bot === null
              ? gt(
                  "A bot starts with an empty T3 chat. No model request runs until you send a message.",
                )
              : gt(
                  "Set this bot’s standing instructions, memory, and launcher preferences. To change its model, open the chat.",
                )}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="flex max-h-[55dvh] flex-col gap-4 overflow-y-auto px-5 py-2">
            <div className="space-y-2">
              <label htmlFor={inputId} className="text-sm font-medium">
                <T>Name</T>
              </label>
              <Input
                id={inputId}
                value={name}
                maxLength={48}
                onChange={(event) => setName(event.currentTarget.value)}
                required
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                <T>Avatar color</T>
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {BOT_ACCENTS.map((value) => (
                  <Button
                    key={value}
                    type="button"
                    variant={accent === value ? "outline" : "ghost"}
                    size="icon-lg"
                    aria-label={botAccentLabel(value, gt)}
                    aria-pressed={accent === value}
                    onClick={() => setAccent(value)}
                  >
                    <BotAvatar name={name || "B"} accent={value} />
                  </Button>
                ))}
              </div>
            </fieldset>
            {bot === null ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  <T>Model</T>
                </span>
                {modelSelection === null ? (
                  <span className="text-sm text-muted-foreground">
                    <T>No providers available</T>
                  </span>
                ) : (
                  <ProviderModelPicker
                    environmentId={environmentId}
                    activeInstanceId={modelSelection.instanceId}
                    model={modelSelection.model}
                    lockedProvider={null}
                    instanceEntries={entries}
                    modelOptionsByInstance={options}
                    getModelDisabledReason={modelDisabledReason}
                    onOpenProviderSetup={(instanceId) =>
                      void navigate({
                        to: "/settings/providers",
                        search: { environmentId, instanceId },
                      })
                    }
                    onInstanceModelChange={(instanceId, model) =>
                      setSelection(pickModelSelection(modelSelection, instanceId, model))
                    }
                  />
                )}
              </div>
            ) : null}
            <div className="space-y-2">
              <label htmlFor={`${inputId}-instructions`} className="text-sm font-medium">
                <T>Instructions</T>
              </label>
              <Textarea
                id={`${inputId}-instructions`}
                value={instructions}
                maxLength={2000}
                rows={3}
                onChange={(event) => setInstructions(event.currentTarget.value)}
                placeholder={gt("Give this bot one job and say what it should leave to others.")}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor={`${inputId}-memory`} className="text-sm font-medium">
                <T>Memory</T>
              </label>
              <Textarea
                id={`${inputId}-memory`}
                value={memory}
                maxLength={6000}
                rows={3}
                onChange={(event) => setMemory(event.currentTarget.value)}
                placeholder={gt("Facts and preferences to carry into future conversations.")}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor={`${inputId}-compact`} className="text-sm font-medium">
                <T>Claude auto-compact window</T>
              </label>
              <Input
                id={`${inputId}-compact`}
                value={compact}
                maxLength={7}
                inputMode="numeric"
                aria-invalid={!validCompact}
                onChange={(event) => setCompact(event.currentTarget.value)}
                placeholder={gt("Use provider setting")}
              />
              <p className="text-xs text-muted-foreground">
                <T>
                  Optional. Enter 100,000 to 1,000,000 tokens without commas. Applies only to
                  Claude; other providers keep their own settings.
                </T>
              </p>
            </div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`${inputId}-pin`} className="text-sm font-medium">
                <T>Pin to launcher</T>
              </label>
              <Switch
                id={`${inputId}-pin`}
                checked={pinned}
                disabled={!canPin && !pinned}
                onCheckedChange={setPinned}
              />
            </div>
          </div>
          <DialogFooter>
            {bot !== null ? (
              <div className="me-auto">
                <Button type="button" variant="ghost" disabled={busy} onClick={() => void remove()}>
                  {gt("Remove bot, keep chat")}
                </Button>
              </div>
            ) : null}
            <Button
              type="submit"
              disabled={!name.trim() || busy || !validCompact || (bot === null && modelUnavailable)}
            >
              {bot === null ? gt("Create bot") : gt("Save changes")}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

function botAccentLabel(accent: BotProfile["accent"], gt: ReturnType<typeof useGT>) {
  switch (accent) {
    case "sky":
      return gt("Sky blue");
    case "mint":
      return gt("Mint green");
    case "amber":
      return gt("Amber");
    case "rose":
      return gt("Rose");
    case "iris":
      return gt("Indigo");
    case "slate":
      return gt("Slate");
  }
}
