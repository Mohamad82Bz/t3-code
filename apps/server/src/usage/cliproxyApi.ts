import {
  ProviderDriverKind,
  UsageLimitSourceError,
  type ProviderConsumeResetCreditResult,
  type UsageLimitSourceAccount,
  type UsageLimitSourceConfig,
  type UsageLimitSourceAccountActionInput,
  type UsageLimitSourceAccountActionResult,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { identifyCliproxyAccounts } from "@t3tools/shared/cliproxyAccounts";
import * as Hex from "effect/encoding/Hex";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientError, HttpClientRequest, HttpClientResponse } from "effect/http";

import { codexPlanLabel } from "../provider/CodexProvider.ts";
import { codexRateLimitsToLimits } from "../provider/codexUsageLimits.ts";
import { claudeUsageResponseToLimits } from "../provider/claudeUsageLimits.ts";
import { makeUnavailableUsageLimits } from "@t3tools/provider-core/server/usageLimits";

const AuthFile = Schema.Struct({
  id: Schema.String,
  auth_index: Schema.String,
  provider: Schema.String,
  email: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
  account: Schema.optional(Schema.String),
  label: Schema.optional(Schema.String),
  comment: Schema.optional(Schema.String),
  note: Schema.optional(Schema.String),
  metadata: Schema.optional(
    Schema.Struct({
      comment: Schema.optional(Schema.String),
      note: Schema.optional(Schema.String),
    }),
  ),
  chatgpt_account_id: Schema.optional(Schema.String),
  account_id: Schema.optional(Schema.String),
  runtime_only: Schema.optional(Schema.Boolean),
  disabled: Schema.optional(Schema.Boolean),
  id_token: Schema.optional(
    Schema.Struct({
      chatgpt_account_id: Schema.optional(Schema.String),
      chatgpt_plan_type: Schema.optional(Schema.String),
    }),
  ),
});
const AuthFiles = Schema.Struct({ files: Schema.Array(AuthFile) });
const ApiResponse = Schema.Struct({ status_code: Schema.Number, body: Schema.String });
const CodexWindow = Schema.Struct({
  used_percent: Schema.Number,
  reset_at: Schema.optional(Schema.NullOr(Schema.Number)),
  limit_window_seconds: Schema.optional(Schema.Number),
});
const CodexUsage = Schema.Struct({
  plan_type: Schema.optional(Schema.String),
  rate_limit: Schema.NullOr(
    Schema.Struct({
      primary_window: Schema.optional(Schema.NullOr(CodexWindow)),
      secondary_window: Schema.optional(Schema.NullOr(CodexWindow)),
    }),
  ),
});
const ClaudeWindow = Schema.Struct({
  utilization: Schema.Number,
  resets_at: Schema.NullOr(Schema.String),
});
const ClaudeUsage = Schema.Struct({
  five_hour: Schema.optional(Schema.NullOr(ClaudeWindow)),
  seven_day: Schema.optional(Schema.NullOr(ClaudeWindow)),
  limits: Schema.optional(
    Schema.Array(
      Schema.Struct({
        kind: Schema.String,
        percent: Schema.optional(Schema.NullOr(Schema.Number)),
        resets_at: Schema.optional(Schema.NullOr(Schema.String)),
        scope: Schema.optional(
          Schema.NullOr(
            Schema.Struct({
              model: Schema.optional(Schema.NullOr(Schema.Struct({ display_name: Schema.String }))),
            }),
          ),
        ),
      }),
    ),
  ),
});
const CreditList = Schema.Struct({
  credits: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      status: Schema.String,
      reset_type: Schema.String,
      expires_at: Schema.String,
    }),
  ),
});

const decodeAuthDocument = Schema.decodeUnknownEffect(
  Schema.Struct({ prefix: Schema.optional(Schema.String) }),
);
const decodeClientKeys = Schema.decodeUnknownEffect(
  Schema.Struct({ "api-keys": Schema.Array(Schema.String) }),
);
const decodeInferenceResponse = Schema.decodeUnknownEffect(
  Schema.Struct({
    choices: Schema.NonEmptyArray(
      Schema.Struct({ message: Schema.Record(Schema.String, Schema.Unknown) }),
    ),
  }),
);
const decodeAuthFiles = Schema.decodeUnknownEffect(AuthFiles);
const encodeJson = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));
const decodeApiResponse = Schema.decodeUnknownEffect(ApiResponse);
const decodeCreditList = Schema.decodeUnknownEffect(Schema.fromJsonString(CreditList));
const decodeClaudeUsage = Schema.decodeUnknownEffect(Schema.fromJsonString(ClaudeUsage));
const decodeCodexUsage = Schema.decodeUnknownEffect(Schema.fromJsonString(CodexUsage));
const isUsageLimitSourceError = Schema.is(UsageLimitSourceError);

// Codes that mean the certificate chain is not trusted, which an extra CA can fix. Expired or
// mismatched certificates are reported by code only.
const UNTRUSTED_CERTIFICATE_CODES = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

/** The Node error code under a failed fetch, which wraps it in a generic `TypeError`. */
const nodeErrorCode = (cause: unknown) => {
  for (let error = cause, depth = 0; error instanceof Error && depth < 3; depth += 1) {
    const code = (error as { readonly code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z0-9_]{1,64}$/.test(code)) return code;
    error = error.cause;
  }
  return undefined;
};

// Hub responses and nested error messages can carry keys or tokens, so only the failure's kind,
// HTTP status, or Node error code reaches the client.
const describeManagementFailure = (error: unknown) => {
  if (Cause.isTimeoutError(error)) return "The hub did not answer within 15 seconds.";
  if (HttpClientError.isHttpClientError(error)) {
    const reason = error.reason;
    if (reason._tag === "StatusCodeError") {
      return `The hub answered with HTTP ${reason.response.status}.`;
    }
    const code = reason._tag === "TransportError" ? nodeErrorCode(reason.cause) : undefined;
    if (code !== undefined && UNTRUSTED_CERTIFICATE_CODES.has(code)) {
      return `The hub's TLS certificate is not trusted (${code}). If it comes from a private CA, add that CA to NODE_EXTRA_CA_CERTS.`;
    }
    if (code !== undefined) return `The hub request failed (${code}).`;
  }
  return "The hub management request failed.";
};
const decodeConsumeResponse = Schema.decodeUnknownEffect(
  Schema.fromJsonString(
    Schema.Struct({
      code: Schema.Literals(["reset", "nothing_to_reset", "no_credit", "already_redeemed"]),
    }),
  ),
);

const CODEX_BASE = "https://chatgpt.com/backend-api/wham";
const CREDIT_URL = `${CODEX_BASE}/rate-limit-reset-credits`;

const CREDIT_REDEEM_NAMESPACE = new Uint8Array([
  0x6f, 0x1c, 0x2a, 0x9e, 0x2d, 0x4b, 0x4c, 0x1e, 0x9a, 0x7f, 0x3b, 0x8d, 0x5e, 0x0c, 0x1a, 0x42,
]);

// UUIDv5 per account and credit also deduplicates retries across T3 environments.
const creditRedeemRequestId = Effect.fn("CliproxyApi.creditRedeemRequestId")(function* (
  accountId: string,
  creditId: string,
) {
  const crypto = yield* Crypto.Crypto;
  const name = new TextEncoder().encode(`${accountId}:${creditId}`);
  const input = new Uint8Array(CREDIT_REDEEM_NAMESPACE.length + name.length);
  input.set(CREDIT_REDEEM_NAMESPACE);
  input.set(name, CREDIT_REDEEM_NAMESPACE.length);
  const bytes = (yield* crypto.digest("SHA-1", input).pipe(Effect.orDie)).slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Hex.encode(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
});

export const makeCliproxyApi = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient;
  const crypto = yield* Crypto.Crypto;

  const management = Effect.fn("CliproxyApi.management")(function* (
    config: UsageLimitSourceConfig,
    path: string,
    body?: unknown,
    options?: { readonly method?: "PATCH"; readonly headers?: Readonly<Record<string, string>> },
  ) {
    const url = yield* Effect.try({
      try: () =>
        new URL(
          `v0/management/${path}`,
          config.url.endsWith("/") ? config.url : `${config.url}/`,
        ).toString(),
      catch: () => new UsageLimitSourceError({ detail: "The hub URL is not valid." }),
    });
    const request = (
      options?.method === "PATCH"
        ? HttpClientRequest.patch(url)
        : body === undefined
          ? HttpClientRequest.get(url)
          : HttpClientRequest.post(url)
    ).pipe(
      HttpClientRequest.setHeader("Authorization", `Bearer ${config.managementKey}`),
      HttpClientRequest.setHeaders(options?.headers ?? {}),
    );
    const response = yield* client
      .execute(body === undefined ? request : request.pipe(HttpClientRequest.bodyJsonUnsafe(body)))
      .pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap((response) => response.json),
        Effect.timeout("15 seconds"),
        Effect.mapError(
          (error) => new UsageLimitSourceError({ detail: describeManagementFailure(error) }),
        ),
      );
    return response;
  });

  const authFiles = Effect.fn("CliproxyApi.authFiles")(function* (config: UsageLimitSourceConfig) {
    const response = yield* management(config, "auth-files");
    return (yield* decodeAuthFiles(response)).files;
  });

  const apiCall = Effect.fn("CliproxyApi.apiCall")(function* (
    config: UsageLimitSourceConfig,
    account: typeof AuthFile.Type,
    url: string,
    data?: unknown,
  ) {
    const header =
      account.provider === "codex"
        ? {
            Authorization: "Bearer $TOKEN$",
            "Content-Type": "application/json",
            "OpenAI-Beta": "codex-1",
            Originator: "Codex Desktop",
            ...(account.id_token?.chatgpt_account_id
              ? { "Chatgpt-Account-Id": account.id_token.chatgpt_account_id }
              : {}),
          }
        : { Authorization: "Bearer $TOKEN$", "anthropic-beta": "oauth-2025-04-20" };
    const raw = yield* management(config, "api-call", {
      auth_index: account.auth_index,
      method: data === undefined ? "GET" : "POST",
      url,
      header,
      ...(data === undefined ? {} : { data: yield* encodeJson(data) }),
    });
    const response = yield* decodeApiResponse(raw);
    if (response.status_code < 200 || response.status_code >= 300) {
      return yield* new UsageLimitSourceError({
        detail: `The provider refused the hub request (HTTP ${response.status_code}).`,
      });
    }
    return response.body;
  });

  const credits = Effect.fn("CliproxyApi.credits")(function* (
    config: UsageLimitSourceConfig,
    account: typeof AuthFile.Type,
  ) {
    const body = yield* apiCall(config, account, CREDIT_URL);
    const response = yield* decodeCreditList(body);
    const now = DateTime.toEpochMillis(yield* DateTime.now);
    return response.credits
      .filter(
        (credit) =>
          credit.reset_type === "codex_rate_limits" &&
          credit.status === "available" &&
          Date.parse(credit.expires_at) > now,
      )
      .toSorted((a, b) => Date.parse(a.expires_at) - Date.parse(b.expires_at));
  });

  const readAccount = Effect.fn("CliproxyApi.readAccount")(function* (
    config: UsageLimitSourceConfig,
    account: typeof AuthFile.Type,
  ) {
    const checkedAt = DateTime.formatIso(yield* DateTime.now);
    const base = {
      id: account.id,
      driver: ProviderDriverKind.make(account.provider === "codex" ? "codex" : "claudeAgent"),
      ...(account.email ? { email: account.email } : {}),
      ...(account.provider === "codex"
        ? {
            disabled: account.disabled ?? false,
            authIndex: account.auth_index,
            canManage: Boolean(
              account.name && !account.runtime_only && typeof account.disabled === "boolean",
            ),
          }
        : {}),
      ...(account.id_token?.chatgpt_account_id?.trim()
        ? { workspaceId: account.id_token.chatgpt_account_id.trim() }
        : {}),
    };
    const read = Effect.gen(function* () {
      if (account.provider === "claude") {
        const body = yield* apiCall(config, account, "https://api.anthropic.com/api/oauth/usage");
        const usage = yield* decodeClaudeUsage(body);
        const model_scoped = (usage.limits ?? []).flatMap((limit) =>
          limit.kind === "weekly_scoped" && limit.scope?.model && typeof limit.percent === "number"
            ? [
                {
                  display_name: limit.scope.model.display_name,
                  utilization: limit.percent,
                  resets_at: limit.resets_at ?? null,
                },
              ]
            : [],
        );
        return {
          ...base,
          plan: "Claude Subscription",
          usageLimits: claudeUsageResponseToLimits({
            checkedAt,
            response: {
              rate_limits_available: true,
              rate_limits: {
                five_hour: usage.five_hour ?? null,
                seven_day: usage.seven_day ?? null,
                model_scoped,
              },
            },
          }).limits,
        };
      }
      const body = yield* apiCall(config, account, `${CODEX_BASE}/usage`);
      const usage = yield* decodeCodexUsage(body);
      const toWindow = (window: typeof CodexWindow.Type | null | undefined) =>
        window
          ? {
              usedPercent: window.used_percent,
              resetsAt: window.reset_at ?? null,
              ...(window.limit_window_seconds === undefined
                ? {}
                : { windowDurationMins: window.limit_window_seconds / 60 }),
            }
          : null;
      const available = yield* credits(config, account).pipe(Effect.orElseSucceed(() => undefined));
      const next = available?.[0];
      return {
        ...base,
        plan: codexPlanLabel(usage.plan_type ?? account.id_token?.chatgpt_plan_type),
        usageLimits: {
          ...codexRateLimitsToLimits({
            checkedAt,
            snapshot: {
              planType: usage.plan_type ?? null,
              primary: toWindow(usage.rate_limit?.primary_window),
              secondary: toWindow(usage.rate_limit?.secondary_window),
            },
          }),
          ...(available
            ? {
                resetCredits: {
                  availableCount: available.length,
                  ...(next
                    ? {
                        nextCreditId: next.id,
                        nextExpiresAt: DateTime.formatIso(DateTime.makeUnsafe(next.expires_at)),
                      }
                    : {}),
                },
              }
            : {}),
        },
      };
    });
    return yield* read.pipe(
      Effect.orElseSucceed(() => ({
        ...base,
        usageLimits: makeUnavailableUsageLimits({
          checkedAt,
          reason: "probeFailed",
          message: "The hub could not read this account's usage.",
        }),
      })),
    );
  });

  const readAccounts = Effect.fn("CliproxyApi.readAccounts")(function* (
    config: UsageLimitSourceConfig,
  ): Effect.fn.Return<ReadonlyArray<UsageLimitSourceAccount>, UsageLimitSourceError> {
    const accounts = yield* authFiles(config).pipe(
      Effect.mapError((error) =>
        isUsageLimitSourceError(error)
          ? error
          : new UsageLimitSourceError({ detail: "The hub could not list accounts." }),
      ),
    );
    const codex = identifyCliproxyAccounts(
      accounts.filter((account) => account.provider === "codex"),
    );
    const visible = [
      ...codex,
      ...accounts.filter((account) => account.provider === "claude" && !account.disabled),
    ];
    return yield* Effect.forEach(
      visible,
      (account) =>
        readAccount(config, account).pipe(
          Effect.map((result) => {
            const identity = codex.find((entry) => entry.id === account.id);
            return identity
              ? { ...result, identifier: identity.identifier, commented: identity.commented }
              : result;
          }),
        ),
      { concurrency: 4 },
    );
  });

  const consume = Effect.fn("CliproxyApi.consume")(function* (
    config: UsageLimitSourceConfig,
    accountId: string,
    creditId: string,
  ): Effect.fn.Return<ProviderConsumeResetCreditResult, UsageLimitSourceError> {
    const operation = Effect.gen(function* () {
      const account = (yield* authFiles(config)).find((account) => account.id === accountId);
      if (!account || account.disabled || account.provider !== "codex") {
        return yield* new UsageLimitSourceError({
          detail: "The Codex hub account is missing or disabled.",
        });
      }
      const body = yield* apiCall(config, account, `${CREDIT_URL}/consume`, {
        redeem_request_id: yield* creditRedeemRequestId(
          account.id_token?.chatgpt_account_id ?? account.id,
          creditId,
        ).pipe(Effect.provideService(Crypto.Crypto, crypto)),
        credit_id: creditId,
      });
      const response = yield* decodeConsumeResponse(body);
      const outcome = (
        {
          reset: "reset",
          nothing_to_reset: "nothingToReset",
          no_credit: "noCredit",
          already_redeemed: "alreadyRedeemed",
        } as const
      )[response.code];
      if (outcome !== "reset" && outcome !== "alreadyRedeemed") return { outcome };
      const cleared = yield* management(config, "reset-quota", {
        auth_index: account.auth_index,
      }).pipe(Effect.result);
      return {
        outcome,
        ...(cleared._tag === "Failure"
          ? {
              warning:
                "Credit redeemed, but the hub cooldown could not be cleared. Routing may resume after its cooldown expires.",
            }
          : {}),
      } as const;
    });
    return yield* operation.pipe(
      Effect.mapError((error) =>
        isUsageLimitSourceError(error)
          ? error
          : new UsageLimitSourceError({
              detail: "The hub returned an unexpected reset-credit response.",
            }),
      ),
    );
  });
  const accountAction = Effect.fn("CliproxyApi.accountAction")(function* (
    config: UsageLimitSourceConfig,
    input: UsageLimitSourceAccountActionInput,
  ): Effect.fn.Return<UsageLimitSourceAccountActionResult, UsageLimitSourceError> {
    const operation = Effect.gen(function* () {
      const files = yield* authFiles(config);
      const findTarget = (entries: readonly (typeof AuthFile.Type)[]) =>
        Effect.gen(function* () {
          const matches = entries.filter((entry) => entry.auth_index === input.authIndex);
          const file = matches[0];
          if (
            matches.length !== 1 ||
            !file ||
            file.id !== input.accountId ||
            file.provider !== "codex" ||
            file.runtime_only ||
            !file.name ||
            typeof file.disabled !== "boolean"
          ) {
            return yield* new UsageLimitSourceError({
              detail:
                "The Codex credential changed or cannot be managed safely. Refresh and try again.",
            });
          }
          return file;
        });
      const file = yield* findTarget(files);
      const accountId = (entry: typeof AuthFile.Type) =>
        entry.id_token?.chatgpt_account_id ?? entry.chatgpt_account_id ?? entry.account_id ?? "";
      const snapshot = (entry: typeof AuthFile.Type) => entry.account || entry.email || "";
      const currentTarget = Effect.gen(function* () {
        const current = yield* findTarget(yield* authFiles(config));
        if (
          current.name !== file.name ||
          accountId(current) !== accountId(file) ||
          snapshot(current) !== snapshot(file)
        ) {
          return yield* new UsageLimitSourceError({
            detail: "The Codex credential identity changed. Refresh and try again.",
          });
        }
        return current;
      });
      const setDisabled = (expectedDisabled: boolean) =>
        Effect.gen(function* () {
          const current = yield* currentTarget;
          if (current.disabled !== expectedDisabled) {
            return yield* new UsageLimitSourceError({
              detail: "The credential state changed. Refresh and try again.",
            });
          }
          yield* management(
            config,
            "auth-files/status",
            {
              name: file.id,
              disabled: !expectedDisabled,
              auth_index: file.auth_index,
              cpamp_physical_name: file.name,
              cpamp_runtime_id: file.id,
              cpamp_provider: "codex",
              ...(accountId(file) ? { cpamp_account_id: accountId(file) } : {}),
              ...(snapshot(file) ? { cpamp_account_snapshot: snapshot(file) } : {}),
            },
            { method: "PATCH" },
          );
          if ((yield* currentTarget).disabled !== !expectedDisabled) {
            return yield* new UsageLimitSourceError({
              detail: "CPA did not confirm the credential status. Refresh to check.",
            });
          }
        });
      if (input.action.type === "toggle") {
        yield* setDisabled(input.action.expectedDisabled);
        return {
          message: input.action.expectedDisabled ? "Credential enabled." : "Credential disabled.",
        };
      }

      const document = (entry: typeof AuthFile.Type) =>
        Effect.gen(function* () {
          if (!entry.name)
            return yield* new UsageLimitSourceError({
              detail: "A Codex credential has no physical file name.",
            });
          const body = yield* management(
            config,
            `auth-files/download?name=${encodeURIComponent(entry.name)}`,
          );
          return yield* decodeAuthDocument(body);
        });
      const stored = yield* document(file);
      const identifier = identifyCliproxyAccounts(
        files.filter((entry) => entry.provider === "codex"),
      ).find((entry) => entry.id === file.id)!.identifier;
      const prefix = stored.prefix?.trim() || identifier.toLowerCase();
      if (!stored.prefix?.trim() && !/^[a-z0-9]+$/.test(prefix)) {
        return yield* new UsageLimitSourceError({
          detail: "The account identifier cannot be used as a routing prefix.",
        });
      }
      // Disabled accounts also participate in prefix routing when temporarily enabled.
      for (const other of files.filter(
        (entry) => entry.provider === "codex" && entry.name !== file.name,
      )) {
        if ((yield* document(other)).prefix?.trim() === prefix) {
          return yield* new UsageLimitSourceError({ detail: "The account prefix is not unique." });
        }
      }
      const inferenceUrl = yield* Effect.try({
        try: () => {
          const url = new URL(config.inferenceUrl ?? config.url);
          if (
            !["http:", "https:"].includes(url.protocol) ||
            url.username ||
            url.password ||
            url.search ||
            url.hash
          )
            throw new Error();
          return new URL(
            "v1/chat/completions",
            url.href.endsWith("/") ? url.href : `${url.href}/`,
          ).toString();
        },
        catch: () => new UsageLimitSourceError({ detail: "The inference URL is not valid." }),
      });
      let clientKey = config.inferenceKey?.trim();
      if (!clientKey) {
        const response = yield* management(config, "api-keys");
        const keys = yield* decodeClientKeys(response);
        clientKey = keys["api-keys"].find((key) => key.trim())?.trim();
      }
      if (!clientKey)
        return yield* new UsageLimitSourceError({
          detail: "Configure an inference API key for Start Quota.",
        });
      const identity = [
        {
          name: file.name,
          runtimeId: file.id,
          authIndex: file.auth_index,
          provider: "codex",
          accountId: accountId(file),
          accountSnapshot: snapshot(file),
        },
      ];
      const identityHeader = encodeURIComponent(yield* encodeJson(identity));
      const patchPrefix = (value: string) =>
        Effect.gen(function* () {
          yield* management(
            config,
            "auth-files/fields",
            { name: file.id, prefix: value },
            {
              method: "PATCH",
              headers: { "X-CPAMP-Auth-File-Mutation-Identity": identityHeader },
            },
          );
          if (((yield* document(file)).prefix ?? "").trim() !== value) {
            return yield* new UsageLimitSourceError({
              detail: "The credential prefix was not saved.",
            });
          }
        });
      let prefixAttempted = false;
      let enableAttempted = false;
      const result = yield* Effect.gen(function* () {
        if (!stored.prefix?.trim()) {
          prefixAttempted = true;
          yield* patchPrefix(prefix);
        }
        if (file.disabled) {
          enableAttempted = true;
          yield* setDisabled(true);
        }
        if ((yield* currentTarget).disabled) {
          return yield* new UsageLimitSourceError({
            detail: "The credential was disabled before inference.",
          });
        }
        const response = yield* client
          .execute(
            HttpClientRequest.post(inferenceUrl).pipe(
              HttpClientRequest.setHeader("Authorization", `Bearer ${clientKey}`),
              HttpClientRequest.bodyJsonUnsafe({
                model: `${prefix}/gpt-6-luna`,
                messages: [{ role: "user", content: "say ok" }],
                stream: false,
              }),
            ),
          )
          .pipe(
            Effect.flatMap(HttpClientResponse.filterStatusOk),
            Effect.flatMap((response) => response.json),
            Effect.timeout("90 seconds"),
            Effect.mapError(
              () =>
                new UsageLimitSourceError({
                  detail:
                    "The quota-start inference failed. Check the hub's inference URL and API key.",
                }),
            ),
          );
        yield* decodeInferenceResponse(response);
        return { message: "Quota started. Original credential state restored." };
      }).pipe(Effect.exit);
      // Restoration must finish even if the client disconnects or inference fails.
      const restoredStatus = yield* Effect.gen(function* () {
        if (enableAttempted && !(yield* currentTarget).disabled) yield* setDisabled(false);
      }).pipe(Effect.retry({ times: 2 }), Effect.exit);
      const restoredPrefix = yield* Effect.gen(function* () {
        if (!prefixAttempted) return;
        yield* currentTarget;
        const held = (yield* document(file)).prefix?.trim();
        if (held && held !== prefix) {
          return yield* new UsageLimitSourceError({
            detail: "The credential prefix changed during inference.",
          });
        }
        if (held) yield* patchPrefix("");
      }).pipe(Effect.retry({ times: 2 }), Effect.exit);
      if (Exit.isFailure(restoredStatus) || Exit.isFailure(restoredPrefix)) {
        return yield* new UsageLimitSourceError({
          detail:
            "Start Quota could not restore the original credential state. Check its enabled status and prefix in CPA.",
        });
      }
      return yield* result;
    });
    return yield* operation.pipe(
      Effect.uninterruptible,
      Effect.mapError((error) =>
        isUsageLimitSourceError(error)
          ? error
          : new UsageLimitSourceError({
              detail: "CPA returned an unexpected credential response.",
            }),
      ),
    );
  });
  return { readAccounts, consume, accountAction };
});
