import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { expect, it } from "@effect/vitest";
import { ServerConfigStreamEvent, UsageLimitSourceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientResponse } from "effect/http";

import * as BackgroundPolicy from "../background/BackgroundPolicy.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as UsageLimitSources from "./UsageLimitSources.ts";

const encodeConfigEvent = Schema.encodeSync(ServerConfigStreamEvent);
const decodeStatusBody = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Struct({ disabled: Schema.Boolean })),
);

it.effect(
  "deduplicates concurrent account actions and publishes only confirmed state before refreshing",
  () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const file = {
        id: "runtime",
        name: "physical.json",
        auth_index: "index",
        provider: "codex",
        email: "alice@example.com",
        disabled: true,
      };
      let mutations = 0;
      const http = HttpClient.make((request) =>
        Effect.gen(function* () {
          const path = new URL(request.url).pathname;
          if (path.endsWith("/auth-files"))
            return HttpClientResponse.fromWeb(request, Response.json({ files: [file] }));
          if (path.endsWith("/api-call"))
            return HttpClientResponse.fromWeb(
              request,
              Response.json({ status_code: 401, body: "{}" }),
            );
          if (path.endsWith("/status")) {
            if (request.body._tag !== "Uint8Array") throw new Error("Expected status body");
            file.disabled = decodeStatusBody(new TextDecoder().decode(request.body.body)).disabled;
            mutations++;
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(release);
            return HttpClientResponse.fromWeb(request, Response.json({}));
          }
          throw new Error("Unexpected management request");
        }),
      );
      yield* Effect.gen(function* () {
        const sources = yield* UsageLimitSources.make;
        yield* sources.refresh;
        const input = {
          sourceId: UsageLimitSourceId.make("hub"),
          accountId: "runtime",
          authIndex: "index",
          action: { type: "toggle", expectedDisabled: true },
        } as const;
        const first = yield* sources.accountAction(input).pipe(Effect.forkChild);
        yield* Deferred.await(entered);
        const refresh = yield* sources.refresh.pipe(Effect.forkChild);
        expect((yield* sources.current)[0]?.accounts[0]?.disabled).toBe(true);
        expect((yield* sources.accountAction(input).pipe(Effect.flip)).detail).toContain(
          "already running",
        );
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(first);
        yield* Fiber.join(refresh);
        expect((yield* sources.current)[0]?.accounts[0]?.disabled).toBe(false);
        expect(mutations).toBe(1);
      }).pipe(
        Effect.provide([
          ServerSettings.layerTest({
            usageLimitSources: {
              [UsageLimitSourceId.make("hub")]: {
                kind: "cliproxy",
                url: "http://hub.test",
                managementKey: "test",
                enabled: true,
              },
            },
          }),
          Layer.mock(BackgroundPolicy.BackgroundPolicy)({
            shouldRunScopeWork: () => Effect.succeed(false),
          }),
          Layer.succeed(HttpClient.HttpClient, http),
          NodeCrypto.layer,
        ]),
        Effect.scoped,
      );
    }),
);

it.effect("keeps malformed source URLs encodable for config subscribers", () =>
  Effect.gen(function* () {
    const sources = yield* UsageLimitSources.make;
    yield* sources.refresh;
    const snapshots = yield* sources.current;
    expect(snapshots.map((source) => source.label)).toEqual([
      "local-hub",
      "opaque-hub",
      "Named hub",
      "hub.test:8317",
      "Usage limit source",
    ]);
    expect(() =>
      encodeConfigEvent({
        version: 1,
        type: "usageLimitSourcesUpdated",
        payload: { sources: snapshots },
      }),
    ).not.toThrow();
    expect(snapshots.every((source) => source.error === "No management key configured.")).toBe(
      true,
    );
  }).pipe(
    Effect.provide([
      ServerSettings.layerTest({
        usageLimitSources: {
          [UsageLimitSourceId.make("local-hub")]: {
            kind: "cliproxy",
            url: "localhost:8317",
            managementKey: "",
            enabled: true,
          },
          [UsageLimitSourceId.make("opaque-hub")]: {
            kind: "cliproxy",
            url: "file:///tmp/hub",
            managementKey: "",
            enabled: true,
          },
          [UsageLimitSourceId.make("named-hub")]: {
            kind: "cliproxy",
            url: "localhost:8317",
            label: "Named hub",
            managementKey: "",
            enabled: true,
          },
          [UsageLimitSourceId.make("valid-hub")]: {
            kind: "cliproxy",
            url: "https://hub.test:8317",
            managementKey: "",
            enabled: true,
          },
          [UsageLimitSourceId.make(" ")]: {
            kind: "cliproxy",
            url: "localhost:8317",
            managementKey: "",
            enabled: true,
          },
        },
      }),
      Layer.mock(BackgroundPolicy.BackgroundPolicy)({
        shouldRunScopeWork: () => Effect.succeed(false),
      }),
      Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make(() => Effect.die("Unexpected network request")),
      ),
      NodeCrypto.layer,
    ]),
    Effect.scoped,
  ),
);
