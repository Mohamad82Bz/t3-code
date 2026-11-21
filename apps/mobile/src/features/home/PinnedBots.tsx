import { BOT_CREATOR_THREAD_ID, type BotProfile } from "@t3tools/contracts";
import {
  type EnvironmentThreadShell,
  threadRuntimeIsActive,
} from "@t3tools/client-runtime/state/models";
import { resolveBotAppearance } from "@t3tools/shared/botAvatars";
import { useGT } from "gt-react-native";
import { Pressable, View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";
import { scopedThreadKey } from "../../lib/scopedEntities";
import { MobileBotAvatar } from "./MobileBotAvatar";

export function PinnedBots({
  bots,
  selectedThreadKey,
  onOpen,
  onSettings,
}: {
  bots: readonly { bot: BotProfile; thread: EnvironmentThreadShell }[];
  selectedThreadKey: string | null;
  onOpen: (thread: EnvironmentThreadShell) => void;
  onSettings: () => void;
}) {
  const gt = useGT();
  return (
    <View className="mb-3 gap-2 rounded-2xl bg-surface px-3 py-2">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-foreground">{gt("Bots")}</Text>
        <Pressable
          accessibilityRole="button"
          className="min-h-11 justify-center px-2"
          onPress={onSettings}
        >
          <Text className="text-sm font-medium text-foreground">{gt("All bots")}</Text>
        </Pressable>
      </View>
      {bots.map(({ bot, thread }) => {
        const working = threadRuntimeIsActive(thread.runtime);
        const pending = thread.hasPendingApprovals
          ? gt("Needs approval")
          : thread.hasPendingUserInput
            ? gt("Has a question")
            : working
              ? gt("Working")
              : null;
        const key = scopedThreadKey(thread.environmentId, thread.id);
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityState={{ selected: selectedThreadKey === key }}
            onPress={() => onOpen(thread)}
            className="min-h-11 flex-row items-center gap-3 rounded-xl px-2 py-1"
          >
            <MobileBotAvatar appearance={resolveBotAppearance(bot)} size={32} working={working} />
            <Text numberOfLines={1} className="flex-1 text-sm font-semibold text-foreground">
              {bot.threadId === BOT_CREATOR_THREAD_ID ? gt("Bot Creator") : bot.name}
            </Text>
            {pending ? <Text className="text-xs text-muted-foreground">{pending}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
