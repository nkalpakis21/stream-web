/** Square viewport used by the on-screen frame editor (CSS pixels). */
export const FRAME_VIEWPORT_PX = 288;
/** Exported JPEG edge length. Circular avatars display this as object-cover. */
export const FRAME_OUTPUT_PX = 768;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

export function coverScale(
  naturalWidth: number,
  naturalHeight: number,
  viewport: number
): number {
  if (naturalWidth <= 0 || naturalHeight <= 0) return 1;
  return Math.max(viewport / naturalWidth, viewport / naturalHeight);
}

export function clampOffset(offset: number, drawnSize: number, viewport: number): number {
  const min = Math.min(0, viewport - drawnSize);
  return Math.max(min, Math.min(0, offset));
}

export function zoomAroundCenter(
  prevScale: number,
  nextScale: number,
  offsetX: number,
  offsetY: number,
  viewport: number
): { offsetX: number; offsetY: number } {
  if (prevScale <= 0) {
    return { offsetX, offsetY };
  }
  const cx = viewport / 2;
  const cy = viewport / 2;
  return {
    offsetX: cx - ((cx - offsetX) / prevScale) * nextScale,
    offsetY: cy - ((cy - offsetY) / prevScale) * nextScale,
  };
}
