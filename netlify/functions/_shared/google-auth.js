const crypto = require("crypto");

const tokenCache = new Map();
let accessTokenTestOverride = null;

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

async function getGoogleAccessToken(scopes) {
  if (accessTokenTestOverride) return accessTokenTestOverride(scopes);
  const scope = [...new Set(scopes)].sort().join(" ");
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(scope);
  if (cached && cached.expiresAt - 60 > now) {
    return cached.accessToken;
  }

  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  if (!serviceAccountEmail) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL is not configured.");
  }

  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: serviceAccountEmail,
    scope,
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
  tokenCache.set(scope, {
    accessToken: data.access_token,
    expiresAt: now + Number(data.expires_in || 3600),
  });
  return data.access_token;
}

function setGoogleAccessTokenForTests(provider) {
  if (process.env.NODE_ENV !== "test") throw new Error("Google access-token overrides are available only in tests.");
  accessTokenTestOverride = provider;
  tokenCache.clear();
}

module.exports = { getGoogleAccessToken, setGoogleAccessTokenForTests };
