const securityHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
  "X-Robots-Tag": "noindex, nofollow",
};

function json(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: { ...securityHeaders, ...headers },
    body: JSON.stringify(body),
  };
}

function html(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
      ...headers,
    },
    body,
  };
}

function empty(statusCode, headers = {}) {
  return {
    statusCode,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", ...headers },
    body: "",
  };
}

function readJson(event) {
  if (!event.body) {
    return {};
  }

  try {
    return JSON.parse(event.body);
  } catch (error) {
    const parseError = new Error("Invalid JSON body.");
    parseError.statusCode = 400;
    throw parseError;
  }
}

function methodNotAllowed() {
  return json(405, { error: "Method not allowed." });
}

module.exports = {
  empty,
  html,
  json,
  methodNotAllowed,
  readJson,
};

