import { describe, expect, test } from "bun:test";
import { MAX_SCALE, clampPan, fitScale, fitted, step, toggleZoom, zoomAt } from "../../src/view";

const viewport = { width: 1000, height: 800 };
const big = { width: 2000, height: 1000 };
const small = { width: 200, height: 100 };

describe("fitScale", () => {
  test("shrinks a large image to fit inside the padded viewport", () => {
    // (1000 - 96) / 2000 = 0.452 limits before (800 - 96) / 1000 = 0.704
    expect(fitScale(big, viewport)).toBeCloseTo(0.452);
  });

  test("never enlarges a small image", () => {
    expect(fitScale(small, viewport)).toBe(1);
  });
});

describe("fitted", () => {
  test("centres the image", () => {
    const view = fitted(small, viewport);
    expect(view).toEqual({ scale: 1, x: 400, y: 350 });
  });
});

describe("zoomAt", () => {
  test("keeps the image point under the cursor in place", () => {
    const start = { scale: 1, x: 0, y: 0 };
    const huge = { width: 4000, height: 4000 };
    const view = zoomAt(start, 2, 300, 200, huge, viewport);
    expect(view.scale).toBe(2);
    // Image point (300, 200) was under the cursor and still is.
    expect((300 - view.x) / view.scale).toBeCloseTo(300);
    expect((200 - view.y) / view.scale).toBeCloseTo(200);
  });

  test("cannot zoom out past the fitted size", () => {
    const view = zoomAt(fitted(big, viewport), 0.1, 500, 400, big, viewport);
    expect(view.scale).toBeCloseTo(fitScale(big, viewport));
  });

  test("cannot zoom in past MAX_SCALE", () => {
    const view = zoomAt({ scale: 6, x: 0, y: 0 }, 10, 0, 0, big, viewport);
    expect(view.scale).toBe(MAX_SCALE);
  });
});

describe("clampPan", () => {
  test("an image wider than the viewport cannot be dragged past its edges", () => {
    expect(clampPan({ scale: 1, x: 300, y: 0 }, big, viewport).x).toBe(0);
    expect(clampPan({ scale: 1, x: -5000, y: 0 }, big, viewport).x).toBe(-1000);
  });

  test("an axis that fits stays centred", () => {
    expect(clampPan({ scale: 1, x: 0, y: -400 }, small, viewport).y).toBe(350);
  });
});

describe("toggleZoom", () => {
  test("fitted large image goes to actual pixels, then back", () => {
    const fit = fitted(big, viewport);
    const zoomed = toggleZoom(fit, 500, 400, big, viewport);
    expect(zoomed.scale).toBe(1);
    expect(toggleZoom(zoomed, 500, 400, big, viewport)).toEqual(fit);
  });

  test("image that fits at 74% goes to actual pixels, not 2x the fit", () => {
    const screenshot = { width: 1600, height: 900 };
    const wide = { width: 1280, height: 800 };
    expect(toggleZoom(fitted(screenshot, wide), 640, 400, screenshot, wide).scale).toBe(1);
  });

  test("small image goes to 2x", () => {
    expect(toggleZoom(fitted(small, viewport), 500, 400, small, viewport).scale).toBe(2);
  });
});

describe("step", () => {
  test("wraps around both ends", () => {
    expect(step(4, 1, 5, true)).toBe(0);
    expect(step(0, -1, 5, true)).toBe(4);
  });

  test("stops at the ends without wrap", () => {
    expect(step(4, 1, 5, false)).toBe(4);
    expect(step(0, -1, 5, false)).toBe(0);
  });
});
