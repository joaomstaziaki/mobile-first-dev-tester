// Renderer UI. Task 2: URL bar + one iPhone-style frame whose screen is a
// real browser viewport (<webview>) with a mobile user agent and 3x DPR.
(function () {
  'use strict';

  var IPHONE_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) ' +
    'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

  var urlBox = document.getElementById('url');
  var frames = Array.prototype.slice.call(document.querySelectorAll('.frame'));
  var currentUrl = '';

  // "localhost:3000" -> http://..., bare hosts -> https://...
  function toUrl(raw) {
    var p = raw.trim().replace(/^["']|["']$/g, '');
    if (!p) return '';
    if (/^https?:\/\//i.test(p)) return p;
    if (/^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)([:\/]|$)/i.test(p)) return 'http://' + p;
    return 'https://' + p;
  }

  function hostOf(u) {
    try { return new URL(u).host; } catch (e) { return u; }
  }

  /* ---------- frame ---------- */

  function buildFrame(f) {
    f.device = f.getAttribute('data-device');
    f.screenW = parseInt(f.getAttribute('data-screen'), 10);
    f.h = parseInt(f.getAttribute('data-h'), 10);

    f.innerHTML =
      '<div class="bar"><b>' + f.device + '</b>' +
      '<input class="w" type="number" min="280" max="1400" title="Viewport width, px">×' +
      '<input class="hh" type="number" min="400" max="2000" title="Screen height, px">' +
      '<a class="open" title="Open the current URL in your default browser">open</a></div>' +
      '<div class="note"></div>' +
      '<div class="shell">' +
      '<div class="status"><span>9:41</span><span>●●● ◠ ▮</span></div>' +
      '<div class="screen"></div>' +
      '<div class="safaribar">' +
      '<div class="pill"><span class="lock">🔒</span><span class="host">Search or enter website</span></div>' +
      '<div class="tools"><span class="back off">‹</span><span class="fwd off">›</span>' +
      '<span>↑</span><span>☐</span><span>▦</span></div>' +
      '</div>' +
      '<div class="home"><i></i></div></div>';

    f.shell = f.querySelector('.shell');
    f.screenBox = f.querySelector('.screen');
    f.note = f.querySelector('.note');
    f.pillHost = f.querySelector('.pill .host');
    f.backBtn = f.querySelector('.tools .back');
    f.fwdBtn = f.querySelector('.tools .fwd');

    // The webview is created once; useragent must be set before any load.
    var wv = document.createElement('webview');
    wv.setAttribute('useragent', IPHONE_UA);
    wv.setAttribute('src', 'about:blank');
    f.webview = wv;
    f.screenBox.appendChild(wv);

    var wBox = f.querySelector('.w');
    var hBox = f.querySelector('.hh');
    wBox.value = f.screenW;
    hBox.value = f.h;

    wBox.addEventListener('change', function () {
      f.screenW = parseInt(wBox.value, 10) || f.screenW;
      wBox.value = f.screenW;
      size(f);
    });
    hBox.addEventListener('change', function () {
      f.h = parseInt(hBox.value, 10) || f.h;
      hBox.value = f.h;
      size(f);
    });
    f.querySelector('.open').addEventListener('click', function () {
      if (currentUrl) window.devTester.openExternal(currentUrl);
    });

    f.backBtn.addEventListener('click', function () { if (wv.canGoBack()) wv.goBack(); });
    f.fwdBtn.addEventListener('click', function () { if (wv.canGoForward()) wv.goForward(); });

    wv.addEventListener('dom-ready', function () {
      // Real mobile rendering: 3x device pixel ratio, mobile screen semantics.
      // Applied once; it sticks across navigations in this webview.
      if (!f.emulated && new URLSearchParams(location.search).get('emu') !== '0') {
        f.emulated = true;
        window.devTester.emulate(wv.getWebContentsId(), {
          screenPosition: 'mobile',
          screenSize: { width: f.screenW, height: f.h },
          viewSize: { width: 0, height: 0 },   // 0,0 = use the webview's own size
          deviceScaleFactor: 3,
          viewPosition: { x: 0, y: 0 },
          scale: 1
        });
      }
    });

    wv.addEventListener('did-navigate', function (e) { onNav(f, e.url); });
    wv.addEventListener('did-navigate-in-page', function (e) { onNav(f, e.url); });
    wv.addEventListener('did-fail-load', function (e) {
      if (e.errorCode === -3 || !e.isMainFrame) return;   // -3 = aborted (normal)
      setNote(f, 'Could not load ' + (e.validatedURL || currentUrl) + ' — ' +
        e.errorDescription + '. Is the dev server running?', true);
    });
    wv.addEventListener('did-start-loading', function () { setNote(f, 'Loading…'); });
    wv.addEventListener('did-stop-loading', function () {
      if (f.note.textContent === 'Loading…') setNote(f, '');
    });
    wv.addEventListener('page-title-updated', function (e) {
      f.querySelector('.bar b').title = e.title;
    });

    size(f);
  }

  function onNav(f, url) {
    if (url && url !== 'about:blank') {
      f.pillHost.textContent = hostOf(url);
      f.querySelector('.pill .lock').style.display = /^https:/.test(url) ? '' : 'none';
    }
    f.backBtn.classList.toggle('off', !f.webview.canGoBack());
    f.fwdBtn.classList.toggle('off', !f.webview.canGoForward());
  }

  function setNote(f, msg, warn) {
    f.note.textContent = msg || '';
    f.note.className = 'note' + (warn ? ' warn' : '');
  }

  function size(f) {
    f.shell.style.width = f.screenW + 'px';
    f.shell.style.height = f.h + 'px';
    f.webview.style.width = f.screenW + 'px';
    f.style.width = f.shell.offsetWidth + 'px';
  }

  /* ---------- loading ---------- */

  function load(raw, noSave) {
    var url = toUrl(raw);
    if (!url) return;
    currentUrl = url;
    if (!noSave) try { localStorage.setItem('mfdt-url', raw.trim()); } catch (e) {}
    frames.forEach(function (f) {
      setNote(f, '');
      f.webview.setAttribute('src', url);
    });
  }

  function reloadAll() {
    frames.forEach(function (f) {
      if (currentUrl) f.webview.reload();
    });
  }

  function clearAll() {
    currentUrl = '';
    urlBox.value = '';
    try { localStorage.removeItem('mfdt-url'); } catch (e) {}
    frames.forEach(function (f) {
      f.webview.setAttribute('src', 'about:blank');
      f.pillHost.textContent = 'Search or enter website';
      f.querySelector('.pill .lock').style.display = 'none';
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

    // Test-only: --authfill=user:pass answers the dialog automatically.
    var fill = new URLSearchParams(location.search).get('authfill');
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

  frames.forEach(buildFrame);

  document.getElementById('load').addEventListener('click', function () { load(urlBox.value); });
  document.getElementById('reload').addEventListener('click', reloadAll);
  document.getElementById('clear').addEventListener('click', clearAll);
  urlBox.addEventListener('keydown', function (e) { if (e.key === 'Enter') load(urlBox.value); });

  // --url= from the command line wins over the remembered URL (and is not saved).
  var cliUrl = new URLSearchParams(location.search).get('u');
  var saved = '';
  try { saved = localStorage.getItem('mfdt-url') || ''; } catch (e) {}
  if (cliUrl) { urlBox.value = cliUrl; load(cliUrl, true); }
  else if (saved) { urlBox.value = saved; load(saved); }
})();
