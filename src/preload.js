// Preload: the bridge between the renderer UI and the main process.
// Empty for now; task 5+ will expose things like network throttling and
// screenshots here via contextBridge.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('devTester', {
  version: process.versions.electron
});
