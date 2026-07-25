const { clearSessionCookie } = require("./_shared/auth");
const { json } = require("./_shared/http");

exports.handler = async function handler() {
  return json(200, { ok: true }, {
    "Set-Cookie": clearSessionCookie(),
  });
};

