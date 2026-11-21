import {
  BOT_CREATOR_THREAD_ID,
  DEFAULT_BOT_APPEARANCE,
  OrchestratorMcpFailure,
  ThreadId,
  TrimmedNonEmptyString,
} from "@t3tools/contracts";
import { McpSchema, Tool, Toolkit } from "effect/ai";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as BotProfiles from "../../bots/BotProfiles.ts";
import * as BotService from "../../bots/BotService.ts";
import * as Threads from "../../orchestration-v2/ThreadManagementService.ts";
import * as Invocation from "../McpInvocationContext.ts";
import * as Access from "../McpToolAccess.ts";

const Profile = Schema.Struct({
  threadId: ThreadId,
  name: Schema.String,
  instructions: Schema.String,
});
const CreatorRead = Tool.make("t3_bot_read", {
  description:
    "Bot Creator only: read the live name and instructions of a created bot by its thread id.",
  parameters: Schema.Struct({ threadId: ThreadId }),
  success: Profile,
  failure: OrchestratorMcpFailure,
  dependencies: [
    Invocation.McpInvocationContext,
    BotProfiles.BotProfiles,
    Threads.ThreadManagementService,
  ],
})
  .annotate(Tool.Readonly, true)
  .annotate(McpSchema.EnabledWhen, Invocation.hiddenFromOutsideClients);
const CreatorCreate = Tool.make("t3_bot_create", {
  description:
    "Bot Creator only: when the owner clearly asked to create a bot, save one focused profile using this thread’s provider and model. Does not send a message or start a routine. Read it back with t3_bot_read.",
  parameters: Schema.Struct({
    name: TrimmedNonEmptyString.check(Schema.isMaxLength(48)),
    instructions: TrimmedNonEmptyString.check(Schema.isMaxLength(2_000)),
  }),
  success: Profile,
  failure: OrchestratorMcpFailure,
  dependencies: [
    Invocation.McpInvocationContext,
    BotProfiles.BotProfiles,
    BotService.BotService,
    Threads.ThreadManagementService,
    SecureRandom.SecureRandom,
  ],
})
  .annotate(Tool.Destructive, false)
  .annotate(Tool.OpenWorld, false)
  .annotate(McpSchema.EnabledWhen, Invocation.hiddenFromOutsideClients);

export const BotToolkit = Toolkit.make(CreatorRead, CreatorCreate);

const deny = (message: string) =>
  new OrchestratorMcpFailure({ code: "capability_denied", message });
const failed = () =>
  new OrchestratorMcpFailure({
    code: "orchestration_error",
    message: "Could not load or save the bot profile.",
  });
const requireCreator = Effect.fn("BotToolkit.requireCreator")(function* () {
  const scope = yield* Invocation.McpInvocationContext;
  if (scope.thread?.threadId !== BOT_CREATOR_THREAD_ID)
    return yield* deny("This tool is reserved for Bot Creator.");
  const profiles = yield* BotProfiles.BotProfiles;
  if (!(yield* profiles.getActive(BOT_CREATOR_THREAD_ID).pipe(Effect.mapError(failed))))
    return yield* deny("Bots are disabled on this environment.");
  return profiles;
});
const handlers = {
  t3_bot_read: Access.actsAsCaller((input) =>
    Effect.gen(function* () {
      const profiles = yield* requireCreator();
      const bot = yield* profiles.getActive(input.threadId).pipe(Effect.mapError(failed));
      if (!bot) return yield* failed();
      return { threadId: bot.threadId, name: bot.name, instructions: bot.instructions };
    }),
  ),
  t3_bot_create: Access.actsAsCaller((input) =>
    Effect.gen(function* () {
      yield* requireCreator();
      const threads = yield* Threads.ThreadManagementService;
      const creator = yield* threads
        .getThreadShell(BOT_CREATOR_THREAD_ID)
        .pipe(Effect.mapError(failed));
      if (!creator) return yield* failed();
      const random = yield* SecureRandom.SecureRandom;
      const bots = yield* BotService.BotService;
      const bot = yield* bots
        .mutate({
          type: "create",
          id: yield* random.uuidV4(),
          modelSelection: creator.modelSelection,
          name: input.name,
          instructions: input.instructions,
          avatar: DEFAULT_BOT_APPEARANCE,
          accent: "iris",
          pinned: false,
          memory: "",
          autoCompactWindow: null,
        })
        .pipe(Effect.mapError(failed));
      if (!bot) return yield* failed();
      return { threadId: bot.threadId, name: bot.name, instructions: bot.instructions };
    }),
  ),
} satisfies Access.Handlers<typeof BotToolkit.tools>;

export const layer = Access.toLayer(BotToolkit, handlers);
