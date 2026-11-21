import { ProjectId, ThreadId, type BotProfile } from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { expect, it } from "@effect/vitest";
import * as ServerConfig from "../config.ts";
import * as BotProfiles from "./BotProfiles.ts";

it.effect(
  "serializes profile edits, restores them after restart, and omits disabled bots from turns",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const home = yield* fs.makeTempDirectoryScoped({ prefix: "t3-bot-profiles-" });
      const store = BotProfiles.layer.pipe(Layer.provide(ServerConfig.layerTest(home, home)));
      const bots = yield* Effect.provide(BotProfiles.BotProfiles, store);
      const first: BotProfile = {
        threadId: ThreadId.make("bot:first"),
        projectId: ProjectId.make("first"),
        name: "First",
        accent: "sky",
        pinned: true,
        instructions: "One job",
        memory: "One fact",
        autoCompactWindow: 200_000,
      };
      const second: BotProfile = {
        ...first,
        threadId: ThreadId.make("bot:second"),
        projectId: ProjectId.make("second"),
        name: "Second",
        autoCompactWindow: null,
      };
      expect(yield* Stream.runHead(bots.subscribe())).toEqual(
        Option.some({ enabled: false, bots: [] }),
      );
      yield* Effect.forEach(
        [first, second],
        (bot) =>
          bots.modify((snapshot) =>
            Effect.succeed([undefined, { enabled: true, bots: [...snapshot.bots, bot] }]),
          ),
        { concurrency: "unbounded" },
      );
      const restarted = yield* Effect.provide(BotProfiles.BotProfiles, Layer.fresh(store));
      expect(yield* restarted.getActive(first.threadId)).toEqual(first);
      expect(yield* restarted.getActive(second.threadId)).toEqual(second);
      yield* restarted.modify((snapshot) =>
        Effect.succeed([undefined, { ...snapshot, enabled: false }]),
      );
      expect(yield* restarted.getActive(first.threadId)).toBeUndefined();
      yield* restarted.modify((snapshot) =>
        Effect.succeed([undefined, { ...snapshot, enabled: true }]),
      );
      expect(yield* restarted.getActive(first.threadId)).toEqual(first);
    }).pipe(Effect.provide(NodeServices.layer)),
);
