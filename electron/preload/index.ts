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

if (!process.contextIsolated) {
  throw new Error("Nyx preload requires contextIsolation=true.");
}

contextBridge.exposeInMainWorld("nyx", api);
