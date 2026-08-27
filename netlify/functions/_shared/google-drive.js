const path = require("path");

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function getRootFolderId() {
  const folderId = process.env.GOOGLE_DRIVE_CRM_FOLDER_ID;
  if (!folderId) throw new Error("GOOGLE_DRIVE_CRM_FOLDER_ID is not configured.");
  return folderId;
}

function getBridgeConfig() {
  const url = process.env.GOOGLE_DRIVE_WEB_APP_URL;
  const secret = process.env.GOOGLE_DRIVE_WEB_APP_SECRET;
  if (!url || !secret) throw new Error("The Google Drive upload bridge is not configured.");
  return { url, secret };
}

function safeName(value, fallback = "File") {
  return String(value || fallback).normalize("NFKD").replace(/[^a-zA-Z0-9 ._&()-]+/g, "-").replace(/\s+/g, " ").replace(/^\.+|\.+$/g, "").trim().slice(0, 140) || fallback;
}

function slugPart(value, fallback = "File") {
  return safeName(value, fallback).replace(/\s+/g, "-").replace(/&/g, "and");
}

function decodeUpload(file) {
  if (!file?.base64 || !file?.name) {
    const error = new Error("Choose a file to upload.");
    error.statusCode = 400;
    throw error;
  }
  const bytes = Buffer.from(file.base64, "base64");
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) {
    const error = new Error("Files must be between 1 byte and 4 MB.");
    error.statusCode = 413;
    throw error;
  }
  return { bytes, mimeType: file.type || "application/octet-stream" };
}

async function bridgeRequest(action, payload = {}) {
  const { url, secret } = getBridgeConfig();
  const response = await fetch(url, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, secret, ...payload }),
  });
  const responseText = await response.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Google Drive upload bridge returned an invalid response (${response.status}).`);
  }
  if (!response.ok || !data.ok) {
    const error = new Error(data.error || `Google Drive upload bridge failed with status ${response.status}.`);
    error.statusCode = data.statusCode || (response.status === 404 ? 404 : 502);
    throw error;
  }
  return data;
}

async function ensureFolder(name, parentId) {
  const folderName = safeName(name, "Other");
  const data = await bridgeRequest("ensureFolder", { name: folderName, parentId });
  return { id: data.folder.id, name: data.folder.name, url: data.folder.url };
}

async function folderPath(parts, startId = getRootFolderId()) {
  let folder = { id: startId, url: `https://drive.google.com/drive/folders/${startId}` };
  for (const part of parts.filter(Boolean)) folder = await ensureFolder(part, folder.id);
  return folder;
}

async function uploadFile({ file, parentId, fileName }) {
  const { bytes, mimeType } = decodeUpload(file);
  const data = await bridgeRequest("uploadFile", { parentId, fileName: safeName(fileName || file.name, "Upload"), mimeType, base64: bytes.toString("base64") });
  return { id: data.file.id, name: data.file.name, mimeType: data.file.mimeType || mimeType, webViewLink: data.file.url, url: data.file.url };
}

async function downloadFile(fileId) {
  const data = await bridgeRequest("downloadFile", { fileId });
  return { id: data.file.id, name: data.file.name, mimeType: data.file.mimeType, bytes: Buffer.from(data.file.base64, "base64") };
}

async function trashFile(fileId) {
  await bridgeRequest("trashFile", { fileId });
}

function expenseFileName({ date, vendor, total, customerName, originalName }) {
  const extension = path.extname(originalName || "") || ".jpg";
  return [date, customerName, vendor, Number(total || 0).toFixed(2)].filter(Boolean).map((part) => slugPart(part)).join("_") + extension.toLowerCase();
}

function signedWorkOrderFileName({ date, customerName, originalName }) {
  const extension = path.extname(originalName || "") || ".jpg";
  return `${[date, customerName, "Signed Work Order"].filter(Boolean).map((part) => slugPart(part)).join("_")}${extension.toLowerCase()}`;
}

module.exports = { downloadFile, ensureFolder, expenseFileName, folderPath, getRootFolderId, safeName, signedWorkOrderFileName, trashFile, uploadFile };
