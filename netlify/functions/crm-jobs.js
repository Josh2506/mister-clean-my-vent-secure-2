const { requireSession } = require("./_shared/auth");
const { appendRecord, findRecordById, getRows, updateRecord, withSheetsMetrics } = require("./_shared/google-sheets");
const { hasJobData, isArchived, jobFromBody, jobToClient } = require("./_shared/crm-records");
const { json, readJson } = require("./_shared/http");

exports.handler = async function handler(event) {
  const auth = requireSession(event);
  if (auth.response) {
    return auth.response;
  }

  try {
    if (event.httpMethod === "GET") {
      const customerId = event.queryStringParameters?.customerId || "";
      const rows = await getRows("Jobs");
      const jobs = rows
        .filter(hasJobData)
        .filter((row) => !isArchived(row))
        .filter((row) => !customerId || row["Customer ID"] === customerId)
        .map(jobToClient)
        .sort((a, b) => `${b.appointmentDate || ""}${b.createdAt || ""}`.localeCompare(`${a.appointmentDate || ""}${a.createdAt || ""}`));
      return json(200, { jobs });
    }

    if (event.httpMethod === "POST") {
      const body = readJson(event);
      const { result: job, metrics } = await withSheetsMetrics(async () => {
        const record = jobFromBody(body);
        await appendRecord("Jobs", record);
        return record;
      });
      return json(201, { job: jobToClient(job), sheetsRequests: metrics }, {
        "X-CRM-Sheets-Reads": String(metrics.reads),
        "X-CRM-Sheets-Writes": String(metrics.writes),
        "X-CRM-Sheets-Retries": String(metrics.retries),
      });
    }

    if (event.httpMethod === "PUT") {
      const body = readJson(event);
      const jobId = body.jobId || body.id;
      if (!jobId) {
        return json(400, { error: "Job ID is required." });
      }
      const { result: updated, metrics } = await withSheetsMetrics(async () => {
        const existing = await findRecordById("Jobs", "Job ID", jobId);
        if (!existing) return null;
        const record = jobFromBody({ ...body, jobId }, existing);
        await updateRecord("Jobs", existing.rowNumber, record);
        return record;
      });
      if (!updated) return json(404, { error: "Job not found." });
      return json(200, { job: jobToClient(updated), sheetsRequests: metrics }, {
        "X-CRM-Sheets-Reads": String(metrics.reads),
        "X-CRM-Sheets-Writes": String(metrics.writes),
        "X-CRM-Sheets-Retries": String(metrics.retries),
      });
    }

    if (event.httpMethod === "DELETE") {
      const jobId = event.queryStringParameters?.id;
      if (!jobId) {
        return json(400, { error: "Job ID is required." });
      }
      const existing = await findRecordById("Jobs", "Job ID", jobId);
      if (!existing) {
        return json(404, { error: "Job not found." });
      }
      const archived = jobFromBody({ ...existing, jobId, archived: "TRUE" }, existing);
      await updateRecord("Jobs", existing.rowNumber, archived);
      return json(200, { ok: true });
    }

    return json(405, { error: "Method not allowed." });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "CRM job request failed." });
  }
};
