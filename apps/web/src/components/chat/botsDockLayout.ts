export function resolveBotsDockLayout({
  width,
  height,
  chatLeft,
  preview,
}: {
  width: number;
  height: number;
  chatLeft: number;
  preview: { x: number; y: number; width: number; height: number } | null;
}) {
  const inset = 12;
  const availableWidth = chatLeft - inset * 2;
  if (width < 640 || height < 160 || availableWidth < 36) return null;
  const overlapsPreview = (dockWidth: number, dockHeight: number) =>
    preview !== null &&
    preview.x < inset + dockWidth &&
    preview.x + preview.width > inset &&
    preview.y < inset + dockHeight &&
    preview.y + preview.height > inset;
  const dockWidth = Math.min(280, availableWidth);
  // The inline quota dock can take 420px at the bottom of this same gutter.
  if (height >= 640 && availableWidth >= 192 && !overlapsPreview(dockWidth, 204)) {
    return { inline: true, width: dockWidth } as const;
  }
  return overlapsPreview(36, 36) ? null : ({ inline: false } as const);
}
