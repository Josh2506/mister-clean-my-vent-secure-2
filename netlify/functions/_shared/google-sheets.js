const crypto = require("crypto");
const schema = require("../../../crm/schema.json");

let tokenCache = null;

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function getPrivateKey() {
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (!key) {
    throw new Error("GOOGLE_PRIVATE_KEY is not configured.");
  }
  return key.replace(/\\n/g, "\n");
}

function getSpreadsheetId() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID is not configured.");
  }
  return spreadsheetId;
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.expiresAt - 60 > now) {
    return tokenCache.accessToken;
  }

  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  if (!serviceAccountEmail) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL is not configured.");
  }

  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: serviceAccountEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const unsignedJwt = `${base64urlJson(header)}.${base64urlJson(claimSet)}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsignedJwt).sign(getPrivateKey(), "base64url");
  const assertion = `${unsignedJwt}.${signature}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google authentication failed with status ${response.status}.`);
  }

  const data = await response.json();
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + Number(data.expires_in || 3600),
  };
  return tokenCache.accessToken;
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

async function sheetsRequest(path, options = {}) {
  const accessToken = await getAccessToken();
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${getSpreadsheetId()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Sheets request failed: ${response.status} ${text}`);
  }

  if (response.status === 204) {
    return null;
  }
  return response.json();
}

function getTabHeaders(tabName) {
  const headers = schema.tabs[tabName];
  if (!headers) {
    throw new Error(`Unknown CRM tab: ${tabName}`);
  }
  return headers;
}

const headerAliases = {
  "Street Address": ["Address", "Service Address"],
  "ZIP Code": ["Zip", "Zip Code", "Postal Code"],
  "Preferred Contact Method": ["Preferred Contact"],
  "Customer Status": ["Status"],
  "General Notes": ["Notes"],
  "Job Status": ["Status"],
  "Technician Notes": ["Notes"],
};

function normalizeHeader(header) {
  return String(header || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildHeaderIndex(actualHeaders, expectedHeaders) {
  const actualIndex = new Map();
  actualHeaders.forEach((header, index) => {
    actualIndex.set(normalizeHeader(header), index);
  });

  const expectedHeaderKeys = expectedHeaders.flatMap((header) => [header, ...(headerAliases[header] || [])].map(normalizeHeader));
  const hasUsableHeaderRow = expectedHeaderKeys.some((key) => actualIndex.has(key));
  if (!hasUsableHeaderRow) {
    return null;
  }

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
  const prefixes = {
    Customers: "cus_",
    Jobs: "job_",
    Reminders: "rem_",
    Leads: "lead_",
    Services: "svc_",
  };
  return prefixes[tabName] || "";
}

function findShiftedRecordStart(row = [], tabName) {
  const prefix = getRecordIdPrefix(tabName);
  if (!prefix) {
    return -1;
  }
  return row.findIndex((cell) => String(cell || "").trim().startsWith(prefix));
}

function recordFromRow(row = [], headers = [], rowNumber, startIndex = 0) {
  const record = { rowNumber };
  headers.forEach((header, headerIndex) => {
    record[header] = row[startIndex + headerIndex] || "";
  });
  return record;
}

function valuesToRecords(values = [], tabName) {
  const headers = getTabHeaders(tabName);
  const actualHeaders = values[0] || [];
  const headerIndexes = buildHeaderIndex(actualHeaders, headers) || headers.map((_, index) => index);

  return values.slice(1).map((row, index) => {
    let record = { rowNumber: index + 2 };
    headers.forEach((header, headerIndex) => {
      record[header] = row[headerIndexes[headerIndex]] || "";
    });

    const shiftedStart = findShiftedRecordStart(row, tabName);
    if (!record[headers[0]] && shiftedStart > 0) {
      record = recordFromRow(row, headers, index + 2, shiftedStart);
    }

    actualHeaders.forEach((header, actualIndex) => {
      const rawHeader = String(header || "").trim();
      if (rawHeader && record[rawHeader] === undefined) {
        record[rawHeader] = row[actualIndex] || "";
      }
    });
    return record;
  });
}

async function ensureHeaders(tabName) {
  const headers = getTabHeaders(tabName);
  const endColumn = columnName(headers.length - 1);
  const encodedRange = encodeURIComponent(`${tabName}!A1:${endColumn}1`);
  await sheetsRequest(`/values/${encodedRange}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values: [headers] }),
  });
}

function nextAppendRow(values = []) {
  const lastUsedRow = values.reduce((lastRow, row, index) => (rowHasAnyValue(row) ? index + 1 : lastRow), 1);
  return Math.max(lastUsedRow + 1, 2);
}

async function getRows(tabName) {
  const headers = getTabHeaders(tabName);
  await ensureHeaders(tabName);
  const endColumn = "AZ";
  const encodedRange = encodeURIComponent(`${tabName}!A:${endColumn}`);
  const data = await sheetsRequest(`/values/${encodedRange}`);
  return valuesToRecords(data.values || [headers], tabName);
}

async function appendRecord(tabName, record) {
  const headers = getTabHeaders(tabName);
  await ensureHeaders(tabName);
  const values = headers.map((header) => record[header] || "");
  const endColumn = columnName(headers.length - 1);
  const tableRange = encodeURIComponent(`${tabName}!A:AZ`);
  const data = await sheetsRequest(`/values/${tableRange}`);
  const rowNumber = nextAppendRow(data.values || [headers]);
  const encodedRange = encodeURIComponent(`${tabName}!A${rowNumber}:${endColumn}${rowNumber}`);
  await sheetsRequest(`/values/${encodedRange}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values: [values] }),
  });
  return record;
}

async function updateRecord(tabName, rowNumber, record) {
  const headers = getTabHeaders(tabName);
  await ensureHeaders(tabName);
  const values = headers.map((header) => record[header] || "");
  const endColumn = columnName(headers.length - 1);
  const encodedRange = encodeURIComponent(`${tabName}!A${rowNumber}:${endColumn}${rowNumber}`);
  await sheetsRequest(`/values/${encodedRange}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values: [values] }),
  });
  return record;
}

async function findRecordById(tabName, idColumn, id) {
  const rows = await getRows(tabName);
  return rows.find((row) => row[idColumn] === id) || null;
}

module.exports = {
  appendRecord,
  findRecordById,
  getRows,
  getTabHeaders,
  nextAppendRow,
  updateRecord,
  valuesToRecords,
};
