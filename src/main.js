// Main process: creates the app window. The device frames themselves are
// <webview> tags in the renderer (enabled below), so each frame is a real,
// isolated browser viewport with its own size and user agent.
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 1000,
    minWidth: 700,
    minHeight: 500,
    backgroundColor: '#1b1b1b',
    title: 'Mobile-First Dev Tester',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,        // device frames are <webview>s
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.removeMenu();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  return win;
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
