import { clean, HttpError } from './lib.js';

export const DEFAULT_SETTINGS = {
  event_name: 'Our Event',
  tagline: '',
  start_utc: '',
  end_utc: '',
  timezone: 'UTC',
  venue_name: '',
  venue_address: '',
  map_url: '',
  logo_url: '',
  brand_color: '#5b3cc4',
  notes: 'Free seating · This pass admits 2',
};

const KEYS = Object.keys(DEFAULT_SETTINGS);

export async function getSettings(env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
  const out = { ...DEFAULT_SETTINGS };
  for (const { key, value } of results) if (KEYS.includes(key) && value !== null) out[key] = value;
  return out;
}

export async function saveSettings(env, input) {
  const next = {};
  for (const key of KEYS) {
    if (!(key in input)) continue;
    let v = clean(input[key], key === 'notes' ? 600 : 300);
    if (key === 'brand_color' && v && !/^#[0-9a-fA-F]{6}$/.test(v)) throw new HttpError(400, 'Brand colour must look like #5b3cc4');
    if ((key === 'logo_url' || key === 'map_url') && v && !/^https:\/\//i.test(v)) throw new HttpError(400, `${key} must start with https://`);
    if ((key === 'start_utc' || key === 'end_utc') && v && Number.isNaN(Date.parse(v))) throw new HttpError(400, `${key} is not a valid date`);
    if (key === 'timezone' && v) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: v });
      } catch {
        throw new HttpError(400, 'Unknown timezone');
      }
    }
    next[key] = v;
  }
  const stmts = Object.entries(next).map(([k, v]) =>
    env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, v),
  );
  if (stmts.length) await env.DB.batch(stmts);
  return getSettings(env);
}

export function formatWhen(s) {
  if (!s.start_utc) return '';
  const tz = s.timezone || 'UTC';
  const start = new Date(s.start_utc);
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(start);
  const time = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
  return s.end_utc ? `${day} · ${time(start)} – ${time(new Date(s.end_utc))}` : `${day} · ${time(start)}`;
}

export function mapLink(s) {
  if (s.map_url) return s.map_url;
  const q = [s.venue_name, s.venue_address].filter(Boolean).join(', ');
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : '';
}

const icsDate = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const endOf = (s) => s.end_utc || new Date(Date.parse(s.start_utc) + 3 * 3600 * 1000).toISOString();

export function googleCalendarLink(s, ticketUrl) {
  if (!s.start_utc) return '';
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: s.event_name,
    dates: `${icsDate(s.start_utc)}/${icsDate(endOf(s))}`,
    location: [s.venue_name, s.venue_address].filter(Boolean).join(', '),
    details: `Your pass: ${ticketUrl}`,
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

const icsText = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

export function eventIcs(s, ticket, base) {
  const ticketUrl = `${base}/t/${ticket.token}`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Event Pass//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${ticket.code}-${icsDate(s.start_utc)}@event-pass`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(s.start_utc)}`,
    `DTEND:${icsDate(endOf(s))}`,
    `SUMMARY:${icsText(s.event_name)}`,
    `LOCATION:${icsText([s.venue_name, s.venue_address].filter(Boolean).join(', '))}`,
    `DESCRIPTION:${icsText(`Your pass (admits ${ticket.admits}): ${ticketUrl}`)}`,
    `URL:${ticketUrl}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}
