# Event Pass

Unique QR passes for **pair tickets** (one pass admits 2), issued automatically when someone buys, and checked in at the door by several staff phones at once.

- **Ticket page**: event details, logo and brand colour, buyer and guest names, the QR, a WhatsApp/share button for the partner, add-to-calendar and directions.
- **Door scanner** (`/scan`): phone camera scanning, staff PIN, "Admit both" / "Admit 1", a red screen for used or cancelled passes, undo, and name/code search when a phone is dead.
- **Organiser dashboard** (`/admin`): live arrival count, recent check-ins, search, add, edit or cancel passes, CSV import/export, and a per-pass WhatsApp send.
- **Get your pass** (`/find`): buyers enter their email and order number to open their pass.
- **Purchase webhook**: your checkout calls it after payment and gets back the `ticket_url`.

It runs on **Cloudflare Workers + D1**, and the free tier is plenty for 500+ attendees.

## How it works

```
Checkout paid ──POST /api/webhook/order──▶ pass created (idempotent per order_id)
                                             │
Buyer ◀── ticket_url (email / WhatsApp / /find page) ──┘
Buyer shares the same link with their partner
Door: staff phone scans QR ─▶ "Valid · 2 to admit" ─▶ Admit both / Admit 1
```

- Each pass has an unguessable 128-bit token in its QR, plus a 6-character code (e.g. `P3EC3T`) for manual lookup.
- Check-in is one conditional database update. Two doors scanning the same pass at the same moment cannot both admit it (the tests race 4 doors).
- If a pair arrives separately, the first person is admitted with "Admit 1" and the partner later shows the same QR.

## Deploy (about 10 minutes)

You need a free Cloudflare account and Node 18+.

```bash
cd event-pass
npm install
npx wrangler login
npx wrangler d1 create event-pass        # copy the database_id it prints into wrangler.toml
npm run db:init                          # creates the tables
npx wrangler secret put ADMIN_PIN        # long passphrase for you
npx wrangler secret put STAFF_PIN        # 6+ digits, shared with door staff
npx wrangler secret put WEBHOOK_SECRET   # long random string, e.g. `openssl rand -hex 24`
npm run deploy                           # prints https://event-pass.<you>.workers.dev
```

Then open `https://…workers.dev/admin`, sign in, and fill in the **Event** tab (name, date, venue, logo URL, colour).
The **Connect** tab shows your scanner link, find-your-pass link and webhook URL.

If you use a custom domain, set `PUBLIC_BASE_URL` under `[vars]` in `wrangler.toml` so QR codes point to it.

## Connecting your purchase flow (no-code)

Send an HTTP `POST` to:

```
https://<your-worker>/api/webhook/order?key=YOUR_WEBHOOK_SECRET
```

The body can be JSON or form fields. Field names are matched loosely, and nested payloads are fine:

| Meaning | Accepted names (any of) |
|---|---|
| Order number (strongly recommended) | `order_id`, `orderNumber`, `order_no`, `reference`, `transaction_id` |
| Buyer name | `name`, `full_name`, `customer_name`, or `first_name` + `last_name` |
| Email | `email`, `customer_email` |
| Phone / WhatsApp | `phone`, `mobile`, `whatsapp` |
| Partner's name (optional) | `guest_name`, `partner_name`, `plus_one` |

The response is `{ "ticket_url": "...", "code": "P3EC3T", ... }`. Repeating the same `order_id` returns the same pass, so retries never create duplicates.

How to get the link to the buyer, depending on your platform:

- **Wix**: Automations → trigger "Order paid" (or "Invoice paid") → action "Send HTTP request" → POST to the URL above with the order fields. Put "Get your pass: https://<your-worker>/find" on the thank-you page and in the order confirmation email.
- **Squarespace / Shopify / others**: use **Make.com** or **Zapier**. Trigger "New order" → "HTTP / Webhooks POST" to the URL above → then "Send email" or "WhatsApp" with `ticket_url` from the response.
- **Anything else**: buyers can always open `/find` and enter their email and order number.

You can also add passes yourself in **Admin → Passes → Add pass**, or bulk-load them with **Import CSV**. The CSV header row uses the same names as the table above.

## Event day checklist

1. Share `https://<your-worker>/scan` and the staff PIN with door staff. Each person types their door name so the log shows who admitted whom.
2. Ask staff to open the scanner once before doors open and allow camera access.
3. Turn on **Auto-admit** in the scanner for the fastest flow: one scan admits everyone remaining on the pass.
4. Staff need mobile data or venue Wi-Fi. If the camera fails, search by name or the 6-character code.
5. Watch arrivals live on `/admin`. Export the attendance CSV afterwards.

## Develop & test

```bash
cp .dev.vars.example .dev.vars
npm run db:init:local
npm run dev            # http://127.0.0.1:8787
npm test               # end-to-end smoke test against the dev server
```
