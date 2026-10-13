import qrcode from 'qrcode-generator';
import { esc, jsLiteral } from '../lib.js';
import { layout, icons } from './layout.js';
import { formatWhen, mapLink, googleCalendarLink } from '../settings.js';

function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 8, margin: 16, scalable: true, alt: 'Entry QR code' });
}

function statusPill(t) {
  if (t.status === 'void') return '<span class="pill bad">Cancelled</span>';
  if (t.admitted >= t.admits) return '<span class="pill ok">Checked in</span>';
  if (t.admitted > 0) return `<span class="pill warn">${t.admitted} of ${t.admits} checked in</span>`;
  return `<span class="pill">Admits ${t.admits}</span>`;
}

export function ticketPage(s, t, base) {
  const url = `${base}/t/${t.token}`;
  const when = formatWhen(s);
  const map = mapLink(s);
  const gcal = googleCalendarLink(s, url);
  const names = [t.buyer_name, t.guest_name].filter(Boolean);
  const shareText = `Our pass for ${s.event_name} (admits ${t.admits}). Show this QR at the door: ${url}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
  const isVoid = t.status === 'void';

  const body = `
<main class="wrap">
  <article class="card ticket">
    <header class="hero">
      ${s.logo_url ? `<img class="logo" src="${esc(s.logo_url)}" alt="">` : ''}
      <h1>${esc(s.event_name)}</h1>
      ${s.tagline ? `<p class="tagline">${esc(s.tagline)}</p>` : ''}
    </header>

    <section class="pad meta">
      ${when ? `<div class="meta-row">${icons.calendar}<span>${esc(when)}</span></div>` : ''}
      ${s.venue_name || s.venue_address ? `<div class="meta-row">${icons.map}<span>${esc(s.venue_name)}${s.venue_name && s.venue_address ? '<br>' : ''}<span class="muted">${esc(s.venue_address)}</span></span></div>` : ''}
    </section>

    <div class="tear" aria-hidden="true"></div>

    <section class="pad center">
      ${isVoid
        ? '<p class="void">This pass has been cancelled and can’t be used for entry.</p>'
        : `<div class="qr">${qrSvg(url)}</div>
           <p class="code">Pass code <strong>${esc(t.code)}</strong></p>`}
      <div class="who">
        ${names.map((n) => `<div class="name">${esc(n)}</div>`).join('')}
        ${!t.guest_name && t.admits === 2 ? '<div class="muted small">+ 1 guest</div>' : ''}
      </div>
      <div>${statusPill(t)}</div>
      ${s.notes ? `<p class="notes muted small">${esc(s.notes)}</p>` : ''}
    </section>
  </article>

  ${isVoid ? '' : `
  <section class="actions stack">
    <button class="btn primary block" id="share" type="button">${icons.share}Share pass with my partner</button>
    <a class="btn block" href="${esc(wa)}" target="_blank" rel="noopener">${icons.whatsapp}Send via WhatsApp</a>
    <div class="row">
      ${gcal ? `<a class="btn" href="${esc(gcal)}" target="_blank" rel="noopener">${icons.calendar}Google Cal</a>
                <a class="btn" href="/t/${esc(t.token)}/event.ics">${icons.calendar}Apple / Outlook</a>` : ''}
    </div>
    ${map ? `<a class="btn block" href="${esc(map)}" target="_blank" rel="noopener">${icons.map}Directions</a>` : ''}
    <p class="muted small center">Tip: take a screenshot so your pass works even without signal. Both of you can show the same QR. If you arrive separately, each person is checked in once.</p>
  </section>`}
</main>
<script>
  const shareBtn = document.getElementById('share');
  if (shareBtn) shareBtn.addEventListener('click', async () => {
    const data = { title: ${jsLiteral(s.event_name)}, text: ${jsLiteral(shareText)} };
    if (navigator.share) {
      try { await navigator.share(data); } catch (e) {}
    } else {
      window.open(${jsLiteral(wa)}, '_blank', 'noopener');
    }
  });
</script>`;

  return layout({
    title: `${s.event_name} · Pass`,
    settings: s,
    body,
    head: `<style>
.ticket { overflow: hidden; }
.hero { background: var(--brand); color: #fff; padding: 28px 20px 24px; text-align: center; }
.hero h1 { font-size: 26px; font-weight: 800; }
.tagline { margin: 6px 0 0; opacity: .85; }
.logo { max-height: 56px; max-width: 60%; margin-bottom: 12px; object-fit: contain; }
.meta { display: grid; gap: 12px; }
.meta-row { display: flex; gap: 12px; align-items: flex-start; }
.meta-row svg { width: 20px; height: 20px; flex: none; margin-top: 2px; color: var(--brand); }
.tear { height: 0; border-top: 2px dashed var(--border); margin: 0 20px; position: relative; }
.tear::before, .tear::after { content: ""; position: absolute; top: -13px; width: 24px; height: 24px; border-radius: 50%; background: var(--bg); }
.tear::before { left: -33px; } .tear::after { right: -33px; }
.center { text-align: center; }
.qr { background: #fff; border-radius: 14px; padding: 6px; width: min(100%, 300px); margin: 0 auto; }
.qr svg { display: block; width: 100%; height: auto; }
.code { margin: 12px 0 4px; color: var(--muted); }
.code strong { color: var(--text); letter-spacing: .12em; font-size: 18px; }
.who { margin: 14px 0 10px; }
.name { font-size: 20px; font-weight: 700; }
.notes { margin: 14px 0 0; }
.void { color: var(--bad); font-weight: 600; }
.actions { margin-top: 20px; }
</style>`,
  });
}

export function notFoundPage(s) {
  return layout({
    title: 'Pass not found',
    settings: s,
    body: `<main class="wrap"><div class="card pad stack">
      <h1>Pass not found</h1>
      <p class="muted">This link doesn’t match any pass. Check you copied the whole link, or find your pass with your email and order number.</p>
      <a class="btn primary block" href="/find">Find my pass</a>
    </div></main>`,
  });
}
