/**
 * Mister Clean My Vent CRM — MileIQ Gmail importer.
 *
 * Deploy this as a separate Apps Script project under the business Google account.
 * Script Properties required:
 *   MILEIQ_IMPORT_ENDPOINT=https://www.mistercleanmyvent.com/api/crm/mileiq-import
 *   MILEIQ_IMPORT_SECRET=<same random secret stored in Netlify>
 */
const MILEIQ_IMPORTED_LABEL = "MileIQ/Imported";
const MILEIQ_ERROR_LABEL = "MileIQ/Import Error";
const MILEIQ_QUERY = 'from:(mileiq.com) subject:("Your mileage report is ready") newer_than:1y -label:"MileIQ/Imported"';

function importMileIQReports() {
  const importedLabel = label_(MILEIQ_IMPORTED_LABEL);
  const errorLabel = label_(MILEIQ_ERROR_LABEL);
  const threads = GmailApp.search(MILEIQ_QUERY, 0, 20);
  const results = [];
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (message) {
      if (messageHasLabel_(message, importedLabel)) return;
      try {
        const csvUrl = csvDownloadUrl_(message.getBody());
        const response = UrlFetchApp.fetch(csvUrl, { followRedirects: true, muteHttpExceptions: true });
        if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error("MileIQ CSV download returned HTTP " + response.getResponseCode() + ".");
        const result = sendCsvToCrm_(message, response.getContentText());
        thread.addLabel(importedLabel);
        thread.removeLabel(errorLabel);
        results.push(result);
      } catch (error) {
        thread.addLabel(errorLabel);
        console.error("MileIQ import failed for Gmail message " + message.getId() + ": " + error.message);
      }
    });
  });
  return results;
}

function installMileIQImporter() {
  label_(MILEIQ_IMPORTED_LABEL);
  label_(MILEIQ_ERROR_LABEL);
  ScriptApp.getProjectTriggers().filter(function (trigger) { return trigger.getHandlerFunction() === "importMileIQReports"; })
    .forEach(function (trigger) { ScriptApp.deleteTrigger(trigger); });
  ScriptApp.newTrigger("importMileIQReports").timeBased().everyHours(1).create();
  return importMileIQReports();
}

function csvDownloadUrl_(html) {
  const anchors = String(html || "").match(/<a\b[^>]*href=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/gi) || [];
  const csvAnchor = anchors.find(function (anchor) { return /download\s+as\s+csv/i.test(anchor.replace(/<[^>]+>/g, " ")); });
  if (!csvAnchor) throw new Error("The MileIQ CSV download link was not found in this email.");
  const match = csvAnchor.match(/href=["']([^"']+)["']/i);
  if (!match) throw new Error("The MileIQ CSV link is invalid.");
  return decodeHtml_(match[1]);
}

function sendCsvToCrm_(message, csv) {
  const properties = PropertiesService.getScriptProperties();
  const endpoint = properties.getProperty("MILEIQ_IMPORT_ENDPOINT");
  const secret = properties.getProperty("MILEIQ_IMPORT_SECRET");
  if (!endpoint || !secret) throw new Error("MILEIQ_IMPORT_ENDPOINT and MILEIQ_IMPORT_SECRET must be configured in Script Properties.");
  const payload = {
    secret: secret,
    gmailMessageId: message.getId(),
    reportId: message.getId(),
    reportName: message.getSubject(),
    csv: csv,
  };
  const response = UrlFetchApp.fetch(endpoint, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  const data = JSON.parse(response.getContentText() || "{}");
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 || !data.ok) throw new Error(data.error || "CRM rejected the MileIQ import.");
  return data;
}

function messageHasLabel_(message, label) {
  return message.getThread().getLabels().some(function (current) { return current.getName() === label.getName(); });
}

function label_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function decodeHtml_(value) {
  return String(value || "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}
