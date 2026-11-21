import {
  BotOperationError,
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
import * as Path from "effect/Path";
import type * as Stream from "effect/Stream";
import * as ServerConfig from "../config.ts";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import * as Projects from "../project/ProjectService.ts";

import * as BotProfiles from "./BotProfiles.ts";

export class BotService extends Context.Service<
  BotService,
  {
    readonly subscribe: () => Stream.Stream<BotsSnapshot, BotOperationError>;
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

  const setEnabled = Effect.fn("BotService.setEnabled")(function* (enabled: boolean) {
    return yield* profiles.modify((previous) =>
      Effect.succeed([
        undefined,
        previous.enabled === enabled ? previous : { ...previous, enabled },
      ]),
    );
  });

  const provision = Effect.fn("BotService.provision")(
    function* (input: Extract<BotMutation, { type: "create" }>, profile: BotProfile) {
      const { projectId, threadId } = profile;
      yield* projects.create({
        commandId: CommandId.make(`bot-project:${input.id}`),
        projectId,
        title: profile.name,
        workspaceRoot: path.join(stateDir, "bot-workspaces", input.id),
        createWorkspaceRootIfMissing: true,
      });
      const existingThread = yield* threads.getThreadShell(threadId);
      if (existingThread?.projectId === projectId && existingThread.deletedAt === null) return;
      yield* threads.dispatch({
        type: "thread.create",
        commandId: CommandId.make(`bot-thread:${input.id}`),
        projectId,
        threadId,
        title: profile.name,
        modelSelection: input.modelSelection,
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
        const threadId =
          input.type === "create" ? ThreadId.make("bot:" + input.id) : input.threadId;
        const existing = previous.bots.find((bot) => bot.threadId === threadId);
        if (input.type === "remove") {
          return [
            null,
            existing === undefined
              ? previous
              : { ...previous, bots: previous.bots.filter((bot) => bot !== existing) },
          ] as const;
        }
        const { name, accent, pinned, instructions, memory, autoCompactWindow } = input;
        const fields = { name, accent, pinned, instructions, memory, autoCompactWindow };
        if (input.type === "create") {
          if (existing !== undefined) return [existing, previous] as const;
          const profile = { threadId, projectId: ProjectId.make("bot:" + input.id), ...fields };
          yield* provision(input, profile);
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

  return BotService.of({ subscribe: profiles.subscribe, setEnabled, mutate });
});

export const layer = Layer.effect(BotService, make);
