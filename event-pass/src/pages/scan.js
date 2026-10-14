import { esc, jsLiteral } from '../lib.js';
import { layout } from './layout.js';

export function scanPage(s) {
  const body = `
<div id="gate" class="wrap">
  <form class="card pad" id="gateForm">
    <h1 style="font-size:22px">${esc(s.event_name)}</h1>
    <p class="muted" style="margin:4px 0 0">Door check-in</p>
    <label for="pin">Staff PIN</label>
    <input id="pin" type="password" inputmode="numeric" autocomplete="off" required>
    <label for="door">Your door / name <span class="muted">(optional)</span></label>
    <input id="door" placeholder="e.g. Main door" maxlength="40">
    <div class="err" id="gateErr" role="alert"></div>
    <button class="btn primary block">Start scanning</button>
  </form>
</div>

<div id="app" class="hidden">
  <header class="bar">
    <div>
      <div class="ev">${esc(s.event_name)}</div>
      <div class="muted small" id="doorLabel"></div>
    </div>
    <div class="count" aria-live="polite"><strong id="inCount">–</strong><span class="muted"> / <span id="expCount">–</span> in</span></div>
  </header>

  <div class="cam">
    <video id="video" playsinline muted autoplay></video>
    <div class="frame" aria-hidden="true"></div>
    <div class="cam-msg" id="camMsg">Starting camera…</div>
  </div>

  <section class="wrap tools">
    <form id="searchForm" class="row" autocomplete="off">
      <input id="q" placeholder="Pass code or name" aria-label="Pass code or name">
      <button class="btn" style="flex:none">Find</button>
    </form>
    <div id="results" class="list"></div>
    <label class="toggle"><input type="checkbox" id="auto"> <span>Auto-admit everyone left on the pass when scanned</span></label>
    <button class="btn block" id="lock" type="button">Lock scanner</button>
  </section>
</div>

<div id="sheet" class="sheet hidden" role="dialog" aria-modal="true" aria-labelledby="rTitle">
  <div class="sheet-card">
    <div class="band" id="band"><div class="r-title" id="rTitle"></div><div class="r-sub" id="rSub"></div></div>
    <div class="pad">
      <div id="rNames" class="r-names"></div>
      <div id="rMeta" class="muted small"></div>
      <div id="rActions" class="stack" style="margin-top:16px"></div>
    </div>
  </div>
</div>

<script src="/vendor/jsqr.js"></script>
<script>
(() => {
  const TZ = ${jsLiteral(s.timezone || 'UTC')};
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem('ep_' + k) || ''; } catch (e) { return ''; } },
    set(k, v) { try { v === null ? localStorage.removeItem('ep_' + k) : localStorage.setItem('ep_' + k, v); } catch (e) {} },
  };
  const state = { pin: store.get('pin'), door: store.get('door'), auto: store.get('auto') === '1', paused: false, last: '', lastAt: 0, closeTimer: null };
  let audio = null;

  const escHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtTime = (iso) => iso ? new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso)) : '';

  async function api(path, opts = {}) {
    let res;
    try {
      res = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', 'x-pin': state.pin } });
    } catch (e) {
      throw Object.assign(new Error('No connection. Check Wi-Fi / data and try again.'), { offline: true });
    }
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (res.status === 401 || res.status === 429) { lock(data.error || 'Wrong PIN'); throw new Error(data.error || 'Wrong PIN'); }
    return { res, data };
  }

  // ---------- Gate ----------
  $('door').value = state.door;
  $('auto').checked = state.auto;
  $('gateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    state.pin = $('pin').value.trim();
    state.door = $('door').value.trim();
    $('gateErr').textContent = '';
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    try {
      const { res, data } = await api('/api/staff/stats');
      if (!res.ok) throw new Error(data.error || 'Could not sign in');
      store.set('pin', state.pin);
      store.set('door', state.door);
      unlock(data);
    } catch (ex) { $('gateErr').textContent = ex.message; }
  });

  function unlock(stats) {
    $('gate').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('doorLabel').textContent = state.door ? 'Door: ' + state.door : '';
    showStats(stats);
    startCamera();
  }

  function lock(msg) {
    store.set('pin', null);
    state.pin = '';
    stopCamera();
    $('sheet').classList.add('hidden');
    $('app').classList.add('hidden');
    $('gate').classList.remove('hidden');
    $('pin').value = '';
    $('gateErr').textContent = msg || '';
  }
  $('lock').addEventListener('click', () => lock(''));
  $('auto').addEventListener('change', (e) => { state.auto = e.target.checked; store.set('auto', state.auto ? '1' : '0'); });

  // ---------- Stats ----------
  function showStats(d) {
    if (!d || d.admitted === undefined) return;
    $('inCount').textContent = d.admitted;
    $('expCount').textContent = d.expected;
  }
  async function refreshStats() {
    if (!state.pin) return;
    try { const { res, data } = await api('/api/staff/stats'); if (res.ok) showStats(data); } catch (e) {}
  }
  setInterval(refreshStats, 20000);

  // ---------- Camera ----------
  const video = $('video');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let stream = null, detector = null, loopTimer = null;

  async function startCamera() {
    $('camMsg').textContent = 'Starting camera…';
    $('camMsg').classList.remove('hidden');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
      video.srcObject = stream;
      await video.play();
      $('camMsg').classList.add('hidden');
    } catch (e) {
      $('camMsg').textContent = 'Camera unavailable. Allow camera access in your browser settings, or use the code / name search below.';
      return;
    }
    if ('BarcodeDetector' in window) {
      try { detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { detector = null; }
    }
    loop();
  }
  function stopCamera() {
    clearTimeout(loopTimer);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  async function loop() {
    if (!stream) return;
    if (!state.paused && video.readyState >= 2) {
      try {
        let text = null;
        if (detector) {
          const codes = await detector.detect(video);
          if (codes.length) text = codes[0].rawValue;
        } else if (window.jsQR) {
          const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          ctx.imageSmoothingQuality = 'high';   // resizing the canvas resets this; smoothing averages sensor noise for jsQR
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (code) text = code.data;
        }
        if (text) onScan(text);
      } catch (e) {}
    }
    loopTimer = setTimeout(loop, 120);
  }

  // ---------- Feedback ----------
  function feedback(kind) {
    try { navigator.vibrate && navigator.vibrate(kind === 'ok' ? 80 : [120, 80, 120]); } catch (e) {}
    if (!audio) return;
    try {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = kind === 'ok' ? 880 : kind === 'warn' ? 520 : 220;
      o.type = kind === 'bad' ? 'square' : 'sine';
      g.gain.setValueAtTime(0.15, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + (kind === 'bad' ? 0.5 : 0.18));
      o.connect(g).connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + 0.5);
    } catch (e) {}
  }

  // ---------- Scan handling ----------
  function tokenFrom(text) {
    const m = String(text).match(/\\/t\\/([A-Za-z0-9_-]{16,64})(?:[/?#]|$)/) || String(text).match(/^([A-Za-z0-9_-]{22})$/);
    return m ? m[1] : null;
  }

  async function onScan(text) {
    const now = Date.now();
    if (state.paused || (text === state.last && now - state.lastAt < 3000)) return;
    state.last = text; state.lastAt = now; state.paused = true;
    const token = tokenFrom(text);
    if (!token) return showResult('bad', 'Not a valid pass', 'This QR code isn’t a pass for this event.');
    await lookup('token=' + encodeURIComponent(token));
  }

  async function lookup(query) {
    state.paused = true;
    showResult('wait', 'Checking…', '');
    try {
      const { res, data } = await api('/api/staff/lookup?' + query);
      if (!res.ok) throw new Error(data.error || 'Lookup failed');
      if (!data.ticket) return showResult('bad', 'Pass not found', 'This pass doesn’t exist for this event.');
      present(data.ticket);
    } catch (ex) {
      showResult('bad', 'Couldn’t check pass', ex.message, null, [btn('Try again', 'primary', () => lookup(query))]);
    }
  }

  function present(t) {
    const left = t.admits - t.admitted;
    if (t.status === 'void') return showResult('bad', 'Cancelled pass', 'Do not admit. This pass was cancelled.', t);
    if (left <= 0) {
      return showResult('bad', 'Already checked in', 'All ' + t.admits + ' already admitted' + (t.last_checkin_at ? ' · last at ' + fmtTime(t.last_checkin_at) : ''), t,
        [btn('Undo last admit', 'danger', () => undo(t))]);
    }
    if (state.auto) return admit(t, left);
    const actions = [];
    if (left === 2) actions.push(btn('Admit both (2)', 'ok', () => admit(t, 2)));
    actions.push(btn(left === 2 ? 'Admit 1 only' : 'Admit 1', left === 2 ? '' : 'ok', () => admit(t, 1)));
    const partial = t.admitted > 0;
    showResult(partial ? 'warn' : 'ok', partial ? '1 already in · 1 to admit' : 'Valid · ' + left + ' to admit',
      partial ? 'Partner checked in at ' + fmtTime(t.first_checkin_at) : 'Pair pass', t, actions);
  }

  async function admit(t, count) {
    showResult('wait', 'Admitting…', '', t);
    try {
      const { res, data } = await api('/api/staff/checkin', { method: 'POST', body: JSON.stringify({ id: t.id, count, door: state.door }) });
      if (res.status === 409) return present(data.ticket);
      if (!res.ok) throw new Error(data.error || 'Check-in failed');
      const nt = data.ticket;
      const left = nt.admits - nt.admitted;
      showResult('ok', 'Admitted ' + count, left > 0 ? left + ' more can enter later on this pass' : 'Pass fully used', nt,
        [btn('Undo', 'danger', () => undo(nt))], 3500);
      refreshStats();
    } catch (ex) {
      showResult('bad', 'Not admitted', ex.message, t, [btn('Try again', 'primary', () => admit(t, count))]);
    }
  }

  async function undo(t) {
    showResult('wait', 'Undoing…', '', t);
    try {
      const { res, data } = await api('/api/staff/undo', { method: 'POST', body: JSON.stringify({ id: t.id, door: state.door }) });
      if (!res.ok) throw new Error(data.error || 'Undo failed');
      refreshStats();
      present(data.ticket);
    } catch (ex) {
      showResult('bad', 'Undo failed', ex.message, t);
    }
  }

  function btn(label, kind, fn) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn block ' + (kind || '');
    b.textContent = label;
    b.addEventListener('click', () => { clearTimeout(state.closeTimer); fn(); });
    return b;
  }

  function showResult(kind, title, sub, t, actions = [], autoCloseMs = 0) {
    clearTimeout(state.closeTimer);
    if (kind !== 'wait') feedback(kind);
    $('sheet').className = 'sheet ' + kind;
    $('rTitle').textContent = title;
    $('rSub').textContent = sub || '';
    $('rNames').innerHTML = t ? [t.buyer_name, t.guest_name].filter(Boolean).map((n) => '<div>' + escHtml(n) + '</div>').join('') : '';
    $('rMeta').textContent = t ? 'Code ' + t.code + ' · ' + t.admitted + ' of ' + t.admits + ' in' : '';
    const box = $('rActions');
    box.innerHTML = '';
    actions.forEach((a) => box.appendChild(a));
    if (kind !== 'wait') box.appendChild(btn('Scan next', actions.length ? '' : 'primary', closeResult));
    if (autoCloseMs) state.closeTimer = setTimeout(closeResult, autoCloseMs);
  }

  function closeResult() {
    clearTimeout(state.closeTimer);
    $('sheet').className = 'sheet hidden';
    state.paused = false;
  }

  // ---------- Manual search ----------
  $('searchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('q').value.trim();
    const list = $('results');
    list.innerHTML = '';
    if (q.length < 2) return;
    if (/^[A-Za-z0-9]{6}$/.test(q)) {
      const { data } = await api('/api/staff/lookup?code=' + encodeURIComponent(q)).catch(() => ({ data: {} }));
      if (data.ticket) { $('q').value = ''; return present(data.ticket); }
    }
    try {
      const { res, data } = await api('/api/staff/lookup?q=' + encodeURIComponent(q));
      if (!res.ok) throw new Error(data.error);
      if (!data.results.length) { list.innerHTML = '<p class="muted small">No matches.</p>'; return; }
      data.results.forEach((t) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'item';
        const left = t.admits - t.admitted;
        b.innerHTML = '<span><strong>' + escHtml(t.buyer_name) + '</strong>' + (t.guest_name ? ' &amp; ' + escHtml(t.guest_name) : '') +
          '<br><span class="muted small">' + escHtml(t.code) + '</span></span>' +
          '<span class="pill ' + (t.status === 'void' ? 'bad' : left === 0 ? 'ok' : left < t.admits ? 'warn' : '') + '">' +
          (t.status === 'void' ? 'Cancelled' : t.admitted + '/' + t.admits + ' in') + '</span>';
        b.addEventListener('click', () => { state.paused = true; present(t); });
        list.appendChild(b);
      });
    } catch (ex) { list.innerHTML = '<p class="err">' + escHtml(ex.message) + '</p>'; }
  });

  if (state.pin) {
    api('/api/staff/stats').then(({ res, data }) => res.ok ? unlock(data) : lock('')).catch(() => unlock(null));
  }
})();
</script>`;

  return layout({
    title: `${s.event_name} · Door`,
    settings: s,
    body,
    head: `<style>
.bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 16px; background: var(--surface); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 2; }
.ev { font-weight: 700; }
.count { font-size: 15px; white-space: nowrap; }
.count strong { font-size: 24px; }
.cam { position: relative; background: #000; aspect-ratio: 1 / 1; max-height: 62vh; width: 100%; overflow: hidden; }
.cam video { width: 100%; height: 100%; object-fit: cover; display: block; }
.frame { position: absolute; inset: 15%; border: 3px solid rgba(255,255,255,.85); border-radius: 20px; box-shadow: 0 0 0 9999px rgba(0,0,0,.35); }
.cam-msg { position: absolute; inset: 0; display: grid; place-items: center; color: #fff; text-align: center; padding: 24px; background: rgba(0,0,0,.6); }
.tools { padding-top: 16px; }
.list { margin-top: 10px; display: grid; gap: 8px; }
.item { display: flex; justify-content: space-between; align-items: center; gap: 10px; text-align: left; width: 100%; padding: 12px 14px; border-radius: 12px;
  border: 1px solid var(--border); background: var(--surface); color: var(--text); font: inherit; cursor: pointer; }
.toggle { display: flex; gap: 10px; align-items: center; font-weight: 500; margin: 18px 0; }
.toggle input { width: 22px; min-height: 22px; height: 22px; }
.sheet { position: fixed; inset: 0; z-index: 10; background: rgba(0,0,0,.55); display: flex; align-items: flex-end; justify-content: center; }
.sheet-card { width: 100%; max-width: 520px; background: var(--surface); border-radius: 22px 22px 0 0; overflow: hidden; padding-bottom: env(safe-area-inset-bottom); }
.band { padding: 26px 20px; color: #fff; background: #6b6878; }
.sheet.ok .band { background: var(--ok); }
.sheet.warn .band { background: #d98200; }
.sheet.bad .band { background: var(--bad); }
.r-title { font-size: 30px; font-weight: 800; line-height: 1.1; }
.r-sub { margin-top: 6px; font-size: 16px; opacity: .95; }
.r-names { font-size: 22px; font-weight: 700; }
@media (min-width: 700px) { .sheet { align-items: center; } .sheet-card { border-radius: 22px; } }
</style>`,
  });
}
