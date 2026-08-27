const { requireSession } = require("./_shared/auth");
const { appendRecord, findRecordById, getRows, updateRecord } = require("./_shared/google-sheets");
const { folderPath, safeName, signedWorkOrderFileName, trashFile, uploadFile } = require("./_shared/google-drive");
const { customerToClient, documentToClient, expenseToClient, hasCustomerData, isArchived, jobFromBody, jobToClient, nowIso, photoToClient, id } = require("./_shared/crm-records");
const { json, readJson } = require("./_shared/http");

const PHOTO_CATEGORIES = ["Before", "During", "After", "Damage", "Equipment / Setup", "Receipt / Material", "Other"];
const DOCUMENT_TYPES = ["Estimate", "Invoice", "Receipt", "Service Certificate", "Customer Document", "Insurance Document", "Other"];

async function context(jobId) {
  const [job, customerRows] = await Promise.all([findRecordById("Jobs", "Job ID", jobId), getRows("Customers")]);
  if (!job || isArchived(job)) { const error = new Error("Job not found."); error.statusCode = 404; throw error; }
  const customerRecord = customerRows.find((row) => row["Customer ID"] === job["Customer ID"] && hasCustomerData(row) && !isArchived(row));
  if (!customerRecord) { const error = new Error("The Customer connected to this Job was not found."); error.statusCode = 400; throw error; }
  return { job, customer: customerToClient(customerRecord), jobClient: jobToClient(job) };
}

async function ensureJobFolder(job, customer, jobClient) {
  if (job["Google Drive Folder ID"]) return { id: job["Google Drive Folder ID"], url: job["Google Drive Folder URL"] || `https://drive.google.com/drive/folders/${job["Google Drive Folder ID"]}` };
  const serviceDate = jobClient.appointmentDate || jobClient.dateCompleted || new Date().toISOString().slice(0, 10);
  const year = serviceDate.slice(0, 4) || String(new Date().getFullYear());
  const folderName = `${customer.name || "Customer"} - ${customer.city || "New Jersey"} - ${serviceDate} - ${jobClient.id}`;
  const folder = await folderPath(["Jobs", year, folderName]);
  const updated = jobFromBody({ ...job, jobId: job["Job ID"], googleDriveFolderId: folder.id, googleDriveFolderUrl: folder.url }, job);
  await updateRecord("Jobs", job.rowNumber, updated);
  Object.assign(job, updated);
  return folder;
}

function jobTotals(job, expenses) {
  const totals = { partsMaterials: 0, fuelTravel: 0, laborSubcontractor: 0, other: 0, totalExpenses: 0 };
  expenses.forEach((expense) => {
    const amount = Number(expense.totalAmount || 0) || 0;
    totals.totalExpenses += amount;
    if (expense.category === "Parts & Materials") totals.partsMaterials += amount;
    else if (expense.category === "Gas / Fuel") totals.fuelTravel += amount;
    else if (expense.category === "Subcontractor / Labor") totals.laborSubcontractor += amount;
    else totals.other += amount;
  });
  totals.revenue = Number(job.finalPrice || job.quotedPrice || 0) || 0;
  totals.grossProfit = totals.revenue - totals.totalExpenses;
  return totals;
}

exports.handler = async function handler(event) {
  const auth = requireSession(event);
  if (auth.response) return auth.response;
  try {
    const query = event.queryStringParameters || {};
    if (event.httpMethod === "GET") {
      const { job, customer, jobClient } = await context(query.jobId);
      const [photoRows, documentRows, expenseRows] = await Promise.all([getRows("Job Photos"), getRows("Job Documents"), getRows("Expenses")]);
      const photos = photoRows.filter((row) => row["Job ID"] === query.jobId && row["Photo ID"] && !isArchived(row)).map(photoToClient);
      const documents = documentRows.filter((row) => row["Job ID"] === query.jobId && row["Document ID"] && !isArchived(row)).map(documentToClient);
      const expenses = expenseRows.filter((row) => row["Job ID"] === query.jobId && row["Expense ID"] && !isArchived(row)).map(expenseToClient);
      return json(200, { job: jobToClient(job), customer, photos, documents, expenses, totals: jobTotals(jobClient, expenses), photoCategories: PHOTO_CATEGORIES, documentTypes: DOCUMENT_TYPES });
    }

    if (event.httpMethod === "POST") {
      const body = readJson(event);
      const { job, customer, jobClient } = await context(body.jobId);
      const jobFolder = await ensureJobFolder(job, customer, jobClient);
      if (body.assetType === "photo") {
        const category = PHOTO_CATEGORIES.includes(body.category) ? body.category : "Other";
        const target = await folderPath([`${category.replace(/\//g, " - ")} Photos`], jobFolder.id);
        const uploaded = await uploadFile({ file: body.file, parentId: target.id, fileName: safeName(body.file?.name, "Job Photo") });
        const record = { "Photo ID": id("photo"), "Job ID": job["Job ID"], "Customer ID": customer.id, Category: category, Notes: String(body.notes || "").trim(), "File Name": uploaded.name, "MIME Type": uploaded.mimeType || body.file.type, "Google Drive File ID": uploaded.id, "Google Drive File URL": uploaded.url, "Uploaded At": nowIso(), Archived: "FALSE" };
        await appendRecord("Job Photos", record);
        return json(201, { photo: photoToClient(record), job: jobToClient(job) });
      }
      if (body.assetType === "document") {
        const documentType = DOCUMENT_TYPES.includes(body.documentType) ? body.documentType : "Other";
        const target = await folderPath([documentType === "Other" ? "Other Documents" : `${documentType}s`], jobFolder.id);
        const uploaded = await uploadFile({ file: body.file, parentId: target.id, fileName: safeName(body.file?.name, "Job Document") });
        const record = { "Document ID": id("doc"), "Job ID": job["Job ID"], "Customer ID": customer.id, "Document Type": documentType, "File Name": uploaded.name, "MIME Type": uploaded.mimeType || body.file.type, Notes: String(body.notes || "").trim(), "Google Drive File ID": uploaded.id, "Google Drive File URL": uploaded.url, "Uploaded At": nowIso(), Archived: "FALSE" };
        await appendRecord("Job Documents", record);
        return json(201, { document: documentToClient(record), job: jobToClient(job) });
      }
      if (body.assetType === "signedWorkOrder") {
        const target = await folderPath(["Work Orders"], jobFolder.id);
        const date = jobClient.dateCompleted || jobClient.appointmentDate || new Date().toISOString().slice(0, 10);
        const uploaded = await uploadFile({ file: body.file, parentId: target.id, fileName: signedWorkOrderFileName({ date, customerName: customer.name, originalName: body.file?.name }) });
        const updated = jobFromBody({ ...job, jobId: job["Job ID"], signedWorkOrderFileId: uploaded.id, signedWorkOrderUrl: uploaded.url, signedWorkOrderFileName: uploaded.name, signedWorkOrderUploadedAt: nowIso() }, job);
        await updateRecord("Jobs", job.rowNumber, updated);
        return json(201, { job: jobToClient(updated) });
      }
      return json(400, { error: "Choose a valid upload type." });
    }

    if (event.httpMethod === "DELETE") {
      const deleteFile = query.deleteFile === "true";
      if (query.assetType === "signedWorkOrder") {
        const { job } = await context(query.jobId);
        if (deleteFile && job["Signed Work Order File ID"]) await trashFile(job["Signed Work Order File ID"]);
        const updated = jobFromBody({ ...job, jobId: job["Job ID"], signedWorkOrderFileId: "", signedWorkOrderUrl: "", signedWorkOrderFileName: "", signedWorkOrderUploadedAt: "" }, job);
        updated["Signed Work Order File ID"] = ""; updated["Signed Work Order URL"] = ""; updated["Signed Work Order File Name"] = ""; updated["Signed Work Order Uploaded At"] = "";
        await updateRecord("Jobs", job.rowNumber, updated);
        return json(200, { ok: true, fileDeleted: deleteFile });
      }
      const config = query.assetType === "photo" ? { tab: "Job Photos", idColumn: "Photo ID" } : { tab: "Job Documents", idColumn: "Document ID" };
      const record = await findRecordById(config.tab, config.idColumn, query.id);
      if (!record) return json(404, { error: "Attachment not found." });
      if (deleteFile && record["Google Drive File ID"]) await trashFile(record["Google Drive File ID"]);
      await updateRecord(config.tab, record.rowNumber, { ...record, Archived: "TRUE" });
      return json(200, { ok: true, fileDeleted: deleteFile });
    }
    return json(405, { error: "Method not allowed." });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "CRM job attachment request failed." });
  }
};
