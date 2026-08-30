import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
process.env.NODE_ENV = "test";

process.env.CRM_ADMIN_EMAILS = "owner@example.com";
process.env.CRM_SESSION_SECRET = "this-is-a-long-random-test-session-secret";
process.env.CRM_RATE_LIMIT_WINDOW_MS = "60000";
process.env.CRM_RATE_LIMIT_MAX_REQUESTS = "100";

const auth = require("../netlify/functions/_shared/auth.js");
const customers = require("../netlify/functions/crm-customers.js");
const dashboard = require("../netlify/functions/crm-dashboard.js");
const jobs = require("../netlify/functions/crm-jobs.js");
const expensesApi = require("../netlify/functions/crm-expenses.js");
const jobAssetsApi = require("../netlify/functions/crm-job-assets.js");
const fileApi = require("../netlify/functions/crm-file.js");
const login = require("../netlify/functions/crm-login.js");
const records = require("../netlify/functions/_shared/crm-records.js");
const googleSheets = require("../netlify/functions/_shared/google-sheets.js");
const googleAuth = require("../netlify/functions/_shared/google-auth.js");
const googleDrive = require("../netlify/functions/_shared/google-drive.js");
const schema = require("../crm/schema.json");

const passwordHash = auth.createPasswordHash("correct-horse-password");
process.env.CRM_ADMIN_PASSWORD_HASH = passwordHash;

assert.equal(auth.verifyPassword("correct-horse-password", passwordHash), true, "valid password should verify");
assert.equal(auth.verifyPassword("wrong-password", passwordHash), false, "invalid password should fail");

const sessionCookie = auth.createSession("owner@example.com");
assert.equal(auth.verifySessionCookie(`mcmv_crm_session=${encodeURIComponent(sessionCookie)}`).email, "owner@example.com");
assert.equal(auth.verifySessionCookie("mcmv_crm_session=bad.cookie"), null);

const unauthEvent = { httpMethod: "GET", headers: {} };
assert.equal((await customers.handler(unauthEvent)).statusCode, 401, "customers API must reject logged-out visitors");
assert.equal((await dashboard.handler(unauthEvent)).statusCode, 401, "dashboard API must reject logged-out visitors");
assert.equal((await jobs.handler(unauthEvent)).statusCode, 401, "jobs API must reject logged-out visitors");
assert.equal((await expensesApi.handler(unauthEvent)).statusCode, 401, "expenses API must reject logged-out visitors");
assert.equal((await jobAssetsApi.handler(unauthEvent)).statusCode, 401, "job attachment API must reject logged-out visitors");
assert.equal((await fileApi.handler(unauthEvent)).statusCode, 401, "Drive file proxy must reject logged-out visitors");

const badLogin = await login.handler({
  httpMethod: "POST",
  headers: { host: "localhost", "x-forwarded-for": "127.0.0.1" },
  body: JSON.stringify({ email: "owner@example.com", password: "wrong-password" }),
});
assert.equal(badLogin.statusCode, 401, "wrong password should fail");

const goodLogin = await login.handler({
  httpMethod: "POST",
  headers: { host: "localhost", "x-forwarded-for": "127.0.0.2" },
  body: JSON.stringify({ email: "owner@example.com", password: "correct-horse-password" }),
});
assert.equal(goodLogin.statusCode, 200, "correct password should log in");
assert.match(goodLogin.headers["Set-Cookie"], /mcmv_crm_session=/);

const customer = records.customerFromBody({
  firstName: "Joshua",
  phone: "7326260685",
  streetAddress: "123 Main St",
});
assert.equal(customer["First Name"], "Joshua");
assert.equal(customer.Phone, "(732) 626-0685");
assert.equal(records.customerToClient(customer).name, "Joshua");
assert.equal(records.hasCustomerData({}), false, "blank customer sheet rows should be ignored");
assert.equal(records.hasCustomerData({ "Customer ID": "cus_blank_only" }), false, "ID-only customer rows should be ignored");
assert.equal(records.hasCustomerData(customer), true, "real customer sheet rows should be included");

const shiftedCustomerRows = [
  ["Customer ID", "Phone", "First Name", "Last Name", "Archived"],
  ["cus_shifted", "7326260685", "Jane", "Customer", "FALSE"],
];
const shiftedCustomer = googleSheets.valuesToRecords(shiftedCustomerRows, "Customers")[0];
assert.equal(shiftedCustomer["First Name"], "Jane", "customer rows should follow Google Sheet headers");
assert.equal(shiftedCustomer.Phone, "7326260685", "customer phone should follow Google Sheet headers");

const farShiftedCustomerRows = [
  ["Customer ID", "First Name", "Last Name", "Phone", "Email", "Street Address", "City", "State", "ZIP Code"],
  [
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "cus_far_shifted",
    "Maria",
    "Lopez",
    "(732) 626-0685",
    "maria@example.com",
    "45 Oak St",
    "Somerville",
    "NJ",
    "08876",
    "Google",
  ],
];
const farShiftedCustomer = googleSheets.valuesToRecords(farShiftedCustomerRows, "Customers")[0];
assert.equal(farShiftedCustomer["Customer ID"], "cus_far_shifted", "customer IDs shifted into column P should still be read");
assert.equal(farShiftedCustomer["First Name"], "Maria", "shifted first names should map back to the normal customer schema");
assert.equal(farShiftedCustomer.Phone, "(732) 626-0685", "shifted phone numbers should map back to the normal customer schema");
assert.equal(farShiftedCustomer.City, "Somerville", "shifted cities should map back to the normal customer schema");
assert.equal(googleSheets.nextAppendRow([["Customer ID"], []]), 2, "blank rows should not force appends down the sheet");
assert.equal(
  googleSheets.nextAppendRow([["Customer ID"], [], farShiftedCustomerRows[1]]),
  4,
  "new records should append below shifted data instead of overwriting it"
);

const alternateCustomerRows = [
  ["ID", "Name", "Phone Number", "Service Address", "Notes", "Archived"],
  ["cus_alt", "Jane Customer", "7326260685", "123 Main St", "Needs annual dryer vent cleaning", "FALSE"],
];
const alternateCustomer = googleSheets.valuesToRecords(alternateCustomerRows, "Customers")[0];
const alternateClient = records.customerToClient(alternateCustomer);
assert.equal(records.hasCustomerData(alternateCustomer), true, "customers with alternate sheet headers should be included");
assert.equal(alternateClient.id, "cus_alt", "alternate customer ID header should be read");
assert.equal(alternateClient.name, "Jane Customer", "alternate customer name header should be read");
assert.equal(alternateClient.phone, "7326260685", "alternate phone header should be read");
assert.equal(alternateClient.streetAddress, "123 Main St", "alternate address header should be read");
assert.equal(alternateClient.notes, "Needs annual dryer vent cleaning", "alternate notes header should be read");

const liveLeadHeaders = ["Lead ID", "First Name", "Last Name", "Phone Number", "Email", "Address", "City", "State", "Zip Code ", "Lead Source", "Customer ID", "Notes"];
const liveLead = googleSheets.valuesToRecords([liveLeadHeaders, ["lead_live", "Sam", "Owner", "7325550100", "sam@example.com", "1 Main St", "Somerville", "NJ", "08876", "Google", "cus_live", "Call back"]], "Leads")[0];
assert.equal(liveLead.Phone, "7325550100", "the live Leads Phone Number header should map to Phone");
assert.equal(liveLead["Converted Customer ID"], "cus_live", "the live Leads Customer ID header should map to Converted Customer ID");

const liveReminderHeaders = ["Reminder ID", "Customer ID", "Job ID", "Reminder Type", "Due Date", "Reminder Status", "Contact Method", "Date Contacted ", "Customer Response", "Follow Up", "Notes"];
const liveReminder = googleSheets.valuesToRecords([liveReminderHeaders, ["rem_live", "cus_live", "job_live", "Annual", "2026-10-01", "Open", "Text", "", "", "2026-10-10", ""]], "Reminders")[0];
assert.equal(liveReminder["Follow-Up Date"], "2026-10-10", "the live Reminders Follow Up header should map without rewriting it");

const job = records.jobFromBody({
  customerId: customer["Customer ID"],
  serviceType: "Dryer Vent Cleaning",
  nextServiceDate: "2026-08-24",
});
assert.equal(records.jobToClient(job).customerId, customer["Customer ID"]);
assert.equal(records.hasJobData({}), false, "blank job sheet rows should be ignored");
assert.equal(records.hasJobData({ "Job ID": "job_blank_only", "Customer ID": customer["Customer ID"] }), false, "ID-only job rows should be ignored");
assert.equal(records.hasJobData(job), true, "real job sheet rows should be included");
assert.equal(records.dateDiffDays("2026-08-24", "2026-07-24"), 31);

const expense = records.expenseFromBody({
  date: "2026-08-26",
  vendor: "Home Depot",
  category: "Parts & Materials",
  totalAmount: "187.42",
  customerId: customer["Customer ID"],
  jobId: job["Job ID"],
});
assert.match(expense["Expense ID"], /^exp_/, "expenses should receive stable prefixed IDs");
assert.equal(records.expenseToClient(expense).jobId, job["Job ID"], "expense should retain its Job relationship");
assert.equal(records.expenseToClient(expense).customerId, customer["Customer ID"], "expense should retain its Customer relationship");
assert.throws(() => records.expenseFromBody({ vendor: "Wawa", totalAmount: "not-a-number" }), /valid total/i);

const signedJob = records.jobFromBody({
  customerId: customer["Customer ID"],
  signedWorkOrderFileId: "drive_file_123",
  signedWorkOrderUrl: "https://drive.google.com/file/d/drive_file_123/view",
  signedWorkOrderFileName: "2026-08-26_Smith_Signed-Work-Order.jpg",
  signedWorkOrderUploadedAt: "2026-08-26T12:00:00.000Z",
}, job);
assert.equal(records.jobToClient(signedJob).signedWorkOrderFileId, "drive_file_123", "signed Work Order metadata should extend the existing Job record");
const clearedJob = records.jobFromBody({ customerId: customer["Customer ID"], jobId: signedJob["Job ID"], finalPrice: "", signedWorkOrderFileId: "" }, signedJob);
assert.equal(clearedJob["Final Price"], "", "editing a Job should allow optional values to be cleared");
assert.equal(clearedJob["Signed Work Order File ID"], "", "signed Work Order metadata should be removable without changing the Job ID");

assert.ok(schema.tabs.Expenses.includes("Google Drive File ID"), "Expenses tab should store Drive metadata, not file bytes");
assert.ok(schema.tabs.Jobs.includes("Signed Work Order File ID"), "Jobs should be extended instead of adding a duplicate Work Orders table");
assert.ok(!schema.tabs.Expenses.some((header) => /base64|binary/i.test(header)), "Sheets must not contain raw file columns");
assert.equal(googleDrive.expenseFileName({ date: "2026-08-26", vendor: "Home Depot", total: "187.42", customerName: "Smith", originalName: "receipt.JPG" }), "2026-08-26_Smith_Home-Depot_187.42.jpg");
assert.equal(googleDrive.signedWorkOrderFileName({ date: "2026-08-26", customerName: "Smith", originalName: "scan.pdf" }), "2026-08-26_Smith_Signed-Work-Order.pdf");

process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "test_spreadsheet";
googleAuth.setGoogleAccessTokenForTests(async () => "test-access-token");
const sheetsOriginalFetch = globalThis.fetch;
let sheetsCalls = [];
globalThis.fetch = async (url, options = {}) => {
  sheetsCalls.push({ url: String(url), method: options.method || "GET" });
  if (String(url).includes("values:batchGet")) {
    return new Response(JSON.stringify({
      valueRanges: [
        { values: [schema.tabs.Customers] },
        { values: [schema.tabs.Jobs] },
        { values: [schema.tabs.Expenses] },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (String(url).includes(":append")) {
    return new Response(JSON.stringify({ updates: { updatedRows: 1 } }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return new Response(JSON.stringify({ values: [schema.tabs.Jobs] }), { status: 200, headers: { "content-type": "application/json" } });
};

googleSheets.clearSheetsCachesForTests();
const batchMeasurement = await googleSheets.withSheetsMetrics(() => googleSheets.getRowsBatch(["Customers", "Jobs", "Expenses"]));
assert.deepEqual(batchMeasurement.metrics, { reads: 1, writes: 0, retries: 0 }, "CRM bootstrap should batch three tabs into one Sheets read");

const dashboardMeasurement = await dashboard.handler({
  httpMethod: "GET",
  headers: { cookie: `mcmv_crm_session=${encodeURIComponent(sessionCookie)}` },
});
assert.equal(dashboardMeasurement.statusCode, 200, "batched CRM dashboard should load successfully");
assert.equal(dashboardMeasurement.headers["X-CRM-Sheets-Reads"], "1", "one dashboard refresh should use one Sheets read");

googleSheets.clearSheetsCachesForTests();
sheetsCalls = [];
const appendMeasurement = await googleSheets.withSheetsMetrics(() => googleSheets.appendRecord("Jobs", job));
assert.deepEqual(appendMeasurement.metrics, { reads: 1, writes: 1, retries: 0 }, "a cold Work Order append should use one header read and one write");
assert.equal(sheetsCalls.filter((call) => call.method === "GET").length, 1, "Work Order append should not read the full Jobs tab");

googleSheets.clearSheetsCachesForTests();
const workOrderMeasurement = await jobs.handler({
  httpMethod: "POST",
  headers: { cookie: `mcmv_crm_session=${encodeURIComponent(sessionCookie)}` },
  body: JSON.stringify({ customerId: customer["Customer ID"], serviceType: "Dryer Vent Cleaning", appointmentDate: "2026-08-28" }),
});
assert.equal(workOrderMeasurement.statusCode, 201, "Work Order creation should succeed through the API handler");
assert.equal(workOrderMeasurement.headers["X-CRM-Sheets-Reads"], "1", "one Work Order creation should use one Sheets read");
assert.equal(workOrderMeasurement.headers["X-CRM-Sheets-Writes"], "1", "one Work Order creation should use one Sheets write");

const standardSheetsFetch = globalThis.fetch;
googleSheets.clearSheetsCachesForTests();
let removedJobUpdate = null;
globalThis.fetch = async (url, options = {}) => {
  if (String(url).includes("/values/") && (options.method || "GET") === "GET") {
    return new Response(JSON.stringify({
      values: [schema.tabs.Jobs, schema.tabs.Jobs.map((header) => job[header] ?? "")],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (options.method === "PUT") {
    removedJobUpdate = JSON.parse(options.body);
    return new Response(JSON.stringify({ updatedRows: 1 }), { status: 200, headers: { "content-type": "application/json" } });
  }
  throw new Error(`Unexpected Sheets request while removing a service: ${options.method || "GET"} ${url}`);
};
const serviceRemoval = await jobs.handler({
  httpMethod: "DELETE",
  headers: { cookie: `mcmv_crm_session=${encodeURIComponent(sessionCookie)}` },
  queryStringParameters: { id: job["Job ID"] },
});
assert.equal(serviceRemoval.statusCode, 200, "service removal should succeed through the API handler");
assert.equal(serviceRemoval.headers["X-CRM-Sheets-Reads"], "1", "service removal should use one Sheets read");
assert.equal(serviceRemoval.headers["X-CRM-Sheets-Writes"], "1", "service removal should use one Sheets write");
assert.equal(
  removedJobUpdate.values[0][schema.tabs.Jobs.indexOf("Archived")],
  "TRUE",
  "service removal should archive the Job row instead of deleting spreadsheet history"
);
globalThis.fetch = standardSheetsFetch;

googleSheets.clearSheetsCachesForTests();
let retryAttempt = 0;
globalThis.fetch = async () => {
  retryAttempt += 1;
  if (retryAttempt === 1) return new Response(JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED" } }), { status: 429, headers: { "retry-after": "0.001" } });
  return new Response(JSON.stringify({ values: [schema.tabs.Customers] }), { status: 200, headers: { "content-type": "application/json" } });
};
const retryMeasurement = await googleSheets.withSheetsMetrics(() => googleSheets.getRows("Customers"));
assert.deepEqual(retryMeasurement.metrics, { reads: 2, writes: 0, retries: 1 }, "a legitimate 429 should retry once with backoff and then succeed");
globalThis.fetch = sheetsOriginalFetch;
googleAuth.setGoogleAccessTokenForTests(null);

const adminAppSource = readFileSync(new URL("../crm-assets/admin-app.js", import.meta.url), "utf8");
const loadDataSource = adminAppSource.match(/async function loadData[\s\S]*?\n}\n\nasync function showDashboard/)?.[0] || "";
assert.equal((loadDataSource.match(/api\(/g) || []).length, 1, "CRM bootstrap and refresh should make one application API request");
assert.match(loadDataSource, /api\("\/api\/crm\/dashboard"\)/, "CRM bootstrap should use the batched dashboard endpoint");
const jobSaveSource = adminAppSource.match(/function openJobModal[\s\S]*?function searchableJobField/)?.[0] || "";
assert.doesNotMatch(jobSaveSource, /loadData\(|\/api\/crm\/jobs\?customerId/, "saving a Work Order should update local state without a full reload");
const serviceRemovalSource = adminAppSource.match(/async function removeService[\s\S]*?\n}\n\nfunction bindCustomerButtons/)?.[0] || "";
assert.match(adminAppSource, /renderJobCards\(profileJobs, false, true\)/, "customer Service History should enable the removal control");
assert.match(adminAppSource, /data-remove-service=/, "each customer service card should render a visible Remove Service button");
assert.match(serviceRemovalSource, /Are you sure you want to remove this service from this customer\?/, "service removal should require the requested confirmation");
assert.match(serviceRemovalSource, /method: "DELETE"/, "confirmed service removal should call the Jobs delete API");
assert.doesNotMatch(serviceRemovalSource, /loadData\(/, "service removal should update local state without rereading the full CRM");
assert.doesNotMatch(adminAppSource, /setInterval\s*\(/, "the CRM should not poll Google Sheets");

process.env.GOOGLE_DRIVE_CRM_FOLDER_ID = "root_folder";
process.env.GOOGLE_DRIVE_WEB_APP_URL = "https://script.google.test/exec";
process.env.GOOGLE_DRIVE_WEB_APP_SECRET = "test-bridge-secret";
const originalFetch = globalThis.fetch;
const bridgeCalls = [];
globalThis.fetch = async (_url, options) => {
  const request = JSON.parse(options.body);
  bridgeCalls.push(request);
  return new Response(JSON.stringify({ ok: true, folder: { id: `folder_${bridgeCalls.length}`, name: request.name, url: `https://drive.google.test/folder_${bridgeCalls.length}` } }), { status: 200 });
};
const nestedFolder = await googleDrive.folderPath(["Receipts", "2026"]);
assert.equal(nestedFolder.id, "folder_2", "Drive bridge folder creation should walk the requested hierarchy");
assert.equal(bridgeCalls[0].parentId, "root_folder", "Drive bridge should start from the configured existing folder");
assert.equal(bridgeCalls[1].parentId, "folder_1", "Drive bridge should reuse the prior folder result without creating a second root");
assert.equal(bridgeCalls[0].secret, "test-bridge-secret", "Drive bridge requests should be authenticated");
globalThis.fetch = originalFetch;

const photoRows = [schema.tabs["Job Photos"], ["photo_123", job["Job ID"], customer["Customer ID"], "Before", "", "before.jpg", "image/jpeg", "file_123", "https://drive.google.com/file/d/file_123/view", "2026-08-26T12:00:00.000Z", "FALSE"]];
assert.equal(googleSheets.valuesToRecords(photoRows, "Job Photos")[0]["Photo ID"], "photo_123", "tabs with spaces should map attachment records correctly");

const missingCustomerIdDelete = await customers.handler({
  httpMethod: "DELETE",
  headers: { cookie: `mcmv_crm_session=${encodeURIComponent(sessionCookie)}` },
  queryStringParameters: {},
});
assert.equal(missingCustomerIdDelete.statusCode, 400, "customer archive without an ID should fail clearly");

console.log("CRM tests passed");
