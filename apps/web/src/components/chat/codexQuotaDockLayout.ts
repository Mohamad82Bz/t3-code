export function resolveCodexQuotaDockLayout({
  width,
  height,
  chatLeft,
  preview,
}: {
  readonly width: number;
  readonly height: number;
  readonly chatLeft: number;
  readonly preview?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  } | null;
}) {
  if (width < 640 || height < 160) return null;
  const inset = 12;
  const availableWidth = chatLeft - inset * 2;
  const dockWidth = Math.min(240, Math.max(192, availableWidth));
  const maxHeight = Math.min(420, height - inset * 2);
  const previewOverlaps = Boolean(
    preview &&
    preview.x < inset + dockWidth &&
    preview.x + preview.width > inset &&
    preview.y < height - inset &&
    preview.y + preview.height > height - inset - maxHeight,
  );
  return { width: dockWidth, maxHeight, inline: availableWidth >= 192 && !previewOverlaps };
}
