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
  ['darkall', 'touch', 'net', 'zoom', 'shotall', 'opendevtools'].forEach((k) => {  // test-only overrides
    if (argValue(k)) query[k] = argValue(k);
  });
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

// CDP commands against a frame's webContents (dark mode, touch emulation).
function cdp(id, method, params) {
  const wc = webContents.fromId(id);
  if (!wc || wc.isDestroyed()) return Promise.resolve();
  try {
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
  } catch (e) { return Promise.resolve(); }
  return wc.debugger.sendCommand(method, params).catch(() => {});
}

// prefers-color-scheme per frame; '' returns the page to the OS setting.
ipcMain.handle('set-dark', (event, id, on) => {
  return cdp(id, 'Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: on ? 'dark' : '' }]
  });
});

// Touch emulation: the mouse emits touch events, like DevTools device mode.
ipcMain.handle('set-touch', async (event, id, on) => {
  await cdp(id, 'Emulation.setTouchEmulationEnabled', { enabled: !!on, maxTouchPoints: 5 });
  await cdp(id, 'Emulation.setEmitTouchEventsForMouse', { enabled: !!on, configuration: 'mobile' });
});

// Full-page screenshot of a frame: CDP captures beyond the viewport at the
// frame's real pixel ratio; plain capturePage is the fallback.
function shotDir() {
  return argValue('shotdir') ||
    path.join(app.getPath('pictures'), 'Mobile-First Dev Tester');
}

ipcMain.handle('capture', async (event, id, meta) => {
  const wc = webContents.fromId(id);
  if (!wc || wc.isDestroyed()) return { error: 'frame is gone' };
  // The guest surface is exactly the webview element's size, and the renderer
  // grows the element to the page's full height before calling this (CDP's
  // captureBeyondViewport tiles the viewport when device emulation is on).
  let buf;
  try { buf = (await wc.capturePage()).toPNG(); }
  catch (e) { return { error: e.message }; }
  if (!buf || !buf.length) return { error: 'empty capture' };
  const dir = shotDir();
  const clean = (s) => String(s || '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
  const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const name = [clean(meta.host) || 'page', clean(meta.device), meta.w + 'x' + meta.h, ts]
    .join('_') + '.png';
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), buf);
  } catch (e) { return { error: e.message }; }
  return { path: path.join(dir, name), name };
});

ipcMain.handle('show-item', (event, p) => {
  if (typeof p === 'string' && p.startsWith(shotDir())) shell.showItemInFolder(p);
});

// Network throttling: session-wide, so every frame feels the same network.
const NET_PROFILES = {
  online: null,
  fast3g: { latency: 170, downloadThroughput: 200 * 1024, uploadThroughput: 94 * 1024 },
  slow3g: { latency: 400, downloadThroughput: 50 * 1024, uploadThroughput: 50 * 1024 },
  offline: { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }
};
ipcMain.handle('set-network', (event, key) => {
  if (!(key in NET_PROFILES)) return;
  const { session } = require('electron');
  const ses = session.defaultSession;
  const p = NET_PROFILES[key];
  if (p) ses.enableNetworkEmulation(p);
  else ses.disableNetworkEmulation();
  // Throttling only affects the network layer; cached pages would still load
  // instantly. Offline must mean offline, so block requests outright too.
  if (key === 'offline') {
    ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] },
      (details, cb) => cb({ cancel: true }));
  } else {
    ses.webRequest.onBeforeRequest(null);
  }
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
