export interface Settings {
  /** Arrow keys wrap from the last image to the first and back. */
  wrap: boolean;
  /** Clicking the dark area around the image closes the lightbox. */
  closeOnBackdrop: boolean;
}

export const DEFAULTS: Settings = { wrap: true, closeOnBackdrop: true };

// Firefox's `browser` namespace returns promises; Chrome's `chrome` does in MV3.
const api: typeof chrome = (globalThis as { browser?: typeof chrome }).browser ?? chrome;

export async function loadSettings(): Promise<Settings> {
  const stored = await api.storage.sync.get(DEFAULTS as unknown as Record<string, unknown>);
  return { ...DEFAULTS, ...stored };
}

export function saveSettings(patch: Partial<Settings>): Promise<void> {
  return api.storage.sync.set(patch);
}

export function onSettingsChanged(listener: (settings: Settings) => void): void {
  api.storage.onChanged.addListener((_changes, area) => {
    if (area === "sync") void loadSettings().then(listener);
  });
}
