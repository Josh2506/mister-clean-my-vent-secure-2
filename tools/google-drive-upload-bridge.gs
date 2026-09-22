/**
 * Mister Clean My Vent CRM — Google Drive and Calendar bridge.
 * Deploy as a web app that executes as the business account owner. Store the shared
 * secret in Script Properties under CRM_DRIVE_BRIDGE_SECRET.
 */
const CRM_DRIVE_ROOT_FOLDER_ID = "1GKzwuPAzs__1ssBP4VEsgv97Dii-oiRN";
// Leave blank in source control. A deployment may use this private value or the
// CRM_DRIVE_BRIDGE_SECRET Script Property.
const CRM_DRIVE_BRIDGE_SECRET = "";
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function doPost(event) {
  try {
    const request = JSON.parse(event.postData.contents || "{}");
    verifySecret_(request.secret);
    let result;
    if (request.action === "ensureFolder") result = ensureFolder_(request);
    else if (request.action === "uploadFile") result = uploadFile_(request);
    else if (request.action === "downloadFile") result = downloadFile_(request);
    else if (request.action === "trashFile") result = trashFile_(request);
    else if (request.action === "calendarStatus") result = calendarStatus_();
    else if (request.action === "calendarTest") result = calendarTest_();
    else if (request.action === "calendarSync") result = calendarSync_(request);
    else throw new Error("Unsupported CRM bridge action.");
    return json_({ ok: true, ...result });
  } catch (error) {
    return json_({ ok: false, error: error.message || "Drive bridge request failed." });
  }
}

function verifySecret_(providedSecret) {
  const configuredSecret = PropertiesService.getScriptProperties().getProperty("CRM_DRIVE_BRIDGE_SECRET") || CRM_DRIVE_BRIDGE_SECRET;
  if (!configuredSecret || !providedSecret || configuredSecret !== providedSecret) throw new Error("Drive bridge authorization failed.");
}

function rootFolder_() {
  return DriveApp.getFolderById(CRM_DRIVE_ROOT_FOLDER_ID);
}

function assertAllowedFolder_(folder) {
  if (folder.getId() === rootFolder_().getId()) return;
  let current = folder;
  for (let depth = 0; depth < 12; depth += 1) {
    const parents = current.getParents();
    if (!parents.hasNext()) break;
    current = parents.next();
    if (current.getId() === rootFolder_().getId()) return;
  }
  throw new Error("The requested folder is outside the CRM Drive folder.");
}

function assertAllowedFile_(file) {
  const parents = file.getParents();
  while (parents.hasNext()) {
    try {
      assertAllowedFolder_(parents.next());
      return;
    } catch (error) {
      // Check the next parent.
    }
  }
  throw new Error("The requested file is outside the CRM Drive folder.");
}

function ensureFolder_(request) {
  const parent = DriveApp.getFolderById(String(request.parentId || ""));
  assertAllowedFolder_(parent);
  const name = safeName_(request.name, "Other");
  const matches = parent.getFoldersByName(name);
  const folder = matches.hasNext() ? matches.next() : parent.createFolder(name);
  return { folder: { id: folder.getId(), name: folder.getName(), url: folder.getUrl() } };
}

function uploadFile_(request) {
  const parent = DriveApp.getFolderById(String(request.parentId || ""));
  assertAllowedFolder_(parent);
  const bytes = Utilities.base64Decode(String(request.base64 || ""));
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) throw new Error("Files must be between 1 byte and 4 MB.");
  const name = uniqueFileName_(parent, safeName_(request.fileName, "Upload"));
  const blob = Utilities.newBlob(bytes, String(request.mimeType || "application/octet-stream"), name);
  return { file: fileData_(parent.createFile(blob)) };
}

function downloadFile_(request) {
  const file = DriveApp.getFileById(String(request.fileId || ""));
  assertAllowedFile_(file);
  const blob = file.getBlob();
  return { file: { ...fileData_(file), base64: Utilities.base64Encode(blob.getBytes()) } };
}

function trashFile_(request) {
  const file = DriveApp.getFileById(String(request.fileId || ""));
  assertAllowedFile_(file);
  file.setTrashed(true);
  return { file: { id: file.getId(), trashed: true } };
}

function uniqueFileName_(folder, requestedName) {
  const dot = requestedName.lastIndexOf(".");
  const base = dot > 0 ? requestedName.slice(0, dot) : requestedName;
  const extension = dot > 0 ? requestedName.slice(dot) : "";
  let candidate = requestedName;
  let counter = 2;
  while (folder.getFilesByName(candidate).hasNext()) {
    candidate = base + "_" + String(counter).padStart(3, "0") + extension;
    counter += 1;
  }
  return candidate;
}

function safeName_(value, fallback) {
  return String(value || fallback).normalize("NFKD").replace(/[^a-zA-Z0-9 ._&()-]+/g, "-").replace(/\s+/g, " ").replace(/^\.+|\.+$/g, "").trim().slice(0, 140) || fallback;
}

function fileData_(file) {
  return { id: file.getId(), name: file.getName(), mimeType: file.getMimeType(), url: file.getUrl() };
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function businessCalendar_() {
  const calendarId = PropertiesService.getScriptProperties().getProperty("CRM_CALENDAR_ID");
  if (!calendarId) throw new Error("CRM_CALENDAR_ID is not configured in Script Properties.");
  const calendar = CalendarApp.getCalendarById(calendarId);
  if (!calendar) throw new Error("The configured business calendar is unavailable to this Google account.");
  return calendar;
}

function calendarData_(calendar, extra) {
  return Object.assign({
    connected: true,
    id: calendar.getId(),
    name: calendar.getName(),
    timeZone: calendar.getTimeZone(),
    lastSync: PropertiesService.getScriptProperties().getProperty("CRM_CALENDAR_LAST_SYNC") || "",
  }, extra || {});
}

function calendarStatus_() {
  return { calendar: calendarData_(businessCalendar_()) };
}

function calendarTest_() {
  const calendar = businessCalendar_();
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 5 * 60 * 1000);
  const event = calendar.createEvent("[CRM TEST] Connection verification", start, end, {
    description: "Temporary Mister Clean My Vent CRM write-access test. This event is removed immediately.",
    sendInvites: false,
  });
  event.deleteEvent();
  return { calendar: calendarData_(calendar, { writeTest: true, testedAt: new Date().toISOString() }) };
}

function appointmentDate_(dateText, timeText) {
  const dateParts = String(dateText || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateParts) throw new Error("A valid appointment date is required for Calendar sync.");
  const timeMatch = String(timeText || "").trim().match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
  if (!timeMatch) throw new Error("A valid appointment time is required for Calendar sync.");
  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const meridiem = String(timeMatch[3] || "").toUpperCase();
  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  return new Date(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]), hour, minute, 0, 0);
}

function findJobEvent_(calendar, request, start) {
  if (request.eventId) {
    const exact = calendar.getEventById(String(request.eventId));
    if (exact) return exact;
  }
  const from = new Date(start.getTime() - 3 * 24 * 60 * 60 * 1000);
  const to = new Date(start.getTime() + 4 * 24 * 60 * 60 * 1000);
  const events = calendar.getEvents(from, to);
  for (let index = 0; index < events.length; index += 1) {
    if (events[index].getTag("crmJobId") === String(request.jobId)) return events[index];
    if (events[index].getDescription().indexOf("CRM Job: " + String(request.jobId)) >= 0) return events[index];
  }
  return null;
}

function calendarSync_(request) {
  if (!request.jobId) throw new Error("Job ID is required for Calendar sync.");
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const calendar = businessCalendar_();
    const status = String(request.jobStatus || "").trim().toUpperCase();
    const canceled = status === "CANCELED";
    const confirmed = ["SCHEDULED", "CONFIRMED", "IN PROGRESS", "COMPLETED"].indexOf(status) >= 0;
    if (!canceled && !confirmed) return { calendar: { eventId: String(request.eventId || ""), status: "Not scheduled", lastSyncedAt: "", error: "" } };
    const start = appointmentDate_(request.appointmentDate, request.appointmentTime);
    const duration = Math.max(15, Math.min(720, Number(request.durationMinutes || 60)));
    const end = new Date(start.getTime() + duration * 60 * 1000);
    let event = findJobEvent_(calendar, request, start);
    if (canceled && !event) return { calendar: { eventId: "", status: "Canceled — no event found", lastSyncedAt: new Date().toISOString(), error: "" } };
    const baseTitle = String(request.serviceType || "Service Appointment") + " — " + String(request.customerName || "Customer");
    const title = canceled ? "CANCELED — " + baseTitle : baseTitle;
    const description = [
      "CRM Job: " + String(request.jobId),
      "Status: " + String(request.jobStatus || ""),
      "Service: " + String(request.serviceType || ""),
      "Customer: " + String(request.customerName || ""),
      request.notes ? "Notes: " + String(request.notes) : "",
    ].filter(Boolean).join("\n");
    if (!event) {
      event = calendar.createEvent(title, start, end, { description: description, location: String(request.address || ""), sendInvites: false });
      event.setTag("crmJobId", String(request.jobId));
    } else {
      event.setTitle(title);
      event.setDescription(description);
      event.setLocation(String(request.address || ""));
      event.setTime(start, end);
      event.setTag("crmJobId", String(request.jobId));
    }
    const syncedAt = new Date().toISOString();
    PropertiesService.getScriptProperties().setProperty("CRM_CALENDAR_LAST_SYNC", syncedAt);
    return { calendar: { eventId: event.getId(), status: canceled ? "Canceled" : "Synced", lastSyncedAt: syncedAt, error: "" } };
  } finally {
    lock.releaseLock();
  }
}
