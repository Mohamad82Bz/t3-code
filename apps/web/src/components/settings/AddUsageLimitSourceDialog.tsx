import type {
  EnvironmentId,
  SecretReference,
  UnifiedSettings,
  UsageLimitSourceConfig,
  UsageLimitSourceId,
} from "@t3tools/contracts";
import { T, useGT, Var } from "gt-react";
import { useId, useState } from "react";

import { useUpdateEnvironmentSettings } from "../../hooks/useSettings";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { SecretInput } from "./SecretInput";
import { sourceIdFromUrl } from "./AddUsageLimitSourceDialog.logic";
import { SecretSourceInput, useSecretSources } from "./SecretSourceInput";
import { Label } from "../ui/label";

/** Send the management key once to server secret storage; settings retain only a redaction marker. */
export function AddUsageLimitSourceDialog({
  open,
  onOpenChange,
  environmentId,
  environmentLabel,
  source,
  sources,
  kind = "cliproxy",
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string;
  readonly source?: { readonly id: UsageLimitSourceId; readonly config: UsageLimitSourceConfig };
  readonly kind?: "cliproxy" | "http";
  readonly sources: UnifiedSettings["usageLimitSources"];
}) {
  const gt = useGT();
  const formId = useId();
  const updateSettings = useUpdateEnvironmentSettings(environmentId);
  const [label, setLabel] = useState(source?.config.label ?? "");
  const [url, setUrl] = useState(source?.config.url ?? "");
  const [inferenceUrl, setInferenceUrl] = useState(source?.config.inferenceUrl ?? "");
  const [inferenceKey, setInferenceKey] = useState(source?.config.inferenceKey ?? "");
  const secretSources = useSecretSources(environmentId);
  const [keyDraft, setKeyDraft] = useState<string | SecretReference>(
    source?.config.managementKey ?? "",
  );
  const [keyValid, setKeyValid] = useState(true);
  const managementKey = typeof keyDraft === "string" ? keyDraft.trim() : keyDraft;
  const trimmedUrl = url.trim();
  const http = kind === "http";
  const endpoint = URL.parse(trimmedUrl);
  const canSave =
    keyValid &&
    (http
      ? endpoint !== null &&
        /^https?:$/.test(endpoint.protocol) &&
        !endpoint.username &&
        !endpoint.password
      : trimmedUrl.length > 0 && managementKey !== "");

  const reset = () => {
    setLabel("");
    setUrl("");
    setKeyDraft("");
    setKeyValid(true);
    setInferenceUrl("");
    setInferenceKey("");
  };

  const save = () => {
    if (!canSave) return;
    const id = source?.id ?? sourceIdFromUrl(trimmedUrl, sources, kind);
    updateSettings({
      usageLimitSources: {
        [id]: {
          kind,
          ...(label.trim() ? { label: label.trim() } : {}),
          url: trimmedUrl,
          managementKey,
          enabled: source?.config.enabled ?? true,
          ...(inferenceUrl.trim() ? { inferenceUrl: inferenceUrl.trim() } : {}),
          ...(inferenceKey.trim() ? { inferenceKey: inferenceKey.trim() } : {}),
        },
      },
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {http ? (
              <T>Add an HTTP quota source</T>
            ) : source ? (
              gt("Edit CLIProxyAPI hub")
            ) : (
              <T>Add a CLIProxyAPI hub</T>
            )}
          </DialogTitle>
          <DialogDescription>
            {http ? (
              <T>
                Read quotas from an endpoint on <Var>{environmentLabel}</Var>.
              </T>
            ) : (
              <T>
                Show the quota of every account the hub pools, next to the providers on{" "}
                <Var>{environmentLabel}</Var>. The key stays on that server.
              </T>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form
            id={formId}
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="usage-source-url">
                {http ? <T>Endpoint URL</T> : <T>Hub URL</T>}
              </Label>
              <Input
                id="usage-source-url"
                placeholder="https://hub.example.ts.net:8318"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                autoFocus
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="usage-source-key">
                {http ? <T>Bearer token (optional)</T> : <T>Management key</T>}
              </Label>
              <SecretSourceInput
                id="usage-source-key"
                aria-label={http ? gt("Bearer token (optional)") : gt("Management key")}
                value={keyDraft}
                sources={secretSources}
                environmentId={environmentId}
                onChange={(event) => setKeyDraft(event.target.value)}
                onSecretChange={(secret) => setKeyDraft(secret ?? "")}
                onValidityChange={setKeyValid}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="usage-source-label">
                <T>Label (optional)</T>
              </Label>
              <Input
                id="usage-source-label"
                placeholder={gt("Defaults to the hub's host name")}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
            </div>
            {!http ? (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="usage-source-inference-url">
                    {gt("Inference URL (optional)")}
                  </Label>
                  <Input
                    id="usage-source-inference-url"
                    placeholder={gt("Defaults to the hub URL")}
                    value={inferenceUrl}
                    onChange={(event) => setInferenceUrl(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {gt("Used when CPA management and inference use different ports.")}
                  </p>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="usage-source-inference-key">
                    {gt("Inference API key (optional)")}
                  </Label>
                  <SecretInput
                    id="usage-source-inference-key"
                    value={inferenceKey}
                    onChange={(event) => setInferenceKey(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {gt(
                      "Otherwise Start Quota uses a client key from the hub. Keys stay on {environment}.",
                      { environment: environmentLabel },
                    )}
                  </p>
                </div>
              </>
            ) : null}
          </form>
        </DialogPanel>
        <DialogFooter variant="bare">
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            <T>Cancel</T>
          </Button>
          <Button type="submit" form={formId} disabled={!canSave}>
            {http ? <T>Add source</T> : source ? gt("Save hub") : <T>Add hub</T>}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
