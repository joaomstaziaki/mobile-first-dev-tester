// Preload: the bridge between the renderer UI and the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('devTester', {
  version: process.versions.electron,

  // Turn on Chromium device emulation (mobile screen, DPR) for a webview.
  emulate: (webContentsId, params) => ipcRenderer.invoke('emulate', webContentsId, params),

  // Open a URL in the user's default browser.
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});
