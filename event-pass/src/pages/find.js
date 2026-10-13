import { esc } from '../lib.js';
import { layout, icons } from './layout.js';
import { formatWhen } from '../settings.js';

export function findPage(s) {
  const when = formatWhen(s);
  const body = `
<main class="wrap">
  <div class="card pad stack">
    ${s.logo_url ? `<img src="${esc(s.logo_url)}" alt="" style="max-height:48px;max-width:60%;object-fit:contain">` : ''}
    <h1>${esc(s.event_name)}</h1>
    ${when ? `<p class="muted" style="margin:4px 0 0">${esc(when)}</p>` : ''}
    <h2 style="font-size:18px;margin-top:20px;display:flex;gap:8px;align-items:center">${icons.ticket.replace('<svg', '<svg width="22" height="22"')} Get your pass</h2>
    <p class="muted small">Enter the email you paid with and your order number from the confirmation email.</p>
    <form id="f">
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="email" required>
      <label for="order">Order number</label>
      <input id="order" name="order" autocomplete="off" required>
      <div class="err" id="err" role="alert"></div>
      <button class="btn primary block" id="go">Show my pass</button>
    </form>
  </div>
</main>
<script>
  document.getElementById('f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('err');
    const go = document.getElementById('go');
    err.textContent = '';
    go.disabled = true;
    try {
      const res = await fetch('/api/find', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: e.target.email.value, order: e.target.order.value.replace(/^#/, '') }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      location.href = data.url;
    } catch (ex) {
      err.textContent = ex.message;
      go.disabled = false;
    }
  });
</script>`;
  return layout({ title: `${s.event_name} · Get your pass`, settings: s, body });
}
