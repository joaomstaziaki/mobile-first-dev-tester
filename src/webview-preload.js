// Runs inside every device frame's page, before the page's own scripts.
// Reports the user's scrolls and clicks to the app (sendToHost) and applies
// the ones mirrored back from the other frames.
const { ipcRenderer } = require('electron');

let applyingScroll = false;
let applyingClick = false;
let raf = null;

/* ---- scroll: report as a fraction of the scrollable range ---- */

window.addEventListener('scroll', () => {
  if (applyingScroll || raf) return;
  raf = requestAnimationFrame(() => {
    raf = null;
    if (applyingScroll) return;
    const se = document.scrollingElement || document.documentElement;
    const maxY = se.scrollHeight - window.innerHeight;
    const maxX = se.scrollWidth - window.innerWidth;
    ipcRenderer.sendToHost('sync-scroll', {
      y: maxY > 0 ? window.scrollY / maxY : 0,
      x: maxX > 0 ? window.scrollX / maxX : 0
    });
  });
}, { passive: true, capture: true });

ipcRenderer.on('apply-scroll', (e, pos) => {
  applyingScroll = true;
  const se = document.scrollingElement || document.documentElement;
  window.scrollTo(
    pos.x * Math.max(0, se.scrollWidth - window.innerWidth),
    pos.y * Math.max(0, se.scrollHeight - window.innerHeight)
  );
  setTimeout(() => { applyingScroll = false; }, 150);
});

/* ---- clicks: report a selector path, replay it elsewhere ---- */

function selectorFor(el) {
  if (!el || el.nodeType !== 1) return null;
  const path = [];
  while (el && el !== document.documentElement) {
    if (el.id) { path.unshift('#' + CSS.escape(el.id)); break; }
    let i = 1, sib = el;
    while ((sib = sib.previousElementSibling)) i++;
    path.unshift(el.tagName.toLowerCase() + ':nth-child(' + i + ')');
    el = el.parentElement;
  }
  return path.join('>');
}

document.addEventListener('click', (ev) => {
  if (applyingClick || !ev.isTrusted) return;   // replayed clicks are untrusted
  const sel = selectorFor(ev.target);
  if (sel) ipcRenderer.sendToHost('sync-click', { sel });
}, true);

ipcRenderer.on('apply-click', (e, d) => {
  applyingClick = true;
  try {
    const el = document.querySelector(d.sel);
    if (el) el.click();   // best effort: layouts can differ between devices
  } catch (err) {}
  applyingClick = false;
});
