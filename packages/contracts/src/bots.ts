import * as Schema from "effect/Schema";
import { ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ModelSelection } from "./modelSelection.ts";

export const BOT_ACCENTS = ["sky", "mint", "amber", "rose", "iris", "slate"] as const;
const BotAccent = Schema.Literals(BOT_ACCENTS);
const BotName = TrimmedNonEmptyString.check(Schema.isMaxLength(48));
const BotProfileFields = {
  name: BotName,
  accent: BotAccent,
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
]);
export type BotMutation = typeof BotMutation.Type;

export class BotOperationError extends Schema.TaggedError<BotOperationError>()(
  "BotOperationError",
  {
    reason: Schema.Literals(["disabled", "missing", "read", "write", "provision"]),
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
      case "provision":
        return "Could not create the bot's project and thread.";
    }
  }
}
