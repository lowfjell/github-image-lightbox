import type { Settings } from "./settings";
import { type Size, type View, clampPan, fitScale, fitted, step, toggleZoom, zoomAt } from "./view";

export interface Item {
  src: string;
  href: string;
  alt: string;
}

// Used for images that report no natural size, such as some SVGs.
const FALLBACK_SIZE: Size = { width: 800, height: 600 };

const STYLE = `
:host { all: initial; }
.stage {
  position: fixed; inset: 0; overflow: hidden; touch-action: none; outline: none;
  background: rgba(1, 4, 9, 0.92); color: #e6edf3;
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
}
.image {
  position: absolute; top: 0; left: 0; max-width: none; max-height: none;
  transform-origin: 0 0; cursor: grab; user-select: none;
  opacity: 0; transition: opacity 120ms ease-out;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
}
.image.ready { opacity: 1; }
.dragging .image { cursor: grabbing; }
button, a { all: unset; box-sizing: border-box; cursor: pointer; }
.bar {
  position: absolute; top: 12px; right: 12px; display: flex; align-items: center; gap: 4px; padding: 4px;
  background: rgba(22, 27, 34, 0.86); border: 1px solid rgba(240, 246, 252, 0.12); border-radius: 8px;
}
.bar span { padding: 0 8px; color: #9198a1; font-variant-numeric: tabular-nums; }
.bar span:empty { display: none; }
.original { padding: 4px 8px; border-radius: 6px; }
.close { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 6px; font-size: 16px; }
.nav {
  position: absolute; top: 50%; translate: 0 -50%; width: 44px; height: 64px;
  display: grid; place-items: center; font-size: 32px; line-height: 1;
  background: rgba(22, 27, 34, 0.7); border: 1px solid rgba(240, 246, 252, 0.12); border-radius: 8px;
}
.nav[hidden] { display: none; }
.nav:disabled { opacity: 0.35; cursor: default; }
.prev { left: 12px; }
.next { right: 12px; }
.original:hover, .close:hover, .nav:hover:not(:disabled) { background: rgba(177, 186, 196, 0.16); }
:focus-visible { outline: 2px solid #1f6feb; outline-offset: 1px; }
.stage:focus-visible { outline: none; }
.message { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; color: #9198a1; }
.message:empty { display: none; }
@media (prefers-reduced-motion: reduce) { .image { transition: none; } }
`;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

export class Lightbox {
  private host: HTMLElement | null = null;
  private stage = el("div", { className: "stage", tabIndex: -1 });
  private img = el("img", { className: "image", draggable: false });
  private counter = el("span", { className: "counter" });
  private zoomLabel = el("span", { className: "zoom" });
  private original = el("a", { className: "original", target: "_blank", rel: "noopener noreferrer" }, "Open original ↗");
  private closeButton = el("button", { className: "close", type: "button", title: "Close (Esc)" }, "✕");
  private prevButton = el("button", { className: "nav prev", type: "button", title: "Previous (←)" }, "‹");
  private nextButton = el("button", { className: "nav next", type: "button", title: "Next (→)" }, "›");
  private message = el("p", { className: "message" });

  private items: Item[] = [];
  private index = 0;
  private size: Size = FALLBACK_SIZE;
  private view: View = { scale: 1, x: 0, y: 0 };
  private loadToken = 0;
  private drag: { id: number; startX: number; startY: number; from: View; moved: boolean } | null = null;
  private suppressClick = false;
  private returnFocus: HTMLElement | null = null;
  private saved = { overflow: "", inert: false };

  constructor(private settings: Settings) {
    this.stage.setAttribute("role", "dialog");
    this.stage.setAttribute("aria-modal", "true");
    this.stage.setAttribute("aria-label", "Image viewer");
    this.counter.setAttribute("aria-live", "polite");
    this.closeButton.setAttribute("aria-label", "Close");
    this.prevButton.setAttribute("aria-label", "Previous image");
    this.nextButton.setAttribute("aria-label", "Next image");
    this.stage.append(
      this.img,
      this.message,
      el("div", { className: "bar" }, this.counter, this.zoomLabel, this.original, this.closeButton),
      this.prevButton,
      this.nextButton,
    );

    this.closeButton.addEventListener("click", () => this.close());
    this.prevButton.addEventListener("click", () => this.go(-1));
    this.nextButton.addEventListener("click", () => this.go(1));
    this.stage.addEventListener("click", this.onClick);
    this.stage.addEventListener("pointerdown", this.onPointerDown);
    this.stage.addEventListener("pointermove", this.onPointerMove);
    this.stage.addEventListener("pointerup", this.onPointerUp);
    this.stage.addEventListener("pointercancel", this.onPointerUp);
    this.stage.addEventListener("wheel", this.onWheel, { passive: false });
    this.img.addEventListener("dblclick", (e) => this.apply(toggleZoom(this.view, e.clientX, e.clientY, this.size, this.viewport())));
  }

  get isOpen(): boolean {
    return this.host !== null;
  }

  setSettings(settings: Settings): void {
    this.settings = settings;
    this.updateNav();
  }

  open(items: Item[], index: number, returnFocus: HTMLElement): void {
    if (!this.host) this.mount();
    this.items = items;
    this.returnFocus = returnFocus;
    this.show(index);
    this.stage.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.host) return;
    window.removeEventListener("keydown", this.onKey, true);
    window.removeEventListener("resize", this.onResize);
    this.host.remove();
    this.host = null;
    document.documentElement.style.overflow = this.saved.overflow;
    document.body.inert = this.saved.inert;
    this.img.removeAttribute("src");
    this.returnFocus?.focus({ preventScroll: true });
    this.returnFocus = null;
  }

  private mount(): void {
    const host = el("div", { id: "github-image-lightbox" });
    host.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483647;";
    const root = host.attachShadow({ mode: "open" });
    root.append(el("style", { textContent: STYLE }), this.stage);
    // Outside <body>, so making the page inert leaves the lightbox usable and keeps focus inside it.
    document.documentElement.append(host);
    this.host = host;
    this.saved = { overflow: document.documentElement.style.overflow, inert: document.body.inert };
    document.documentElement.style.overflow = "hidden";
    document.body.inert = true;
    window.addEventListener("keydown", this.onKey, true);
    window.addEventListener("resize", this.onResize);
  }

  private show(index: number): void {
    this.index = index;
    const item = this.items[index];
    const token = ++this.loadToken;
    this.img.classList.remove("ready");
    this.message.textContent = "";
    this.img.alt = item.alt;
    this.original.href = item.href;
    this.counter.textContent = this.items.length > 1 ? `${index + 1} / ${this.items.length}` : "";
    this.stage.dataset.index = String(index);
    this.updateNav();

    const ready = () => {
      if (token !== this.loadToken) return;
      this.size = this.img.naturalWidth > 0
        ? { width: this.img.naturalWidth, height: this.img.naturalHeight }
        : FALLBACK_SIZE;
      this.img.style.width = `${this.size.width}px`;
      this.img.style.height = `${this.size.height}px`;
      this.apply(fitted(this.size, this.viewport()));
      this.img.classList.add("ready");
    };
    this.img.onload = ready;
    this.img.onerror = () => {
      if (token === this.loadToken) this.message.textContent = "This image didn't load. Try “Open original”.";
    };
    this.img.src = item.src;
    if (this.img.complete && this.img.naturalWidth > 0) ready();

    for (const neighbour of [index - 1, index + 1]) {
      const near = this.items[step(neighbour, 0, this.items.length, true)];
      if (near && near !== item) new Image().src = near.src;
    }
  }

  private go(delta: number): void {
    if (this.items.length < 2) return;
    const next = step(this.index, delta, this.items.length, this.settings.wrap);
    if (next !== this.index) this.show(next);
  }

  private updateNav(): void {
    const single = this.items.length < 2;
    this.prevButton.hidden = single;
    this.nextButton.hidden = single;
    this.prevButton.disabled = !this.settings.wrap && this.index === 0;
    this.nextButton.disabled = !this.settings.wrap && this.index === this.items.length - 1;
  }

  private viewport(): Size {
    return { width: this.stage.clientWidth || window.innerWidth, height: this.stage.clientHeight || window.innerHeight };
  }

  private apply(view: View): void {
    this.view = view;
    this.img.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    this.zoomLabel.textContent = `${Math.round(view.scale * 100)}%`;
    this.stage.dataset.scale = view.scale.toFixed(3);
  }

  private zoomCentre(factor: number): void {
    const { width, height } = this.viewport();
    this.apply(zoomAt(this.view, factor, width / 2, height / 2, this.size, this.viewport()));
  }

  private onKey = (event: KeyboardEvent): void => {
    // Keep GitHub's own shortcuts from firing behind the lightbox.
    event.stopPropagation();
    switch (event.key) {
      case "Escape": this.close(); break;
      case "ArrowLeft": this.go(-1); break;
      case "ArrowRight": this.go(1); break;
      case "+": case "=": this.zoomCentre(1.25); break;
      case "-": this.zoomCentre(0.8); break;
      case "0": this.apply(fitted(this.size, this.viewport())); break;
      default: return;
    }
    event.preventDefault();
  };

  private onResize = (): void => {
    const wasFitted = Math.abs(this.view.scale - fitScale(this.size, this.viewport())) < 0.01;
    this.apply(wasFitted ? fitted(this.size, this.viewport()) : clampPan(this.view, this.size, this.viewport()));
  };

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const pixels = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY;
    this.apply(zoomAt(this.view, Math.exp(-pixels * 0.002), event.clientX, event.clientY, this.size, this.viewport()));
  };

  private onPointerDown = (event: PointerEvent): void => {
    this.suppressClick = false;
    if (event.button !== 0 || event.target !== this.img) return;
    event.preventDefault();
    // Capture on the image, not the stage: the click that ends a press goes to the capturing
    // element, and a click on the stage means "close".
    this.img.setPointerCapture(event.pointerId);
    this.drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, from: this.view, moved: false };
    this.stage.classList.add("dragging");
  };

  private onPointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.hypot(dx, dy) > 3) drag.moved = true;
    this.apply(clampPan({ ...drag.from, x: drag.from.x + dx, y: drag.from.y + dy }, this.size, this.viewport()));
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (!this.drag || event.pointerId !== this.drag.id) return;
    this.suppressClick = this.drag.moved;
    this.drag = null;
    this.stage.classList.remove("dragging");
  };

  private onClick = (event: MouseEvent): void => {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    if (event.target === this.stage && this.settings.closeOnBackdrop) this.close();
  };
}
