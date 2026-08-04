/* ==========================================================================
   IT Helpdesk – Ticket Submission Portal (backend)
   Express server that accepts ticket submissions and creates tickets in
   OTOBO via the Generic Interface REST API (TicketCreate operation).

   Endpoint:  POST /api/submit
   Payload:   { fullName, email, type, service, sla, subject, description, priority }

   OTOBO then sends notifications / agent replies to the submitter's email
   (used as the ticket's customer user).
   ========================================================================== */

"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");

const { mapPriority } = require("./mappings");

const app = express();

/* ---------- Configuration ------------------------------------------------- */
const PORT = process.env.PORT || 3000;

// Frontend origin(s) allowed to call this API.
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

const OTOBRO_BASE_URL = process.env.OTOBRO_BASE_URL;
const OTOBRO_ROUTE = process.env.OTOBRO_ROUTE || "/ticket";
const OTOBRO_USER = process.env.OTOBRO_USER || "";
const OTOBRO_PASSWORD = process.env.OTOBRO_PASSWORD || "";
const OTOBRO_QUEUE = process.env.OTOBRO_QUEUE || "Raw";
const OTOBRO_TYPE = process.env.OTOBRO_TYPE || "Unclassified";

/* ---------- Middleware ---------------------------------------------------- */
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

/* ---------- Validation ---------------------------------------------------- */
const REQUIRED_FIELDS = [
  "fullName",
  "email",
  "type",
  "service",
  "sla",
  "subject",
  "description",
  "priority",
];

const isValidRequest = (body) => {
  if (!body || typeof body !== "object") return false;
  return REQUIRED_FIELDS.every(
    (field) => typeof body[field] === "string" && body[field].trim() !== ""
  );
};

const isValidEmail = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/* ---------- OTOBO request builder ----------------------------------------- */
const buildOtoboPayload = (data) => {
  const email = data.email.trim();

  return {
    UserLogin: OTOBRO_USER,
    Password: OTOBRO_PASSWORD,
    Ticket: {
      Title: data.subject.trim(),
      Queue: OTOBRO_QUEUE,
      State: "new",
      Type: OTOBRO_TYPE,
      PriorityID: mapPriority(data.priority),
      CustomerUser: email,
    },
    Article: {
      Subject: data.subject.trim(),
      Body: [
        `Full Name: ${data.fullName}`,
        `Type: ${data.type}`,
        `Service: ${data.service}`,
        `SLA: ${data.sla}`,
        `Priority: ${data.priority}`,
        "",
        "Description:",
        data.description,
      ].join("\n"),
      CommunicationChannel: "Email",
      From: email,
      ContentType: "text/plain; charset=utf8",
    },
  };
};

/* ---------- OTOBO API call ------------------------------------------------ */
const createOtoboTicket = async (payload) => {
  const endpoint = `${OTOBRO_BASE_URL}${OTOBRO_ROUTE}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  // OTOBO's Generic Interface always answers with JSON.
  const result = await response.json().catch(() => ({}));

  // OTOBO returns several response shapes for TicketCreate, depending on the
  // operation's "IncludeTicketData" setting:
  //   - { Success: 1, Data: { TicketID, TicketNumber } }   (IncludeTicketData: 0)
  //   - { TicketID, TicketNumber, Ticket: { ... } }        (IncludeTicketData: 1)
  // or an error:
  //   - { Error: { ErrorCode, ErrorMessage } } or { Success: 0, ErrorMessage }
  const ticketID =
    result.Data?.TicketID ?? result.TicketID ?? result.Ticket?.TicketID;
  const ticketNumber =
    result.Data?.TicketNumber ?? result.TicketNumber ?? result.Ticket?.TicketNumber;

  const success =
    result.Success == 1 || Boolean(ticketID);

  if (!success) {
    const hasErrorObject = Boolean(result.Error) || result.Success === 0;
    const message =
      result.Error?.ErrorMessage ||
      result.ErrorMessage ||
      (hasErrorObject
        ? "OTOBO reported an error creating the ticket."
        : `OTOBO responded with HTTP ${response.status}.`);
    const code = result.Error?.ErrorCode || result.ErrorCode || "";
    throw new Error(code ? `${code}: ${message}` : message);
  }

  return { ticketID, ticketNumber };
};

/* ---------- Route: POST /api/submit --------------------------------------- */
app.post("/api/submit", async (req, res) => {
  try {
    if (!isValidRequest(req.body)) {
      return res
        .status(400)
        .json({ success: false, error: "Missing required fields." });
    }

    if (!isValidEmail(req.body.email)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid email address." });
    }

    if (!OTOBRO_BASE_URL || !OTOBRO_USER || !OTOBRO_PASSWORD) {
      return res.status(500).json({
        success: false,
        error: "OTOBO connection is not configured on the server.",
      });
    }

    const payload = buildOtoboPayload(req.body);
    const { ticketID, ticketNumber } = await createOtoboTicket(payload);

    return res.status(200).json({ success: true, ticketID, ticketNumber });
  } catch (error) {
    console.error("Ticket create failed:", error.message);
    return res.status(500).json({
      success: false,
      error: `Could not create the ticket: ${error.message}`,
    });
  }
});

/* ---------- Health check --------------------------------------------------- */
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

/* ---------- Start ---------------------------------------------------------- */
app.listen(PORT, () => {
  console.log(`Ticket backend running on http://localhost:${PORT}`);
});
