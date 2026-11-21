import * as Schema from "effect/Schema";
import { ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ModelSelection } from "./modelSelection.ts";

const BOT_ACCENTS = ["sky", "mint", "amber", "rose", "iris", "slate"] as const;
const BotAccent = Schema.Literals(BOT_ACCENTS);
const BotName = TrimmedNonEmptyString.check(Schema.isMaxLength(48));

export const BotAppearance = Schema.Struct({
  shape: Schema.String.check(Schema.isPattern(/^(?:object:)?[a-z0-9][a-z0-9_-]{0,63}$/)),
  color: Schema.String.check(Schema.isPattern(/^(?:[a-z]{1,16}|#[0-9a-f]{6})$/i)),
  definition: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(16_384))),
  picture: Schema.optionalKey(
    Schema.String.check(
      Schema.isMaxLength(131_072),
      Schema.isPattern(/^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/),
    ),
  ),
});
export type BotAppearance = typeof BotAppearance.Type;
export const DEFAULT_BOT_APPEARANCE: BotAppearance = { shape: "t3", color: "violet" };
export const BOT_CREATOR_THREAD_ID = ThreadId.make("bot:creator");

export const BotAvatarDrawingInput = Schema.Struct({
  threadId: ThreadId,
  description: TrimmedNonEmptyString.check(Schema.isMaxLength(200)),
});
export type BotAvatarDrawingInput = typeof BotAvatarDrawingInput.Type;
export const BotAvatarDrawing = Schema.Struct({
  name: TrimmedNonEmptyString.check(Schema.isMaxLength(48)),
  path: Schema.String.check(
    Schema.isMaxLength(8_000),
    Schema.isPattern(/^[Mm][MmLlHhVvCcSsQqTtAaZz0-9,.eE+ \t\r\n-]+$/),
  ),
  x: Schema.Number.check(Schema.isBetween({ minimum: 15, maximum: 85 })),
  y: Schema.Number.check(Schema.isBetween({ minimum: 15, maximum: 85 })),
  spacing: Schema.Number.check(Schema.isBetween({ minimum: 8, maximum: 35 })),
});
export type BotAvatarDrawing = typeof BotAvatarDrawing.Type;

const BotProfileFields = {
  name: BotName,
  accent: BotAccent,
  avatar: Schema.optionalKey(BotAppearance),
  pinned: Schema.Boolean,
  instructions: Schema.String.check(Schema.isMaxLength(2_000)),
  memory: Schema.String.check(Schema.isMaxLength(6_000)),
  autoCompactWindow: Schema.NullOr(
    Schema.Int.check(Schema.isBetween({ minimum: 100_000, maximum: 1_000_000 })),
  ),
};

export const BotProfile = Schema.Struct({
  ...BotProfileFields,
  threadId: ThreadId,
  projectId: ProjectId,
});
export type BotProfile = typeof BotProfile.Type;

export const BotsSnapshot = Schema.Struct({
  enabled: Schema.Boolean,
  bots: Schema.Array(BotProfile),
});
export type BotsSnapshot = typeof BotsSnapshot.Type;

export const BotMutation = Schema.Union([
  Schema.Struct({ type: Schema.Literal("open-creator"), modelSelection: ModelSelection }),
  Schema.Struct({
    type: Schema.Literal("create"),
    ...BotProfileFields,
    id: Schema.String.check(Schema.isUUID()),
    modelSelection: ModelSelection,
  }),
  Schema.Struct({
    type: Schema.Literal("update"),
    ...BotProfileFields,
    threadId: ThreadId,
  }),
  Schema.Struct({ type: Schema.Literal("remove"), threadId: ThreadId }),
  Schema.Struct({
    type: Schema.Literal("move"),
    threadId: ThreadId,
    before: Schema.NullOr(ThreadId),
  }),
]);
export type BotMutation = typeof BotMutation.Type;

export class BotOperationError extends Schema.TaggedError<BotOperationError>()(
  "BotOperationError",
  {
    reason: Schema.Literals(["disabled", "missing", "read", "write", "provision", "draw"]),
  },
) {
  override get message() {
    switch (this.reason) {
      case "disabled":
        return "Bots are disabled on this environment.";
      case "missing":
        return "This bot no longer exists.";
      case "read":
        return "Could not load bots.";
      case "write":
        return "Could not save bots.";
      case "draw":
        return "Could not draw an avatar with this bot’s model.";
      case "provision":
        return "Could not create the bot's project and thread.";
    }
  }
}
