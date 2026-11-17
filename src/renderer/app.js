// Renderer UI. Task 3: a rail of device frames — presets with per-device
// user agent, pixel ratio and shell chrome; add / remove / rotate / resize;
// the setup is remembered across launches.
(function () {
  'use strict';

  /* ---------- device catalog ---------- */

  var UAS = {
    ios:     'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    ipad:    'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  };

  var DEVICES = {
    'iphone-se':   { name: 'iPhone SE',         w: 375,  h: 667,  dpr: 2,     kind: 'ios' },
    'iphone-13':   { name: 'iPhone 13 / 14',    w: 390,  h: 844,  dpr: 3,     kind: 'ios' },
    'iphone-15':   { name: 'iPhone 15 / 16',    w: 393,  h: 852,  dpr: 3,     kind: 'ios' },
    'iphone-pm':   { name: 'iPhone 15 Pro Max', w: 430,  h: 932,  dpr: 3,     kind: 'ios' },
    'galaxy-s23':  { name: 'Galaxy S23',        w: 360,  h: 780,  dpr: 3,     kind: 'android' },
    'pixel-8':     { name: 'Pixel 8',           w: 412,  h: 915,  dpr: 2.625, kind: 'android' },
    'ipad-mini':   { name: 'iPad Mini',         w: 768,  h: 1024, dpr: 2,     kind: 'ipad' },
    'ipad-air':    { name: 'iPad Air',          w: 820,  h: 1180, dpr: 2,     kind: 'ipad' },
    'desktop':     { name: 'Desktop 1280',      w: 1280, h: 800,  dpr: 1,     kind: 'desktop' },
    'desktop-xl':  { name: 'Desktop 1440',      w: 1440, h: 900,  dpr: 1,     kind: 'desktop' }
  };
  var DEFAULT_SETUP = [
    { dev: 'iphone-13' }, { dev: 'galaxy-s23' }, { dev: 'desktop' }
  ];

  var urlBox = document.getElementById('url');
  var railBox = document.getElementById('frames');
  var railScale = document.getElementById('railscale');
  var addSel = document.getElementById('adddev');
  var frames = [];
  var currentUrl = '';
  var qs = new URLSearchParams(location.search);
  var WV_PRELOAD = new URL('../webview-preload.js', location.href).href;

  var syncScroll = localStorage.getItem('mfdt-sync-scroll') !== '0';
  var syncClicks = localStorage.getItem('mfdt-sync-clicks') !== '0';
  var touchOn = qs.get('touch') ? qs.get('touch') === '1' : localStorage.getItem('mfdt-touch') === '1';
  var netMode = qs.get('net') || localStorage.getItem('mfdt-net') || 'online';
  var zoomMode = qs.get('zoom') || localStorage.getItem('mfdt-zoom') || 'fit';

  /* ---------- zoom: scale the rail visually, keep viewports honest ---------- */

  function applyZoom() {
    var z = 1;
    railScale.style.transform = '';
    railScale.style.marginRight = '';
    railScale.style.marginBottom = '';
    if (zoomMode === 'fit') {
      var w = railScale.offsetWidth;
      var avail = railBox.clientWidth - 4;
      z = w > avail ? Math.max(0.25, avail / w) : 1;
    } else {
      z = parseFloat(zoomMode) || 1;
    }
    if (z !== 1) {
      railScale.style.transform = 'scale(' + z + ')';
      railScale.style.marginRight = -(railScale.offsetWidth * (1 - z)) + 'px';
      railScale.style.marginBottom = -(railScale.offsetHeight * (1 - z)) + 'px';
    }
  }
  window.addEventListener('resize', applyZoom);

  /* ---------- helpers ---------- */

  function toUrl(raw) {
    var p = raw.trim().replace(/^["']|["']$/g, '');
    if (!p) return '';
    if (/^(https?|file):/i.test(p)) return p;
    if (/^[a-zA-Z]:[\\\/]/.test(p)) {        // a local file path
      return 'file:///' + p.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
    }
    if (/^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)([:\/]|$)/i.test(p)) return 'http://' + p;
    return 'https://' + p;
  }

  function hostOf(u) {
    try { return new URL(u).host; } catch (e) { return u; }
  }

  // Same page despite device-specific hosts: en.m.wikipedia.org == en.wikipedia.org.
  function normUrl(u) {
    try {
      var x = new URL(u);
      var host = x.host.split('.').filter(function (s) {
        return s !== 'm' && s !== 'www' && s !== 'mobile';
      }).join('.');
      return host + x.pathname + x.search;
    } catch (e) { return u; }
  }

  function broadcast(from, channel, payload) {
    frames.forEach(function (o) {
      if (o === from || !o.webview) return;
      try { o.webview.send(channel, payload); } catch (e) {}
    });
  }

  // A frame navigated somewhere new (a clicked link, a redirect the others
  // missed): bring the rest of the rail along.
  function maybeSyncNav(f, url) {
    if (!syncClicks || !currentUrl || !url || url === 'about:blank') return;
    if (normUrl(url) === normUrl(currentUrl)) return;
    currentUrl = url;
    urlBox.value = url;
    frames.forEach(function (o) {
      if (o === f || !o.webview) return;
      var there = '';
      try { there = o.webview.getURL(); } catch (e) {}
      if (normUrl(there) !== normUrl(url)) {
        try { o.webview.loadURL(url); } catch (e) {}
      }
    });
  }

  function setNote(f, msg, warn) {
    f.note.textContent = msg || '';
    f.note.className = 'note' + (warn ? ' warn' : '');
    f.notePath = null;
  }

  /* ---------- screenshots ---------- */

  function shotFrame(f) {
    return new Promise(function (done) {
    var d = DEVICES[f.dev];
    var meta = {
      host: hostOf(currentUrl || ''),
      device: d.name,
      w: f.w, h: f.h,
      kind: d.kind, dpr: d.dpr,
      vh: f.webview.clientHeight || 600
    };
    var id;
    var wv = f.webview;
    try { id = wv.getWebContentsId(); } catch (e) { done(); return; }
    setNote(f, 'Capturing…');
    // Viewport capture: exactly what the frame shows, fold and all.
    window.devTester.capture(id, meta).then(function (r) {
      if (r && r.path) {
        setNote(f, 'Saved ' + r.name + ' — click to show in folder');
        f.note.classList.add('link');
        f.notePath = r.path;
      } else {
        setNote(f, 'Screenshot failed: ' + (r && r.error || 'unknown'), true);
      }
      done();
    }).catch(function (e) {
      setNote(f, 'Screenshot failed: ' + e.message, true);
      done();
    });
    });
  }

  // One frame at a time: several giant surfaces at once can stall the compositor.
  function shotAll() {
    frames.reduce(function (p, f) {
      return p.then(function () { return shotFrame(f); });
    }, Promise.resolve());
  }

  function saveFrames() {
    try {
      localStorage.setItem('mfdt-frames', JSON.stringify(frames.map(function (f) {
        return { dev: f.dev, w: f.w, h: f.h, dark: f.dark };
      })));
    } catch (e) {}
  }

  /* ---------- shell markup per device kind ---------- */

  function shellHtml(kind) {
    if (kind === 'ios') return (
      '<div class="status"><span>9:41</span><span>●●● ◠ ▮</span></div>' +
      '<div class="screen"></div>' +
      '<div class="safaribar">' +
      '<div class="pill"><span class="lock">🔒</span><span class="host">Search or enter website</span></div>' +
      '<div class="tools"><span class="back off">‹</span><span class="fwd off">›</span>' +
      '<span>↑</span><span>☐</span><span>▦</span></div>' +
      '</div>' +
      '<div class="home"><i></i></div>');
    if (kind === 'android') return (
      '<div class="status"><span>10:30</span><span>▲ ▮ ▰</span></div>' +
      '<div class="chromebar">' +
      '<div class="pill"><span class="lock">🔒</span><span class="host">Search or type URL</span></div>' +
      '<span class="dots">⋮</span></div>' +
      '<div class="screen"></div>' +
      '<div class="home"><i></i></div>');
    if (kind === 'ipad') return (
      '<div class="status"><span>9:41</span><span>●●● ◠ ▮</span></div>' +
      '<div class="padbar">' +
      '<span class="back off">‹</span><span class="fwd off">›</span>' +
      '<div class="pill"><span class="lock">🔒</span><span class="host">Search or enter website</span></div>' +
      '<span>↑</span><span>＋</span><span>▦</span></div>' +
      '<div class="screen"></div>' +
      '<div class="home"><i></i></div>');
    return '<div class="screen"></div>';   // desktop: plain viewport
  }

  /* ---------- webview ---------- */

  function makeWebview(f) {
    if (f.webview) { f.webview.remove(); f.webview = null; }
    f.emulated = false;
    var wv = document.createElement('webview');
    wv.setAttribute('preload', WV_PRELOAD);
    wv.setAttribute('useragent', UAS[DEVICES[f.dev].kind]);
    wv.setAttribute('src', currentUrl || 'about:blank');
    f.webview = wv;
    f.shell.querySelector('.screen').appendChild(wv);

    wv.addEventListener('dom-ready', function () {
      if (f.webview !== wv) return;
      var d = DEVICES[f.dev];
      var id = wv.getWebContentsId();
      if (!f.emulated && d.kind !== 'desktop' && qs.get('emu') !== '0') {
        f.emulated = true;
        window.devTester.emulate(id, {
          screenPosition: 'mobile',
          screenSize: { width: f.w, height: f.h },
          viewSize: { width: 0, height: 0 },
          deviceScaleFactor: d.dpr,
          viewPosition: { x: 0, y: 0 },
          scale: 1
        });
      }
      if (f.dark) window.devTester.setDark(id, true);
      if (touchOn && d.kind !== 'desktop') window.devTester.setTouch(id, true);
    });
    wv.addEventListener('did-navigate', function (e) {
      onNav(f, e.url);
      maybeSyncNav(f, e.url);
    });
    wv.addEventListener('did-navigate-in-page', function (e) { onNav(f, e.url); });
    wv.addEventListener('ipc-message', function (e) {
      if (f.webview !== wv) return;
      if (e.channel === 'sync-scroll' && syncScroll) broadcast(f, 'apply-scroll', e.args[0]);
      else if (e.channel === 'sync-click' && syncClicks) broadcast(f, 'apply-click', e.args[0]);
    });
    wv.addEventListener('did-fail-load', function (e) {
      if (!e.isMainFrame || e.errorCode === -3 || netMode === 'offline') return;
      setNote(f, 'Could not load ' + (e.validatedURL || currentUrl) + ' — ' +
        e.errorDescription + '. Is the dev server running?', true);
    });
    wv.addEventListener('did-start-loading', function () {
      if (netMode !== 'offline') setNote(f, 'Loading…');
    });
    wv.addEventListener('did-stop-loading', function () {
      if (f.note.textContent === 'Loading…') setNote(f, '');
    });
    size(f);
  }

  function onNav(f, url) {
    var pillHost = f.shell.querySelector('.pill .host');
    var lock = f.shell.querySelector('.pill .lock');
    if (pillHost && url && url !== 'about:blank') {
      pillHost.textContent = hostOf(url);
      lock.style.display = /^https:/.test(url) ? '' : 'none';
    }
    var back = f.shell.querySelector('.back');
    var fwd = f.shell.querySelector('.fwd');
    if (back) back.classList.toggle('off', !f.webview.canGoBack());
    if (fwd) fwd.classList.toggle('off', !f.webview.canGoForward());
  }

  /* ---------- frames ---------- */

  function size(f) {
    f.shell.style.width = f.w + 'px';
    f.shell.style.height = f.h + 'px';
    f.webview.style.width = f.w + 'px';
    f.el.style.width = f.shell.offsetWidth + 'px';
    applyZoom();
    if (f.emulated) {
      f.emulated = false;             // re-apply with the new screen size
      try { f.webview.reload(); } catch (e) {}
    }
  }

  function addFrame(cfg) {
    var f = { dev: cfg.dev };
    var d = DEVICES[f.dev];
    if (!d) return;
    f.w = cfg.w || d.w;
    f.h = cfg.h || d.h;
    f.dark = !!cfg.dark || qs.get('darkall') === '1';

    var el = document.createElement('div');
    el.className = 'frame';
    f.el = el;

    var options = Object.keys(DEVICES).map(function (k) {
      return '<option value="' + k + '">' + DEVICES[k].name + '</option>';
    }).join('');

    el.innerHTML =
      '<div class="bar">' +
      '<select class="dev" title="Device preset">' + options + '</select>' +
      '<input class="w" type="number" min="280" max="2000" title="Viewport width, px">×' +
      '<input class="hh" type="number" min="400" max="2000" title="Screen height, px">' +
      '<button class="rot" title="Rotate (swap width and height)">⟳</button>' +
      '<button class="dk" title="Emulate prefers-color-scheme: dark in this frame">Dark</button>' +
      '<button class="dt" title="Open DevTools for this frame">dev</button>' +
      '<button class="cam" title="Save a full-page screenshot of this frame">📷</button>' +
      '<a class="open" title="Open the current URL in your default browser">open</a>' +
      '<button class="x" title="Remove this frame">×</button></div>' +
      '<div class="note"></div>' +
      '<div class="shell"></div>';

    f.note = el.querySelector('.note');
    f.shell = el.querySelector('.shell');

    var devSel = el.querySelector('.dev');
    var wBox = el.querySelector('.w');
    var hBox = el.querySelector('.hh');
    devSel.value = f.dev;
    wBox.value = f.w;
    hBox.value = f.h;

    function rebuildShell() {
      var kind = DEVICES[f.dev].kind;
      f.shell.className = 'shell ' + kind + (f.dark ? ' dark' : '');
      f.shell.innerHTML = shellHtml(kind);
      var back = f.shell.querySelector('.back');
      var fwd = f.shell.querySelector('.fwd');
      if (back) back.addEventListener('click', function () { if (f.webview.canGoBack()) f.webview.goBack(); });
      if (fwd) fwd.addEventListener('click', function () { if (f.webview.canGoForward()) f.webview.goForward(); });
      makeWebview(f);
    }

    devSel.addEventListener('change', function () {
      f.dev = devSel.value;
      var nd = DEVICES[f.dev];
      f.w = nd.w; f.h = nd.h;
      wBox.value = f.w; hBox.value = f.h;
      rebuildShell();
      saveFrames();
    });
    wBox.addEventListener('change', function () {
      f.w = parseInt(wBox.value, 10) || f.w; wBox.value = f.w; size(f); saveFrames();
    });
    hBox.addEventListener('change', function () {
      f.h = parseInt(hBox.value, 10) || f.h; hBox.value = f.h; size(f); saveFrames();
    });
    el.querySelector('.rot').addEventListener('click', function () {
      var t = f.w; f.w = f.h; f.h = t;
      wBox.value = f.w; hBox.value = f.h;
      size(f); saveFrames();
    });
    el.querySelector('.dt').addEventListener('click', function () {
      try { f.webview.openDevTools(); } catch (e) {}
    });
    el.querySelector('.cam').addEventListener('click', function () { shotFrame(f); });
    f.note.addEventListener('click', function () {
      if (f.notePath) window.devTester.showItem(f.notePath);
    });
    var dkBtn = el.querySelector('.dk');
    dkBtn.classList.toggle('on', f.dark);
    dkBtn.addEventListener('click', function () {
      f.dark = !f.dark;
      dkBtn.classList.toggle('on', f.dark);
      f.shell.classList.toggle('dark', f.dark);
      try { window.devTester.setDark(f.webview.getWebContentsId(), f.dark); } catch (e) {}
      saveFrames();
    });
    el.querySelector('.open').addEventListener('click', function () {
      if (currentUrl) window.devTester.openExternal(currentUrl);
    });
    el.querySelector('.x').addEventListener('click', function () {
      frames.splice(frames.indexOf(f), 1);
      el.remove();
      saveFrames();
      applyZoom();
    });

    railScale.appendChild(el);   // attach first: sizing reads offsetWidth
    rebuildShell();
    frames.push(f);
    applyZoom();
    return f;
  }

  /* ---------- loading ---------- */

  function addRecent(raw) {
    try {
      var list = JSON.parse(localStorage.getItem('mfdt-recents') || '[]');
      list = [raw].concat(list.filter(function (x) { return x !== raw; })).slice(0, 12);
      localStorage.setItem('mfdt-recents', JSON.stringify(list));
      fillRecents(list);
    } catch (e) {}
  }

  function fillRecents(list) {
    document.getElementById('recentlist').innerHTML = (list || []).map(function (u) {
      return '<option value="' + u.replace(/"/g, '&quot;') + '"></option>';
    }).join('');
  }

  function load(raw, noSave) {
    var url = toUrl(raw);
    if (!url) return;
    currentUrl = url;
    if (!noSave) {
      try { localStorage.setItem('mfdt-url', raw.trim()); } catch (e) {}
      addRecent(raw.trim());
    }
    frames.forEach(function (f) {
      setNote(f, '');
      f.webview.setAttribute('src', url);
    });
    showNetNotes();
  }

  function reloadAll() {
    if (!currentUrl) return;
    frames.forEach(function (f) { f.webview.reload(); });
  }

  function clearAll() {
    currentUrl = '';
    urlBox.value = '';
    try { localStorage.removeItem('mfdt-url'); } catch (e) {}
    frames.forEach(function (f) {
      f.webview.setAttribute('src', 'about:blank');
      var pillHost = f.shell.querySelector('.pill .host');
      if (pillHost) pillHost.textContent = 'Search or enter website';
      setNote(f, '');
    });
  }

  /* ---------- HTTP basic-auth dialog ---------- */

  var authModal = document.getElementById('authmodal');
  var authWhere = document.getElementById('authwhere');
  var authUser = document.getElementById('authuser');
  var authPass = document.getElementById('authpass');
  var authQueue = [];
  var authCurrent = null;

  function nextAuth() {
    authCurrent = authQueue.shift() || null;
    if (!authCurrent) { authModal.hidden = true; return; }
    authWhere.textContent = (authCurrent.isProxy ? 'Proxy ' : '') + authCurrent.host +
      (authCurrent.realm ? ' — "' + authCurrent.realm + '"' : '');
    authUser.value = '';
    authPass.value = '';
    authModal.hidden = false;
    authUser.focus();

    var fill = qs.get('authfill');   // test-only: answers the dialog automatically
    if (fill) {
      var i = fill.indexOf(':');
      authUser.value = fill.slice(0, i);
      authPass.value = fill.slice(i + 1);
      answerAuth(true);
    }
  }

  function answerAuth(ok) {
    if (!authCurrent) return;
    if (ok) window.devTester.sendAuth(authCurrent.id, authUser.value, authPass.value);
    else window.devTester.sendAuth(authCurrent.id, null, null);
    authPass.value = '';
    nextAuth();
  }

  window.devTester.onAuthRequest(function (req) {
    authQueue.push(req);
    if (!authCurrent) nextAuth();
  });

  document.getElementById('authform').addEventListener('submit', function (e) {
    e.preventDefault();
    answerAuth(true);
  });
  document.getElementById('authcancel').addEventListener('click', function () { answerAuth(false); });

  /* ---------- wire up ---------- */

  var setup = null;
  try { setup = JSON.parse(localStorage.getItem('mfdt-frames') || 'null'); } catch (e) {}
  if (!setup || !setup.length) setup = DEFAULT_SETUP;
  setup.forEach(function (cfg) { if (DEVICES[cfg.dev]) addFrame(cfg); });
  if (!frames.length) DEFAULT_SETUP.forEach(addFrame);

  addSel.innerHTML = '<option value="">+ Add device</option>' +
    Object.keys(DEVICES).map(function (k) {
      return '<option value="' + k + '">' + DEVICES[k].name + '</option>';
    }).join('');
  addSel.addEventListener('change', function () {
    if (addSel.value) {
      addFrame({ dev: addSel.value });
      saveFrames();
      railBox.scrollLeft = railBox.scrollWidth;
    }
    addSel.value = '';
  });

  var scrollTog = document.getElementById('syncscroll');
  var clickTog = document.getElementById('syncclicks');
  scrollTog.checked = syncScroll;
  clickTog.checked = syncClicks;
  scrollTog.addEventListener('change', function () {
    syncScroll = scrollTog.checked;
    try { localStorage.setItem('mfdt-sync-scroll', syncScroll ? '1' : '0'); } catch (e) {}
  });
  clickTog.addEventListener('change', function () {
    syncClicks = clickTog.checked;
    try { localStorage.setItem('mfdt-sync-clicks', syncClicks ? '1' : '0'); } catch (e) {}
  });

  var touchTog = document.getElementById('touchtog');
  touchTog.checked = touchOn;
  touchTog.addEventListener('change', function () {
    touchOn = touchTog.checked;
    try { localStorage.setItem('mfdt-touch', touchOn ? '1' : '0'); } catch (e) {}
    frames.forEach(function (f) {
      if (DEVICES[f.dev].kind === 'desktop') return;
      try { window.devTester.setTouch(f.webview.getWebContentsId(), touchOn); } catch (e) {}
    });
  });

  function showNetNotes() {
    frames.forEach(function (f) {
      if (netMode === 'offline') setNote(f, 'Offline: the network is set to Offline in the toolbar.', true);
      else if (f.note.textContent.indexOf('Offline:') === 0) setNote(f, '');
    });
  }

  var netSel = document.getElementById('net');
  netSel.value = netMode;
  var netReady = Promise.resolve(window.devTester.setNetwork(netMode)).catch(function () {});
  if (netMode === 'offline') showNetNotes();
  netSel.addEventListener('change', function () {
    netMode = netSel.value;
    try { localStorage.setItem('mfdt-net', netMode); } catch (e) {}
    window.devTester.setNetwork(netMode);
    showNetNotes();
  });

  var zoomSel = document.getElementById('zoom');
  zoomSel.value = zoomMode;
  zoomSel.addEventListener('change', function () {
    zoomMode = zoomSel.value;
    try { localStorage.setItem('mfdt-zoom', zoomMode); } catch (e) {}
    applyZoom();
  });
  applyZoom();

  document.getElementById('shotall').addEventListener('click', shotAll);
  try { fillRecents(JSON.parse(localStorage.getItem('mfdt-recents') || '[]')); } catch (e) {}

  // Test-only flags: exercise the UI without a human at the keyboard.
  if (qs.get('shotall') === '1') setTimeout(shotAll, 10000);
  if (qs.get('opendevtools') === '1') {
    setTimeout(function () {
      if (frames[0]) try { frames[0].webview.openDevTools(); } catch (e) {}
    }, 9000);
  }

  // Test-only: --exec="…" runs JS inside the first frame a few seconds after
  // start, to exercise sync without a human at the keyboard.
  if (qs.get('exec')) {
    setTimeout(function () {
      if (frames[0]) frames[0].webview.executeJavaScript(qs.get('exec')).catch(function () {});
    }, 8000);
  }

  document.getElementById('load').addEventListener('click', function () { load(urlBox.value); });
  document.getElementById('reload').addEventListener('click', reloadAll);
  document.getElementById('clear').addEventListener('click', clearAll);
  urlBox.addEventListener('keydown', function (e) { if (e.key === 'Enter') load(urlBox.value); });

  // --url= from the command line wins over the remembered URL (and is not saved).
  // Wait for network emulation to be in place so the first load honours it.
  netReady.then(function () {
    var cliUrl = qs.get('u');
    var saved = '';
    try { saved = localStorage.getItem('mfdt-url') || ''; } catch (e) {}
    if (cliUrl) { urlBox.value = cliUrl; load(cliUrl, true); }
    else if (saved) { urlBox.value = saved; load(saved); }
  });
})();
