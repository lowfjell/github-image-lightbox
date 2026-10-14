function resolve(url: string, base: string): URL | null {
  try {
    return new URL(url, base);
  } catch {
    return null;
  }
}

// GitHub shows a file at /owner/repo/blob/ref/path and serves its bytes at
// /owner/repo/raw/ref/path (or blob/...?raw=true), so treat those as one URL.
function canonical(url: URL): string {
  const copy = new URL(url.href);
  copy.hash = "";
  if (copy.hostname === "github.com") {
    copy.pathname = copy.pathname.replace(/^(\/[^/]+\/[^/]+)\/blob\//, "$1/raw/");
    copy.searchParams.delete("raw");
  }
  return copy.href;
}

/**
 * True when a link points at the same image it wraps. GitHub's markdown
 * renderer links every embedded image to itself this way. Badges and other
 * images that link somewhere else return false.
 */
export function isSelfImageLink(href: string, src: string, pageUrl: string): boolean {
  const link = resolve(href, pageUrl);
  const image = resolve(src, pageUrl);
  if (!link || !image) return false;
  if (link.protocol !== "https:" && link.protocol !== "http:") return false;
  return canonical(link) === canonical(image);
}
