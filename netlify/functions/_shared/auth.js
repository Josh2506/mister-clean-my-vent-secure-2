const crypto = require("crypto");
const { json } = require("./http");

const SESSION_COOKIE = "mcmv_crm_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64url(input) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function getAdminEmails() {
  return (process.env.CRM_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function getSessionSecret() {
  const secret = process.env.CRM_SESSION_SECRET;
  if (!secret || secret.length < 24) {
    throw new Error("CRM_SESSION_SECRET must be set to a long random value.");
  }
  return secret;
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function timingSafeEqualText(a, b) {
  const aBuffer = Buffer.from(String(a));
  const bBuffer = Buffer.from(String(b));
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function createSession(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const payload = {
    email: normalizedEmail,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = sign(encodedPayload, getSessionSecret());
  return `${encodedPayload}.${signature}`;
}

function parseCookies(cookieHeader = "") {
  return cookieHeader.split(";").reduce((cookies, part) => {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName) {
      return cookies;
    }
    cookies[rawName] = decodeURIComponent(rawValue.join("="));
    return cookies;
  }, {});
}

function verifySessionCookie(cookieHeader = "") {
  const cookies = parseCookies(cookieHeader);
  const cookieValue = cookies[SESSION_COOKIE];
  if (!cookieValue || !cookieValue.includes(".")) {
    return null;
  }

  const [encodedPayload, signature] = cookieValue.split(".");
  const expectedSignature = sign(encodedPayload, getSessionSecret());
  if (!timingSafeEqualText(signature, expectedSignature)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(fromBase64url(encodedPayload));
  } catch (error) {
    return null;
  }

  if (!payload.email || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  const adminEmails = getAdminEmails();
  if (!adminEmails.includes(String(payload.email).toLowerCase())) {
    return null;
  }

  return payload;
}

function cookieHeaderForSession(event, sessionValue) {
  const host = event.headers.host || event.headers.Host || "";
  const isLocal = host.includes("localhost") || host.includes("127.0.0.1");
  const secureFlag = isLocal ? "" : "; Secure";
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionValue)}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${secureFlag}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`;
}

function requireSession(event) {
  try {
    const session = verifySessionCookie(event.headers.cookie || event.headers.Cookie || "");
    if (!session) {
      return { response: json(401, { error: "Login required." }) };
    }
    return { session };
  } catch (error) {
    return { response: json(500, { error: "CRM authentication is not configured." }) };
  }
}

function createPasswordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.startsWith("scrypt$")) {
    return false;
  }

  const [, salt, expectedHash] = storedHash.split("$");
  if (!salt || !expectedHash) {
    return false;
  }

  const actualHash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return timingSafeEqualText(actualHash, expectedHash);
}

module.exports = {
  SESSION_COOKIE,
  clearSessionCookie,
  cookieHeaderForSession,
  createPasswordHash,
  createSession,
  getAdminEmails,
  requireSession,
  verifyPassword,
  verifySessionCookie,
};

