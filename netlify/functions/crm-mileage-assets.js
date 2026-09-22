const { requireSession } = require("./_shared/auth");
const { appendRecord, findRecordById, updateRecord } = require("./_shared/google-sheets");
const { folderPath, safeName, trashFile, uploadFile } = require("./_shared/google-drive");
const { id, nowIso } = require("./_shared/crm-records");
const { json, readJson } = require("./_shared/http");

function toClient(record) {
  return { id: record["Document ID"], mileageId: record["Mileage ID"], category: record.Category, fileName: record["File Name"], mimeType: record["MIME Type"], googleDriveFileId: record["Google Drive File ID"], googleDriveFileUrl: record["Google Drive File URL"], uploadedAt: record["Uploaded At"] };
}

exports.handler = async function handler(event) {
  const auth = requireSession(event);
  if (auth.response) return auth.response;
  try {
    if (event.httpMethod === "POST") {
      const body = readJson(event);
      const mileage = await findRecordById("Mileage", "Mileage ID", body.mileageId);
      if (!mileage || String(mileage.Archived).toUpperCase() === "TRUE") return json(404, { error: "Mileage entry not found." });
      const year = String(mileage.Date || new Date().getFullYear()).slice(0, 4);
      const folder = await folderPath(["Mileage", year, `${mileage.Date} - ${mileage["Mileage ID"]}`]);
      const uploaded = await uploadFile({ file: body.file, parentId: folder.id, fileName: safeName(body.file?.name, "Mileage Supporting Document") });
      const record = { "Document ID": id("mdoc"), "Mileage ID": mileage["Mileage ID"], Category: String(body.category || "Other"), "File Name": uploaded.name, "MIME Type": uploaded.mimeType || body.file?.type, "Google Drive File ID": uploaded.id, "Google Drive File URL": uploaded.url, "Uploaded At": nowIso(), Archived: "FALSE" };
      await appendRecord("Mileage Documents", record);
      return json(201, { document: toClient(record) });
    }
    if (event.httpMethod === "DELETE") {
      const query = event.queryStringParameters || {};
      const record = await findRecordById("Mileage Documents", "Document ID", query.id);
      if (!record) return json(404, { error: "Mileage document not found." });
      if (query.deleteFile === "true" && record["Google Drive File ID"]) await trashFile(record["Google Drive File ID"]);
      await updateRecord("Mileage Documents", record.rowNumber, { ...record, Archived: "TRUE" });
      return json(200, { ok: true });
    }
    return json(405, { error: "Method not allowed." });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "Mileage document request failed." });
  }
};
