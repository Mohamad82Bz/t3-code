import { DEFAULT_BOT_APPEARANCE, type BotAppearance } from "@t3tools/contracts";
import { useGT } from "gt-react";
import { useRef, useState } from "react";
import { Button } from "../ui/button";
import { Dialog, DialogFooter, DialogHeader, DialogPopup, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { BotAvatar } from "../chat/BotAvatar";
import { decodeAvatarDefinition, objectAvatars } from "./avatarObjects";
import { botColor, PICKER_COLORS, PICKER_SHAPES, type AvatarState } from "./threebot/character";
import { colorHex } from "./threebot/avatar-color";
import { avatarConfig as config } from "@t3tools/shared/botAvatars";

interface Crop {
  image: HTMLImageElement;
  zoom: number;
  x: number;
  y: number;
}

export function BotAppearanceEditor({
  value,
  onChange,
  onClose,
  onDraw,
}: {
  value: BotAppearance;
  onChange: (avatar: BotAppearance) => void;
  onClose: () => void;
  onDraw?: (description: string) => Promise<BotAppearance | null>;
}) {
  const gt = useGT();
  const [draft, setDraft] = useState(value);
  const [tab, setTab] = useState<"shape" | "image">("shape");
  const [mood, setMood] = useState<AvatarState>("idle");
  const [json, setJson] = useState("");
  const [description, setDescription] = useState("");
  const [crop, setCrop] = useState<Crop | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const drag = useRef<{ clientX: number; clientY: number; x: number; y: number } | null>(null);
  const choose = (shape: string) => setDraft({ shape, color: draft.color });
  const readImage = async (file?: File) => {
    if (!file || busy) return;
    setError("");
    setBusy(true);
    try {
      if (file.size > 25 * 1024 * 1024 || !/^image\/(png|jpeg|webp|gif)$/.test(file.type))
        throw Error();
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === "string" ? resolve(reader.result) : reject();
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const image = new Image();
      image.src = data;
      await image.decode();
      if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 40_000_000)
        throw Error();
      setCrop({ image, zoom: 1, x: 0, y: 0 });
      setTab("image");
    } catch {
      setError(gt("Choose a PNG, JPEG, WebP, or GIF under 25 MB."));
    } finally {
      setBusy(false);
    }
  };
  const move = (current: Crop, x: number, y: number, zoom = current.zoom) => {
    const min = Math.min(current.image.naturalWidth, current.image.naturalHeight);
    const maxX = ((current.image.naturalWidth * zoom) / min - 1) / 2;
    const maxY = ((current.image.naturalHeight * zoom) / min - 1) / 2;
    setCrop({
      ...current,
      zoom,
      x: Math.max(-maxX, Math.min(x, maxX)),
      y: Math.max(-maxY, Math.min(y, maxY)),
    });
  };
  const applyCrop = () => {
    if (!crop) return;
    const canvas = document.createElement("canvas");
    const size = 256;
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const scale = (size * crop.zoom) / Math.min(crop.image.naturalWidth, crop.image.naturalHeight);
    const w = crop.image.naturalWidth * scale;
    const h = crop.image.naturalHeight * scale;
    ctx.drawImage(crop.image, (size - w) / 2 + crop.x * size, (size - h) / 2 + crop.y * size, w, h);
    const picture = canvas.toDataURL("image/webp", 0.8);
    if (picture.length > 131_072) {
      setError(gt("The cropped avatar is too large."));
      return;
    }
    setDraft({ ...draft, picture });
    setCrop(null);
    setError("");
  };
  const importAvatar = () => {
    const definition = decodeAvatarDefinition(json);
    const encoded = definition === null ? "" : JSON.stringify(definition);
    if (definition === null || encoded.length > 16_384) {
      setError(gt("That is not a valid Open Bot Avatar definition."));
      return;
    }
    setDraft({ shape: `object:${definition.id}`, color: draft.color, definition: encoded });
    setError("");
    setJson("");
  };
  const draw = async () => {
    if (!onDraw || busy || !description.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await onDraw(description.trim());
      if (result?.definition && decodeAvatarDefinition(result.definition))
        setDraft({ ...result, color: draft.color });
      else setError(gt("The model did not produce a valid avatar."));
    } catch {
      setError(gt("Could not draw an avatar with this bot’s model."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{gt("Edit avatar")}</DialogTitle>
        </DialogHeader>
        <div
          className="scrollbar-gutter-both max-h-[60dvh] space-y-5 overflow-y-auto px-5 py-3"
          onPaste={(event) => {
            const image = Array.from(event.clipboardData.files).find((file) =>
              file.type.startsWith("image/"),
            );
            if (image) {
              event.preventDefault();
              void readImage(image);
            }
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-1">
              <Button
                type="button"
                variant={tab === "shape" ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={tab === "shape"}
                onClick={() => setTab("shape")}
              >
                {gt("Shape")}
              </Button>
              <Button
                type="button"
                variant={tab === "image" ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={tab === "image"}
                onClick={() => setTab("image")}
              >
                {gt("Upload")}
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(DEFAULT_BOT_APPEARANCE);
                setCrop(null);
                setMood("idle");
              }}
            >
              {gt("Reset")}
            </Button>
          </div>
          <div className="flex flex-col items-center gap-3 rounded-lg bg-muted/40 py-4">
            <BotAvatar appearance={draft} state={mood} size={96} animate />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              {gt("Preview animation")}
              <select
                className="rounded-md border bg-background px-2 py-1 text-foreground"
                value={mood}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  if (Object.hasOwn(config.states, next)) setMood(next as AvatarState);
                }}
              >
                {Object.keys(config.states).map((state) => (
                  <option key={state} value={state}>
                    {state.replaceAll("-", " ")}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {tab === "shape" ? (
            <>
              <fieldset className="space-y-2">
                <legend className="text-xs font-medium text-muted-foreground">{gt("Shape")}</legend>
                <div className="grid grid-cols-6 gap-1 sm:grid-cols-8">
                  {[...new Set([...PICKER_SHAPES, ...config.shapes])].map((shape) => (
                    <AvatarChoice
                      key={shape}
                      label={shape}
                      chosen={!draft.picture && shape === draft.shape}
                      appearance={{ shape, color: draft.color }}
                      onClick={() => choose(shape)}
                    />
                  ))}
                </div>
              </fieldset>
              <fieldset className="space-y-2">
                <legend className="text-xs font-medium text-muted-foreground">
                  {gt("Objects")}
                </legend>
                <div className="grid grid-cols-6 gap-1 sm:grid-cols-8">
                  {objectAvatars.map((avatar) => {
                    const shape = `object:${avatar.id}`;
                    return (
                      <AvatarChoice
                        key={shape}
                        label={avatar.name}
                        chosen={!draft.picture && shape === draft.shape}
                        appearance={{ shape, color: draft.color }}
                        onClick={() => choose(shape)}
                      />
                    );
                  })}
                </div>
              </fieldset>
              <fieldset className="space-y-2">
                <legend className="text-xs font-medium text-muted-foreground">
                  {gt("Avatar color")}
                </legend>
                <div className="flex flex-wrap items-center gap-2">
                  {PICKER_COLORS.map(({ id, name }) => (
                    <button
                      key={id}
                      type="button"
                      className="size-8 rounded-full border border-foreground/20 aria-pressed:ring-2 aria-pressed:ring-ring aria-pressed:ring-inset"
                      style={{ background: botColor(id) }}
                      aria-label={name}
                      aria-pressed={draft.color === id}
                      onClick={() => setDraft({ ...draft, color: id })}
                    />
                  ))}
                  <input
                    type="color"
                    value={colorHex(draft.color)}
                    aria-label={gt("Custom color")}
                    className="size-8 cursor-pointer bg-transparent"
                    onChange={(event) => setDraft({ ...draft, color: event.currentTarget.value })}
                  />
                </div>
              </fieldset>
              <details className="space-y-2">
                <summary className="cursor-pointer text-sm">{gt("Import an avatar")}</summary>
                <Textarea
                  aria-label={gt("Avatar JSON")}
                  rows={3}
                  maxLength={16_384}
                  value={json}
                  onChange={(event) => setJson(event.currentTarget.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!json.trim()}
                  onClick={importAvatar}
                >
                  {gt("Use this avatar")}
                </Button>
              </details>
              {onDraw ? (
                <details className="space-y-2">
                  <summary className="cursor-pointer text-sm">{gt("Draw a new object")}</summary>
                  <Input
                    aria-label={gt("Describe the new object")}
                    maxLength={200}
                    value={description}
                    onChange={(event) => setDescription(event.currentTarget.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy || !description.trim()}
                    onClick={() => void draw()}
                  >
                    {busy ? gt("Drawing…") : gt("Draw it")}
                  </Button>
                </details>
              ) : null}
            </>
          ) : crop ? (
            <div className="space-y-3">
              <div
                role="img"
                aria-label={gt("Drag to reposition")}
                className="relative mx-auto aspect-square w-48 touch-none overflow-hidden rounded-full bg-muted"
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  drag.current = {
                    clientX: event.clientX,
                    clientY: event.clientY,
                    x: crop.x,
                    y: crop.y,
                  };
                }}
                onPointerMove={(event) => {
                  if (!drag.current) return;
                  const size = event.currentTarget.clientWidth;
                  move(
                    crop,
                    drag.current.x + (event.clientX - drag.current.clientX) / size,
                    drag.current.y + (event.clientY - drag.current.clientY) / size,
                  );
                }}
                onLostPointerCapture={() => {
                  drag.current = null;
                }}
              >
                <img
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute max-w-none"
                  style={{
                    left: `${50 + crop.x * 100}%`,
                    top: `${50 + crop.y * 100}%`,
                    width: `${((100 * crop.image.naturalWidth) / Math.min(crop.image.naturalWidth, crop.image.naturalHeight)) * crop.zoom}%`,
                    translate: "-50% -50%",
                  }}
                  src={crop.image.src}
                />
              </div>
              <label className="flex items-center gap-3 text-sm">
                {gt("Zoom")}
                <input
                  type="range"
                  min="1"
                  max="4"
                  step="0.01"
                  value={crop.zoom}
                  className="flex-1"
                  onChange={(event) =>
                    move(crop, crop.x, crop.y, Number(event.currentTarget.value))
                  }
                />
              </label>
              <div className="flex justify-center gap-2">
                <Button type="button" variant="ghost" onClick={() => setCrop(null)}>
                  {gt("Cancel")}
                </Button>
                <Button type="button" onClick={applyCrop}>
                  {gt("Set avatar")}
                </Button>
              </div>
            </div>
          ) : (
            <div
              className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-3"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void readImage(event.dataTransfer.files[0]);
              }}
            >
              <p className="text-sm text-muted-foreground">{gt("Drag, drop, or paste an image")}</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              >
                {gt("Browse files")}
              </Button>
              <input
                ref={fileInput}
                type="file"
                hidden
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(event) => {
                  void readImage(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </div>
          )}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            disabled={busy || crop !== null}
            onClick={() => {
              onChange(draft);
              onClose();
            }}
          >
            {gt("Done")}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function AvatarChoice({
  appearance,
  label,
  chosen,
  onClick,
}: {
  appearance: BotAppearance;
  label: string;
  chosen: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={chosen}
      className="grid min-h-11 place-items-center rounded-lg hover:bg-accent aria-pressed:bg-accent aria-pressed:ring-1 aria-pressed:ring-inset aria-pressed:ring-ring"
      onClick={onClick}
    >
      <BotAvatar appearance={appearance} size={34} />
    </button>
  );
}
