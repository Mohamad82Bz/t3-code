import { useAtomValue } from "@effect/atom-react";
import { useSelectWorkspaceDetail } from "../layout/workspace/useSelectWorkspaceDetail";
import {
  BOT_CREATOR_THREAD_ID,
  DEFAULT_BOT_APPEARANCE,
  type BotAppearance,
  type BotProfile,
  type EnvironmentId,
  type ModelSelection,
  type ServerConfig,
} from "@t3tools/contracts";
import {
  avatarConfig,
  avatarHex,
  objectAvatarGallery,
  resolveBotAppearance,
} from "@t3tools/shared/botAvatars";
import { decodeBotAvatarDefinition } from "@t3tools/shared/botAvatarDefinition";
import { AsyncResult } from "effect/reactivity";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useGT } from "gt-react-native";
import { useState } from "react";
import { Alert, Pressable, Switch, TextInput, View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";
import { ScreenScrollView } from "../../components/ui/ScreenScrollView";
import { buildModelOptions } from "../../lib/modelOptions";
import { uuidv4 } from "../../lib/uuid";
import { botsSnapshotAtom, drawBotAvatar, mutateBot, setBotsEnabled } from "../../state/bots";
import { environmentServerConfigsAtom } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { MobileBotAvatar } from "../home/MobileBotAvatar";
import { SettingsScreen } from "./components/SettingsScreen";

export function SettingsBotsRouteScreen() {
  const gt = useGT();
  const configs = useAtomValue(environmentServerConfigsAtom);
  const servers = [...configs].filter(
    ([, config]) => config.environment.capabilities.bots === true,
  );
  const [target, setTarget] = useState<EnvironmentId | null>(null);
  const selected = servers.find(([id]) => id === target) ?? servers[0];
  return (
    <SettingsScreen title={gt("Bots")}>
      <ScreenScrollView keyboardShouldPersistTaps="handled">
        <View className="gap-4 px-4 py-4">
          {servers.length > 1 ? (
            <View className="flex-row flex-wrap gap-2">
              {servers.map(([id, config]) => (
                <Action
                  key={id}
                  label={config.environment.label}
                  selected={id === selected?.[0]}
                  onPress={() => setTarget(id)}
                />
              ))}
            </View>
          ) : null}
          {selected ? (
            <EnvironmentBots key={selected[0]} environmentId={selected[0]} config={selected[1]} />
          ) : (
            <Text className="text-muted-foreground">
              {gt("Connect to an environment that supports Bots.")}
            </Text>
          )}
        </View>
      </ScreenScrollView>
    </SettingsScreen>
  );
}

function EnvironmentBots({
  environmentId,
  config,
}: {
  environmentId: EnvironmentId;
  config: ServerConfig;
}) {
  const gt = useGT();
  const selectDetail = useSelectWorkspaceDetail();
  const result = useAtomValue(botsSnapshotAtom(environmentId));
  const snapshot = AsyncResult.getOrElse(result, () => null);
  const canToggle = useAtomValue(setBotsEnabled.permissionAtom(environmentId));
  const canEdit = useAtomValue(mutateBot.permissionAtom(environmentId));
  const toggle = useAtomCommand(setBotsEnabled);
  const mutate = useAtomCommand(mutateBot);
  const [editing, setEditing] = useState<BotProfile | "new" | null>(null);
  const models = buildModelOptions(config, null, undefined, null).filter(
    (option) => !option.isUnavailable && !option.isHidden,
  );
  const defaultModel =
    models.find(
      (option) =>
        option.selection.instanceId === config.settings.defaultModelSelection?.instanceId &&
        option.selection.model === config.settings.defaultModelSelection?.model,
    )?.selection ?? models[0]?.selection;
  const open = (bot: BotProfile) =>
    selectDetail({ name: "Thread", params: { environmentId, threadId: bot.threadId } });
  const openCreator = async () => {
    const existing = snapshot?.bots.find((bot) => bot.threadId === BOT_CREATOR_THREAD_ID);
    if (existing) return open(existing);
    if (!defaultModel) return;
    const response = await mutate({
      environmentId,
      input: { type: "open-creator", modelSelection: defaultModel },
    });
    if (response._tag === "Success" && response.value) open(response.value);
  };
  if (!snapshot)
    return (
      <Text className="text-muted-foreground">
        {AsyncResult.isFailure(result) ? gt("Could not load bots.") : gt("Loading bots…")}
      </Text>
    );
  if (editing !== null && canEdit && snapshot.enabled)
    return (
      <EditBot
        bot={editing === "new" ? null : editing}
        environmentId={environmentId}
        models={models}
        defaultModel={defaultModel}
        onClose={() => setEditing(null)}
      />
    );
  const bots = snapshot.bots.filter((bot) => bot.threadId !== BOT_CREATOR_THREAD_ID);
  return (
    <>
      <View className="flex-row items-center justify-between rounded-2xl bg-surface p-4">
        <Text className="text-base font-semibold text-foreground">{gt("Enable Bots")}</Text>
        <Switch
          accessibilityLabel={gt("Enable Bots")}
          disabled={!canToggle}
          value={snapshot.enabled}
          onValueChange={(enabled) => {
            void toggle({ environmentId, input: { enabled } });
          }}
        />
      </View>
      {snapshot.enabled ? (
        <>
          <View className="flex-row gap-2">
            <Action
              label={gt("Bot Creator")}
              disabled={
                !canEdit ||
                (!defaultModel &&
                  !snapshot.bots.some((bot) => bot.threadId === BOT_CREATOR_THREAD_ID))
              }
              onPress={() => void openCreator()}
            />
            <Action
              label={gt("Create bot")}
              disabled={!canEdit}
              onPress={() => setEditing("new")}
            />
          </View>
          {bots.length === 0 ? (
            <Text className="text-muted-foreground">{gt("No bots yet")}</Text>
          ) : (
            bots.map((bot, i) => (
              <View key={bot.threadId} className="gap-2 rounded-2xl bg-surface p-3">
                <View className="flex-row items-center gap-3">
                  <MobileBotAvatar appearance={resolveBotAppearance(bot)} />
                  <Text className="flex-1 text-base font-semibold text-foreground">{bot.name}</Text>
                </View>
                <View className="flex-row flex-wrap gap-2">
                  <Action label={gt("Open chat")} onPress={() => open(bot)} />
                  <Action
                    label={gt("Edit bot")}
                    disabled={!canEdit}
                    onPress={() => setEditing(bot)}
                  />
                  {i > 0 ? (
                    <Action
                      label={gt("Move up")}
                      disabled={!canEdit}
                      onPress={() => {
                        void mutate({
                          environmentId,
                          input: {
                            type: "move",
                            threadId: bot.threadId,
                            before: bots[i - 1]?.threadId ?? null,
                          },
                        });
                      }}
                    />
                  ) : null}
                  {i + 1 < bots.length ? (
                    <Action
                      label={gt("Move down")}
                      disabled={!canEdit}
                      onPress={() => {
                        void mutate({
                          environmentId,
                          input: {
                            type: "move",
                            threadId: bot.threadId,
                            before: bots[i + 2]?.threadId ?? null,
                          },
                        });
                      }}
                    />
                  ) : null}
                </View>
              </View>
            ))
          )}
        </>
      ) : null}
    </>
  );
}

function EditBot({
  bot,
  environmentId,
  models,
  defaultModel,
  onClose,
}: {
  bot: BotProfile | null;
  environmentId: EnvironmentId;
  models: ReturnType<typeof buildModelOptions>;
  defaultModel: ModelSelection | undefined;
  onClose: () => void;
}) {
  const gt = useGT();
  const [name, setName] = useState(bot?.name ?? "");
  const [instructions, setInstructions] = useState(bot?.instructions ?? "");
  const [memory, setMemory] = useState(bot?.memory ?? "");
  const [compact, setCompact] = useState(bot?.autoCompactWindow?.toString() ?? "");
  const [avatar, setAvatar] = useState<BotAppearance>(() =>
    bot ? resolveBotAppearance(bot) : DEFAULT_BOT_APPEARANCE,
  );
  const [pinned, setPinned] = useState(bot?.pinned ?? true);
  const [selection, setSelection] = useState(defaultModel);
  const [avatarJson, setAvatarJson] = useState("");
  const [customColor, setCustomColor] = useState(avatar.color.startsWith("#") ? avatar.color : "");
  const [description, setDescription] = useState("");
  const [drawing, setDrawing] = useState(false);
  const drawAvatar = useAtomCommand(drawBotAvatar);
  const draw = () => {
    if (!bot || drawing || !description.trim()) return;
    setDrawing(true);
    void drawAvatar({ environmentId, input: { threadId: bot.threadId, description } })
      .then((response) => {
        if (response._tag === "Success") setAvatar({ ...response.value, color: avatar.color });
      })
      .catch(() => Alert.alert(gt("Could not draw an avatar with this bot’s model.")))
      .finally(() => setDrawing(false));
  };
  const importAvatar = () => {
    const definition = decodeBotAvatarDefinition(avatarJson);
    if (!definition) {
      Alert.alert(gt("That is not a valid Open Bot Avatar definition."));
      return;
    }
    setAvatar({ shape: "object:" + definition.id, color: avatar.color, definition: avatarJson });
    setAvatarJson("");
  };
  const [chooseAvatar, setChooseAvatar] = useState(false);
  const [chooseModel, setChooseModel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [id] = useState(uuidv4);
  const mutate = useAtomCommand(mutateBot);
  const valid =
    name.trim().length > 0 &&
    /^(?:|[1-9][0-9]{5}|1000000)$/.test(compact) &&
    (bot !== null || selection !== undefined);
  const save = () => {
    if (!valid || saving || (bot === null && selection === undefined)) return;
    setSaving(true);
    const fields = {
      name: name.trim(),
      instructions,
      memory,
      pinned,
      accent: bot?.accent ?? "iris",
      avatar,
      autoCompactWindow: compact === "" ? null : Number(compact),
    } as const;
    void mutate({
      environmentId,
      input: bot
        ? { ...fields, type: "update", threadId: bot.threadId }
        : { ...fields, type: "create", id, modelSelection: selection! },
    })
      .then((result) => {
        if (result._tag === "Success") onClose();
      })
      .catch(() => Alert.alert(gt("Could not load bots.")))
      .finally(() => setSaving(false));
  };
  const upload = () => {
    void pickBotPicture()
      .then((picture) => {
        if (picture) setAvatar({ ...avatar, picture });
      })
      .catch(() => Alert.alert(gt("Could not load this image.")));
  };
  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-3">
        <MobileBotAvatar appearance={avatar} size={56} />
        <Action
          label={gt("Edit avatar")}
          selected={chooseAvatar}
          onPress={() => setChooseAvatar(!chooseAvatar)}
        />
      </View>
      {chooseAvatar ? (
        <View className="gap-3">
          <View className="flex-row flex-wrap gap-2">
            {[
              ...new Set([...avatarConfig.pickerShapes, ...avatarConfig.shapes]),
              ...objectAvatarGallery.map((object) => `object:${object.id}`),
            ].map((shape) => (
              <Pressable
                key={shape}
                accessibilityRole="button"
                accessibilityLabel={shape}
                accessibilityState={{ selected: shape === avatar.shape && !avatar.picture }}
                className={
                  shape === avatar.shape && !avatar.picture
                    ? "items-center justify-center rounded-lg bg-surface p-1"
                    : "items-center justify-center p-1"
                }
                onPress={() => setAvatar({ shape, color: avatar.color })}
              >
                <MobileBotAvatar appearance={{ shape, color: avatar.color }} size={38} />
              </Pressable>
            ))}
          </View>
          <View className="flex-row flex-wrap gap-2">
            {avatarConfig.pickerColors.map(({ id: color, name: label }) => (
              <Pressable
                key={color}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: color === avatar.color }}
                className="h-9 w-9 rounded-full border border-border"
                style={{
                  backgroundColor: avatarHex(color),
                  opacity: color === avatar.color ? 1 : 0.65,
                }}
                onPress={() => setAvatar({ ...avatar, color })}
              />
            ))}
          </View>
          <View className="flex-row gap-2">
            <Action label={gt("Upload")} onPress={() => void upload()} />
            <Action label={gt("Reset")} onPress={() => setAvatar(DEFAULT_BOT_APPEARANCE)} />
          </View>
          <Field
            label={gt("Custom color")}
            value={customColor}
            onChange={(value) => {
              setCustomColor(value);
              if (/^#[0-9a-f]{6}$/i.test(value)) setAvatar({ ...avatar, color: value });
            }}
            maxLength={7}
          />
          <Field
            label={gt("Avatar JSON")}
            value={avatarJson}
            onChange={setAvatarJson}
            maxLength={16384}
            multiline
          />
          <Action
            label={gt("Import an avatar")}
            disabled={!avatarJson.trim()}
            onPress={importAvatar}
          />
          {bot ? (
            <View className="gap-2">
              <Field
                label={gt("Describe the new object")}
                value={description}
                onChange={setDescription}
                maxLength={200}
              />
              <Action
                label={drawing ? gt("Drawing…") : gt("Draw it")}
                disabled={drawing || !description.trim()}
                onPress={() => void draw()}
              />
            </View>
          ) : null}
        </View>
      ) : null}
      <Field label={gt("Name")} value={name} onChange={setName} maxLength={48} />
      {bot === null ? (
        <>
          <Action
            label={
              models.find(
                (option) =>
                  option.selection.model === selection?.model &&
                  option.selection.instanceId === selection?.instanceId,
              )?.label ?? gt("Choose model")
            }
            onPress={() => setChooseModel(!chooseModel)}
          />
          {chooseModel ? (
            <View className="gap-1">
              {models.map((option) => (
                <Action
                  key={option.key}
                  label={option.providerLabel + " / " + option.label}
                  onPress={() => {
                    setSelection(option.selection);
                    setChooseModel(false);
                  }}
                />
              ))}
            </View>
          ) : null}
        </>
      ) : null}
      <Field
        label={gt("Instructions")}
        value={instructions}
        onChange={setInstructions}
        maxLength={2000}
        multiline
      />
      <Field label={gt("Memory")} value={memory} onChange={setMemory} maxLength={6000} multiline />
      <Field
        label={gt("Claude auto-compact window")}
        value={compact}
        onChange={setCompact}
        maxLength={7}
        numeric
      />
      <View className="flex-row items-center justify-between">
        <Text className="text-sm text-foreground">{gt("Pin to launcher")}</Text>
        <Switch
          value={pinned}
          onValueChange={setPinned}
          accessibilityLabel={gt("Pin to launcher")}
        />
      </View>
      <View className="flex-row gap-2">
        <Action label={gt("Cancel")} disabled={saving} onPress={onClose} />
        <Action
          label={gt("Save changes")}
          disabled={!valid || saving}
          selected
          onPress={() => void save()}
        />
      </View>
      {bot ? (
        <Action
          label={gt("Remove bot, keep chat")}
          disabled={saving}
          onPress={() =>
            Alert.alert(gt("Remove bot, keep chat"), undefined, [
              { text: gt("Cancel"), style: "cancel" },
              {
                text: gt("Remove"),
                style: "destructive",
                onPress: () => {
                  void mutate({
                    environmentId,
                    input: { type: "remove", threadId: bot.threadId },
                  }).then((result) => {
                    if (result._tag === "Success") onClose();
                  });
                },
              },
            ])
          }
        />
      ) : null}
    </View>
  );
}

async function pickBotPicture() {
  const selected = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  const uri = selected.assets?.[0]?.uri;
  if (!uri) return null;
  const context = ImageManipulator.ImageManipulator.manipulate(uri);
  try {
    const image = await context.resize({ width: 256 }).renderAsync();
    const result = await image
      .saveAsync({ format: ImageManipulator.SaveFormat.WEBP, compress: 0.8, base64: true })
      .finally(() => image.release());
    if (!result.base64 || result.base64.length > 131_000)
      throw Error("Avatar image exceeds size limit");
    return "data:image/webp;base64," + result.base64;
  } finally {
    context.release();
  }
}

function Action({
  label,
  onPress,
  disabled = false,
  selected = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      className={
        selected
          ? "min-h-11 justify-center rounded-xl bg-accent px-3"
          : "min-h-11 justify-center rounded-xl bg-surface px-3"
      }
    >
      <Text
        className={
          disabled ? "text-sm text-muted-foreground" : "text-sm font-medium text-foreground"
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChange,
  maxLength,
  multiline = false,
  numeric = false,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  maxLength: number;
  multiline?: boolean;
  numeric?: boolean;
}) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        className="min-h-11 rounded-xl border border-border px-3 py-2 text-base text-foreground"
        value={value}
        maxLength={maxLength}
        onChangeText={onChange}
        multiline={multiline}
        keyboardType={numeric ? "number-pad" : "default"}
      />
    </View>
  );
}
