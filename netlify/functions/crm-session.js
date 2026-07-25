const { requireSession } = require("./_shared/auth");
const { json } = require("./_shared/http");

exports.handler = async function handler(event) {
  const auth = requireSession(event);
  if (auth.response) {
    return auth.response;
  }

  return json(200, { ok: true, email: auth.session.email });
};

