const { requireSession } = require("./_shared/auth");
const { appendRecord, findRecordById, getRowsBatch, updateRecord, withSheetsMetrics } = require("./_shared/google-sheets");
const { id, isArchived, mileageFromBody, mileageToClient, nowIso } = require("./_shared/crm-records");
const { json, readJson } = require("./_shared/http");

const DEFAULT_RATES = [
  { id: "rate_2026_h1", start: "2026-01-01", end: "2026-06-30", rate: 0.725, source: "IRS standard mileage rate" },
  { id: "rate_2026_h2", start: "2026-07-01", end: "2026-12-31", rate: 0.76, source: "IRS standard mileage rate" },
];

function rateToClient(row) {
  return { id: row["Rate ID"], start: row["Effective Start"], end: row["Effective End"], rate: Number(row["Business Rate"] || 0), source: row.Source, notes: row.Notes, active: String(row.Active).toUpperCase() !== "FALSE" };
}

function configuredRates(rows) {
  const saved = rows.filter((row) => row["Rate ID"] && String(row.Active || "TRUE").toUpperCase() !== "FALSE").map(rateToClient);
  const byId = new Map(DEFAULT_RATES.map((rate) => [rate.id, { ...rate, active: true }]));
  saved.forEach((rate) => byId.set(rate.id, rate));
  return [...byId.values()].sort((a, b) => a.start.localeCompare(b.start));
}

function effectiveRate(date, rates) {
  const match = rates.find((rate) => date >= rate.start && date <= rate.end && rate.active !== false);
  if (!match) {
    const error = new Error(`No active mileage rate is configured for ${date}.`);
    error.statusCode = 400;
    throw error;
  }
  return match.rate;
}

function validateNoDuplicateOrOverlap(record, rows) {
  const currentId = record["Mileage ID"];
  const active = rows.filter((row) => !isArchived(row) && row["Mileage ID"] !== currentId);
  const duplicate = active.find((row) => ["Date", "Vehicle", "Starting Odometer", "Ending Odometer", "Total Miles", "Starting Location", "Destinations", "Job ID"]
    .every((field) => String(row[field] || "") === String(record[field] || "")));
  if (duplicate) {
    const error = new Error("This mileage entry appears to duplicate an existing record.");
    error.statusCode = 409;
    throw error;
  }
  if (record["Mileage Source"] === "Odometer") {
    const start = Number(record["Starting Odometer"]);
    const end = Number(record["Ending Odometer"]);
    const overlap = active.find((row) => row.Vehicle === record.Vehicle && row["Mileage Source"] === "Odometer"
      && start < Number(row["Ending Odometer"]) && end > Number(row["Starting Odometer"]));
    if (overlap) {
      const error = new Error(`Odometer range overlaps mileage entry ${overlap["Mileage ID"]}.`);
      error.statusCode = 409;
      throw error;
    }
  }
}

exports.handler = async function handler(event) {
  const auth = requireSession(event);
  if (auth.response) return auth.response;
  try {
    if (event.httpMethod === "GET") {
      const rows = await getRowsBatch(["Mileage", "Mileage Rates", "CRM Settings", "Mileage Documents"]);
      return json(200, {
        mileage: rows.Mileage.filter((row) => row["Mileage ID"] && !isArchived(row)).map(mileageToClient),
        rates: configuredRates(rows["Mileage Rates"]),
        settings: Object.fromEntries(rows["CRM Settings"].filter((row) => row["Setting Key"]).map((row) => [row["Setting Key"], row["Setting Value"]])),
        documents: rows["Mileage Documents"].filter((row) => row["Document ID"] && !isArchived(row)),
      });
    }

    if (["POST", "PUT"].includes(event.httpMethod)) {
      const body = readJson(event);
      if (body.action === "saveRate") {
        const existing = body.id ? await findRecordById("Mileage Rates", "Rate ID", body.id) : null;
        const record = { ...(existing || {}), "Rate ID": existing?.["Rate ID"] || body.id || id("rate"), "Effective Start": body.start, "Effective End": body.end, "Business Rate": String(Number(body.rate)), Source: body.source || "IRS standard mileage rate", Notes: body.notes || "", Active: body.active === false ? "FALSE" : "TRUE", "Updated At": nowIso() };
        if (!record["Effective Start"] || !record["Effective End"] || !Number.isFinite(Number(record["Business Rate"]))) return json(400, { error: "Rate dates and amount are required." });
        if (existing) await updateRecord("Mileage Rates", existing.rowNumber, record); else await appendRecord("Mileage Rates", record);
        return json(200, { rate: rateToClient(record) });
      }
      if (body.action === "saveSetting") {
        const key = String(body.key || "").trim();
        if (!key) return json(400, { error: "Setting key is required." });
        const existing = await findRecordById("CRM Settings", "Setting Key", key);
        const record = { ...(existing || {}), "Setting Key": key, "Setting Value": String(body.value ?? ""), Description: body.description || existing?.Description || "", "Updated At": nowIso() };
        if (existing) await updateRecord("CRM Settings", existing.rowNumber, record); else await appendRecord("CRM Settings", record);
        return json(200, { setting: { key, value: record["Setting Value"] } });
      }

      const { result, metrics } = await withSheetsMetrics(async () => {
        const rows = await getRowsBatch(["Mileage", "Mileage Rates", "CRM Settings"]);
        const existing = event.httpMethod === "PUT" ? rows.Mileage.find((row) => row["Mileage ID"] === (body.mileageId || body.id)) : null;
        if (event.httpMethod === "PUT" && !existing) return null;
        const settings = Object.fromEntries(rows["CRM Settings"].filter((row) => row["Setting Key"]).map((row) => [row["Setting Key"], row["Setting Value"]]));
        const preparedBody = { ...body, vehicle: body.vehicle || settings.DEFAULT_VEHICLE || "2007 Toyota Tacoma", homeOfficeQualified: body.homeOfficeQualified ?? settings.HOME_OFFICE_QUALIFIED ?? "FALSE" };
        const rate = effectiveRate(preparedBody.date || existing?.Date || new Date().toISOString().slice(0, 10), configuredRates(rows["Mileage Rates"]));
        const record = mileageFromBody(preparedBody, existing || {}, rate);
        validateNoDuplicateOrOverlap(record, rows.Mileage);
        if (existing) await updateRecord("Mileage", existing.rowNumber, record); else await appendRecord("Mileage", record);
        return record;
      });
      if (!result) return json(404, { error: "Mileage entry not found." });
      return json(event.httpMethod === "POST" ? 201 : 200, { mileage: mileageToClient(result), sheetsRequests: metrics }, {
        "X-CRM-Sheets-Reads": String(metrics.reads), "X-CRM-Sheets-Writes": String(metrics.writes), "X-CRM-Sheets-Retries": String(metrics.retries),
      });
    }

    if (event.httpMethod === "DELETE") {
      const mileageId = event.queryStringParameters?.id;
      const existing = await findRecordById("Mileage", "Mileage ID", mileageId);
      if (!existing) return json(404, { error: "Mileage entry not found." });
      await updateRecord("Mileage", existing.rowNumber, { ...existing, Archived: "TRUE", "Updated At": nowIso() });
      return json(200, { ok: true, mileageId });
    }
    return json(405, { error: "Method not allowed." });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "Mileage request failed." });
  }
};

module.exports.DEFAULT_RATES = DEFAULT_RATES;
