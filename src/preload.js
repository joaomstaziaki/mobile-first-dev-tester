// Preload: the bridge between the renderer UI and the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('devTester', {
  version: process.versions.electron,

  // Apply a frame's full emulation state (metrics, touch, dark) in one call.
  applyEmulation: (webContentsId, state) => ipcRenderer.invoke('apply-emulation', webContentsId, state),

  // Open a URL in the user's default browser.
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Session-wide network throttling.
  setNetwork: (profile) => ipcRenderer.invoke('set-network', profile),

  // Screenshots: full-page capture of a frame, saved under Pictures.
  capture: (webContentsId, meta) => ipcRenderer.invoke('capture', webContentsId, meta),
  showItem: (p) => ipcRenderer.invoke('show-item', p),

  // HTTP basic auth: main asks the UI for credentials; the UI answers.
  onAuthRequest: (handler) => ipcRenderer.on('auth-request', (e, req) => handler(req)),
  sendAuth: (id, user, pass) => ipcRenderer.send('auth-response', id, user, pass),

  // Untrusted dev certificates: main asks, the UI answers per host.
  onCertRequest: (handler) => ipcRenderer.on('cert-request', (e, req) => handler(req)),
  sendCert: (host, ok) => ipcRenderer.send('cert-response', host, ok)
});
