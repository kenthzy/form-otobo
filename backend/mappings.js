/* ==========================================================================
   Field mappings from the web form to OTOBO values.

   Priority is sent as the OTOBO priority ID (stable across instances;
   names like "3 normal" / "3 Medium" differ per OTOBO install).
   Standard OTOBO IDs: 1 very low, 2 low, 3 normal, 4 high, 5 very urgent.

   Type / Service / SLA are NOT mapped: they are kept in the article body
   only, because OTOBO ticket types/services may not exist by the form's
   names. A valid ticket Type is sent separately via the OTOBRO_TYPE env
   variable (default "Unclassified").
   ========================================================================== */

"use strict";

const PRIORITY_MAP = {
  Low: "2",
  Normal: "3",
  High: "4",
  Critical: "5",
};

const mapPriority = (value) => PRIORITY_MAP[value] || "3";

module.exports = { mapPriority };
