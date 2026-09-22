const { requireSession } = require("./_shared/auth");
const { appendRecord, findRecordById, getRowsBatch, updateRecord, withSheetsMetrics } = require("./_shared/google-sheets");
const { folderPath, safeName, uploadFile } = require("./_shared/google-drive");
const { cashCommitmentFromBody, cashCommitmentToClient, expenseFromBody, expenseToClient, id, isArchived, nowIso, ownerTransactionFromBody, ownerTransactionToClient } = require("./_shared/crm-records");
const { json, readJson } = require("./_shared/http");

function requireConfirmation(body) {
  if (body.confirmed !== true) { const error = new Error("Confirm this financial transaction before saving."); error.statusCode = 400; throw error; }
}
function settingRecord(key, value, description, existing = {}) { return { ...existing, "Setting Key": key, "Setting Value": String(value ?? ""), Description: description || existing.Description || "", "Updated At": nowIso() }; }
async function saveSetting(key, value, description) {
  const existing = await findRecordById("CRM Settings", "Setting Key", key);
  const record = settingRecord(key, value, description, existing || {});
  if (existing) await updateRecord("CRM Settings", existing.rowNumber, record); else await appendRecord("CRM Settings", record);
}
async function audit(entityType, entityId, action, before, after, email) {
  await appendRecord("Owner Finance Audit", { "Audit ID": id("aud"), "Entity Type": entityType, "Entity ID": entityId, Action: action, "Changed At": nowIso(), "Changed By": email, "Before JSON": JSON.stringify(before || {}), "After JSON": JSON.stringify(after || {}) });
}
async function attachDocument(body, record) {
  if (!body.file) return record;
  const year = String(record.Date || new Date().getFullYear()).slice(0, 4);
  const folder = await folderPath(["Owner Finance", year, record["Transaction Type"].replace(/[^a-z0-9 ]/gi, "")]);
  const uploaded = await uploadFile({ file: body.file, parentId: folder.id, fileName: safeName(`${record.Date}_${record["Transaction Type"]}_${record.Amount}_${body.file.name}`) });
  return { ...record, "Document File Name": uploaded.name, "Document MIME Type": uploaded.mimeType, "Google Drive File ID": uploaded.id, "Google Drive File URL": uploaded.url };
}
async function attachPersonalPurchaseReceipt(body, record) {
  if (!body.file) return record;
  const year = String(record.Date || new Date().getFullYear()).slice(0, 4);
  const folder = await folderPath(["Receipts", year, "Personal Funds"]);
  const uploaded = await uploadFile({ file: body.file, parentId: folder.id, fileName: safeName(`${record.Date}_${record.Vendor}_${record["Total Amount"]}_${body.file.name}`) });
  return { ...record, "Receipt File Name": uploaded.name, "Receipt MIME Type": uploaded.mimeType || body.file.type, "Google Drive File ID": uploaded.id, "Google Drive File URL": uploaded.url };
}

exports.handler = async function handler(event) {
  const auth = requireSession(event); if (auth.response) return auth.response;
  try {
    const { result, metrics } = await withSheetsMetrics(async () => {
      if (event.httpMethod === "GET") {
        const rows = await getRowsBatch(["Owner Transactions", "Cash Commitments", "Owner Finance Audit", "CRM Settings"]);
        return { transactions: rows["Owner Transactions"].filter((r) => r["Transaction ID"] && !isArchived(r)).map(ownerTransactionToClient).sort((a,b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`)), commitments: rows["Cash Commitments"].filter((r) => r["Commitment ID"] && !isArchived(r)).map(cashCommitmentToClient).sort((a,b) => a.dueDate.localeCompare(b.dueDate)), settings: Object.fromEntries(rows["CRM Settings"].filter((r) => r["Setting Key"]).map((r) => [r["Setting Key"], r["Setting Value"]])) };
      }
      const body = readJson(event); requireConfirmation(body);
      if (["POST", "PUT"].includes(event.httpMethod) && body.entity === "transaction") {
        const existing = event.httpMethod === "PUT" ? await findRecordById("Owner Transactions", "Transaction ID", body.transactionId) : null;
        if (event.httpMethod === "PUT" && !existing) return { statusCode: 404, error: "Owner transaction not found." };
        let record = ownerTransactionFromBody(body, existing || {});
        if (!existing) {
          const rows = await getRowsBatch(["Owner Transactions"]);
          if (rows["Owner Transactions"].some((r) => !isArchived(r) && r["Deduplication Key"] === record["Deduplication Key"])) { const error = new Error("A matching owner transaction is already recorded."); error.statusCode = 409; throw error; }
        }
        record = await attachDocument(body, record);
        if (existing) await updateRecord("Owner Transactions", existing.rowNumber, record); else await appendRecord("Owner Transactions", record);
        await audit("Owner Transaction", record["Transaction ID"], existing ? "Corrected" : "Created", existing, record, auth.email);
        return { transaction: ownerTransactionToClient(record) };
      }
      if (["POST", "PUT"].includes(event.httpMethod) && body.entity === "commitment") {
        const existing = event.httpMethod === "PUT" ? await findRecordById("Cash Commitments", "Commitment ID", body.commitmentId) : null;
        const record = cashCommitmentFromBody(body, existing || {});
        if (existing) await updateRecord("Cash Commitments", existing.rowNumber, record); else await appendRecord("Cash Commitments", record);
        await audit("Cash Commitment", record["Commitment ID"], existing ? "Corrected" : "Created", existing, record, auth.email);
        return { commitment: cashCommitmentToClient(record) };
      }
      if (event.httpMethod === "POST" && body.entity === "settings") {
        const allowed = { RECONCILED_BANK_BALANCE: "Manual reconciled business bank balance", RECONCILED_BANK_BALANCE_AS_OF: "Balance as-of date", RECONCILED_BANK_BALANCE_STATUS: "Reconciliation status", FEDERAL_INCOME_TAX_RESERVE_PERCENT: "Federal income tax reserve percentage", SELF_EMPLOYMENT_TAX_RESERVE_PERCENT: "Self-employment tax reserve percentage", NJ_INCOME_TAX_RESERVE_PERCENT: "New Jersey income tax reserve percentage", MINIMUM_OPERATING_CASH_RESERVE: "Minimum operating cash reserve", LLC_TAX_CLASSIFICATION: "Tax classification confirmation" };
        for (const [key, description] of Object.entries(allowed)) if (Object.prototype.hasOwnProperty.call(body, key)) await saveSetting(key, body[key], description);
        await audit("Owner Finance Settings", "owner-finance", "Updated", {}, body, auth.email); return { ok: true };
      }
      if (event.httpMethod === "POST" && body.entity === "personalPurchase") {
        let expense = expenseFromBody({ ...body, paymentSource: "Personal Funds", ownerFundingTreatment: body.ownerFundingTreatment, reimbursementStatus: body.reimbursementStatus || (body.ownerFundingTreatment === "Awaiting Reimbursement" ? "Awaiting Reimbursement" : "Not Applicable") });
        expense = await attachPersonalPurchaseReceipt(body, expense);
        await appendRecord("Expenses", expense); await audit("Expense", expense["Expense ID"], "Personally Paid Business Expense Created", {}, expense, auth.email);
        return { expense: expenseToClient(expense) };
      }
      return { statusCode: 405, error: "Unsupported owner-finance operation." };
    });
    if (result?.error) return json(result.statusCode || 400, { error: result.error });
    return json(event.httpMethod === "POST" ? 201 : 200, result, { "X-CRM-Sheets-Reads": String(metrics.reads), "X-CRM-Sheets-Writes": String(metrics.writes), "X-CRM-Sheets-Retries": String(metrics.retries) });
  } catch (error) { return json(error.statusCode || 500, { error: error.message || "Owner finance request failed." }); }
};
