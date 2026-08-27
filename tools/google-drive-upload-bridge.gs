/**
 * Mister Clean My Vent CRM — Google Drive upload bridge.
 * Deploy as a web app that executes as the Drive owner. Store the shared
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
    else throw new Error("Unsupported Drive bridge action.");
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
