// End-to-end smoke test against a running worker (`npm run dev`).
// Usage: BASE=http://127.0.0.1:8787 node test/smoke.mjs
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const ADMIN = process.env.ADMIN_PIN || 'admin-change-me';
const STAFF = process.env.STAFF_PIN || '246810';
const SECRET = process.env.WEBHOOK_SECRET || 'local-webhook-secret';
const run = Date.now().toString(36);

async function call(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let data = text;
  if (!raw) try { data = JSON.parse(text); } catch {}
  return { status: res.status, data, headers: res.headers };
}
const staff = (path, opts = {}) => call(path, { ...opts, headers: { 'x-pin': STAFF } });
const admin = (path, opts = {}) => call(path, { ...opts, headers: { 'x-pin': ADMIN } });
const step = (name) => console.log('✓', name);

// Event settings
let r = await admin('/api/admin/settings', {
  method: 'PUT',
  body: { event_name: 'Gala Night', timezone: 'Asia/Singapore', start_utc: '2026-11-20T11:00:00.000Z', end_utc: '2026-11-20T15:00:00.000Z',
    venue_name: 'The Hall', venue_address: '1 Example Road', brand_color: '#5b3cc4' },
});
assert.equal(r.status, 200);
assert.equal(r.data.event_name, 'Gala Night');
r = await admin('/api/admin/settings', { method: 'PUT', body: { brand_color: 'red;}' } });
assert.equal(r.status, 400);
step('admin saves settings, rejects bad colour');

// Webhook auth
r = await call('/api/webhook/order', { method: 'POST', body: { order_id: 'x', name: 'x' } });
assert.equal(r.status, 401);
r = await staff('/api/admin/tickets');
assert.equal(r.status, 401);
step('webhook and admin reject missing/wrong secrets');

// Purchase -> ticket (nested payload like a no-code automation)
const order = `ORD-${run}`;
r = await call(`/api/webhook/order?key=${SECRET}`, {
  method: 'POST',
  body: { data: { orderNumber: order, contact: { firstName: 'Alex', lastName: 'Tan', email: 'Alex@Example.com', phone: '+65 9123 4567' } }, guest_name: 'Sam Lee' },
});
assert.equal(r.status, 201, JSON.stringify(r.data));
assert.equal(r.data.created, true);
const { ticket_url, code } = r.data;
assert.match(ticket_url, /\/t\/[A-Za-z0-9_-]{22}$/);
assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
const token = ticket_url.split('/t/')[1];
step('webhook creates pass from nested payload');

// Idempotent retry (form-encoded, bearer auth)
r = await call('/api/webhook/order', {
  method: 'POST',
  headers: { authorization: `Bearer ${SECRET}`, 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ order_id: order, name: 'Alex Tan' }).toString(),
});
assert.equal(r.status, 200);
assert.equal(r.data.created, false);
assert.equal(r.data.ticket_url, ticket_url);
step('same order twice returns the same pass');

// Concurrent duplicate deliveries
const dupOrder = `DUP-${run}`;
const dups = await Promise.all(Array.from({ length: 5 }, () =>
  call(`/api/webhook/order?key=${SECRET}`, { method: 'POST', body: { order_id: dupOrder, name: 'Dup Buyer' } })));
assert.equal(new Set(dups.map((d) => d.data.ticket_url)).size, 1);
step('parallel duplicate webhooks still produce one pass');

// Ticket page + calendar
r = await call(`/t/${token}`, { raw: true });
assert.equal(r.status, 200);
assert.ok(r.data.includes('Gala Night') && r.data.includes('Alex Tan') && r.data.includes('Sam Lee') && r.data.includes('<svg'));
assert.ok(r.data.includes('wa.me'));
r = await call(`/t/${token}/event.ics`, { raw: true });
assert.equal(r.status, 200);
assert.ok(r.data.includes('DTSTART:20261120T110000Z'));
r = await call('/t/doesnotexistdoesnotexist', { raw: true });
assert.equal(r.status, 404);
step('ticket page renders QR, names, share + calendar');

// Find my pass
r = await call('/api/find', { method: 'POST', body: { email: 'alex@example.com', order } });
assert.equal(r.status, 200);
assert.equal(r.data.url, ticket_url);
r = await call('/api/find', { method: 'POST', body: { email: 'someone@else.com', order } });
assert.equal(r.status, 404);
step('buyer can find pass by email + order number only');

// Door: lookup + partial check-in
r = await staff(`/api/staff/lookup?token=${token}`);
const id = r.data.ticket.id;
assert.equal(r.data.ticket.admits, 2);
assert.equal(r.data.ticket.admitted, 0);
r = await staff(`/api/staff/lookup?code=${code.toLowerCase()}`);
assert.equal(r.data.ticket.id, id);
r = await staff('/api/staff/checkin', { method: 'POST', body: { id, count: 1, door: 'North' } });
assert.equal(r.status, 200);
assert.equal(r.data.ticket.admitted, 1);
r = await staff('/api/staff/checkin', { method: 'POST', body: { id, count: 2 } });
assert.equal(r.status, 409);
assert.equal(r.data.reason, 'used');
step('admit 1 of pair; admitting 2 more is refused');

// Two doors racing for the last seat
const race = await Promise.all([1, 2, 3, 4].map((n) => staff('/api/staff/checkin', { method: 'POST', body: { id, count: 1, door: `D${n}` } })));
assert.equal(race.filter((x) => x.status === 200).length, 1, 'exactly one door wins');
r = await staff(`/api/staff/lookup?token=${token}`);
assert.equal(r.data.ticket.admitted, 2);
step('4 doors racing for the last admit: exactly one succeeds');

// Undo
r = await staff('/api/staff/undo', { method: 'POST', body: { id } });
assert.equal(r.data.ticket.admitted, 1);
r = await staff('/api/staff/checkin', { method: 'POST', body: { id, count: 1 } });
assert.equal(r.data.ticket.admitted, 2);
step('undo and re-admit');

// Void
r = await admin('/api/admin/tickets', { method: 'POST', body: { buyer_name: 'Refunded Person', admits: 2 } });
assert.equal(r.status, 201);
const voidId = r.data.ticket.id;
await admin(`/api/admin/tickets/${voidId}/void`, { method: 'POST' });
r = await staff('/api/staff/checkin', { method: 'POST', body: { id: voidId, count: 2 } });
assert.equal(r.status, 409);
assert.equal(r.data.reason, 'void');
step('cancelled pass is refused at the door');

// Edit + import + search + stats
r = await admin(`/api/admin/tickets/${id}`, { method: 'PATCH', body: { guest_name: 'Samantha Lee' } });
assert.equal(r.data.ticket.guest_name, 'Samantha Lee');
r = await admin('/api/admin/import', {
  method: 'POST',
  body: { rows: [{ 'Order Number': `IMP1-${run}`, Name: 'Imported One', Email: 'one@example.com' }, { 'Order Number': order, Name: 'Dup' }, { Name: '' }] },
});
assert.equal(r.data.created, 1);
assert.equal(r.data.existing, 1);
assert.equal(r.data.errors.length, 1);
r = await staff('/api/staff/lookup?q=Samantha');
assert.ok(r.data.results.some((t) => t.id === id));
r = await staff('/api/staff/stats');
assert.ok(r.data.admitted >= 2 && r.data.expected >= r.data.admitted);
r = await admin('/api/admin/overview');
assert.ok(r.data.recent.length > 0);
step('edit, CSV import, name search, stats');

// Pages respond
for (const p of ['/scan', '/admin', '/find', '/']) {
  r = await call(p, { raw: true });
  assert.equal(r.status, 200, p);
}
step('scanner, admin and find pages load');

console.log('\nAll checks passed.');
