# P&O Reception – Ticket Portal

A modern, responsive form for submitting **Meeting Room Reservation** and
**Parking Lot Request** tickets (e.g. at the front desk).
Submissions are created **directly in OTOBO** through its Generic Interface
REST API (`TicketCreate`), using the submitter's email as the ticket's
customer user so OTOBO sends all notifications and agent replies to them.

No OTOBO customer account is required: OTOBO's `TicketCreate` accepts any
valid email address as `Ticket.CustomerUser` even if the email is not
registered as a Customer User, and OTOBO still sends ticket updates and agent
replies to that address.

**Stack:** Astro · Tailwind CSS v4 · DaisyUI v5 · Vanilla JS · Node.js (Express)

## Folder structure

```
form-otobo/
├── frontend/                 # Astro static site (builds to dist/)
│   ├── astro.config.mjs      # Tailwind plugin + dev proxy /api → :3000
│   ├── package.json
│   ├── public/
│   │   └── logo.svg          # Header logo
│   └── src/
│       ├── pages/index.astro           # Meeting Room Reservation form (`/`)
│       ├── pages/parking-request.astro # Parking Lot Request form (`/parking-request`)
│       ├── styles/global.css # Tailwind + DaisyUI + custom theme/validation
│       └── scripts/form.js   # Validation, char counter, modal, theme, submit
└── backend/                  # Express API that talks to OTOBO
    ├── server.js             # POST /api/submit -> OTOBO TicketCreate
    ├── otobo-webservice.yml  # OTOBO web service definition (import once)
    ├── package.json
    ├── .env.example          # Copy to .env and fill in
    └── .env                  # Real credentials (gitignored)
```

## Architecture

1. User fills the form; `frontend/src/scripts/form.js` validates client-side.
2. A confirmation modal asks before sending.
3. `fetch()` POSTs JSON to `/api/submit` (relative — proxied to the backend).
4. The backend validates, maps fields, and calls OTOBO:
   `POST {OTOBRO_BASE_URL}{OTOBRO_ROUTE}` (TicketCreate).
5. OTOBO creates the ticket in the configured queue and emails the user.
6. Backend returns `{ success, ticketNumber }` or OTOBO's error message.

## OTOBO setup (one-time)

### 1. Import the web service
On the OTOBO server's CLI:

```bash
/opt/otobo/bin/otobo.Console.pl Admin::WebService::Add \
  --name TicketPortalAPI \
  --source-path backend/otobo-webservice.yml
```

Or create it manually: Admin → **Processes & Automation → Web Services** →
add web service `TicketPortalAPI` (Provider, HTTP::REST) with a
`Ticket::TicketCreate` operation, route `/ticket`, method `POST`.

### 2. Create the API agent
Admin → **Agents & Users → Users** → add `apiuser` with a password and
**rw** permission on the group that owns the target queue (default `Raw`).

### 3. Email delivery (optional but recommended)

No customer pre-registration is needed. `TicketCreate` accepts any valid email
as the ticket's customer and OTOBO sends replies/notifications to it. To let
customers receive emails:

1. **Outbound SMTP**: Admin → **Communication → Email Outbound** — set a working
   SMTP server/credentials (e.g. `smtp.gmail.com`, port 587, an app password).
   Without this, no email reaches the submitter.
2. **System address**: Admin → **Communication → Email Addresses** — ensure the
   queue used by `OTOBRO_QUEUE` has a valid system (From) address.
3. *(Optional) Instant confirmation*: to email the customer immediately on
   ticket creation, add a **Ticket Notification** (Admin → Communication →
   Ticket Notifications) on the `TicketCreate` event sent to the ticket's
   customer user — or enable SysConfig `AutoResponseForWebTickets`.

## Getting started

### 1. Backend

```bash
cd backend
cp .env.example .env   # fill in OTOBRO_* values
npm install
npm start              # http://localhost:3000
```

### 2. Frontend (dev)

```bash
cd frontend
npm install
npm run dev            # http://localhost:4321 (proxies /api → :3000)
```

Open **http://localhost:4321** and submit a ticket. `astro dev` forwards
`/api/*` requests to the backend automatically (see `astro.config.mjs`).

### 3. Frontend (production build)

```bash
cd frontend
npm run build          # outputs static site to dist/
```

`dist/` is served by a web server (see deployment below); the backend must be
running on the same origin behind `/api`.

## Configuration (`.env`)

| Variable            | Purpose                                    | Default                     |
| ------------------- | ------------------------------------------ | --------------------------- |
| `OTOBRO_BASE_URL`   | Generic Interface URL + webservice name     | `http://172.22.2.54/.../TicketPortalAPI` |
| `OTOBRO_ROUTE`      | TicketCreate operation route                | `/ticket`                   |
| `OTOBRO_USER`       | OTOBO agent login                           | `apiuser`                   |
| `OTOBRO_PASSWORD`   | OTOBO agent password                        | *(required)*                |
| `OTOBRO_QUEUE`      | Queue for new tickets                       | `Raw`                       |
| `OTOBRO_TYPE`       | Ticket type sent to OTOBO (must exist there) | `Unclassified`             |
| `PORT`              | Backend port                                | `3000`                      |
| `CORS_ORIGIN`       | Allowed frontend origin (`*` in dev)        | `*`                         |

## Type / Vehicle mapping

There are two dedicated form pages, one per request type:

- `/` → **Meeting Room Reservation**
- `/parking-request` → **Parking Lot Request**

Each page sends its fixed type name directly as OTOBO's ticket type
(`Ticket.Type`), which must exist under OTOBO →
**Admin → Ticket Settings → Types**. The pages link to each other so visitors
can switch.

**Vehicle Type** appears only on the parking page and **No. of Pax** only on the
meeting room page; both are kept in the article body only.

## API reference

**`POST /api/submit`**

```json
{
  "firstName": "John",
  "lastName": "Smith",
  "email": "john.smith@company.com",
  "type": "Meeting Room Reservation",
  "location": "Head Office",
  "service": "",
  "participants": "6-10",
  "subject": "Q3 Town Hall",
  "description": "Projector needed, reserve 2 parking slots.",
  "date": "Aug 14, 2026",
  "startTime": "9:00 AM",
  "endTime": "11:00 AM"
}
```

Validation: `firstName`, `lastName`, `email`, `type`, `location`, `date`,
`subject`, `startTime` and `endTime` are required. `service` (vehicle type) is
required only when `type` is `Parking Lot Request`, and `participants` only when
`type` is `Meeting Room Reservation`. `description` (remarks) is optional.

On the ticket, the backend sets `CustomerUser`/`CustomerID` to the email, the
Request Title (`subject`) becomes the OTOBO ticket title, and the submitter's
name and request details appear in the ticket body under `Remarks:`.

Responses:
- `200 { "success": true, "ticketID": 123, "ticketNumber": "20120230000010" }`
- `400 { "success": false, "error": "..." }` – validation failure
- `500 { "success": false, "error": "..." }` – OTOBO/connection failure (includes
  OTOBO's `ErrorMessage`, e.g. `CustomerUser ... is invalid!`)

**`GET /api/health`** – `{ "status": "ok" }`

## Deploying on the OTOBO VM (internal, via VPN)

1. Build the frontend → copy `frontend/dist/` and `backend/` to the VM
   (e.g. `/opt/helpdesk`).
2. On the VM, set `backend/.env` so OTOBO is reached locally:
   `OTOBRO_BASE_URL=http://localhost/otobo/nph-genericinterface.pl/Webservice/TicketPortalAPI`.
3. Keep the backend running and auto-start on boot — **pm2** (recommended):
   ```bash
   cd backend && npm i -g pm2
   pm2 start server.js --name helpdesk-api
   pm2 save && pm2 startup
   ```
   or a **systemd** service with `Restart=always`.
4. Add a path on OTOBO's web server (Apache or nginx), e.g. `http://<host>/portal/`:
   - serve `dist/` statically at `/portal/`, and
   - reverse-proxy `/portal/api` → `127.0.0.1:3000`.
5. Reload the web server. Users on the VPN open `http://<host>/portal/`.

## Troubleshooting

- **`CustomerUser ... parameter is invalid!`** → the email is not a valid email
  address format. OTOBO 10.x accepts unregistered but well-formed emails; no
  customer account has to exist beforehand.
- **`User could not be authenticated`** → wrong `OTOBRO_USER`/`OTOBRO_PASSWORD`.
- **`AccessDenied` / can't create in queue** → `apiuser` lacks **rw** on the
  queue's group.
- **`Invalid Queue`** → `OTOBRO_QUEUE` doesn't exist.
- **`Ticket->PriorityID or Ticket->Priority parameter is invalid!`** → priority
  ID `3` doesn't exist (unlikely — it's the standard OTOBO "normal" ID). See
  OTOBO → **Admin → Ticket Settings → Priorities** if it fails.
- **`Ticket->TypeID or Ticket->Type parameter is invalid!`** → `OTOBRO_TYPE`
  is not a valid ticket type. See OTOBO → **Admin → Ticket Settings →
  Types** and set `OTOBRO_TYPE` to an existing type (e.g. `Unclassified`).