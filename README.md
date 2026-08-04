# IT Helpdesk Ticket Portal

A modern, responsive employee-facing form for submitting IT support tickets.
Submissions are created **directly in OTOBO** through its Generic Interface
REST API (`TicketCreate`), using the submitter's email as the ticket's
customer user so OTOBO sends all notifications and agent replies to them.

**Stack:** HTML5 · Bootstrap 5 · Vanilla JavaScript · Node.js (Express)

## Folder structure

```
form-otobo/
├── frontend/                 # Browser app
│   ├── index.html            # Ticket form page
│   ├── css/style.css         # Light corporate theme
│   └── js/
│       ├── config.js         # API_ENDPOINT – change when deployed
│       └── app.js            # Validation, char counter, confirm modal, submit
└── backend/                  # Express API that talks to OTOBO
    ├── server.js             # POST /api/submit -> OTOBO TicketCreate
    ├── mappings.js           # Form values -> OTOBO names/IDs
    ├── otobo-webservice.yml  # OTOBO web service definition (import once)
    ├── package.json
    ├── .env.example          # Copy to .env and fill in
    └── .env                  # Real credentials (gitignored)
```

## Architecture

1. User fills the form; `frontend/js/app.js` validates client-side.
2. A confirmation modal asks before sending.
3. `fetch()` POSTs JSON to `POST /api/submit` on the backend.
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

### 3. Register employees as customer users
OTOBO's `TicketCreate` requires every submitter's email to be an existing
**Customer User**. Admin → **Customers** → create a Customer, then
**Customer Users** → add each employee (use the same email they will type in
the form). Otherwise submissions fail with `CustomerUser parameter is invalid!`.

## Getting started

### 1. Backend

```bash
cd backend
cp .env.example .env   # fill in OTOBRO_* values
npm install
npm start              # http://localhost:3000
```

### 2. Frontend

Serve the repo root (or just open `frontend/index.html`):

```bash
# from the repo root
python3 -m http.server 5500
```

Open **http://localhost:5500** and submit a ticket.

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

## Priority / Type / Service / SLA mapping

Set in `backend/mappings.js`. Priority is sent as the **OTOBRO priority ID**
(names like `3 normal` / `3 Medium` differ per instance; IDs are stable):

| Form value | OTOBO priority ID |
| ---------- | ----------------- |
| Low        | `2`               |
| Normal     | `3`               |
| High       | `4`               |
| Critical   | `5`               |

`Type`, `Service`, and `SLA` are **not** sent as OTOBO ticket attributes — they
are kept in the article body only, because OTOBO ticket types/services may not
exist by the form's names. A valid ticket `Type` is sent via `OTOBRO_TYPE`
(default `Unclassified`); change it if your instance uses a different type.

## API reference

**`POST /api/submit`**

```json
{
  "fullName": "John Smith",
  "email": "john.smith@company.com",
  "type": "Incident",
  "service": "Printer",
  "sla": "High",
  "subject": "Printer cannot print",
  "description": "The printer is offline since this morning.",
  "priority": "High"
}
```

Responses:
- `200 { "success": true, "ticketID": 123, "ticketNumber": "20120230000010" }`
- `400 { "success": false, "error": "..." }` – validation failure
- `500 { "success": false, "error": "..." }` – OTOBO/connection failure (includes
  OTOBO's `ErrorMessage`, e.g. `CustomerUser ... is invalid!`)

**`GET /api/health`** – `{ "status": "ok" }`

## Troubleshooting

- **`CustomerUser ... parameter is invalid!`** → the email is not registered as
  a Customer User in OTOBO (see step 3 above).
- **`User could not be authenticated`** → wrong `OTOBRO_USER`/`OTOBRO_PASSWORD`.
- **`AccessDenied` / can't create in queue** → `apiuser` lacks **rw** on the
  queue's group.
- **`Invalid Queue`** → `OTOBRO_QUEUE` doesn't exist.
- **`Ticket->PriorityID or Ticket->Priority parameter is invalid!`** → the
  priority name/ID doesn't exist; priority IDs are sent from `mappings.js`
  (standard OTOBO IDs 1–5). Check OTOBO → **Admin → Ticket Settings →
  Priorities** if it fails.
- **`Ticket->TypeID or Ticket->Type parameter is invalid!`** → `OTOBRO_TYPE`
  is not a valid ticket type. See OTOBO → **Admin → Ticket Settings →
  Types** and set `OTOBRO_TYPE` to an existing type (e.g. `Unclassified`).