import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

process.env.CRM_ADMIN_EMAILS = "owner@example.com";
process.env.CRM_SESSION_SECRET = "this-is-a-long-random-test-session-secret";
process.env.CRM_RATE_LIMIT_WINDOW_MS = "60000";
process.env.CRM_RATE_LIMIT_MAX_REQUESTS = "100";

const auth = require("../netlify/functions/_shared/auth.js");
const customers = require("../netlify/functions/crm-customers.js");
const dashboard = require("../netlify/functions/crm-dashboard.js");
const jobs = require("../netlify/functions/crm-jobs.js");
const login = require("../netlify/functions/crm-login.js");
const records = require("../netlify/functions/_shared/crm-records.js");
const googleSheets = require("../netlify/functions/_shared/google-sheets.js");

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

const missingCustomerIdDelete = await customers.handler({
  httpMethod: "DELETE",
  headers: { cookie: `mcmv_crm_session=${encodeURIComponent(sessionCookie)}` },
  queryStringParameters: {},
});
assert.equal(missingCustomerIdDelete.statusCode, 400, "customer archive without an ID should fail clearly");

console.log("CRM tests passed");
