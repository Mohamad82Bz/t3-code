import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { describe, expect, it } from "@effect/vitest";
import { UsageLimitSourceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";
import { HttpClient, HttpClientResponse } from "effect/http";

import { makeCliproxyApi } from "./cliproxyApi.ts";

const config = {
  kind: "cliproxy",
  url: "http://manager.test:18317",
  inferenceUrl: "http://inference.test:8317",
  managementKey: "management-secret",
  inferenceKey: "client-secret",
  enabled: true,
} as const;
const input = {
  sourceId: UsageLimitSourceId.make("hub"),
  accountId: "runtime-a",
  authIndex: "index-a",
  action: { type: "startQuota" },
} as const;
const Body = Schema.Struct({
  name: Schema.optional(Schema.String),
  disabled: Schema.optional(Schema.Boolean),
  prefix: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  messages: Schema.optional(Schema.Unknown),
  stream: Schema.optional(Schema.Boolean),
  auth_index: Schema.optional(Schema.String),
  cpamp_physical_name: Schema.optional(Schema.String),
  cpamp_runtime_id: Schema.optional(Schema.String),
  cpamp_account_id: Schema.optional(Schema.String),
  cpamp_account_snapshot: Schema.optional(Schema.String),
});
const decodeBody = Schema.decodeUnknownSync(Schema.fromJsonString(Body));
const decodeIdentity = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown));

function fixture(
  options: {
    disabled?: boolean;
    prefix?: string;
    inferenceStatus?: number;
    neverRespond?: boolean;
    duplicatePrefix?: boolean;
    lostPrefixResponse?: boolean;
    failRestore?: boolean;
    lostEnableResponse?: boolean;
  } = {},
) {
  const file = {
    id: "runtime-a",
    name: "physical-a.json",
    auth_index: "index-a",
    provider: "codex",
    email: "alice@example.com",
    disabled: options.disabled ?? true,
    id_token: { chatgpt_account_id: "account-a" },
  };
  let prefix = options.prefix ?? "";
  let lostPrefix = options.lostPrefixResponse ?? false;
  let lostEnable = options.lostEnableResponse ?? false;
  const requests: Array<{ path: string; method: string; body: typeof Body.Type | undefined }> = [];
  const statuses: boolean[] = [];
  const http = HttpClient.make((request) => {
    const url = new URL(request.url);
    const path = url.pathname;
    const body =
      request.body._tag === "Uint8Array"
        ? decodeBody(new TextDecoder().decode(request.body.body))
        : undefined;
    requests.push({ path, method: request.method, body });
    if (path === "/v1/chat/completions") {
      expect(url.origin).toBe("http://inference.test:8317");
      expect(request.headers.authorization).toBe("Bearer client-secret");
      expect(file.disabled).toBe(false);
      expect(body).toEqual({
        model: `${prefix}/gpt-6-luna`,
        messages: [{ role: "user", content: "say ok" }],
        stream: false,
      });
      if (options.neverRespond) return Effect.never;
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          Response.json(
            { choices: [{ message: { content: "ok" } }] },
            { status: options.inferenceStatus ?? 200 },
          ),
        ),
      );
    }
    expect(url.origin).toBe("http://manager.test:18317");
    expect(request.headers.authorization).toBe("Bearer management-secret");
    let response: unknown = {};
    let status = 200;
    if (path.endsWith("/auth-files")) {
      response = {
        files: [
          file,
          ...(options.duplicatePrefix
            ? [{ ...file, id: "other", name: "other.json", auth_index: "other", disabled: true }]
            : []),
        ],
      };
    } else if (path.endsWith("/download")) {
      response = { prefix: url.searchParams.get("name") === file.name ? prefix : "a" };
    } else if (path.endsWith("/fields")) {
      expect(request.method).toBe("PATCH");
      expect(body?.name).toBe("runtime-a");
      expect(
        decodeIdentity(decodeURIComponent(request.headers["x-cpamp-auth-file-mutation-identity"]!)),
      ).toEqual([
        {
          name: "physical-a.json",
          runtimeId: "runtime-a",
          authIndex: "index-a",
          provider: "codex",
          accountId: "account-a",
          accountSnapshot: "alice@example.com",
        },
      ]);
      prefix = body!.prefix!;
      if (lostPrefix && prefix) {
        lostPrefix = false;
        status = 503;
      }
    } else if (path.endsWith("/status")) {
      expect(request.method).toBe("PATCH");
      expect(body).toMatchObject({
        name: "runtime-a",
        auth_index: "index-a",
        cpamp_physical_name: "physical-a.json",
        cpamp_runtime_id: "runtime-a",
        cpamp_account_id: "account-a",
        cpamp_account_snapshot: "alice@example.com",
      });
      if (options.failRestore && body!.disabled) status = 503;
      else {
        file.disabled = body!.disabled!;
        statuses.push(file.disabled);
        if (lostEnable && !file.disabled) {
          lostEnable = false;
          status = 503;
        }
      }
    } else if (path.endsWith("/api-keys")) response = { "api-keys": ["client-secret"] };
    else throw new Error(`Unexpected path: ${path}`);
    return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(response, { status })));
  });
  return {
    file,
    get prefix() {
      return prefix;
    },
    requests,
    statuses,
    api: makeCliproxyApi.pipe(
      Effect.provideService(HttpClient.HttpClient, http),
      Effect.provide(NodeCrypto.layer),
    ),
  };
}

describe("CPA credential actions", () => {
  it.effect.each(["", "existing"])(
    'starts the exact mod request and restores a disabled credential with prefix "%s"',
    (prefix) =>
      Effect.gen(function* () {
        const test = fixture({ prefix });
        const api = yield* test.api;
        expect((yield* api.accountAction(config, input)).message).toContain("Quota started");
        expect(test.statuses).toEqual([false, true]);
        expect(test.file.disabled).toBe(true);
        expect(test.prefix).toBe(prefix);
        expect(
          test.requests
            .filter((request) => request.path.endsWith("/fields"))
            .map((request) => request.body?.prefix),
        ).toEqual(prefix ? [] : ["a", ""]);
      }),
  );
  it.effect.each(["", "existing"])(
    'restores state after failed inference with prefix "%s"',
    (prefix) =>
      Effect.gen(function* () {
        const test = fixture({ prefix, inferenceStatus: 500 });
        const api = yield* test.api;
        const error = yield* api.accountAction(config, input).pipe(Effect.flip);
        expect(error.detail).toContain("inference failed");
        expect(error.detail).not.toContain("secret");
        expect(test.statuses).toEqual([false, true]);
        expect(test.prefix).toBe(prefix);
      }),
  );
  it.effect("keeps an originally enabled credential enabled", () =>
    Effect.gen(function* () {
      const test = fixture({ disabled: false });
      const api = yield* test.api;
      yield* api.accountAction(config, input);
      expect(test.statuses).toEqual([]);
      expect(test.file.disabled).toBe(false);
      expect(test.prefix).toBe("");
    }),
  );
  it.effect("cleans up even when CPA applied the prefix but lost its response", () =>
    Effect.gen(function* () {
      const test = fixture({ lostPrefixResponse: true });
      const api = yield* test.api;
      yield* api.accountAction(config, input).pipe(Effect.flip);
      expect(test.prefix).toBe("");
      expect(test.file.disabled).toBe(true);
      expect(test.requests.some((request) => request.path.endsWith("/chat/completions"))).toBe(
        false,
      );
    }),
  );
  it.effect("re-disables a credential after an uncertain enable response", () =>
    Effect.gen(function* () {
      const test = fixture({ lostEnableResponse: true });
      const api = yield* test.api;
      yield* api.accountAction(config, input).pipe(Effect.flip);
      expect(test.statuses).toEqual([false, true]);
      expect(test.prefix).toBe("");
    }),
  );
  it.effect("rejects a duplicate prefix held by another disabled credential before mutation", () =>
    Effect.gen(function* () {
      const test = fixture({ duplicatePrefix: true, prefix: "a" });
      const api = yield* test.api;
      expect((yield* api.accountAction(config, input).pipe(Effect.flip)).detail).toContain(
        "not unique",
      );
      expect(test.requests.every((request) => request.method === "GET")).toBe(true);
    }),
  );
  it.effect("reports failed restoration and still clears the temporary prefix", () =>
    Effect.gen(function* () {
      const test = fixture({ failRestore: true });
      const api = yield* test.api;
      expect((yield* api.accountAction(config, input).pipe(Effect.flip)).detail).toContain(
        "could not restore",
      );
      expect(test.prefix).toBe("");
      expect(
        test.requests.filter(
          (request) => request.path.endsWith("/status") && request.body?.disabled,
        ),
      ).toHaveLength(3);
    }),
  );
  it.effect("restores after the 90-second inference timeout", () =>
    Effect.gen(function* () {
      const test = fixture({ neverRespond: true });
      const api = yield* test.api;
      const pending = yield* api
        .accountAction(config, input)
        .pipe(Effect.flip, Effect.forkChild({ startImmediately: true }));
      yield* TestClock.adjust("90 seconds");
      expect((yield* Fiber.join(pending)).detail).toContain("inference failed");
      expect(test.file.disabled).toBe(true);
      expect(test.prefix).toBe("");
    }),
  );
  it.effect("uses a client key from CPA when no inference key is configured", () =>
    Effect.gen(function* () {
      const test = fixture();
      const api = yield* test.api;
      const { inferenceKey: _key, ...withoutKey } = config;
      yield* api.accountAction(withoutKey, input);
      expect(test.requests.some((request) => request.path.endsWith("/api-keys"))).toBe(true);
    }),
  );
  it.effect("toggles both directions and refuses stale state or identity", () =>
    Effect.gen(function* () {
      const test = fixture();
      const api = yield* test.api;
      const toggle = (expectedDisabled: boolean) =>
        api.accountAction(config, { ...input, action: { type: "toggle", expectedDisabled } });
      yield* toggle(true);
      expect(test.file.disabled).toBe(false);
      const mutations = test.statuses.length;
      expect((yield* toggle(true).pipe(Effect.flip)).detail).toContain("state changed");
      expect(test.statuses.length).toBe(mutations);
      yield* toggle(false);
      expect(test.file.disabled).toBe(true);
      expect(
        (yield* api
          .accountAction(config, {
            ...input,
            accountId: "replaced",
            action: { type: "toggle", expectedDisabled: true },
          })
          .pipe(Effect.flip)).detail,
      ).toContain("changed");
      expect(test.statuses).toEqual([false, true]);
    }),
  );
});
