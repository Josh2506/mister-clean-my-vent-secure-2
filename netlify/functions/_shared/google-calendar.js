const BRIDGE_TIMEOUT_MS = 12000;

function bridgeConfig() {
  const url = process.env.GOOGLE_DRIVE_WEB_APP_URL;
  const secret = process.env.GOOGLE_DRIVE_WEB_APP_SECRET;
  if (!url || !secret) throw new Error("The Google Apps Script bridge is not configured.");
  return { url, secret };
}

async function calendarBridge(action, payload = {}) {
  const { url, secret } = bridgeConfig();
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BRIDGE_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "POST",
        redirect: "follow",
        signal: controller.signal,
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, secret, ...payload }),
      });
      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error("Google Calendar bridge returned an invalid response."); }
      if (!response.ok || !data.ok) throw new Error(data.error || `Google Calendar bridge failed (${response.status}).`);
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 300 * (2 ** attempt)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function getCalendarStatus() {
  try {
    const data = await calendarBridge("calendarStatus");
    return data.calendar;
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

async function testCalendarConnection() {
  const data = await calendarBridge("calendarTest");
  return data.calendar;
}

function isConfirmedStatus(status) {
  return ["SCHEDULED", "CONFIRMED", "IN PROGRESS", "COMPLETED"].includes(String(status || "").trim().toUpperCase());
}

async function syncJobCalendar(job, context = {}) {
  const hasAppointment = Boolean(job["Appointment Date"] && job["Appointment Time"]);
  const canceled = String(job["Job Status"] || "").trim().toUpperCase() === "CANCELED";
  if (!canceled && (!hasAppointment || !isConfirmedStatus(job["Job Status"]))) {
    return { eventId: job["Calendar Event ID"] || "", status: "Not scheduled", lastSyncedAt: "", error: "" };
  }
  const data = await calendarBridge("calendarSync", {
    eventId: job["Calendar Event ID"] || "",
    jobId: job["Job ID"],
    customerName: context.customerName || "Customer",
    serviceType: job["Service Type"] || "Service Appointment",
    address: context.address || "",
    appointmentDate: job["Appointment Date"],
    appointmentTime: job["Appointment Time"],
    durationMinutes: Number(job["Estimated Duration Minutes"] || 60),
    jobStatus: job["Job Status"],
    notes: job["Technician Notes"] || job["Service Description"] || "",
  });
  return data.calendar;
}

module.exports = { getCalendarStatus, isConfirmedStatus, syncJobCalendar, testCalendarConnection };
