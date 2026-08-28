const schema = require("../../../crm/schema.json");
const { getGoogleAccessToken } = require("./google-auth");
const { AsyncLocalStorage } = require("async_hooks");

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const MAX_RETRIES = 3;
const LAYOUT_CACHE_MS = 5 * 60 * 1000;
const layoutCache = new Map();
const metricsStorage = new AsyncLocalStorage();

function getSpreadsheetId() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID is not configured.");
  return spreadsheetId;
}

function columnName(index) {
  let name = "";
  let number = index + 1;
  while (number > 0) {
    const remainder = (number - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    number = Math.floor((number - 1) / 26);
  }
  return name;
}

function a1TabName(tabName) {
  return `'${String(tabName).replace(/'/g, "''")}'`;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  return (250 * (2 ** attempt)) + Math.floor(Math.random() * 150);
}

function requestKind(options) {
  return String(options.method || "GET").toUpperCase() === "GET" ? "reads" : "writes";
}

async function withSheetsMetrics(callback) {
  return metricsStorage.run({ reads: 0, writes: 0, retries: 0 }, async () => {
    const result = await callback();
    return { result, metrics: { ...metricsStorage.getStore() } };
  });
}

async function sheetsRequest(path, options = {}) {
  const accessToken = await getGoogleAccessToken([SHEETS_SCOPE]);
  const kind = requestKind(options);
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const metrics = metricsStorage.getStore();
    if (metrics) metrics[kind] += 1;
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${getSpreadsheetId()}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(options.headers || {}) },
    });
    if (response.ok) return response.status === 204 ? null : response.json();
    const responseText = await response.text();
    if ([429, 503].includes(response.status) && attempt < MAX_RETRIES) {
      if (metrics) metrics.retries += 1;
      await sleep(retryDelay(response, attempt));
      continue;
    }
    const error = new Error(`Google Sheets request failed: ${response.status} ${responseText}`);
    error.statusCode = response.status === 429 ? 503 : response.status;
    error.googleStatus = response.status;
    throw error;
  }
  throw new Error("Google Sheets request failed after retrying.");
}

function getTabHeaders(tabName) {
  const headers = schema.tabs[tabName];
  if (!headers) throw new Error(`Unknown CRM tab: ${tabName}`);
  return headers;
}

const headerAliases = {
  Phone: ["Phone Number", "Customer Phone", "Mobile"],
  "Street Address": ["Address", "Service Address"],
  "ZIP Code": ["Zip", "Zip Code", "Postal Code"],
  "Preferred Contact Method": ["Preferred Contact"],
  "Customer Status": ["Status"],
  "General Notes": ["Notes"],
  "Job Status": ["Status"],
  "Technician Notes": ["Notes"],
  "Follow-Up Date": ["Follow Up", "Follow Up Date"],
  "Converted Customer ID": ["Customer ID"],
  "Sales Tax": ["Tax"],
  "Total Amount": ["Total", "Amount"],
};

function normalizeHeader(header) {
  return String(header || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function canonicalHeader(actualHeader, expectedHeaders) {
  const normalizedActual = normalizeHeader(actualHeader);
  return expectedHeaders.find((expected) => [expected, ...(headerAliases[expected] || [])]
    .some((candidate) => normalizeHeader(candidate) === normalizedActual)) || actualHeader;
}

function buildHeaderIndex(actualHeaders, expectedHeaders) {
  const actualIndex = new Map();
  actualHeaders.forEach((header, index) => actualIndex.set(normalizeHeader(header), index));
  const expectedHeaderKeys = expectedHeaders.flatMap((header) => [header, ...(headerAliases[header] || [])].map(normalizeHeader));
  if (!expectedHeaderKeys.some((key) => actualIndex.has(key))) return null;
  return expectedHeaders.map((header) => {
    const names = [header, ...(headerAliases[header] || [])];
    const matchedName = names.find((name) => actualIndex.has(normalizeHeader(name)));
    return matchedName ? actualIndex.get(normalizeHeader(matchedName)) : -1;
  });
}

function rowHasAnyValue(row = []) {
  return row.some((cell) => String(cell || "").trim());
}

function getRecordIdPrefix(tabName) {
  return ({ Customers: "cus_", Jobs: "job_", Reminders: "rem_", Leads: "lead_", Services: "svc_", Expenses: "exp_", "Job Photos": "photo_", "Job Documents": "doc_" })[tabName] || "";
}

function findShiftedRecordStart(row = [], tabName) {
  const prefix = getRecordIdPrefix(tabName);
  return prefix ? row.findIndex((cell) => String(cell || "").trim().startsWith(prefix)) : -1;
}

function recordFromRow(row = [], headers = [], rowNumber, startIndex = 0) {
  const record = { rowNumber };
  headers.forEach((header, headerIndex) => { record[header] = row[startIndex + headerIndex] || ""; });
  return record;
}

function valuesToRecords(values = [], tabName) {
  const headers = getTabHeaders(tabName);
  const actualHeaders = values[0] || [];
  const headerIndexes = buildHeaderIndex(actualHeaders, headers) || headers.map((_, index) => index);
  return values.slice(1).map((row, index) => {
    let record = { rowNumber: index + 2 };
    headers.forEach((header, headerIndex) => {
      const columnIndex = headerIndexes[headerIndex];
      record[header] = columnIndex < 0 ? "" : row[columnIndex] || "";
    });
    const shiftedStart = findShiftedRecordStart(row, tabName);
    if (!record[headers[0]] && shiftedStart > 0) record = recordFromRow(row, headers, index + 2, shiftedStart);
    actualHeaders.forEach((header, actualIndex) => {
      const rawHeader = String(header || "").trim();
      if (rawHeader && record[rawHeader] === undefined) record[rawHeader] = row[actualIndex] || "";
    });
    return record;
  });
}

async function ensureTab(tabName) {
  const metadata = await sheetsRequest("?fields=sheets.properties.title");
  if (!(metadata.sheets || []).some((sheet) => sheet.properties?.title === tabName)) {
    await sheetsRequest(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tabName } } }] }),
    });
  }
}

async function ensureHeaders(tabName) {
  const expectedHeaders = getTabHeaders(tabName);
  const headerRange = encodeURIComponent(`${a1TabName(tabName)}!A1:AZ1`);
  let data;
  try {
    data = await sheetsRequest(`/values/${headerRange}`);
  } catch (error) {
    if (error.googleStatus !== 400) throw error;
    await ensureTab(tabName);
    data = await sheetsRequest(`/values/${headerRange}`);
  }
  const actualHeaders = (data.values?.[0] || []).map((header) => String(header || "").trim());
  const normalizedActual = new Set(actualHeaders.filter(Boolean).map(normalizeHeader));
  const missingHeaders = expectedHeaders.filter((expected) => ![expected, ...(headerAliases[expected] || [])]
    .some((candidate) => normalizedActual.has(normalizeHeader(candidate))));
  const layout = [...actualHeaders, ...missingHeaders];
  if (!actualHeaders.some(Boolean) || missingHeaders.length) {
    const endColumn = columnName(layout.length - 1);
    const encodedRange = encodeURIComponent(`${a1TabName(tabName)}!A1:${endColumn}1`);
    await sheetsRequest(`/values/${encodedRange}?valueInputOption=USER_ENTERED`, {
      method: "PUT",
      body: JSON.stringify({ values: [layout] }),
    });
  }
  layoutCache.set(tabName, { layout, expiresAt: Date.now() + LAYOUT_CACHE_MS });
  return layout;
}

function rememberLayout(tabName, values = []) {
  const layout = (values[0] || []).map((header) => String(header || "").trim());
  if (layout.some(Boolean)) layoutCache.set(tabName, { layout, expiresAt: Date.now() + LAYOUT_CACHE_MS });
}

async function getLayout(tabName) {
  const cached = layoutCache.get(tabName);
  if (cached && cached.expiresAt > Date.now()) return cached.layout;
  return ensureHeaders(tabName);
}

function nextAppendRow(values = []) {
  const lastUsedRow = values.reduce((lastRow, row, index) => (rowHasAnyValue(row) ? index + 1 : lastRow), 1);
  return Math.max(lastUsedRow + 1, 2);
}

function recordValuesForLayout(record, layout, expectedHeaders) {
  return layout.map((actualHeader) => {
    const canonical = canonicalHeader(actualHeader, expectedHeaders);
    return record[canonical] ?? record[actualHeader] ?? "";
  });
}

async function getRows(tabName) {
  const headers = getTabHeaders(tabName);
  const encodedRange = encodeURIComponent(`${a1TabName(tabName)}!A:AZ`);
  let data;
  try {
    data = await sheetsRequest(`/values/${encodedRange}`);
  } catch (error) {
    if (error.googleStatus !== 400) throw error;
    await ensureHeaders(tabName);
    data = await sheetsRequest(`/values/${encodedRange}`);
  }
  rememberLayout(tabName, data.values || []);
  return valuesToRecords(data.values || [headers], tabName);
}

async function getRowsBatch(tabNames) {
  const uniqueTabNames = [...new Set(tabNames)];
  uniqueTabNames.forEach(getTabHeaders);
  const params = new URLSearchParams();
  uniqueTabNames.forEach((tabName) => params.append("ranges", `${a1TabName(tabName)}!A:AZ`));
  try {
    const data = await sheetsRequest(`/values:batchGet?${params.toString()}`);
    const records = {};
    uniqueTabNames.forEach((tabName, index) => {
      const values = data.valueRanges?.[index]?.values || [getTabHeaders(tabName)];
      rememberLayout(tabName, values);
      records[tabName] = valuesToRecords(values, tabName);
    });
    return records;
  } catch (error) {
    if (error.googleStatus !== 400) throw error;
    const entries = await Promise.all(uniqueTabNames.map(async (tabName) => [tabName, await getRows(tabName)]));
    return Object.fromEntries(entries);
  }
}

async function appendRecord(tabName, record) {
  const expectedHeaders = getTabHeaders(tabName);
  const layout = await getLayout(tabName);
  const values = recordValuesForLayout(record, layout, expectedHeaders);
  const tableRange = encodeURIComponent(`${a1TabName(tabName)}!A:AZ`);
  await sheetsRequest(`/values/${tableRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ values: [values] }),
  });
  return record;
}

async function updateRecord(tabName, rowNumber, record) {
  const expectedHeaders = getTabHeaders(tabName);
  const layout = await getLayout(tabName);
  const endColumn = columnName(layout.length - 1);
  const encodedRange = encodeURIComponent(`${a1TabName(tabName)}!A${rowNumber}:${endColumn}${rowNumber}`);
  const values = recordValuesForLayout(record, layout, expectedHeaders);
  await sheetsRequest(`/values/${encodedRange}?valueInputOption=USER_ENTERED`, { method: "PUT", body: JSON.stringify({ values: [values] }) });
  return record;
}

async function findRecordById(tabName, idColumn, id) {
  const rows = await getRows(tabName);
  return rows.find((row) => row[idColumn] === id) || null;
}

function clearSheetsCachesForTests() {
  if (process.env.NODE_ENV !== "test") throw new Error("Sheets caches can be cleared only in tests.");
  layoutCache.clear();
}

module.exports = { appendRecord, clearSheetsCachesForTests, findRecordById, getRows, getRowsBatch, getTabHeaders, nextAppendRow, updateRecord, valuesToRecords, withSheetsMetrics };
