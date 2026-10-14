import { type Settings, loadSettings, saveSettings } from "./settings";

const keys = ["wrap", "closeOnBackdrop"] as const satisfies readonly (keyof Settings)[];
const status = document.getElementById("status")!;

void loadSettings().then((settings) => {
  for (const key of keys) {
    const box = document.getElementById(key) as HTMLInputElement;
    box.checked = settings[key];
    box.addEventListener("change", async () => {
      await saveSettings({ [key]: box.checked });
      status.textContent = "Saved.";
    });
  }
});
