import { esc } from '../lib.js';
import { layout } from './layout.js';

export function adminPage(s) {
  const body = `
<div id="gate" class="wrap">
  <form class="card pad" id="gateForm">
    <h1 style="font-size:22px">${esc(s.event_name)}</h1>
    <p class="muted" style="margin:4px 0 0">Organiser dashboard</p>
    <label for="pin">Admin PIN</label>
    <input id="pin" type="password" autocomplete="current-password" required>
    <div class="err" id="gateErr" role="alert"></div>
    <button class="btn primary block">Sign in</button>
  </form>
</div>

<div id="app" class="hidden">
  <header class="top">
    <div class="top-in">
      <strong id="evName">${esc(s.event_name)}</strong>
      <nav class="tabs" role="tablist">
        <button data-tab="overview" class="on">Overview</button>
        <button data-tab="passes">Passes</button>
        <button data-tab="event">Event</button>
        <button data-tab="connect">Connect</button>
      </nav>
    </div>
  </header>

  <main class="page">
    <!-- Overview -->
    <section data-panel="overview">
      <div class="tiles">
        <div class="card tile"><div class="t-label">Pairs sold</div><div class="t-val" id="sPasses">–</div></div>
        <div class="card tile"><div class="t-label">People expected</div><div class="t-val" id="sExpected">–</div></div>
        <div class="card tile"><div class="t-label">Checked in</div><div class="t-val" id="sIn">–</div></div>
        <div class="card tile"><div class="t-label">Yet to arrive</div><div class="t-val" id="sLeft">–</div></div>
      </div>
      <div class="card pad" style="margin-top:12px">
        <div class="meter"><div id="meterFill"></div></div>
        <p class="muted small" id="meterLabel" style="margin:8px 0 0"></p>
      </div>
      <h2 class="h2">Recent check-ins</h2>
      <div class="card"><ul class="feed" id="feed"><li class="muted">No check-ins yet.</li></ul></div>
    </section>

    <!-- Passes -->
    <section data-panel="passes" class="hidden">
      <div class="toolbar">
        <input id="search" placeholder="Search name, email, phone, code, order" aria-label="Search passes">
        <button class="btn primary" id="addBtn" type="button">+ Add pass</button>
        <label class="btn" for="csv" style="margin:0">Import CSV<input id="csv" type="file" accept=".csv,text/csv" class="hidden"></label>
        <button class="btn" id="exportBtn" type="button">Export CSV</button>
      </div>
      <p class="muted small" id="passCount"></p>
      <div class="err" id="passErr"></div>
      <div class="card"><div id="passList" class="plist"></div></div>
    </section>

    <!-- Event -->
    <section data-panel="event" class="hidden">
      <form class="card pad" id="eventForm" style="max-width:640px">
        <label for="f_event_name">Event name</label><input id="f_event_name" name="event_name" required>
        <label for="f_tagline">Tagline <span class="muted">(optional)</span></label><input id="f_tagline" name="tagline">
        <div class="row">
          <div><label for="f_start">Starts</label><input id="f_start" type="datetime-local"></div>
          <div><label for="f_end">Ends</label><input id="f_end" type="datetime-local"></div>
        </div>
        <label for="f_timezone">Event timezone</label><input id="f_timezone" name="timezone" list="tzList"><datalist id="tzList"></datalist>
        <label for="f_venue_name">Venue</label><input id="f_venue_name" name="venue_name">
        <label for="f_venue_address">Address</label><input id="f_venue_address" name="venue_address">
        <label for="f_map_url">Map link <span class="muted">(optional, otherwise Google Maps search of the address)</span></label><input id="f_map_url" name="map_url" placeholder="https://maps.app.goo.gl/…">
        <label for="f_logo_url">Logo image URL <span class="muted">(https, PNG/SVG, ideally white or transparent)</span></label><input id="f_logo_url" name="logo_url" placeholder="https://…">
        <label for="f_brand_color">Brand colour</label>
        <div class="row" style="align-items:center"><input id="f_brand_color" name="brand_color" type="color" style="flex:none;width:64px;padding:4px"><span class="muted small">Used for the ticket header and buttons.</span></div>
        <label for="f_notes">Note on ticket</label><textarea id="f_notes" name="notes"></textarea>
        <div class="err" id="eventErr"></div>
        <button class="btn primary">Save event details</button>
        <span class="muted small" id="eventSaved"></span>
      </form>
    </section>

    <!-- Connect -->
    <section data-panel="connect" class="hidden">
      <div class="card pad stack" style="max-width:760px">
        <h2 class="h2" style="margin:0">Links</h2>
        <div class="kv"><span>Door scanner (give to staff with the staff PIN)</span><code id="lnScan"></code><button class="btn" data-copy="lnScan" type="button">Copy</button></div>
        <div class="kv"><span>“Get your pass” page (put on your thank-you page / confirmation email)</span><code id="lnFind"></code><button class="btn" data-copy="lnFind" type="button">Copy</button></div>
        <div class="kv"><span>Purchase webhook (POST after a successful payment)</span><code id="lnHook"></code><button class="btn" data-copy="lnHook" type="button">Copy</button></div>
        <p class="muted small">Replace <code>YOUR_WEBHOOK_SECRET</code> with the secret you set. Send JSON or form fields. Recognised fields:
          <code>order_id</code>, <code>name</code> (or <code>first_name</code> + <code>last_name</code>), <code>email</code>, <code>phone</code>, <code>guest_name</code>.
          Sending the same <code>order_id</code> twice returns the same pass, so retries are safe. The response includes <code>ticket_url</code>, which you can email or WhatsApp to the buyer in the same automation.</p>
        <pre class="code" id="curl"></pre>
      </div>
    </section>
  </main>
</div>

<dialog id="passDlg">
  <form method="dialog" id="passForm" class="pad" style="min-width:min(92vw,440px)">
    <h2 class="h2" style="margin:0" id="dlgTitle">Add pass</h2>
    <label for="p_buyer_name">Buyer name</label><input id="p_buyer_name" name="buyer_name" required>
    <label for="p_guest_name">Guest name <span class="muted">(optional)</span></label><input id="p_guest_name" name="guest_name">
    <label for="p_buyer_email">Email</label><input id="p_buyer_email" name="buyer_email" type="email">
    <label for="p_buyer_phone">Phone / WhatsApp <span class="muted">(with country code)</span></label><input id="p_buyer_phone" name="buyer_phone" inputmode="tel">
    <div id="newOnly">
      <label for="p_order_id">Order number <span class="muted">(optional)</span></label><input id="p_order_id" name="order_id">
      <label for="p_admits">Admits</label><select id="p_admits" name="admits"><option value="2">2 (pair)</option><option value="1">1</option></select>
    </div>
    <div class="err" id="dlgErr"></div>
    <div class="row" style="margin-top:8px"><button class="btn" value="cancel" formnovalidate type="button" id="dlgCancel">Cancel</button><button class="btn primary" id="dlgSave" type="submit">Save</button></div>
  </form>
</dialog>

<script>
(() => {
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return sessionStorage.getItem('ep_' + k) || ''; } catch (e) { return ''; } },
    set(k, v) { try { v === null ? sessionStorage.removeItem('ep_' + k) : sessionStorage.setItem('ep_' + k, v); } catch (e) {} },
  };
  let pin = store.get('admin_pin');
  let settings = {};
  let passes = [];
  let editing = null;
  const escHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function api(path, opts = {}) {
    let res;
    try { res = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', 'x-pin': pin } }); }
    catch (e) { throw new Error('No connection'); }
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (res.status === 401 || res.status === 429) { signOut(data.error); throw new Error(data.error || 'Wrong PIN'); }
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  // ---------- Sign in ----------
  $('gateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    pin = $('pin').value;
    $('gateErr').textContent = '';
    try { await start(); store.set('admin_pin', pin); } catch (ex) { $('gateErr').textContent = ex.message; }
  });
  function signOut(msg) {
    store.set('admin_pin', null);
    pin = '';
    $('app').classList.add('hidden');
    $('gate').classList.remove('hidden');
    $('gateErr').textContent = msg || '';
  }
  async function start() {
    settings = await api('/api/admin/settings');
    $('gate').classList.add('hidden');
    $('app').classList.remove('hidden');
    fillEventForm();
    fillConnect();
    loadOverview();
    loadPasses();
  }

  // ---------- Tabs ----------
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
    document.querySelectorAll('[data-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== b.dataset.tab));
    if (b.dataset.tab === 'overview') loadOverview();
    if (b.dataset.tab === 'passes') loadPasses();
  }));

  // ---------- Overview ----------
  const fmtTime = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone: settings.timezone || 'UTC', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
  async function loadOverview() {
    const d = await api('/api/admin/overview');
    $('sPasses').textContent = d.passes;
    $('sExpected').textContent = d.expected;
    $('sIn').textContent = d.admitted;
    $('sLeft').textContent = d.expected - d.admitted;
    const pct = d.expected ? Math.round((d.admitted / d.expected) * 100) : 0;
    $('meterFill').style.width = pct + '%';
    $('meterLabel').textContent = pct + '% arrived · ' + d.passes_used + ' of ' + d.passes + ' passes scanned';
    $('feed').innerHTML = d.recent.length ? d.recent.map((r) =>
      '<li><span><strong>' + escHtml(r.buyer_name) + '</strong>' + (r.guest_name ? ' &amp; ' + escHtml(r.guest_name) : '') +
      ' <span class="muted small">' + escHtml(r.code) + (r.door ? ' · ' + escHtml(r.door) : '') + '</span></span>' +
      '<span class="pill ' + (r.delta > 0 ? 'ok' : 'warn') + '">' + (r.delta > 0 ? '+' + r.delta : 'undo') + ' · ' + fmtTime(r.at) + '</span></li>'
    ).join('') : '<li class="muted">No check-ins yet.</li>';
  }
  setInterval(() => { if (pin && !$('app').classList.contains('hidden') && !document.querySelector('[data-panel="overview"]').classList.contains('hidden')) loadOverview().catch(() => {}); }, 15000);

  // ---------- Passes ----------
  async function loadPasses() {
    passes = (await api('/api/admin/tickets')).tickets;
    renderPasses();
  }
  function statusPill(t) {
    if (t.status === 'void') return '<span class="pill bad">Cancelled</span>';
    if (t.admitted >= t.admits) return '<span class="pill ok">In ' + t.admitted + '/' + t.admits + '</span>';
    if (t.admitted > 0) return '<span class="pill warn">In ' + t.admitted + '/' + t.admits + '</span>';
    return '<span class="pill">Not in · ' + t.admits + '</span>';
  }
  function waLink(t) {
    const text = 'Hi ' + t.buyer_name + '! Here is your pass for ' + settings.event_name + ' (admits ' + t.admits + '): ' + t.ticket_url;
    const phone = (t.buyer_phone || '').replace(/[^0-9]/g, '');
    return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(text);
  }
  function renderPasses() {
    const q = $('search').value.trim().toLowerCase();
    const rows = passes.filter((t) => !q || [t.buyer_name, t.guest_name, t.buyer_email, t.buyer_phone, t.code, t.order_id].some((v) => (v || '').toLowerCase().includes(q)));
    $('passCount').textContent = rows.length + ' of ' + passes.length + ' passes';
    $('passList').innerHTML = rows.length ? rows.map((t) =>
      '<div class="prow" data-id="' + t.id + '">' +
        '<div class="pmain"><strong>' + escHtml(t.buyer_name) + '</strong>' + (t.guest_name ? ' &amp; ' + escHtml(t.guest_name) : '') +
        '<div class="muted small">' + [t.code, t.order_id && ('#' + t.order_id), t.buyer_email, t.buyer_phone].filter(Boolean).map(escHtml).join(' · ') + '</div></div>' +
        statusPill(t) +
        '<div class="pact">' +
          '<a class="btn" href="' + escHtml(t.ticket_url) + '" target="_blank" rel="noopener">Open</a>' +
          '<button class="btn" data-act="copy" type="button">Copy link</button>' +
          '<a class="btn" href="' + escHtml(waLink(t)) + '" target="_blank" rel="noopener">WhatsApp</a>' +
          '<button class="btn" data-act="edit" type="button">Edit</button>' +
          (t.status === 'void' ? '<button class="btn" data-act="restore" type="button">Restore</button>' : '<button class="btn danger" data-act="void" type="button">Cancel</button>') +
        '</div>' +
      '</div>'
    ).join('') : '<p class="pad muted">No passes yet. They appear here as purchases come in, or add one manually.</p>';
  }
  $('search').addEventListener('input', renderPasses);
  $('passList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const t = passes.find((x) => x.id === Number(b.closest('.prow').dataset.id));
    $('passErr').textContent = '';
    try {
      if (b.dataset.act === 'copy') { await navigator.clipboard.writeText(t.ticket_url); b.textContent = 'Copied'; setTimeout(() => (b.textContent = 'Copy link'), 1500); }
      if (b.dataset.act === 'edit') openDialog(t);
      if (b.dataset.act === 'void' && confirm('Cancel the pass for ' + t.buyer_name + '? It will be refused at the door.')) { await api('/api/admin/tickets/' + t.id + '/void', { method: 'POST' }); loadPasses(); }
      if (b.dataset.act === 'restore') { await api('/api/admin/tickets/' + t.id + '/restore', { method: 'POST' }); loadPasses(); }
    } catch (ex) { $('passErr').textContent = ex.message; }
  });

  // Add / edit dialog
  const dlg = $('passDlg');
  function openDialog(t) {
    editing = t || null;
    $('dlgTitle').textContent = t ? 'Edit pass' : 'Add pass';
    $('newOnly').classList.toggle('hidden', !!t);
    $('dlgErr').textContent = '';
    ['buyer_name', 'guest_name', 'buyer_email', 'buyer_phone', 'order_id'].forEach((k) => ($('p_' + k).value = (t && t[k]) || ''));
    $('p_admits').value = '2';
    dlg.showModal();
  }
  $('addBtn').addEventListener('click', () => openDialog(null));
  $('dlgCancel').addEventListener('click', () => dlg.close());
  $('passForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = { buyer_name: f.buyer_name.value, guest_name: f.guest_name.value, buyer_email: f.buyer_email.value, buyer_phone: f.buyer_phone.value };
    try {
      if (editing) await api('/api/admin/tickets/' + editing.id, { method: 'PATCH', body: JSON.stringify(body) });
      else {
        const r = await api('/api/admin/tickets', { method: 'POST', body: JSON.stringify({ ...body, order_id: f.order_id.value, admits: Number(f.admits.value) }) });
        if (!r.created) alert('A pass already exists for that order number. Showing the existing one.');
      }
      dlg.close();
      loadPasses();
    } catch (ex) { $('dlgErr').textContent = ex.message; }
  });

  // CSV import / export
  function parseCsv(text) {
    const rows = [];
    let row = [], field = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') q = false;
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\\n' || c === '\\r') {
        if (c === '\\r' && text[i + 1] === '\\n') i++;
        row.push(field); field = '';
        if (row.some((v) => v.trim())) rows.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.some((v) => v.trim())) rows.push(row);
    return rows;
  }
  $('csv').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const rows = parseCsv((await file.text()).replace(/^\\ufeff/, ''));
    if (rows.length < 2) return alert('The CSV needs a header row and at least one attendee.');
    const header = rows[0].map((h) => h.trim());
    const objs = rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] || '').trim()])));
    if (!confirm('Import ' + objs.length + ' passes? Columns found: ' + header.join(', ') + '. Rows with an order number that already exists are skipped.')) return;
    let created = 0, existing = 0, errors = [];
    try {
      for (let i = 0; i < objs.length; i += 100) {
        $('passCount').textContent = 'Importing ' + Math.min(i + 100, objs.length) + ' / ' + objs.length + '…';
        const r = await api('/api/admin/import', { method: 'POST', body: JSON.stringify({ rows: objs.slice(i, i + 100) }) });
        created += r.created; existing += r.existing;
        errors = errors.concat(r.errors.map((x) => 'Row ' + (i + x.row + 2) + ': ' + x.error));
      }
      alert('Imported ' + created + ' new passes. ' + existing + ' already existed.' + (errors.length ? '\\n\\nProblems:\\n' + errors.slice(0, 15).join('\\n') : ''));
    } catch (ex) { alert('Import stopped: ' + ex.message); }
    loadPasses();
  });
  $('exportBtn').addEventListener('click', () => {
    const cols = ['code', 'order_id', 'buyer_name', 'guest_name', 'buyer_email', 'buyer_phone', 'admits', 'admitted', 'status', 'first_checkin_at', 'last_checkin_at', 'source', 'created_at', 'ticket_url'];
    const cell = (v) => { const s = String(v ?? ''); return /^[=+\\-@]/.test(s) ? "'" + s : s; };
    const csv = [cols.join(',')].concat(passes.map((t) => cols.map((c) => '"' + cell(t[c]).replace(/"/g, '""') + '"').join(','))).join('\\r\\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\\ufeff' + csv], { type: 'text/csv' }));
    a.download = 'attendance-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
  });

  // ---------- Event settings ----------
  function tzParts(ms, tz) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return p;
  }
  function tzOffset(ms, tz) {
    const p = tzParts(ms, tz);
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
  }
  // "2026-11-20T19:00" in the event timezone -> ISO UTC
  function localToUtc(local, tz) {
    if (!local) return '';
    const [d, t] = local.split('T');
    const [y, mo, da] = d.split('-').map(Number);
    const [h, mi] = t.split(':').map(Number);
    const guess = Date.UTC(y, mo - 1, da, h, mi);
    let ms = guess - tzOffset(guess, tz);
    ms = guess - tzOffset(ms, tz);
    return new Date(ms).toISOString();
  }
  function utcToLocal(iso, tz) {
    if (!iso) return '';
    const p = tzParts(Date.parse(iso), tz);
    return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute;
  }
  function fillEventForm() {
    const f = $('eventForm');
    ['event_name', 'tagline', 'venue_name', 'venue_address', 'map_url', 'logo_url', 'notes'].forEach((k) => (f[k].value = settings[k] || ''));
    f.brand_color.value = settings.brand_color || '#5b3cc4';
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tz = settings.timezone && settings.timezone !== 'UTC' ? settings.timezone : (settings.start_utc ? settings.timezone : browserTz);
    f.timezone.value = tz;
    $('f_start').value = utcToLocal(settings.start_utc, tz);
    $('f_end').value = utcToLocal(settings.end_utc, tz);
    try { $('tzList').innerHTML = Intl.supportedValuesOf('timeZone').map((z) => '<option value="' + z + '">').join(''); } catch (e) {}
  }
  $('eventForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    $('eventErr').textContent = '';
    $('eventSaved').textContent = '';
    try {
      const tz = f.timezone.value.trim() || 'UTC';
      const body = { timezone: tz, start_utc: localToUtc($('f_start').value, tz), end_utc: localToUtc($('f_end').value, tz), brand_color: f.brand_color.value };
      ['event_name', 'tagline', 'venue_name', 'venue_address', 'map_url', 'logo_url', 'notes'].forEach((k) => (body[k] = f[k].value));
      settings = await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(body) });
      $('evName').textContent = settings.event_name;
      $('eventSaved').textContent = 'Saved. Tickets show the new details straight away.';
    } catch (ex) { $('eventErr').textContent = ex.message; }
  });

  // ---------- Connect ----------
  function fillConnect() {
    const o = location.origin;
    $('lnScan').textContent = o + '/scan';
    $('lnFind').textContent = o + '/find';
    $('lnHook').textContent = o + '/api/webhook/order?key=YOUR_WEBHOOK_SECRET';
    $('curl').textContent = "curl -X POST '" + o + "/api/webhook/order' \\\\\\n" +
      "  -H 'Authorization: Bearer YOUR_WEBHOOK_SECRET' \\\\\\n" +
      "  -H 'Content-Type: application/json' \\\\\\n" +
      "  -d '{\\"order_id\\":\\"10023\\",\\"name\\":\\"Alex Tan\\",\\"email\\":\\"alex@example.com\\",\\"phone\\":\\"+6591234567\\",\\"guest_name\\":\\"Sam Lee\\"}'";
  }
  document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($(b.dataset.copy).textContent); b.textContent = 'Copied'; setTimeout(() => (b.textContent = 'Copy'), 1500); } catch (e) {}
  }));

  if (pin) start().catch(() => signOut(''));
})();
</script>`;

  return layout({
    title: `${s.event_name} · Organiser`,
    settings: s,
    body,
    head: `<style>
.top { background: var(--surface); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 2; }
.top-in { max-width: 1100px; margin: 0 auto; padding: 12px 16px 0; }
.tabs { display: flex; gap: 4px; overflow-x: auto; margin-top: 8px; }
.tabs button { border: 0; background: none; font: inherit; font-weight: 600; color: var(--muted); padding: 10px 12px; border-bottom: 3px solid transparent; cursor: pointer; white-space: nowrap; }
.tabs button.on { color: var(--text); border-bottom-color: var(--brand); }
.page { max-width: 1100px; margin: 0 auto; padding: 20px 16px 60px; }
.h2 { font-size: 18px; margin: 24px 0 10px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.tile { padding: 16px; }
.t-label { color: var(--muted); font-size: 14px; }
.t-val { font-size: 32px; font-weight: 800; font-variant-numeric: tabular-nums; }
.meter { height: 12px; border-radius: 99px; background: var(--surface-2); overflow: hidden; }
.meter div { height: 100%; width: 0; background: var(--brand); transition: width .4s; }
.feed { list-style: none; margin: 0; padding: 0; }
.feed li { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 12px 16px; border-top: 1px solid var(--border); }
.feed li:first-child { border-top: 0; }
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; }
.toolbar input { flex: 1 1 260px; }
.plist .prow { display: grid; grid-template-columns: 1fr auto; gap: 8px 12px; align-items: center; padding: 14px 16px; border-top: 1px solid var(--border); }
.plist .prow:first-child { border-top: 0; }
.pmain { min-width: 0; overflow-wrap: anywhere; }
.pact { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 6px; }
.pact .btn { min-height: 38px; padding: 0 12px; font-size: 14px; }
@media (min-width: 900px) { .plist .prow { grid-template-columns: 1fr auto auto; } .pact { grid-column: auto; } }
.kv { display: grid; gap: 6px; grid-template-columns: 1fr auto; align-items: center; }
.kv span { grid-column: 1 / -1; font-weight: 600; font-size: 14px; }
.kv code { overflow-wrap: anywhere; background: var(--surface-2); padding: 10px 12px; border-radius: 10px; font-size: 13px; }
pre.code { background: var(--surface-2); padding: 14px; border-radius: 12px; overflow-x: auto; font-size: 13px; white-space: pre; }
dialog { border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--text); padding: 0; }
dialog::backdrop { background: rgba(0,0,0,.5); }
</style>`,
  });
}
