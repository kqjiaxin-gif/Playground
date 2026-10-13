import { HttpError, json, html, nowIso, randomToken, randomCode, safeEqual, clean, extractTicketFields, readBody } from './lib.js';
import { getSettings, saveSettings, eventIcs } from './settings.js';
import { ticketPage, notFoundPage } from './pages/ticket.js';
import { scanPage } from './pages/scan.js';
import { adminPage } from './pages/admin.js';
import { findPage } from './pages/find.js';
import jsQrSource from 'jsqr/dist/jsQR.js';

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const THROTTLE_LIMIT = 20;
const THROTTLE_WINDOW_MS = 15 * 60 * 1000;

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'Something went wrong' }, 500);
    }
  },
};

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method;

  // ---- Pages ----
  if (method === 'GET') {
    if (path === '/' || path === '/find') return html(findPage(await getSettings(env)));
    if (path === '/scan') return html(scanPage(await getSettings(env)));
    if (path === '/admin') return html(adminPage(await getSettings(env)));
    if (path === '/vendor/jsqr.js') {
      return new Response(jsQrSource, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
    }

    let m = path.match(/^\/t\/([^/]+)$/);
    if (m) {
      const settings = await getSettings(env);
      const ticket = TOKEN_RE.test(m[1]) ? await ticketByToken(env, m[1]) : null;
      if (!ticket) return html(notFoundPage(settings), 404);
      return html(ticketPage(settings, ticket, baseUrl(env, url)));
    }
    m = path.match(/^\/t\/([^/]+)\/event\.ics$/);
    if (m) {
      const settings = await getSettings(env);
      const ticket = TOKEN_RE.test(m[1]) ? await ticketByToken(env, m[1]) : null;
      if (!ticket || !settings.start_utc) return new Response('Not found', { status: 404 });
      return new Response(eventIcs(settings, ticket, baseUrl(env, url)), {
        headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'attachment; filename="event.ics"' },
      });
    }
  }

  // ---- Purchase flow webhook ----
  if (path === '/api/webhook/order' && method === 'POST') {
    await requireSecret(request, env, url);
    const fields = extractTicketFields(await readBody(request));
    const { ticket, created } = await createTicket(env, fields, 'webhook');
    return json({ ok: true, created, ...publicTicket(ticket, baseUrl(env, url)) }, created ? 201 : 200);
  }

  // ---- Buyer: find my ticket ----
  if (path === '/api/find' && method === 'POST') {
    await assertNotThrottled(env, request);
    const body = await readBody(request);
    const email = clean(body.email, 200).toLowerCase();
    const ref = clean(body.order, 120);
    const ticket = email && ref
      ? await env.DB.prepare(
          `SELECT * FROM tickets WHERE buyer_email = ?1 COLLATE NOCASE AND (order_id = ?2 OR code = upper(?2)) AND status = 'active'`,
        ).bind(email, ref).first()
      : null;
    if (!ticket) {
      await recordFailure(env, request);
      throw new HttpError(404, "We couldn't find a pass for that email and order number. If you just paid, wait a minute and try again.");
    }
    return json({ ok: true, url: `${baseUrl(env, url)}/t/${ticket.token}` });
  }

  // ---- Door staff ----
  if (path.startsWith('/api/staff/')) {
    await requirePin(request, env, 'staff');
    return staffRoutes(request, env, path, url);
  }

  // ---- Organiser ----
  if (path.startsWith('/api/admin/')) {
    await requirePin(request, env, 'admin');
    return adminRoutes(request, env, path, url);
  }

  return method === 'GET' ? html(notFoundPage(await getSettings(env)), 404) : json({ error: 'Not found' }, 404);
}

async function staffRoutes(request, env, path, url) {
  const method = request.method;

  if (path === '/api/staff/stats' && method === 'GET') {
    const settings = await getSettings(env);
    return json({ ...(await stats(env)), event_name: settings.event_name });
  }

  if (path === '/api/staff/lookup' && method === 'GET') {
    const token = url.searchParams.get('token') || '';
    const code = clean(url.searchParams.get('code'), 20).toUpperCase();
    const q = clean(url.searchParams.get('q'), 80);
    if (token) {
      const t = TOKEN_RE.test(token) ? await ticketByToken(env, token) : null;
      return json({ ticket: t ? staffTicket(t) : null });
    }
    if (code) {
      const t = await env.DB.prepare('SELECT * FROM tickets WHERE code = ?').bind(code).first();
      return json({ ticket: t ? staffTicket(t) : null });
    }
    if (q.length >= 2) {
      const like = `%${q.replace(/[%_]/g, '')}%`;
      const { results } = await env.DB.prepare(
        `SELECT * FROM tickets WHERE buyer_name LIKE ?1 OR guest_name LIKE ?1 OR code LIKE ?1 OR order_id LIKE ?1 OR buyer_phone LIKE ?1
         ORDER BY buyer_name LIMIT 20`,
      ).bind(like).all();
      return json({ results: results.map(staffTicket) });
    }
    throw new HttpError(400, 'Give a token, code or search text');
  }

  if (path === '/api/staff/checkin' && method === 'POST') {
    const body = await readBody(request);
    const count = Number(body.count);
    if (count !== 1 && count !== 2) throw new HttpError(400, 'count must be 1 or 2');
    const id = Number(body.id);
    if (!Number.isInteger(id)) throw new HttpError(400, 'id is required');
    const door = clean(body.door, 40) || null;
    const at = nowIso();

    // Single conditional UPDATE: two doors scanning the same pass at once cannot both succeed.
    const updated = await env.DB.prepare(
      `UPDATE tickets
         SET admitted = admitted + ?1, last_checkin_at = ?2, first_checkin_at = COALESCE(first_checkin_at, ?2)
       WHERE id = ?3 AND status = 'active' AND admitted + ?1 <= admits
       RETURNING *`,
    ).bind(count, at, id).first();

    if (!updated) {
      const current = await env.DB.prepare('SELECT * FROM tickets WHERE id = ?').bind(id).first();
      if (!current) throw new HttpError(404, 'Pass not found');
      return json({ ok: false, reason: current.status === 'void' ? 'void' : 'used', ticket: staffTicket(current) }, 409);
    }
    await env.DB.prepare('INSERT INTO checkins (ticket_id, delta, door, at) VALUES (?, ?, ?, ?)').bind(id, count, door, at).run();
    return json({ ok: true, admitted_now: count, ticket: staffTicket(updated) });
  }

  if (path === '/api/staff/undo' && method === 'POST') {
    const body = await readBody(request);
    const id = Number(body.id);
    const door = clean(body.door, 40) || null;
    const updated = await env.DB.prepare(
      `UPDATE tickets SET admitted = admitted - 1,
         first_checkin_at = CASE WHEN admitted - 1 = 0 THEN NULL ELSE first_checkin_at END
       WHERE id = ? AND admitted > 0 RETURNING *`,
    ).bind(id).first();
    if (!updated) throw new HttpError(409, 'Nothing to undo');
    await env.DB.prepare('INSERT INTO checkins (ticket_id, delta, door, at) VALUES (?, -1, ?, ?)').bind(id, door, nowIso()).run();
    return json({ ok: true, ticket: staffTicket(updated) });
  }

  throw new HttpError(404, 'Not found');
}

async function adminRoutes(request, env, path, url) {
  const method = request.method;
  const base = baseUrl(env, url);

  if (path === '/api/admin/overview' && method === 'GET') {
    const { results: recent } = await env.DB.prepare(
      `SELECT c.delta, c.door, c.at, t.buyer_name, t.guest_name, t.code
         FROM checkins c JOIN tickets t ON t.id = c.ticket_id
        ORDER BY c.id DESC LIMIT 30`,
    ).all();
    return json({ ...(await stats(env)), recent });
  }

  if (path === '/api/admin/settings') {
    if (method === 'GET') return json(await getSettings(env));
    if (method === 'PUT') return json(await saveSettings(env, await readBody(request)));
  }

  if (path === '/api/admin/tickets') {
    if (method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM tickets ORDER BY id DESC').all();
      return json({ tickets: results.map((t) => adminTicket(t, base)) });
    }
    if (method === 'POST') {
      const body = await readBody(request);
      const fields = extractTicketFields(body);
      const { ticket, created } = await createTicket(env, fields, 'manual');
      return json({ created, ticket: adminTicket(ticket, base) }, created ? 201 : 200);
    }
  }

  if (path === '/api/admin/import' && method === 'POST') {
    const body = await readBody(request);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length > 200) throw new HttpError(400, 'Send at most 200 rows per request');
    let created = 0, existing = 0;
    const errors = [];
    for (const [i, row] of rows.entries()) {
      try {
        const r = await createTicket(env, extractTicketFields(row), 'import');
        r.created ? created++ : existing++;
      } catch (err) {
        errors.push({ row: i, error: err.message });
      }
    }
    return json({ created, existing, errors });
  }

  const m = path.match(/^\/api\/admin\/tickets\/(\d+)(?:\/(void|restore))?$/);
  if (m) {
    const id = Number(m[1]);
    if (m[2] && method === 'POST') {
      const status = m[2] === 'void' ? 'void' : 'active';
      const t = await env.DB.prepare('UPDATE tickets SET status = ? WHERE id = ? RETURNING *').bind(status, id).first();
      if (!t) throw new HttpError(404, 'Pass not found');
      return json({ ticket: adminTicket(t, base) });
    }
    if (!m[2] && method === 'PATCH') {
      const body = await readBody(request);
      const current = await env.DB.prepare('SELECT * FROM tickets WHERE id = ?').bind(id).first();
      if (!current) throw new HttpError(404, 'Pass not found');
      const next = {
        buyer_name: 'buyer_name' in body ? clean(body.buyer_name, 120) : current.buyer_name,
        buyer_email: 'buyer_email' in body ? clean(body.buyer_email, 200).toLowerCase() : current.buyer_email,
        buyer_phone: 'buyer_phone' in body ? clean(body.buyer_phone, 40) : current.buyer_phone,
        guest_name: 'guest_name' in body ? clean(body.guest_name, 120) : current.guest_name,
      };
      if (!next.buyer_name) throw new HttpError(400, 'Buyer name is required');
      const t = await env.DB.prepare(
        'UPDATE tickets SET buyer_name = ?, buyer_email = ?, buyer_phone = ?, guest_name = ? WHERE id = ? RETURNING *',
      ).bind(next.buyer_name, next.buyer_email || null, next.buyer_phone || null, next.guest_name || null, id).first();
      return json({ ticket: adminTicket(t, base) });
    }
  }

  throw new HttpError(404, 'Not found');
}

// ---------- Tickets ----------

async function createTicket(env, fields, source) {
  if (!fields.buyer_name) throw new HttpError(400, 'A buyer name (or email) is required');
  const orderId = fields.order_id || null;

  if (orderId) {
    const existing = await env.DB.prepare('SELECT * FROM tickets WHERE order_id = ?').bind(orderId).first();
    if (existing) return { ticket: existing, created: false };
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const ticket = await env.DB.prepare(
        `INSERT INTO tickets (token, code, order_id, buyer_name, buyer_email, buyer_phone, guest_name, admits, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      ).bind(
        randomToken(), randomCode(), orderId, fields.buyer_name, fields.buyer_email || null,
        fields.buyer_phone || null, fields.guest_name || null, fields.admits || 2, source, nowIso(),
      ).first();
      return { ticket, created: true };
    } catch (err) {
      const msg = String(err?.message || err);
      if (msg.includes('tickets.order_id') && orderId) {
        // Same order delivered twice at the same moment; return the one that won.
        const existing = await env.DB.prepare('SELECT * FROM tickets WHERE order_id = ?').bind(orderId).first();
        if (existing) return { ticket: existing, created: false };
      }
      if (!msg.includes('UNIQUE')) throw err;
      // token/code collision: retry with fresh values
    }
  }
  throw new HttpError(500, 'Could not create a unique pass, please retry');
}

const ticketByToken = (env, token) => env.DB.prepare('SELECT * FROM tickets WHERE token = ?').bind(token).first();

async function stats(env) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS passes, COALESCE(SUM(admits), 0) AS expected, COALESCE(SUM(admitted), 0) AS admitted,
            COALESCE(SUM(CASE WHEN admitted > 0 THEN 1 ELSE 0 END), 0) AS passes_used
       FROM tickets WHERE status = 'active'`,
  ).first();
  return row;
}

function publicTicket(t, base) {
  return { ticket_url: `${base}/t/${t.token}`, code: t.code, order_id: t.order_id, admits: t.admits };
}

function staffTicket(t) {
  return {
    id: t.id, token: t.token, code: t.code, buyer_name: t.buyer_name, guest_name: t.guest_name, order_id: t.order_id,
    admits: t.admits, admitted: t.admitted, status: t.status, first_checkin_at: t.first_checkin_at, last_checkin_at: t.last_checkin_at,
  };
}

function adminTicket(t, base) {
  return { ...t, ticket_url: `${base}/t/${t.token}` };
}

function baseUrl(env, url) {
  return (env.PUBLIC_BASE_URL || url.origin).replace(/\/+$/, '');
}

// ---------- Auth ----------

async function requirePin(request, env, role) {
  await assertNotThrottled(env, request);
  const pin = request.headers.get('x-pin') || '';
  const ok = safeEqual(pin, env.ADMIN_PIN) || (role === 'staff' && safeEqual(pin, env.STAFF_PIN));
  if (!ok) {
    await recordFailure(env, request);
    throw new HttpError(401, 'Wrong PIN');
  }
}

async function requireSecret(request, env, url) {
  await assertNotThrottled(env, request);
  const auth = request.headers.get('authorization') || '';
  const given =
    (auth.startsWith('Bearer ') ? auth.slice(7) : '') ||
    request.headers.get('x-webhook-secret') ||
    url.searchParams.get('key') || '';
  if (!safeEqual(given.trim(), env.WEBHOOK_SECRET)) {
    await recordFailure(env, request);
    throw new HttpError(401, 'Bad webhook secret');
  }
}

const clientIp = (request) => request.headers.get('cf-connecting-ip') || 'local';

async function assertNotThrottled(env, request) {
  const row = await env.DB.prepare('SELECT count, window_start FROM auth_failures WHERE ip = ?').bind(clientIp(request)).first();
  if (row && row.count >= THROTTLE_LIMIT && Date.now() - row.window_start < THROTTLE_WINDOW_MS) {
    throw new HttpError(429, 'Too many wrong attempts. Try again in 15 minutes.');
  }
}

async function recordFailure(env, request) {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO auth_failures (ip, count, window_start) VALUES (?1, 1, ?2)
     ON CONFLICT(ip) DO UPDATE SET
       count = CASE WHEN ?2 - window_start > ?3 THEN 1 ELSE count + 1 END,
       window_start = CASE WHEN ?2 - window_start > ?3 THEN ?2 ELSE window_start END`,
  ).bind(clientIp(request), now, THROTTLE_WINDOW_MS).run();
}
