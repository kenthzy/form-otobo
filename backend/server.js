/* DON'T EDIT THIS FILE UNLESS YOU KNOW WHAT YOU ARE DOING!

   This is a simple Express server that accepts ticket submissions from the
   frontend form and creates tickets in OTOBO via the Generic Interface REST API
   (TicketCreate operation).

   The server validates the incoming payload, maps the priority to OTOBO's
   internal priority IDs, and sends a request to OTOBO's Generic Interface.

   The server responds with JSON indicating success or failure, along with the
   created ticket's ID and number if successful.

   The server also includes a health check endpoint for monitoring purposes.

   Environment variables:
     - PORT: Port for the Express server (default: 3000)
     - CORS_ORIGIN: Allowed origin(s) for CORS (default: "*")
     - OTOBRO_BASE_URL: Base URL of the OTOBO instance (required)
     - OTOBRO_ROUTE: Route for the Generic Interface (default: "/ticket")
     - OTOBRO_USER: User login for OTOBO (required)
     - OTOBRO_PASSWORD: Password for OTOBO user (required)
     - OTOBRO_QUEUE: Queue for new tickets (default: "Raw")
     - OTOBRO_TYPE: Type for new tickets (default: "Unclassified") */

"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

/* Priority is fixed at "3" (normal) since the form no longer sends a priority.
   Standard OTOBO priority IDs: 1 very low, 2 low, 3 normal, 4 high, 5 very urgent. */

/// Server Configuration
const PORT = process.env.PORT || 3000;

// Frontend origin(s) allowed to call this API.
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

const OTOBRO_BASE_URL = process.env.OTOBRO_BASE_URL;
const OTOBRO_ROUTE = process.env.OTOBRO_ROUTE || "/ticket";
const OTOBRO_USER = process.env.OTOBRO_USER || "";
const OTOBRO_PASSWORD = process.env.OTOBRO_PASSWORD || "";
const OTOBRO_QUEUE = process.env.OTOBRO_QUEUE || "Raw";
const OTOBRO_TYPE = process.env.OTOBRO_TYPE || "Unclassified";

// Middleware
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

// Validation
const REQUIRED_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "type",
  "location",
  "date",
  "subject",
  "startTime",
  "endTime",
];

const isValidRequest = (body) => {
  if (!body || typeof body !== "object") return false;
  return REQUIRED_FIELDS.every(
    (field) => typeof body[field] === "string" && body[field].trim() !== "",
  );
};

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// Escape user-supplied values for the HTML article body.
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );

// OTOBO Payload Builder
const buildOtoboPayload = (data) => {
  const email = data.email.trim();
  const esc = escapeHtml;

  const bodyLines = [
    `<b>Full Name:</b> ${esc(data.firstName)} ${esc(data.lastName)}`,
    `<b>Request Title:</b> ${esc(data.subject)}`,
    `<b>Type:</b> ${esc(data.type)}`,
    `<b>Location:</b> ${esc(data.location)}`,
    `<b>Date:</b> ${esc(data.date)}`,
    `<b>Time:</b> ${esc(data.startTime)} - ${esc(data.endTime)}`,
    ...(data.service ? [`<b>Vehicle Type:</b> ${esc(data.service)}`] : []),
    ...(data.participants ? [`<b>No. of Pax:</b> ${esc(data.participants)}`] : []),
    ...(data.description
      ? [`<b>Remarks:</b><br/>${esc(data.description)}`]
      : []),
  ];

  return {
    UserLogin: OTOBRO_USER,
    Password: OTOBRO_PASSWORD,
    Ticket: {
      Title: data.subject.trim(),
      Queue: OTOBRO_QUEUE,
      State: "new",
      Type: data.type || OTOBRO_TYPE,
      PriorityID: "3",
      CustomerUser: email,
      CustomerID: email,
    },
    Article: {
      Subject: data.subject.trim(),
      Body: bodyLines.join("<br/><br/>"),
      CommunicationChannel: "Email",
      From: email,
      ContentType: "text/html; charset=utf8",
    },
  };
};

// OTOBO API Call
const createOtoboTicket = async (payload) => {
  const endpoint = `${OTOBRO_BASE_URL}${OTOBRO_ROUTE}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  // OTOBO's Generic Interface answers with JSON.
  const result = await response.json().catch(() => ({}));
  const ticketID =
    result.Data?.TicketID ?? result.TicketID ?? result.Ticket?.TicketID;
  const ticketNumber =
    result.Data?.TicketNumber ??
    result.TicketNumber ??
    result.Ticket?.TicketNumber;

  const success = result.Success == 1 || Boolean(ticketID);

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

// POST
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

    if (
      req.body.type === "Parking Lot Request" &&
      (!req.body.service || req.body.service.trim() === "")
    ) {
      return res.status(400).json({
        success: false,
        error: "Vehicle type is required for parking lot requests.",
      });
    }

    if (
      req.body.type === "Meeting Room Reservation" &&
      (!req.body.participants || req.body.participants.trim() === "")
    ) {
      return res.status(400).json({
        success: false,
        error: "Number of participants is required for meeting room reservations.",
      });
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

// Health Check Endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Start
app.listen(PORT, () => {
  console.log(`Ticket backend running on http://localhost:${PORT}`);
});
