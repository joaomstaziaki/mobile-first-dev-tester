// Preload: the bridge between the renderer UI and the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('devTester', {
  version: process.versions.electron,

  // Turn on Chromium device emulation (mobile screen, DPR) for a webview.
  emulate: (webContentsId, params) => ipcRenderer.invoke('emulate', webContentsId, params),

  // Open a URL in the user's default browser.
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Emulation toggles (CDP / session level, main process does the work).
  setDark: (webContentsId, on) => ipcRenderer.invoke('set-dark', webContentsId, on),
  setTouch: (webContentsId, on) => ipcRenderer.invoke('set-touch', webContentsId, on),
  setNetwork: (profile) => ipcRenderer.invoke('set-network', profile),

  // HTTP basic auth: main asks the UI for credentials; the UI answers.
  onAuthRequest: (handler) => ipcRenderer.on('auth-request', (e, req) => handler(req)),
  sendAuth: (id, user, pass) => ipcRenderer.send('auth-response', id, user, pass)
});
