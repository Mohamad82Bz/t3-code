import { DEFAULT_BOT_APPEARANCE, type BotAppearance } from "@t3tools/contracts";
import { avatarHex, avatarSilhouettePath, objectAvatarGallery } from "@t3tools/shared/botAvatars";
import { decodeBotAvatarDefinition } from "@t3tools/shared/botAvatarDefinition";
import { Image } from "expo-image";
import Svg, { Defs, Ellipse, LinearGradient, Path, Stop } from "react-native-svg";

const objects = new Map(objectAvatarGallery.map((avatar) => [`object:${avatar.id}`, avatar]));

export function MobileBotAvatar({
  appearance = DEFAULT_BOT_APPEARANCE,
  size = 36,
  working = false,
}: {
  appearance?: BotAppearance;
  size?: number;
  working?: boolean;
}) {
  if (appearance.picture)
    return (
      <Image
        source={appearance.picture}
        accessibilityIgnoresInvertColors
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  const object =
    objects.get(appearance.shape) ??
    (appearance.definition ? decodeBotAvatarDefinition(appearance.definition) : undefined);
  const eyes = object?.eyes ?? { x: 50, y: 47, spacing: 21, scale: 1.25 };
  const t3 = appearance.shape === "t3";
  const fill = avatarHex(appearance.color);
  const eye =
    parseInt(fill.slice(1, 3), 16) +
      parseInt(fill.slice(3, 5), 16) +
      parseInt(fill.slice(5, 7), 16) >
    500
      ? "#111827"
      : "#fff";
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessible={false}>
      {t3 ? (
        <Defs>
          <LinearGradient id="sky" x1="8%" y1="0%" x2="86%" y2="100%">
            <Stop offset="0" stopColor="#07152f" />
            <Stop offset="0.5" stopColor="#151443" />
            <Stop offset="1" stopColor="#6048bf" />
          </LinearGradient>
        </Defs>
      ) : null}
      <Path
        d={object?.body.path ?? avatarSilhouettePath(appearance.shape)}
        fill={t3 ? "url(#sky)" : fill}
      />
      <Ellipse
        cx={eyes.x - eyes.spacing / 2}
        cy={eyes.y}
        rx={(working ? 5 : 3.6) * eyes.scale}
        ry={(working ? 4 : 8) * eyes.scale}
        fill={t3 ? "#fff" : eye}
      />
      <Ellipse
        cx={eyes.x + eyes.spacing / 2}
        cy={eyes.y}
        rx={(working ? 5 : 3.6) * eyes.scale}
        ry={(working ? 4 : 8) * eyes.scale}
        fill={t3 ? "#fff" : eye}
      />
    </Svg>
  );
}
