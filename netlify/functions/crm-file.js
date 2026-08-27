const { requireSession } = require("./_shared/auth");
const { getRows } = require("./_shared/google-sheets");
const { downloadFile } = require("./_shared/google-drive");
const { json } = require("./_shared/http");

async function isKnownFile(fileId) {
  const [expenses, photos, documents, jobs] = await Promise.all([getRows("Expenses"), getRows("Job Photos"), getRows("Job Documents"), getRows("Jobs")]);
  return expenses.some((row) => row["Google Drive File ID"] === fileId)
    || photos.some((row) => row["Google Drive File ID"] === fileId)
    || documents.some((row) => row["Google Drive File ID"] === fileId)
    || jobs.some((row) => row["Signed Work Order File ID"] === fileId);
}

function safeDownloadName(name) {
  return String(name || "download").replace(/[\r\n"\\]/g, "-");
}

exports.handler = async function handler(event) {
  const auth = requireSession(event);
  if (auth.response) return auth.response;
  try {
    if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed." });
    const query = event.queryStringParameters || {};
    if (!query.id || !(await isKnownFile(query.id))) return json(404, { error: "File not found." });
    const file = await downloadFile(query.id);
    const disposition = query.download === "true" ? "attachment" : "inline";
    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Disposition": `${disposition}; filename="${safeDownloadName(file.name)}"`,
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
      body: file.bytes.toString("base64"),
    };
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "CRM file request failed." });
  }
};
