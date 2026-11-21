import {
  BotOperationError,
  type BotAppearance,
  type BotAvatarDrawingInput,
  BOT_CREATOR_THREAD_ID,
  DEFAULT_BOT_APPEARANCE,
  type BotsSnapshot,
  CommandId,
  ProjectId,
  ThreadId,
  type BotMutation,
  type BotProfile,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as TextGeneration from "../textGeneration/TextGeneration.ts";
import * as Path from "effect/Path";
import type * as Stream from "effect/Stream";
import * as ServerConfig from "../config.ts";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import * as Projects from "../project/ProjectService.ts";

import * as BotProfiles from "./BotProfiles.ts";
import { CREATOR_INSTRUCTIONS } from "./BotCreator.ts";

const encodeObject = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

export class BotService extends Context.Service<
  BotService,
  {
    readonly subscribe: () => Stream.Stream<BotsSnapshot, BotOperationError>;
    readonly drawAvatar: (
      input: BotAvatarDrawingInput,
    ) => Effect.Effect<BotAppearance, BotOperationError>;
    readonly setEnabled: (enabled: boolean) => Effect.Effect<void, BotOperationError>;
    readonly mutate: (input: BotMutation) => Effect.Effect<BotProfile | null, BotOperationError>;
  }
>()("t3/bots/BotService") {}

const make = Effect.gen(function* () {
  const path = yield* Path.Path;
  const { stateDir } = yield* ServerConfig.ServerConfig;
  const projects = yield* Projects.ProjectService;
  const threads = yield* ThreadManagement.ThreadManagementService;
  const profiles = yield* BotProfiles.BotProfiles;
  const text = yield* TextGeneration.TextGeneration;
  const random = yield* SecureRandom.SecureRandom;
  const drawAvatar = Effect.fn("BotService.drawAvatar")(function* (input: BotAvatarDrawingInput) {
    const bot = yield* profiles.getActive(input.threadId);
    if (!bot) return yield* new BotOperationError({ reason: "missing" });
    const failed = () => new BotOperationError({ reason: "draw" });
    const thread = yield* threads.getThreadShell(input.threadId).pipe(Effect.mapError(failed));
    const project = yield* projects.getById(bot.projectId).pipe(Effect.mapError(failed));
    if (!thread || thread.deletedAt !== null || Option.isNone(project) || !text.generateBotAvatar)
      return yield* failed();
    const drawing = yield* text
      .generateBotAvatar({
        description: input.description,
        cwd: project.value.workspaceRoot,
        projectId: bot.projectId,
        modelSelection: thread.modelSelection,
      })
      .pipe(Effect.mapError(failed));
    const id = "drawn-" + (yield* random.uuidV4()).replaceAll("-", "");
    const definition = yield* encodeObject({
      version: 1,
      id,
      name: drawing.name,
      body: { path: drawing.path },
      eyes: { x: drawing.x, y: drawing.y, spacing: drawing.spacing, scale: 1 },
    }).pipe(Effect.mapError(failed));
    return {
      shape: "object:" + id,
      color: bot.avatar?.color ?? DEFAULT_BOT_APPEARANCE.color,
      definition,
    };
  });

  const setEnabled = Effect.fn("BotService.setEnabled")(function* (enabled: boolean) {
    return yield* profiles.modify((previous) =>
      Effect.succeed([
        undefined,
        previous.enabled === enabled ? previous : { ...previous, enabled },
      ]),
    );
  });

  const provision = Effect.fn("BotService.provision")(
    function* (
      id: string,
      modelSelection: Extract<BotMutation, { type: "create" }>["modelSelection"],
      profile: BotProfile,
    ) {
      const { projectId, threadId } = profile;
      yield* projects.create({
        commandId: CommandId.make(`bot-project:${id}`),
        projectId,
        title: profile.name,
        workspaceRoot: path.join(stateDir, "bot-workspaces", id),
        createWorkspaceRootIfMissing: true,
      });
      const existingThread = yield* threads.getThreadShell(threadId);
      if (existingThread?.projectId === projectId && existingThread.deletedAt === null) return;
      yield* threads.dispatch({
        type: "thread.create",
        commandId: CommandId.make(`bot-thread:${id}`),
        projectId,
        threadId,
        title: profile.name,
        modelSelection,
        runtimeMode: "approval-required",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        createdBy: "user",
        creationSource: "web",
      });
    },
    Effect.tapError((cause) =>
      Effect.logWarning("Bot project or thread provisioning failed", cause),
    ),
    Effect.mapError(() => new BotOperationError({ reason: "provision" })),
  );

  const mutate = Effect.fn("BotService.mutate")(function* (input: BotMutation) {
    return yield* profiles.modify<BotProfile | null>((previous) =>
      Effect.gen(function* () {
        if (!previous.enabled) return yield* new BotOperationError({ reason: "disabled" });
        if (input.type === "open-creator") {
          const existing = previous.bots.find((bot) => bot.threadId === BOT_CREATOR_THREAD_ID);
          if (existing !== undefined) return [existing, previous] as const;
          const profile: BotProfile = {
            threadId: BOT_CREATOR_THREAD_ID,
            projectId: ProjectId.make(BOT_CREATOR_THREAD_ID),
            name: "Bot Creator",
            accent: "iris",
            avatar: DEFAULT_BOT_APPEARANCE,
            pinned: false,
            instructions: CREATOR_INSTRUCTIONS,
            memory: "",
            autoCompactWindow: null,
          };
          yield* provision("creator", input.modelSelection, profile);
          return [profile, { ...previous, bots: [...previous.bots, profile] }] as const;
        }
        const threadId =
          input.type === "create" ? ThreadId.make("bot:" + input.id) : input.threadId;
        const existing = previous.bots.find((bot) => bot.threadId === threadId);
        if (input.type === "remove" && threadId === BOT_CREATOR_THREAD_ID)
          return yield* new BotOperationError({ reason: "disabled" });
        if (input.type === "remove") {
          return [
            null,
            existing === undefined
              ? previous
              : { ...previous, bots: previous.bots.filter((bot) => bot !== existing) },
          ] as const;
        }
        if (input.type === "move") {
          if (existing === undefined) return yield* new BotOperationError({ reason: "missing" });
          if (input.before === threadId) return [existing, previous] as const;
          const bots = previous.bots.filter((bot) => bot !== existing);
          const index =
            input.before === null
              ? bots.length
              : bots.findIndex((bot) => bot.threadId === input.before);
          if (index < 0) return yield* new BotOperationError({ reason: "missing" });
          bots.splice(index, 0, existing);
          return [existing, { ...previous, bots }] as const;
        }
        const { name, accent, avatar, pinned, instructions, memory, autoCompactWindow } = input;
        const fields = {
          name,
          accent,
          ...(avatar === undefined ? {} : { avatar }),
          pinned,
          instructions,
          memory,
          autoCompactWindow,
        };
        if (input.type === "create") {
          if (existing !== undefined) return [existing, previous] as const;
          const profile = { threadId, projectId: ProjectId.make("bot:" + input.id), ...fields };
          yield* provision(input.id, input.modelSelection, profile);
          return [profile, { ...previous, bots: [...previous.bots, profile] }] as const;
        }
        if (existing === undefined) return yield* new BotOperationError({ reason: "missing" });
        const profile = { ...existing, ...fields };
        return [
          profile,
          { ...previous, bots: previous.bots.map((bot) => (bot === existing ? profile : bot)) },
        ] as const;
      }),
    );
  });

  return BotService.of({ subscribe: profiles.subscribe, setEnabled, mutate, drawAvatar });
});

export const layer = Layer.effect(BotService, make);
