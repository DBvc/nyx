import { contextBridge } from "electron";

import type { NyxDesktopApi } from "../../shared/contracts/desktop";

const api: NyxDesktopApi = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("nyx", api);
  } catch (error) {
    console.error("Failed to expose Nyx preload API.", error);
  }
} else {
  (globalThis as typeof globalThis & { nyx: NyxDesktopApi }).nyx = api;
}
