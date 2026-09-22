const { requireSession } = require("./_shared/auth");
const { getCalendarStatus, testCalendarConnection } = require("./_shared/google-calendar");
const { json } = require("./_shared/http");

exports.handler = async function handler(event) {
  const auth = requireSession(event);
  if (auth.response) return auth.response;
  try {
    if (event.httpMethod === "GET") return json(200, { calendar: await getCalendarStatus() });
    if (event.httpMethod === "POST") return json(200, { calendar: await testCalendarConnection() });
    return json(405, { error: "Method not allowed." });
  } catch (error) {
    return json(error.statusCode || 502, { error: error.message || "Google Calendar connection test failed." });
  }
};
