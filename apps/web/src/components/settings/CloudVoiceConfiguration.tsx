import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { cloudSpeechDisclosure } from "@t3tools/shared/speech";
import type { PreparedConnection } from "@t3tools/client-runtime/connection";
import {
  configuredSecretSources,
  secretRequestReference,
} from "@t3tools/client-runtime/secret-request";
import {
  getCloudSpeechKeys,
  getCloudSpeechModels,
  saveCloudSpeechSettings,
} from "@t3tools/client-runtime/voice-input";
import {
  AuthOrchestrationOperateScope,
  AuthSettingsWriteScope,
  CloudSpeechApiKey,
  CloudSpeechModelId,
  CLOUD_SPEECH_LABELS,
  CLOUD_SPEECH_PROVIDER_NAMES,
  DEFAULT_OPENAI_SPEECH_BASE_URL,
  isSecretReference,
  normalizeOpenAiSpeechBaseUrl,
  type CloudSpeechModel,
  type CloudSpeechProvider,
  type SecretProviderId,
  type SettingsSecretValue,
  type VoiceTranscriptionDestination,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { HttpClient } from "effect/http";
import { Atom, AsyncResult } from "effect/reactivity";
import { useId, useState } from "react";
import { isSecretsFeatureEnabled } from "../../env";
import {
  inEnvironmentSpeechRuntime,
  runEnvironmentSpeech,
} from "../../speech/runEnvironmentSpeech";
import {
  chooseAudioDestination,
  pendingCloudAudioChoice,
  useAudioChoice,
} from "../../speech/voiceConsent";
import type { EnvironmentPresentation } from "../../state/environments";
import { useEnvironmentScope, usePreparedConnection } from "../../state/session";
import { Button } from "../ui/button";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  useComboboxFilter,
} from "../ui/combobox";
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
import { Label } from "../ui/label";
import { SecretInput } from "./SecretInput";
import { SecretSourceSelect } from "./SecretSourceInput";

// Per dialog instance, not an Atom.family: key presence must be read fresh each time it opens.
function useCloudRead<A, E>(
  prepared: PreparedConnection | null,
  read: (prepared: PreparedConnection) => Effect.Effect<A, E, HttpClient.HttpClient>,
) {
  const make = (connection: PreparedConnection | null) => ({
    prepared: connection,
    atom: Atom.make(
      connection ? inEnvironmentSpeechRuntime(read(connection)) : Effect.succeed(null),
    ),
  });
  const [current, setCurrent] = useState(() => make(prepared));
  if (current.prepared !== prepared) setCurrent(make(prepared));
  return [useAtomValue(current.atom), useAtomRefresh(current.atom)] as const;
}
const isApiKey = Schema.is(CloudSpeechApiKey);
const isModelId = Schema.is(CloudSpeechModelId);
type CloudDestination = Extract<VoiceTranscriptionDestination, { kind: "cloud" }>;

function ModelPicker({
  models,
  value,
  onChange,
  disabled,
  current,
}: {
  models: ReadonlyArray<CloudSpeechModel>;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
  /** The grant's model, flagged when the catalog no longer lists it. */
  current: string | undefined;
}) {
  const { contains } = useComboboxFilter();
  const selected = models.find((model) => model.id === value) ?? null;
  const delisted = current !== undefined && !models.some((model) => model.id === current);
  return (
    <div className="grid gap-1">
      <Combobox
        items={models}
        itemToStringLabel={(model: CloudSpeechModel) => model.name}
        itemToStringValue={(model: CloudSpeechModel) => model.id}
        filter={(model: CloudSpeechModel, query) =>
          contains(model.name, query) || contains(model.id, query)
        }
        value={selected}
        onValueChange={(model) => onChange(model?.id ?? "")}
        autoHighlight
        disabled={disabled}
      >
        <ComboboxInput
          id="voice-cloud-model"
          aria-label="OpenRouter model"
          placeholder="Search transcription models"
          autoFocus
          size="sm"
        />
        <ComboboxPopup>
          <ComboboxEmpty>No transcription model matches.</ComboboxEmpty>
          <ComboboxList className="max-h-64">
            {(model: CloudSpeechModel) => (
              <ComboboxItem key={model.id} value={model}>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{model.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{model.id}</span>
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxPopup>
      </Combobox>
      {delisted ? (
        <p className="text-sm text-destructive" role="alert">
          OpenRouter no longer lists {current}. Dictation stays off until you choose another model.
        </p>
      ) : selected ? (
        <p className="truncate text-xs text-muted-foreground">{selected.id}</p>
      ) : null}
    </div>
  );
}

export function CloudVoiceConfiguration({
  environment,
  provider,
  active,
  close,
}: {
  environment: Pick<EnvironmentPresentation, "environmentId" | "label" | "serverConfig">;
  provider: CloudSpeechProvider;
  active: boolean;
  close: () => void;
}) {
  const id = environment.environmentId;
  const name = CLOUD_SPEECH_LABELS[provider];
  const company = CLOUD_SPEECH_PROVIDER_NAMES[provider];
  const routed = provider === "openrouter";
  const formId = useId();
  const prepared = Option.getOrNull(usePreparedConnection(id));
  const canUse = useEnvironmentScope(id, AuthOrchestrationOperateScope);
  const canManage = useEnvironmentScope(id, AuthSettingsWriteScope);
  const [presence, refresh] = useCloudRead(canUse ? prepared : null, getCloudSpeechKeys);
  const [models, refreshModels] = useCloudRead(
    routed && canUse ? prepared : null,
    getCloudSpeechModels,
  );
  const choice = useAudioChoice();
  const grant = choice === "off" ? null : choice;
  const currentModel =
    active && grant?.destination.kind === "cloud" && grant.destination.provider === "openrouter"
      ? grant.destination.model
      : undefined;
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [model, setModel] = useState(currentModel ?? "");
  const keys = AsyncResult.isSuccess(presence) ? presence.value : null;
  const saved = keys?.[provider];
  const savedBaseUrl = provider === "openai" ? keys?.openaiBaseUrl : undefined;
  const [baseUrlDraft, setBaseUrlDraft] = useState<string | null>(null);
  const baseUrl = normalizeOpenAiSpeechBaseUrl(baseUrlDraft ?? savedBaseUrl ?? "");
  const baseUrlChanged = savedBaseUrl !== undefined && baseUrl !== savedBaseUrl;
  const approvedBaseUrl =
    grant?.destination.kind === "cloud" && grant.destination.provider === "openai"
      ? (grant.destination.baseUrl ?? "")
      : "";
  const endpointChanged = provider === "openai" && baseUrl !== approvedBaseUrl;
  const existing = environment.serverConfig?.settings?.cloudSpeechCredentials?.[provider];
  const sources =
    isSecretsFeatureEnabled && environment.serverConfig?.secretReferences
      ? configuredSecretSources(environment.serverConfig.settings?.secretProviders ?? {})
      : [];
  const reference =
    isSecretReference(existing) && sources.some((s) => s.id === existing.provider)
      ? existing
      : null;
  const [sourceId, setSourceId] = useState<SecretProviderId | null>(reference?.provider ?? null);
  const [draft, setDraft] = useState(reference?.reference ?? "");
  const source = sources.find((s) => s.id === sourceId);
  const credential =
    sourceId !== null
      ? source && secretRequestReference(source, draft)
      : isApiKey(draft.trim())
        ? draft.trim()
        : undefined;
  const keyChanged =
    credential !== undefined &&
    !(
      isSecretReference(credential) &&
      reference?.provider === credential.provider &&
      reference.reference === credential.reference
    );
  const connected = canUse && prepared !== null;
  const editingBaseUrl = canManage && savedBaseUrl !== undefined;
  const editingKey =
    canManage && saved !== undefined && (routed || active || !saved || editingBaseUrl);
  const listedModels = AsyncResult.isSuccess(models) ? (models.value?.models ?? null) : null;
  const modelChosen = isModelId(model) && (listedModels?.some((m) => m.id === model) ?? false);
  const keyReady = draft.trim() ? credential !== undefined : Boolean(saved);
  const modelChanged = model !== (currentModel ?? "");
  const destination = (): CloudDestination =>
    routed && isModelId(model)
      ? { kind: "cloud", provider: "openrouter", environmentId: id, model }
      : provider === "openai"
        ? { kind: "cloud", provider, environmentId: id, ...(baseUrl && { baseUrl }) }
        : { kind: "cloud", provider: "xai", environmentId: id };
  const enable = () => chooseAudioDestination(destination());
  const grantChanges = !active || (routed && modelChanged) || endpointChanged;
  const canSubmit = routed
    ? modelChosen && keyReady && (grantChanges || keyChanged)
    : provider === "openai" && savedBaseUrl !== undefined
      ? keyReady && baseUrl !== undefined && (grantChanges || keyChanged || baseUrlChanged)
      : credential !== undefined;

  const saveSettings = async (
    value: SettingsSecretValue | null | undefined,
    thenEnable: boolean,
    nextBaseUrl?: string,
  ) => {
    if (!connected || !canManage || busy) return;
    setError("");
    setBusy(true);
    try {
      const commit = thenEnable ? pendingCloudAudioChoice(destination()) : null;
      await runEnvironmentSpeech(saveCloudSpeechSettings(prepared, provider, value, nextBaseUrl));
      refresh();
      commit?.();
      close();
    } catch {
      setError("Couldn’t save this change. Check your connection and try again.");
    }
    setBusy(false);
  };
  const submit = () => {
    if (!canSubmit || busy) return;
    const nextKey = keyChanged || (!routed && !editingBaseUrl) ? credential : undefined;
    if (nextKey !== undefined || baseUrlChanged)
      return void saveSettings(nextKey, grantChanges, baseUrlChanged ? baseUrl : undefined);
    if (grantChanges) enable();
    close();
  };

  const keyField = (
    <>
      <Label htmlFor="voice-cloud-key">
        {(routed || editingBaseUrl) && saved ? "Replace API key" : "API key"}
      </Label>
      <div className="flex min-w-0 items-start gap-2">
        {sources.length > 0 && (
          <SecretSourceSelect
            value={sourceId}
            sources={sources}
            label={`${company} API key`}
            disabled={busy}
            onValueChange={(next) => {
              setSourceId(next);
              setDraft("");
              setError("");
            }}
          />
        )}
        <div className="min-w-0 flex-1">
          {sourceId !== null ? (
            <Input
              key={sourceId}
              id="voice-cloud-key"
              name="reference"
              aria-label={`${company} API key reference`}
              autoFocus={!routed}
              placeholder={source?.referencePlaceholder}
              value={draft}
              disabled={busy}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setDraft(event.target.value)}
            />
          ) : (
            <SecretInput
              id="voice-cloud-key"
              name="key"
              aria-label={`${company} API key`}
              autoFocus={!routed}
              placeholder="Enter API key"
              value={draft}
              configured={saved === true}
              disabled={busy}
              maxLength={4096}
              onChange={(event) => setDraft(event.target.value)}
            />
          )}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {draft.trim() && !credential
          ? (source?.invalidReferenceMessage ?? "Enter an API key, not a URL or secret reference.")
          : (routed || editingBaseUrl) && saved
            ? "Leave blank to keep the saved key."
            : active && !routed
              ? "Updating the key keeps dictation enabled."
              : `Anyone with dictation access to ${environment.label} can bill this key.`}
      </p>
    </>
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <DialogPopup className="max-w-md" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>
            {remove
              ? `Remove the ${company} key?`
              : active
                ? routed || provider === "openai"
                  ? `Manage ${company} dictation`
                  : `Manage ${company} key`
                : `Use ${name} for dictation?`}
          </DialogTitle>
          <DialogDescription>
            {remove
              ? `Everyone using ${name} for dictation on ${environment.label} will lose access.`
              : active && !routed && provider !== "openai"
                ? `Anyone with dictation access to ${environment.label} can use this API key.`
                : cloudSpeechDisclosure(provider, environment.label, baseUrl)}
          </DialogDescription>
        </DialogHeader>
        {!remove && (
          <DialogPanel>
            {!connected ? (
              <p>Connect to {environment.label} with dictation access to continue.</p>
            ) : AsyncResult.isFailure(presence) && saved === undefined ? (
              <Button size="sm" variant="outline" onClick={refresh}>
                Retry loading API key
              </Button>
            ) : routed &&
              AsyncResult.isSuccess(presence) &&
              presence.value &&
              saved === undefined ? (
              <p>Update {environment.label} to use OpenRouter dictation.</p>
            ) : saved === undefined ? (
              <p role="status">Checking for an API key…</p>
            ) : routed ? (
              <form
                id={formId}
                className="grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  submit();
                }}
              >
                <div className="grid gap-2">
                  <Label htmlFor="voice-cloud-model">Model</Label>
                  {listedModels ? (
                    <ModelPicker
                      models={listedModels}
                      value={model}
                      onChange={setModel}
                      disabled={busy}
                      current={currentModel}
                    />
                  ) : AsyncResult.isFailure(models) ? (
                    <Button size="sm" variant="outline" type="button" onClick={refreshModels}>
                      Retry loading models
                    </Button>
                  ) : (
                    <p role="status" className="text-sm text-muted-foreground">
                      Loading transcription models…
                    </p>
                  )}
                </div>
                {editingKey ? (
                  <div className="grid gap-2">{keyField}</div>
                ) : !saved ? (
                  <p>Ask an administrator on {environment.label} to add an API key.</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Uses the API key saved on {environment.label}. This choice applies only to this
                    device.
                  </p>
                )}
              </form>
            ) : editingKey ? (
              <form
                id={formId}
                className="grid gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  submit();
                }}
              >
                {editingBaseUrl && (
                  <div className="grid gap-2">
                    <Label htmlFor={`${formId}-base-url`}>Base URL</Label>
                    <Input
                      id={`${formId}-base-url`}
                      inputMode="url"
                      placeholder={DEFAULT_OPENAI_SPEECH_BASE_URL}
                      value={baseUrlDraft ?? savedBaseUrl}
                      onChange={(event) => setBaseUrlDraft(event.target.value)}
                      disabled={busy}
                      aria-invalid={baseUrl === undefined}
                      aria-describedby={`${formId}-base-url-hint`}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <p id={`${formId}-base-url-hint`} className="text-sm text-muted-foreground">
                      {baseUrl === undefined
                        ? "Enter an HTTPS API base URL without credentials, a query, or a fragment. Localhost may use HTTP."
                        : "Leave blank for OpenAI. A custom endpoint receives recordings and the saved API key from this environment."}
                    </p>
                  </div>
                )}
                {keyField}
              </form>
            ) : !saved ? (
              <p>Ask an administrator on {environment.label} to add an API key.</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                This choice applies only to this device. Choose Off to stop sharing.
              </p>
            )}
          </DialogPanel>
        )}
        {error && (
          <p className="px-6 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          {connected && canManage && saved && (active || routed) && !remove && (
            <div className="sm:mr-auto">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => setRemove(true)}
              >
                Remove key…
              </Button>
            </div>
          )}
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={close}>
            Cancel
          </Button>
          {connected &&
            (remove ? (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() => void saveSettings(null, false)}
              >
                Remove key
              </Button>
            ) : routed ? (
              saved !== undefined && (saved || canManage) ? (
                <Button type="submit" form={formId} size="sm" disabled={busy || !canSubmit}>
                  {active ? "Save" : "Save and enable"}
                </Button>
              ) : null
            ) : editingKey ? (
              <Button type="submit" form={formId} size="sm" disabled={busy || !canSubmit}>
                {active
                  ? editingBaseUrl
                    ? endpointChanged && !baseUrlChanged && !keyChanged
                      ? "Confirm destination"
                      : "Save"
                    : "Save key"
                  : "Save and enable"}
              </Button>
            ) : saved && grantChanges ? (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  enable();
                  close();
                }}
              >
                Use {name}
              </Button>
            ) : null)}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
