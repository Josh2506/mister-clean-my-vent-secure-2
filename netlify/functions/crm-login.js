const { cookieHeaderForSession, createSession, getAdminEmails, verifyPassword } = require("./_shared/auth");
const { json, readJson } = require("./_shared/http");
const { rateLimit } = require("./_shared/rate-limit");

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  const limited = rateLimit(event, "crm-login");
  if (limited) {
    return limited;
  }

  let body;
  try {
    body = readJson(event);
  } catch (error) {
    return json(error.statusCode || 400, { error: error.message });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const adminEmails = getAdminEmails();

  if (!email || !password) {
    return json(400, { error: "Email and password are required." });
  }

  if (!adminEmails.includes(email)) {
    return json(401, { error: "Invalid login." });
  }

  if (!process.env.CRM_ADMIN_PASSWORD_HASH) {
    return json(500, { error: "CRM password is not configured." });
  }

  if (!verifyPassword(password, process.env.CRM_ADMIN_PASSWORD_HASH)) {
    return json(401, { error: "Invalid login." });
  }

  const sessionValue = createSession(email);
  return json(200, { ok: true, email }, {
    "Set-Cookie": cookieHeaderForSession(event, sessionValue),
  });
};
