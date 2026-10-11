const crypto = require("crypto");
const { appendRecord, appendRecords, getRowsBatch, withSheetsMetrics } = require("./_shared/google-sheets");
const { id, isArchived, mileageFromBody, nowIso } = require("./_shared/crm-records");
const { configuredRates, effectiveRate } = require("./crm-mileage");
const { parseMileIqReport, tripFingerprint } = require("./_shared/mileiq");
const { json, readJson } = require("./_shared/http");

const MAX_CSV_BYTES = 5 * 1024 * 1024;

function timingSafeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireImportSecret(event, body) {
  const configured = process.env.MILEIQ_IMPORT_SECRET;
  const provided = event.headers?.["x-mileiq-import-secret"] || event.headers?.["X-MileIQ-Import-Secret"] || body.secret;
  if (!configured || !timingSafeEqual(configured, provided)) {
    const error = new Error("MileIQ import authorization failed.");
    error.statusCode = 401;
    throw error;
  }
}

function existingFingerprint(row) {
  if (row["MileIQ Source Hash"]) return row["MileIQ Source Hash"];
  if (row["Mileage Source"] !== "MileIQ") return "";
  return tripFingerprint({
    startDateTime: row["Start Date Time"], endDateTime: row["End Date Time"], start: row["Starting Location"], stop: row["End Location"] || row.Destinations,
    miles: row["Total Miles"], vehicle: row["MileIQ Vehicle"] || row.Vehicle, category: row["MileIQ Category"] || "Business",
  });
}

function vehicleName(sourceName, vehicleRows) {
  const match = vehicleRows.find((row) => String(row.Active || "TRUE").toUpperCase() !== "FALSE"
    && String(row["MileIQ Vehicle Name"] || "").trim().toLowerCase() === String(sourceName || "").trim().toLowerCase());
  if (match?.["Display Name"]) return match["Display Name"];
  if (String(sourceName || "").trim().toLowerCase() === "toyota tacoma 2007") return "2007 Toyota Tacoma";
  return sourceName || "2007 Toyota Tacoma";
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  try {
    const body = readJson(event);
    requireImportSecret(event, body);
    const csv = String(body.csv || "");
    if (!csv || Buffer.byteLength(csv, "utf8") > MAX_CSV_BYTES) return json(400, { error: "A MileIQ CSV smaller than 5 MB is required." });
    const parsed = parseMileIqReport(csv);
    const { result, metrics } = await withSheetsMetrics(async () => {
      const rows = await getRowsBatch(["Mileage", "Mileage Rates", "MileIQ Imports", "Vehicles"]);
      const duplicateReport = rows["MileIQ Imports"].find((row) => row["CSV Hash"] === parsed.csvHash && row.Status === "Completed");
      if (duplicateReport) return { importId: duplicateReport["Import ID"], duplicateReport: true, inserted: 0, duplicates: parsed.trips.filter((trip) => trip.category.toLowerCase() === "business").length, rejected: parsed.rejected.length };
      const rates = configuredRates(rows["Mileage Rates"]);
      const knownHashes = new Set(rows.Mileage.filter((row) => !isArchived(row)).map(existingFingerprint).filter(Boolean));
      const importedAt = nowIso();
      const importId = id("miqimp");
      const businessTrips = parsed.trips.filter((trip) => trip.category.toLowerCase() === "business");
      const mileageRecords = [];
      const importRejected = [...parsed.rejected];
      let duplicates = 0;
      businessTrips.forEach((trip) => {
        if (knownHashes.has(trip.sourceHash)) { duplicates += 1; return; }
        let rate;
        try { rate = effectiveRate(trip.date, rates); }
        catch (error) { importRejected.push({ row: trip.date, reason: error.message }); return; }
        knownHashes.add(trip.sourceHash);
        const record = mileageFromBody({
          date: trip.date, vehicle: vehicleName(trip.vehicle, rows.Vehicles), entryType: "Trip", mileageSource: "MileIQ", totalMiles: trip.miles,
          personalMiles: 0, startingLocation: trip.start, destinations: trip.stop, businessPurpose: trip.purpose || "Business",
          reviewStatus: "Reviewed", parkingAndTolls: trip.parking + trip.tolls, notes: trip.notes,
        }, {}, rate);
        Object.assign(record, {
          "Start Date Time": trip.startDateTime, "End Date Time": trip.endDateTime, "End Location": trip.stop,
          "MileIQ Category": trip.category, "MileIQ Purpose": trip.purpose, "MileIQ Vehicle": trip.vehicle,
          "MileIQ Report ID": String(body.reportId || importId), "MileIQ Message ID": String(body.gmailMessageId || ""),
          "MileIQ Source Hash": trip.sourceHash, "MileIQ Reported Rate": String(trip.reportedRate), "MileIQ Imported At": importedAt,
        });
        mileageRecords.push(record);
      });
      await appendRecords("Mileage", mileageRecords);
      const importRecord = {
        "Import ID": importId, "Gmail Message ID": String(body.gmailMessageId || ""), "Report ID": String(body.reportId || importId),
        "Report Name": String(body.reportName || "MileIQ CSV report"), "CSV Hash": parsed.csvHash, "Imported At": importedAt,
        "Rows Found": String(parsed.trips.length), "Business Rows": String(businessTrips.length), "Rows Inserted": String(mileageRecords.length),
        "Duplicates Skipped": String(duplicates), "Rows Rejected": String(importRejected.length), Status: "Completed",
        "Error Summary": importRejected.slice(0, 10).map((item) => `Row ${item.row}: ${item.reason}`).join("; "),
      };
      await appendRecord("MileIQ Imports", importRecord);
      return { importId, duplicateReport: false, inserted: mileageRecords.length, duplicates, rejected: importRejected.length, rowsFound: parsed.trips.length, businessRows: businessTrips.length };
    });
    return json(200, { ok: true, ...result, sheetsRequests: metrics }, { "X-CRM-Sheets-Reads": String(metrics.reads), "X-CRM-Sheets-Writes": String(metrics.writes), "X-CRM-Sheets-Retries": String(metrics.retries) });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "MileIQ import failed." });
  }
};

module.exports.requireImportSecret = requireImportSecret;
