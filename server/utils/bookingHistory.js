/**
 * Booking history helpers
 *
 * `leads.booking_history` is a JSON column, so Supabase usually hands it back as
 * a real array. Some older rows still hold a JSON *string* because callers wrote
 * `JSON.stringify(history)` into it. Both shapes are in the database today, so
 * every reader has to cope with both.
 *
 * Blindly calling JSON.parse() on the column is what caused
 * "Unexpected token 'o', \"[object Obj\"... is not valid JSON": parsing an array
 * stringifies it to "[object Object],[object Object]" first. The pollers then
 * carried on with an empty list and overwrote the lead's entire history with a
 * single entry.
 *
 * Read with readBookingHistory() and write the array itself (never a string),
 * which is what routes/messages-list.js and routes/public-booking.js already do.
 */

/**
 * Read a lead's booking history in whichever shape it is stored.
 *
 * @param {Object} lead - a leads row
 * @returns {{ history: Array, readable: boolean }}
 *   history  - the entries, oldest-format-agnostic; [] when there are none
 *   readable - false only when existing data was present but could not be read,
 *              which means the caller MUST NOT overwrite the column or the
 *              lead's history is destroyed
 */
function readBookingHistory(lead) {
  const raw = lead ? lead.booking_history : null;

  // Nothing stored yet - safe to start a fresh list
  if (raw === null || raw === undefined || raw === '') {
    return { history: [], readable: true };
  }

  // Normal case: the JSON column gives us the array directly
  if (Array.isArray(raw)) {
    return { history: raw, readable: true };
  }

  // Legacy case: a JSON string written by an older poller
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return { history: parsed, readable: true };
      // Parsed to something that isn't a list - don't guess, don't destroy
      return { history: [], readable: false };
    } catch (err) {
      return { history: [], readable: false };
    }
  }

  // Some other object shape - leave it alone rather than overwrite it
  return { history: [], readable: false };
}

/**
 * Add an entry to the front of a lead's history.
 *
 * @returns {{ history: Array, readable: boolean }} - when readable is false the
 *   caller should skip the database update and log a warning instead.
 */
function prependHistoryEntry(lead, entry) {
  const { history, readable } = readBookingHistory(lead);
  if (!readable) return { history, readable: false };
  return { history: [entry, ...history], readable: true };
}

module.exports = { readBookingHistory, prependHistoryEntry };
