# Mobile-First Dev Tester

A desktop app for mobile-first web development: your site in several **real browser
viewports side by side** — iPhone, Android, iPad, desktop — each with its device's
true width, user agent and pixel ratio, drawn inside honest phone shells so the fold
sits where it sits on the device.

Type one URL; every frame loads it. Scroll one frame; the others follow. Click a
link; the whole rail navigates. Flip one frame dark while its twin stays light.

## Run

- Double-click **`run.cmd`** (dev mode, needs `node_modules` — run `npm install` once), or
- `npm start`, or
- Build and use the packaged app (below).

## What's in the toolbar

| Control | What it does |
|---|---|
| URL bar | Enter loads every frame. Bare hosts get `https://`, `localhost:3000` gets `http://`, local file paths work too. Recent URLs drop down. |
| Load / Reload / Clear | Load, reload all frames (dev servers with HMR reload themselves), unload everything. |
| Shot all | Save a screenshot of every frame to `Pictures\Mobile-First Dev Tester` (exact viewport, what you see). |
| + Add device | Append another frame: iPhone SE / 13-14 / 15-16 / 15 Pro Max, Galaxy S23, Pixel 8, iPad Mini / Air, Desktop 1280 / 1440. |
| Sync scroll | Off by default — each viewport scrolls on its own. Turn on to have the other frames follow proportionally. |
| Sync clicks | Clicks are replayed in the other frames; navigation follows too (mobile-host redirects like `m.` are recognised, no ping-pong). |
| Touch | Mouse input becomes touch events in phone/tablet frames (`pointer: coarse`, 5 touch points). |
| Network | Online / Fast 3G / Slow 3G / Offline — session-wide. Offline really blocks (cache included). |
| Zoom | Fit scales the rail to the window. Purely visual — viewports keep their honest widths. |

Per frame: device preset, editable width × height, ⟳ rotate, **Dark**
(`prefers-color-scheme: dark` for that frame only, via CDP), **dev** (DevTools),
**📷** (screenshot), open (in your default browser), × (remove).

HTTP basic auth (nginx-protected staging sites): a Sign in dialog appears on
challenge; credentials go straight to the request, nothing is stored on disk.

Self-signed certificates (LocalWP `.local` sites and other local HTTPS dev
servers): a "Certificate not trusted — proceed anyway?" prompt appears per
host, remembered for the session. For a permanent fix, trust the certificate
in your dev tool (LocalWP: SSL → Trust).

Frame setup, URL, toggles and recents are remembered across launches.

## Build a Windows app

```
npm run dist
```

Outputs to `dist\`: a one-click installer (`… Setup 0.1.0.exe`) and a portable
exe (`… 0.1.0.exe`). Unsigned — SmartScreen will warn on first run.

## CLI flags (automation / self-testing)

| Flag | Effect |
|---|---|
| `--url=…` | Auto-load a URL on start (not saved to recents). |
| `--shot=file.png --shotdelay=ms` | Screenshot the window after a delay, then quit. |
| `--shotdir=dir` | Where frame screenshots are saved (default: Pictures). |
| `--exec=js` | Run JS inside the first frame after ~8 s. |
| `--darkall=1` / `--touch=1` / `--net=offline` / `--zoom=fit` | Override toggles for one run (not persisted). |
| `--shotall=1` / `--opendevtools=1` | Trigger Shot all / DevTools automatically. |
| `--authfill=user:pass` | Auto-answer the basic-auth dialog (testing only). |
| `--emu=0` | Disable device emulation (testing only). |

## Notes & limits

- Each frame is a Chromium `<webview>`: rendering is Chromium with device metrics,
  UA and DPR emulated — it is not a WebKit engine, so Safari-only bugs won't appear.
- Screenshots capture the viewport (what the frame shows). Full-page capture of
  emulated embedded frames is unreliable in Chromium and was deliberately left out.
- Click sync replays by element path — best effort when layouts differ per device.
