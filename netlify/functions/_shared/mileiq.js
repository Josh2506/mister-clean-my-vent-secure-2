const crypto = require("crypto");

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += character;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

function normalizeHeader(value) {
  return String(value || "").trim().toUpperCase().replace(/\*/g, "");
}

function mileIqDateTime(value) {
  const match = String(value || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const [, month, day, year, hour, minute] = match;
  const isoDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return { date: isoDate, dateTime: `${isoDate}T${hour.padStart(2, "0")}:${minute}:00` };
}

function tripFingerprint(trip) {
  const parts = [trip.startDateTime, trip.endDateTime, trip.start, trip.stop, Number(trip.miles).toFixed(3), trip.vehicle, trip.category]
    .map((value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " "));
  return sha256(parts.join("|"));
}

function parseMileIqReport(csvText) {
  const rows = parseCsv(csvText);
  const headerIndex = rows.findIndex((row) => normalizeHeader(row[0]) === "START_DATE" && row.map(normalizeHeader).includes("MILES"));
  if (headerIndex < 0) throw new Error("MileIQ detailed-log headers were not found in the CSV report.");
  const headers = rows[headerIndex].map(normalizeHeader);
  const value = (row, name) => row[headers.indexOf(name)] ?? "";
  const trips = [];
  const rejected = [];
  rows.slice(headerIndex + 1).forEach((row, offset) => {
    if (!row.some((cell) => String(cell || "").trim())) return;
    const firstCell = String(row[0] || "").trim();
    if (/^(Totals|Report created at MileIQ\.com|\*)/i.test(firstCell)) return;
    const start = mileIqDateTime(value(row, "START_DATE"));
    const end = mileIqDateTime(value(row, "END_DATE"));
    const miles = Number(value(row, "MILES"));
    if (!start || !end || !Number.isFinite(miles) || miles < 0) {
      rejected.push({ row: headerIndex + offset + 2, reason: "Invalid date or mileage value." });
      return;
    }
    const trip = {
      date: start.date,
      startDateTime: start.dateTime,
      endDateTime: end.dateTime,
      category: String(value(row, "CATEGORY")).trim(),
      start: String(value(row, "START")).trim(),
      stop: String(value(row, "STOP")).trim(),
      reportedRate: Number(value(row, "RATE")) || 0,
      miles,
      parking: Number(value(row, "PARKING")) || 0,
      tolls: Number(value(row, "TOLLS")) || 0,
      vehicle: String(value(row, "VEHICLE")).trim(),
      purpose: String(value(row, "PURPOSE")).trim(),
      notes: String(value(row, "NOTES")).trim(),
    };
    trip.sourceHash = tripFingerprint(trip);
    trips.push(trip);
  });
  return { trips, rejected, csvHash: sha256(csvText) };
}

module.exports = { mileIqDateTime, parseCsv, parseMileIqReport, sha256, tripFingerprint };
