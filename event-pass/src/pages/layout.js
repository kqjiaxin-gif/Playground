import { esc } from '../lib.js';

// Shared shell: tokens, light/dark themes, base components.
export function layout({ title, settings, body, head = '', bodyClass = '' }) {
  const brand = /^#[0-9a-fA-F]{6}$/.test(settings.brand_color) ? settings.brand_color : '#5b3cc4';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="${brand}">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root {
  --brand: ${brand};
  --bg: #f4f3f8;
  --surface: #ffffff;
  --surface-2: #f0eff5;
  --text: #17151f;
  --muted: #6b6878;
  --border: #e3e1ea;
  --ok: #0f9d58;
  --ok-bg: #e5f6ec;
  --warn: #b26a00;
  --warn-bg: #fff3dc;
  --bad: #d23b3b;
  --bad-bg: #fde9e9;
  --radius: 18px;
  --shadow: 0 1px 2px rgba(20, 16, 40, .06), 0 8px 24px rgba(20, 16, 40, .06);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0f0e14; --surface: #1a1922; --surface-2: #24232e; --text: #f2f1f7; --muted: #a09dae; --border: #2e2d39;
    --ok-bg: #0f2e1f; --warn-bg: #33270f; --bad-bg: #3a1717; --shadow: none;
  }
}
:root[data-theme="dark"] {
  --bg: #0f0e14; --surface: #1a1922; --surface-2: #24232e; --text: #f2f1f7; --muted: #a09dae; --border: #2e2d39;
  --ok-bg: #0f2e1f; --warn-bg: #33270f; --bad-bg: #3a1717; --shadow: none;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.5 Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
a { color: var(--brand); }
.wrap { max-width: 520px; margin: 0 auto; padding: 20px 16px 48px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.pad { padding: 20px; }
h1, h2, h3 { line-height: 1.2; margin: 0; letter-spacing: -.01em; }
.muted { color: var(--muted); }
.small { font-size: 14px; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; padding: 0 18px; border-radius: 12px;
  border: 1px solid var(--border); background: var(--surface); color: var(--text); font: inherit; font-weight: 600; text-decoration: none; cursor: pointer; }
.btn:disabled { opacity: .5; cursor: default; }
.btn.primary { background: var(--brand); border-color: var(--brand); color: #fff; }
.btn.ok { background: var(--ok); border-color: var(--ok); color: #fff; }
.btn.danger { color: var(--bad); }
.btn.block { width: 100%; }
.btn svg { width: 20px; height: 20px; flex: none; }
input, select, textarea { width: 100%; min-height: 48px; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--border);
  background: var(--surface); color: var(--text); font: inherit; }
textarea { min-height: 96px; }
input:focus, select:focus, textarea:focus { outline: 2px solid var(--brand); outline-offset: 1px; }
label { display: block; font-size: 14px; font-weight: 600; margin: 14px 0 6px; }
.row { display: flex; gap: 10px; }
.row > * { flex: 1; }
.stack > * + * { margin-top: 12px; }
.err { color: var(--bad); font-size: 14px; min-height: 20px; margin-top: 8px; }
.pill { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 13px; font-weight: 600; background: var(--surface-2); color: var(--muted); }
.pill.ok { background: var(--ok-bg); color: var(--ok); }
.pill.warn { background: var(--warn-bg); color: var(--warn); }
.pill.bad { background: var(--bad-bg); color: var(--bad); }
.hidden { display: none !important; }
</style>
${head}
</head>
<body class="${esc(bodyClass)}">
${body}
</body>
</html>`;
}

export const icons = {
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.5-.3Z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 17v2M13 11v2"/></svg>',
};
