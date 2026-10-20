import {
  type EnvironmentId,
  type UsageLimitSourceConfig,
  UsageLimitSourceId,
} from "@t3tools/contracts";
import { useState } from "react";

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
import { Label } from "../ui/label";

/**
 * Dots and dashes in the host are kept so `foo-bar.com` and `foo.bar.com` do
 * not collide; anything else (a port's colon, a path) is folded to a dash.
 */
function sourceIdFromUrl(url: string): UsageLimitSourceId {
  let host = url;
  try {
    host = new URL(url).host;
  } catch {}
  const slug = host
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return UsageLimitSourceId.make(`cliproxy-${slug || "hub"}`);
}

/**
 * The management key is sent once and kept in that server's secret store; settings only ever
 * carry a redaction marker for it afterwards.
 */
export function AddUsageLimitSourceDialog({
  open,
  onOpenChange,
  environmentId,
  environmentLabel,
  source,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string;
  readonly source?: { readonly id: UsageLimitSourceId; readonly config: UsageLimitSourceConfig };
}) {
  const updateSettings = useUpdateEnvironmentSettings(environmentId);
  const [label, setLabel] = useState(source?.config.label ?? "");
  const [url, setUrl] = useState(source?.config.url ?? "");
  const [managementKey, setManagementKey] = useState(source?.config.managementKey ?? "");
  const [inferenceUrl, setInferenceUrl] = useState(source?.config.inferenceUrl ?? "");
  const [inferenceKey, setInferenceKey] = useState(source?.config.inferenceKey ?? "");
  const trimmedUrl = url.trim();
  const canSave = trimmedUrl.length > 0 && managementKey.trim().length > 0;

  const reset = () => {
    setLabel("");
    setUrl("");
    setManagementKey("");
    setInferenceUrl("");
    setInferenceKey("");
  };

  const save = () => {
    if (!canSave) return;
    const id = source?.id ?? sourceIdFromUrl(trimmedUrl);
    updateSettings({
      usageLimitSources: {
        [id]: {
          kind: "cliproxy",
          ...(label.trim() ? { label: label.trim() } : {}),
          url: trimmedUrl,
          managementKey: managementKey.trim(),
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
          <DialogTitle>{source ? "Edit CLIProxyAPI hub" : "Add a CLIProxyAPI hub"}</DialogTitle>
          <DialogDescription>
            Show the quota of every account the hub pools, next to the providers on{" "}
            {environmentLabel}. The key stays on that server.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="usage-source-url">Hub URL</Label>
              <Input
                id="usage-source-url"
                placeholder="https://hub.example.ts.net:8318"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                autoFocus
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="usage-source-key">Management key</Label>
              <SecretInput
                id="usage-source-key"
                value={managementKey}
                onChange={(event) => setManagementKey(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="usage-source-label">Label (optional)</Label>
              <Input
                id="usage-source-label"
                placeholder="Defaults to the hub's host name"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="usage-source-inference-url">Inference URL (optional)</Label>
              <Input
                id="usage-source-inference-url"
                placeholder="Defaults to the hub URL"
                value={inferenceUrl}
                onChange={(event) => setInferenceUrl(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                For Start Quota when CPA management and inference use different ports.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="usage-source-inference-key">Inference API key (optional)</Label>
              <SecretInput
                id="usage-source-inference-key"
                value={inferenceKey}
                onChange={(event) => setInferenceKey(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Otherwise Start Quota uses a client key from the hub's management API. Keys stay on{" "}
                {environmentLabel}.
              </p>
            </div>
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
            Cancel
          </Button>
          <Button onClick={save} disabled={!canSave}>
            {source ? "Save hub" : "Add hub"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
