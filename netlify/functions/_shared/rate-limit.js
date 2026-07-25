const { json } = require("./http");

const hits = new Map();

function rateLimit(event, label = "default") {
  const windowMs = Number(process.env.CRM_RATE_LIMIT_WINDOW_MS || 60000);
  const maxRequests = Number(process.env.CRM_RATE_LIMIT_MAX_REQUESTS || 60);
  const forwardedFor = event.headers["x-forwarded-for"] || event.headers["X-Forwarded-For"] || "";
  const ip = String(forwardedFor).split(",")[0].trim() || "unknown";
  const key = `${label}:${ip}`;
  const now = Date.now();
  const existing = hits.get(key) || { count: 0, resetAt: now + windowMs };

  if (existing.resetAt <= now) {
    existing.count = 0;
    existing.resetAt = now + windowMs;
  }

  existing.count += 1;
  hits.set(key, existing);

  if (existing.count > maxRequests) {
    return json(429, { error: "Too many requests. Please try again soon." });
  }

  return null;
}

module.exports = {
  rateLimit,
};

