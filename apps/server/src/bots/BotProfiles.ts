import {
  BotOperationError,
  BotsSnapshot,
  type BotProfile,
  type ThreadId,
} from "@t3tools/contracts";
import { writeFileStringAtomically } from "@t3tools/shared/atomicWrite";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as ServerConfig from "../config.ts";

const BotsFile = Schema.fromJsonString(BotsSnapshot);
const decodeBotsFile = Schema.decodeEffect(BotsFile);
const encodeBotsFile = Schema.encodeEffect(BotsFile);

export class BotProfiles extends Context.Service<
  BotProfiles,
  {
    readonly subscribe: () => Stream.Stream<BotsSnapshot, BotOperationError>;
    readonly getActive: (
      threadId: ThreadId,
    ) => Effect.Effect<BotProfile | undefined, BotOperationError>;
    readonly modify: <A>(
      change: (
        snapshot: BotsSnapshot,
      ) => Effect.Effect<readonly [A, BotsSnapshot], BotOperationError>,
    ) => Effect.Effect<A, BotOperationError>;
  }
>()("t3/bots/BotProfiles") {}

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { stateDir } = yield* ServerConfig.ServerConfig;
  const mutex = yield* Semaphore.make(1);
  const filePath = path.join(stateDir, "bots.json");

  const load = yield* Effect.cached(
    Effect.gen(function* () {
      const snapshot = (yield* fs.exists(filePath))
        ? yield* decodeBotsFile(yield* fs.readFileString(filePath))
        : { enabled: false, bots: [] };
      return yield* SubscriptionRef.make<BotsSnapshot>(snapshot);
    }).pipe(Effect.mapError(() => new BotOperationError({ reason: "read" }))),
  );

  const save = Effect.fn("BotProfiles.save")(
    function* (ref: SubscriptionRef.SubscriptionRef<BotsSnapshot>, next: BotsSnapshot) {
      const contents = yield* encodeBotsFile(next);
      yield* writeFileStringAtomically({ filePath, contents: `${contents}\n` }).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
      );
      yield* SubscriptionRef.set(ref, next);
    },
    Effect.mapError(() => new BotOperationError({ reason: "write" })),
  );

  const getActive = Effect.fn("BotProfiles.getActive")(function* (threadId: ThreadId) {
    const ref = yield* load;
    const snapshot = yield* SubscriptionRef.get(ref);
    return snapshot.enabled ? snapshot.bots.find((bot) => bot.threadId === threadId) : undefined;
  });

  const modify: BotProfiles["Service"]["modify"] = Effect.fn("BotProfiles.modify")(
    function* (change) {
      const ref = yield* load;
      const previous = yield* SubscriptionRef.get(ref);
      const [result, next] = yield* change(previous);
      if (next !== previous) yield* save(ref, next);
      return result;
    },
    mutex.withPermits(1),
    Effect.uninterruptible,
  );

  return BotProfiles.of({
    subscribe: () => Stream.unwrap(Effect.map(load, SubscriptionRef.changes)),
    getActive,
    modify,
  });
});

export const layer = Layer.effect(BotProfiles, make);
