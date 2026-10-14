export interface Size {
  width: number;
  height: number;
}

/** Image transform: translate(x, y) then scale, with the origin at the top-left corner. */
export interface View {
  scale: number;
  x: number;
  y: number;
}

export const MAX_SCALE = 8;
const PADDING = 48;

/** Largest scale, never above 1, at which the whole image fits in the viewport. */
export function fitScale(image: Size, viewport: Size): number {
  const width = Math.max(1, viewport.width - PADDING * 2);
  const height = Math.max(1, viewport.height - PADDING * 2);
  return Math.min(1, width / image.width, height / image.height);
}

/** Keep the image on screen: centre an axis that fits, otherwise keep its edges past the viewport's. */
export function clampPan(view: View, image: Size, viewport: Size): View {
  const width = image.width * view.scale;
  const height = image.height * view.scale;
  const x = width <= viewport.width
    ? (viewport.width - width) / 2
    : Math.min(0, Math.max(viewport.width - width, view.x));
  const y = height <= viewport.height
    ? (viewport.height - height) / 2
    : Math.min(0, Math.max(viewport.height - height, view.y));
  return { scale: view.scale, x, y };
}

/** The image fitted and centred. */
export function fitted(image: Size, viewport: Size): View {
  return clampPan({ scale: fitScale(image, viewport), x: 0, y: 0 }, image, viewport);
}

/** Zoom by `factor` while the image point under (px, py) stays under it. */
export function zoomAt(view: View, factor: number, px: number, py: number, image: Size, viewport: Size): View {
  const scale = Math.min(MAX_SCALE, Math.max(fitScale(image, viewport), view.scale * factor));
  const k = scale / view.scale;
  return clampPan({ scale, x: px - (px - view.x) * k, y: py - (py - view.y) * k }, image, viewport);
}

/** Double-click: from fitted, go to actual pixels (or 2x when that would barely change anything); otherwise back to fitted. */
export function toggleZoom(view: View, px: number, py: number, image: Size, viewport: Size): View {
  const fit = fitScale(image, viewport);
  if (view.scale > fit * 1.01) return fitted(image, viewport);
  const target = fit < 0.9 ? 1 : fit * 2;
  return zoomAt(view, target / view.scale, px, py, image, viewport);
}

/** Next index in a gallery, wrapping around the ends or stopping at them. */
export function step(index: number, delta: number, length: number, wrap: boolean): number {
  const next = index + delta;
  if (wrap) return ((next % length) + length) % length;
  return Math.min(length - 1, Math.max(0, next));
}
