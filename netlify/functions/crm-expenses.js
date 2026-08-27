const { requireSession } = require("./_shared/auth");
const { appendRecord, findRecordById, getRows, updateRecord } = require("./_shared/google-sheets");
const { expenseFileName, folderPath, trashFile, uploadFile } = require("./_shared/google-drive");
const { customerToClient, expenseFromBody, expenseToClient, hasCustomerData, hasJobData, isArchived, jobToClient } = require("./_shared/crm-records");
const { json, readJson } = require("./_shared/http");

const CATEGORIES = ["Gas / Fuel", "Parts & Materials", "Tools & Equipment", "Vehicle / Maintenance", "Advertising / Marketing", "Subcontractor / Labor", "Office / Business Supplies", "Insurance", "Other Business Expense"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function inDateRange(expense, from, to) {
  return (!from || expense.date >= from) && (!to || expense.date <= to);
}

function totals(expenses) {
  const categoryTotals = {};
  let total = 0;
  expenses.forEach((expense) => {
    const amount = Number(expense.totalAmount || 0);
    total += Number.isFinite(amount) ? amount : 0;
    categoryTotals[expense.category] = (categoryTotals[expense.category] || 0) + (Number.isFinite(amount) ? amount : 0);
  });
  return { total, categoryTotals };
}

async function relationships(body) {
  const [customerRows, jobRows] = await Promise.all([getRows("Customers"), getRows("Jobs")]);
  const customers = customerRows.filter(hasCustomerData).filter((row) => !isArchived(row)).map(customerToClient);
  const jobs = jobRows.filter(hasJobData).filter((row) => !isArchived(row)).map(jobToClient);
  const job = body.jobId ? jobs.find((item) => item.id === body.jobId) : null;
  if (body.jobId && !job) {
    const error = new Error("The selected Job was not found."); error.statusCode = 400; throw error;
  }
  const customerId = job?.customerId || body.customerId || "";
  const customer = customerId ? customers.find((item) => item.id === customerId) : null;
  if (customerId && !customer) {
    const error = new Error("The selected Customer was not found."); error.statusCode = 400; throw error;
  }
  return { customer, customerId, job };
}

async function attachReceipt(body, record, customer) {
  if (!body.file) return record;
  const date = new Date(`${record.Date}T12:00:00`);
  const year = Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
  const month = Number.isNaN(date.getTime()) ? MONTHS[new Date().getMonth()] : MONTHS[date.getMonth()];
  const folder = await folderPath(["Receipts", String(year), month, record.Category.replace(/\//g, " - ")]);
  const fileName = expenseFileName({ date: record.Date, vendor: record.Vendor, total: record["Total Amount"], customerName: customer?.name, originalName: body.file.name });
  const uploaded = await uploadFile({ file: body.file, parentId: folder.id, fileName });
  return {
    ...record,
    "Receipt File Name": uploaded.name,
    "Receipt MIME Type": uploaded.mimeType || body.file.type,
    "Google Drive File ID": uploaded.id,
    "Google Drive File URL": uploaded.url,
  };
}

exports.handler = async function handler(event) {
  const auth = requireSession(event);
  if (auth.response) return auth.response;
  try {
    if (event.httpMethod === "GET") {
      const query = event.queryStringParameters || {};
      const [expenseRows, customerRows, jobRows] = await Promise.all([getRows("Expenses"), getRows("Customers"), getRows("Jobs")]);
      const customers = customerRows.filter(hasCustomerData).filter((row) => !isArchived(row)).map(customerToClient);
      const jobs = jobRows.filter(hasJobData).filter((row) => !isArchived(row)).map(jobToClient);
      const customerById = new Map(customers.map((item) => [item.id, item]));
      const jobById = new Map(jobs.map((item) => [item.id, item]));
      const search = String(query.search || "").toLowerCase();
      const expenses = expenseRows.filter((row) => row["Expense ID"] && !isArchived(row)).map(expenseToClient)
        .map((expense) => ({ ...expense, customer: customerById.get(expense.customerId) || null, job: jobById.get(expense.jobId) || null }))
        .filter((expense) => inDateRange(expense, query.from, query.to))
        .filter((expense) => !query.category || expense.category === query.category)
        .filter((expense) => !query.vendor || expense.vendor === query.vendor)
        .filter((expense) => !query.customerId || expense.customerId === query.customerId)
        .filter((expense) => !query.jobId || expense.jobId === query.jobId)
        .filter((expense) => !query.paymentMethod || expense.paymentMethod === query.paymentMethod)
        .filter((expense) => !search || [expense.vendor, expense.category, expense.description, expense.customer?.name, expense.job?.serviceType].join(" ").toLowerCase().includes(search))
        .sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`));
      return json(200, { expenses, summary: totals(expenses), categories: CATEGORIES });
    }

    if (["POST", "PUT"].includes(event.httpMethod)) {
      const body = readJson(event);
      const { customer, customerId, job } = await relationships(body);
      let existing = {};
      if (event.httpMethod === "PUT") {
        existing = await findRecordById("Expenses", "Expense ID", body.expenseId || body.id);
        if (!existing) return json(404, { error: "Expense not found." });
      }
      let record = expenseFromBody({ ...body, customerId, jobId: job?.id || body.jobId || "" }, existing);
      record = await attachReceipt(body, record, customer);
      if (event.httpMethod === "POST") await appendRecord("Expenses", record);
      else await updateRecord("Expenses", existing.rowNumber, record);
      return json(event.httpMethod === "POST" ? 201 : 200, { expense: expenseToClient(record) });
    }

    if (event.httpMethod === "DELETE") {
      const id = event.queryStringParameters?.id;
      const existing = await findRecordById("Expenses", "Expense ID", id);
      if (!existing) return json(404, { error: "Expense not found." });
      if (event.queryStringParameters?.deleteFile === "true" && existing["Google Drive File ID"]) await trashFile(existing["Google Drive File ID"]);
      const archived = expenseFromBody({ ...existing, expenseId: id, archived: "TRUE" }, existing);
      await updateRecord("Expenses", existing.rowNumber, archived);
      return json(200, { ok: true, fileDeleted: event.queryStringParameters?.deleteFile === "true" });
    }
    return json(405, { error: "Method not allowed." });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "CRM expense request failed." });
  }
};
