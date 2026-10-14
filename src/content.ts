import { isSelfImageLink } from "./links";
import { type Item, Lightbox } from "./lightbox";
import { DEFAULTS, loadSettings, onSettingsChanged } from "./settings";

// Badges and emoji are about 20px tall. Anything this short is not a screenshot.
const MAX_BADGE_HEIGHT = 40;

const lightbox = new Lightbox(DEFAULTS);
void loadSettings().then((settings) => lightbox.setSettings(settings));
onSettingsChanged((settings) => lightbox.setSettings(settings));

/** The image a link wraps, if the link is GitHub's link to that same image. */
function linkedImage(link: HTMLAnchorElement): HTMLImageElement | null {
  const images = link.querySelectorAll("img");
  if (images.length !== 1 || link.textContent?.trim()) return null;
  const img = images[0];
  if (img.naturalHeight > 0 && img.naturalHeight <= MAX_BADGE_HEIGHT) return null;
  const sources = [img.currentSrc, img.src].filter(Boolean);
  return sources.some((src) => isSelfImageLink(link.href, src, location.href)) ? img : null;
}

function toItem(link: HTMLAnchorElement, img: HTMLImageElement): Item {
  return { src: img.currentSrc || img.src, href: link.href, alt: img.alt };
}

// One capturing listener on the document keeps working as GitHub swaps page content without reloads.
document.addEventListener(
  "click",
  (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    // Modifier clicks keep their usual meaning, such as opening the image in a new tab.
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element
      ? event.target.closest<HTMLAnchorElement>(".markdown-body a[href]")
      : null;
    if (!link || !linkedImage(link)) return;

    // Arrow keys step through the images in the same comment or readme.
    const scope = link.closest(".markdown-body") ?? document;
    const gallery: [HTMLAnchorElement, HTMLImageElement][] = [];
    for (const candidate of scope.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      const img = linkedImage(candidate);
      if (img) gallery.push([candidate, img]);
    }
    event.preventDefault();
    lightbox.open(
      gallery.map(([a, img]) => toItem(a, img)),
      gallery.findIndex(([a]) => a === link),
      link,
    );
  },
  true,
);
