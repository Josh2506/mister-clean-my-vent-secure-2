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

function valuesToRecords(values = [], tabName) {
  const headers = getTabHeaders(tabName);
  return values.slice(1).map((row, index) => {
    const record = { rowNumber: index + 2 };
    headers.forEach((header, headerIndex) => {
      record[header] = row[headerIndex] || "";
    });
    return record;
  });
}

async function getRows(tabName) {
  const headers = getTabHeaders(tabName);
  const endColumn = columnName(headers.length - 1);
  const encodedRange = encodeURIComponent(`${tabName}!A:${endColumn}`);
  const data = await sheetsRequest(`/values/${encodedRange}`);
  return valuesToRecords(data.values || [headers], tabName);
}

async function appendRecord(tabName, record) {
  const headers = getTabHeaders(tabName);
  const values = headers.map((header) => record[header] || "");
  const encodedRange = encodeURIComponent(`${tabName}!A:${columnName(headers.length - 1)}`);
  await sheetsRequest(`/values/${encodedRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ values: [values] }),
  });
  return record;
}

async function updateRecord(tabName, rowNumber, record) {
  const headers = getTabHeaders(tabName);
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
  updateRecord,
};

