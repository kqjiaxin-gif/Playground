export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS },
  });
}

export function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy':
        "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; " +
        "connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'",
      ...SECURITY_HEADERS,
    },
  });
}

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function nowIso() {
  return new Date().toISOString();
}

export function randomToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// No 0/O, 1/I/L: easy to read out loud at the door.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomCode(length = 6) {
  let out = '';
  while (out.length < length) {
    const bytes = new Uint8Array(length * 2);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      // Rejection sampling keeps the distribution uniform.
      if (b < 248 && out.length < length) out += CODE_ALPHABET[b % 31];
    }
  }
  return out;
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function clean(value, max = 200) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

const norm = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');

// Flattens nested payloads (e.g. Wix / Zapier) breadth-first, so top-level keys win.
function flatten(obj) {
  const out = {};
  let level = [obj];
  while (level.length) {
    const next = [];
    for (const o of level) {
      for (const [k, v] of Object.entries(o)) {
        if (v && typeof v === 'object') {
          if (!Array.isArray(v)) next.push(v);
        } else if (v !== null && v !== undefined && v !== '') {
          const key = norm(k);
          if (!(key in out)) out[key] = v;
        }
      }
    }
    level = next;
  }
  return out;
}

const ALIASES = {
  order_id: ['orderid', 'ordernumber', 'orderno', 'order', 'reference', 'referenceid', 'transactionid', 'paymentid'],
  buyer_name: ['buyername', 'name', 'fullname', 'customername', 'contactname', 'billingname'],
  first_name: ['firstname', 'givenname', 'first'],
  last_name: ['lastname', 'familyname', 'surname', 'last'],
  buyer_email: ['buyeremail', 'email', 'emailaddress', 'customeremail', 'contactemail'],
  buyer_phone: ['buyerphone', 'phone', 'phonenumber', 'mobile', 'mobilenumber', 'customerphone', 'whatsapp'],
  guest_name: ['guestname', 'guest', 'partnername', 'partner', 'plusonename', 'plusone', 'secondattendee', 'attendee2name', 'attendee2'],
  admits: ['admits'],
};

// Pulls ticket fields out of whatever shape the purchase flow sends.
export function extractTicketFields(payload) {
  const flat = flatten(payload || {});
  const pick = (field) => {
    for (const alias of ALIASES[field]) if (alias in flat) return flat[alias];
    return '';
  };
  const email = clean(pick('buyer_email'), 200).toLowerCase();
  const name =
    clean(pick('buyer_name'), 120) ||
    clean(`${clean(pick('first_name'), 60)} ${clean(pick('last_name'), 60)}`, 120) ||
    email;
  const admits = Number(pick('admits'));
  return {
    order_id: clean(pick('order_id'), 120),
    buyer_name: name,
    buyer_email: email,
    buyer_phone: clean(pick('buyer_phone'), 40),
    guest_name: clean(pick('guest_name'), 120),
    admits: admits === 1 || admits === 2 ? admits : 2,
  };
}

export async function readBody(request) {
  const type = request.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    try {
      return await request.json();
    } catch {
      throw new HttpError(400, 'Body is not valid JSON');
    }
  }
  if (type.includes('form')) {
    const form = await request.formData();
    return Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string'));
  }
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return Object.fromEntries(new URLSearchParams(text));
  }
}

// JSON for embedding inside an inline <script>.
export function jsLiteral(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
