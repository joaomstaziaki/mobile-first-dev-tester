// Main process: creates the app window and services IPC from the renderer.
// The device frames themselves are <webview> tags in the renderer, so each
// frame is a real, isolated browser viewport with its own size and user agent.
const { app, BrowserWindow, ipcMain, webContents, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// CLI: --url=https://… auto-loads a URL on start; --shot=file.png captures
// the window a few seconds later and quits (used for automated checks).
function argValue(name) {
  const hit = process.argv.find(a => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : '';
}
const startUrl = argValue('url');
const shotPath = argValue('shot');
const shotDelay = parseInt(argValue('shotdelay'), 10) || 7000;

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
  const query = {};
  if (startUrl) query.u = startUrl;
  if (argValue('emu')) query.emu = argValue('emu');
  if (argValue('authfill')) query.authfill = argValue('authfill'); // test-only
  if (argValue('exec')) query.exec = argValue('exec');             // test-only
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query });

  if (shotPath) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const img = await win.webContents.capturePage();
          fs.writeFileSync(shotPath, img.toPNG());
          console.log('shot written: ' + shotPath);
        } catch (e) {
          console.error('shot failed: ' + e.message);
        }
        app.quit();
      }, shotDelay);
    });
  }
  return win;
}

// window.open / target=_blank inside a device frame: navigate the frame
// itself instead of popping a native window, like a phone browser would.
app.on('web-contents-created', (event, contents) => {
  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) contents.loadURL(url);
      return { action: 'deny' };
    });
  }
});

// Chromium device emulation for a frame's webContents (mobile screen, DPR).
ipcMain.handle('emulate', (event, id, params) => {
  const wc = webContents.fromId(id);
  if (wc && !wc.isDestroyed()) wc.enableDeviceEmulation(params);
});

ipcMain.handle('open-external', (event, url) => {
  if (/^https?:/i.test(url)) shell.openExternal(url);
});

// HTTP basic auth (e.g. an nginx-protected dev/staging site): Electron shows
// no login prompt of its own, so ask the user through a dialog in the UI.
// Credentials go straight to the auth callback and are never written anywhere.
let mainWin = null;
let authSeq = 0;
const authCallbacks = new Map();

app.on('login', (event, wc, details, authInfo, callback) => {
  event.preventDefault();
  const id = ++authSeq;
  authCallbacks.set(id, callback);
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('auth-request', {
      id,
      host: authInfo.host + (authInfo.port ? ':' + authInfo.port : ''),
      realm: authInfo.realm || '',
      isProxy: !!authInfo.isProxy
    });
  } else {
    authCallbacks.delete(id);
    callback(); // no UI to ask: cancel the challenge
  }
});

ipcMain.on('auth-response', (event, id, user, pass) => {
  const cb = authCallbacks.get(id);
  if (!cb) return;
  authCallbacks.delete(id);
  if (user == null) cb();        // cancelled: the site's 401 page shows
  else cb(user, pass);           // Chromium caches it for the session on success
});

app.whenReady().then(() => {
  mainWin = createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWin = createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
