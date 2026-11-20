import { type SessionCost, type ThreadId, UsageReadError } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import { BUILT_IN_USAGE_DRIVERS } from "../provider/builtInDrivers.ts";
import * as UsageService from "./UsageService.ts";

export class SessionCostService extends Context.Service<
  SessionCostService,
  { readonly read: (threadId: ThreadId) => Effect.Effect<SessionCost, UsageReadError> }
>()("t3/usage/SessionCostService") {}

const make = Effect.gen(function* () {
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const usage = yield* UsageService.UsageService;
  const read = Effect.fn("SessionCostService.read")(function* (threadId: ThreadId) {
    const { providerThreads, attempts, runs } = yield* projections
      .getThreadRecords(threadId, ["providerThreads", "attempts", "runs"])
      .pipe(
        Effect.mapError(
          (cause) =>
            new UsageReadError({
              reason: "scanFailed",
              detail: "Thread usage could not be read.",
              cause,
            }),
        ),
      );
    const running = runs.some((run) =>
      ["preparing", "queued", "starting", "running", "waiting"].includes(run.status),
    );
    const sessions: UsageService.SessionUsageInput["sessions"][number][] = [];
    let unsupported = false;
    for (const thread of providerThreads) {
      const reader = BUILT_IN_USAGE_DRIVERS.find(
        (driver) => driver.driverKind === thread.driver,
      )?.usage;
      if (reader?.kind !== "transcripts") {
        unsupported = true;
        continue;
      }
      const nativeIds = new Set([
        ...(thread.nativeThreadRef?.nativeId == null ? [] : [thread.nativeThreadRef.nativeId]),
        ...attempts
          .filter(
            (attempt) =>
              attempt.providerThreadId === thread.id && attempt.nativeThreadId !== undefined,
          )
          .map((attempt) => attempt.nativeThreadId!),
      ]);
      for (const sessionId of nativeIds)
        sessions.push({
          provider: reader.provider,
          instanceId: thread.providerInstanceId,
          sessionId,
        });
    }
    if (unsupported)
      return {
        status: "failed",
        costUsd: null,
        running,
        records: 0,
        unpricedModels: [],
        message: "This provider does not expose attributable session usage yet.",
      } satisfies SessionCost;
    if (sessions.length === 0)
      return {
        status: running ? "calculating" : runs.length === 0 ? "ready" : "failed",
        costUsd: runs.length === 0 && !running ? 0 : null,
        running,
        records: 0,
        unpricedModels: [],
        message: "Waiting for the provider's session usage.",
      } satisfies SessionCost;
    return yield* usage.readSessionCost({ sessions, running });
  });
  return { read };
});

export const layer = Layer.effect(SessionCostService, make);
