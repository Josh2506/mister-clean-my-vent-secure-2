const crypto = require("crypto");

function nowIso() {
  return new Date().toISOString();
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function clean(value) {
  return String(value || "").trim();
}

const recordFieldAliases = {
  "Customer ID": ["Customer ID", "Customer Id", "ID", "Id"],
  "First Name": ["First Name", "First", "Name", "Full Name", "Customer Name"],
  "Last Name": ["Last Name", "Last"],
  Phone: ["Phone", "Phone Number", "Customer Phone", "Mobile"],
  Email: ["Email", "Email Address", "Customer Email"],
  "Street Address": ["Street Address", "Address", "Service Address", "Customer Address"],
  City: ["City", "Town"],
  State: ["State"],
  "ZIP Code": ["ZIP Code", "Zip", "Zip Code", "Postal Code"],
  "Lead Source": ["Lead Source", "Source"],
  "Neighborhood or Community": ["Neighborhood or Community", "Neighborhood", "Community"],
  "Preferred Contact Method": ["Preferred Contact Method", "Preferred Contact", "Contact Method"],
  "Date Added": ["Date Added", "Created Date"],
  "Customer Status": ["Customer Status", "Status"],
  "General Notes": ["General Notes", "Notes", "Message", "Optional Message"],
  "Job ID": ["Job ID", "Job Id", "ID", "Id"],
  "Appointment Date": ["Appointment Date", "Date", "Service Date", "Job Date"],
  "Appointment Time": ["Appointment Time", "Time", "Service Time", "Job Time"],
  "Job Status": ["Job Status", "Status"],
  "Service Type": ["Service Type", "Service", "Service Name"],
  "Service Description": ["Service Description", "Description"],
  "Quoted Price": ["Quoted Price", "Estimate", "Estimated Price"],
  "Final Price": ["Final Price", "Price", "Job Price"],
  "Payment Status": ["Payment Status", "Paid Status"],
  "Payment Method": ["Payment Method"],
  "Technician Notes": ["Technician Notes", "Notes", "Job Notes"],
  "Before Photo Folder URL": ["Before Photo Folder URL", "Before Photos"],
  "After Photo Folder URL": ["After Photo Folder URL", "After Photos"],
  "Date Completed": ["Date Completed", "Completed Date"],
  "Next Service Date": ["Next Service Date", "Next Recommended Service Date", "Reminder Date"],
  "Google Drive Folder ID": ["Google Drive Folder ID", "Drive Folder ID"],
  "Google Drive Folder URL": ["Google Drive Folder URL", "Drive Folder URL"],
  "Signed Work Order File ID": ["Signed Work Order File ID"],
  "Signed Work Order URL": ["Signed Work Order URL"],
  "Signed Work Order File Name": ["Signed Work Order File Name"],
  "Signed Work Order Uploaded At": ["Signed Work Order Uploaded At"],
  "Created At": ["Created At"],
  "Updated At": ["Updated At"],
  Archived: ["Archived", "Archive"],
};

function readRecordValue(record = {}, fieldName) {
  const names = recordFieldAliases[fieldName] || [fieldName];
  const matchedName = names.find((name) => clean(record[name]));
  return matchedName ? clean(record[matchedName]) : clean(record[fieldName]);
}

function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function isArchived(record) {
  return readRecordValue(record, "Archived").toUpperCase() === "TRUE";
}

function hasCustomerData(record) {
  return [
    "First Name",
    "Last Name",
    "Phone",
    "Email",
    "Street Address",
    "City",
    "ZIP Code",
    "Lead Source",
    "Neighborhood or Community",
    "Preferred Contact Method",
    "General Notes",
  ].some((field) => readRecordValue(record, field));
}

function hasJobData(record) {
  return [
    "Appointment Date",
    "Service Type",
    "Service Description",
    "Quoted Price",
    "Final Price",
    "Technician Notes",
    "Next Service Date",
  ].some((field) => readRecordValue(record, field));
}

function normalizePhone(value) {
  const digits = clean(value).replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return clean(value);
}

function customerFromBody(body, existing = {}) {
  const timestamp = nowIso();
  const firstName = clean(body.firstName || body["First Name"] || existing["First Name"]);
  const lastName = clean(body.lastName || body["Last Name"] || existing["Last Name"]);

  if (!firstName && !lastName) {
    const error = new Error("Customer first or last name is required.");
    error.statusCode = 400;
    throw error;
  }

  return {
    "Customer ID": existing["Customer ID"] || body.customerId || id("cus"),
    "First Name": firstName,
    "Last Name": lastName,
    Phone: normalizePhone(body.phone || body.Phone || existing.Phone),
    Email: clean(body.email || body.Email || existing.Email),
    "Street Address": clean(body.streetAddress || body["Street Address"] || existing["Street Address"]),
    City: clean(body.city || body.City || existing.City),
    State: clean(body.state || body.State || existing.State || "NJ"),
    "ZIP Code": clean(body.zipCode || body["ZIP Code"] || existing["ZIP Code"]),
    "Lead Source": clean(body.leadSource || body["Lead Source"] || existing["Lead Source"]),
    "Neighborhood or Community": clean(body.neighborhood || body["Neighborhood or Community"] || existing["Neighborhood or Community"]),
    "Preferred Contact Method": clean(body.preferredContactMethod || body["Preferred Contact Method"] || existing["Preferred Contact Method"]),
    "Date Added": clean(body.dateAdded || body["Date Added"] || existing["Date Added"] || todayDate()),
    "Customer Status": clean(body.customerStatus || body["Customer Status"] || existing["Customer Status"] || "Active"),
    "General Notes": clean(body.notes || body["General Notes"] || existing["General Notes"]),
    "Created At": existing["Created At"] || timestamp,
    "Updated At": timestamp,
    Archived: clean(body.archived || body.Archived || existing.Archived || "FALSE"),
  };
}

function customerToClient(record) {
  const firstName = readRecordValue(record, "First Name");
  const lastName = readRecordValue(record, "Last Name");

  return {
    id: readRecordValue(record, "Customer ID"),
    firstName,
    lastName,
    name: `${firstName || ""} ${lastName || ""}`.trim(),
    phone: readRecordValue(record, "Phone"),
    email: readRecordValue(record, "Email"),
    streetAddress: readRecordValue(record, "Street Address"),
    city: readRecordValue(record, "City"),
    state: readRecordValue(record, "State"),
    zipCode: readRecordValue(record, "ZIP Code"),
    leadSource: readRecordValue(record, "Lead Source"),
    neighborhood: readRecordValue(record, "Neighborhood or Community"),
    preferredContactMethod: readRecordValue(record, "Preferred Contact Method"),
    dateAdded: readRecordValue(record, "Date Added"),
    customerStatus: readRecordValue(record, "Customer Status"),
    notes: readRecordValue(record, "General Notes"),
    createdAt: readRecordValue(record, "Created At"),
    updatedAt: readRecordValue(record, "Updated At"),
  };
}

function jobFromBody(body, existing = {}) {
  const timestamp = nowIso();
  const customerId = clean(body.customerId || body["Customer ID"] || existing["Customer ID"]);
  const bodyField = (camelName, sheetName) => {
    if (Object.prototype.hasOwnProperty.call(body, camelName)) return clean(body[camelName]);
    if (Object.prototype.hasOwnProperty.call(body, sheetName)) return clean(body[sheetName]);
    return clean(existing[sheetName]);
  };
  if (!customerId) {
    const error = new Error("Customer ID is required.");
    error.statusCode = 400;
    throw error;
  }

  return {
    "Job ID": existing["Job ID"] || body.jobId || id("job"),
    "Customer ID": customerId,
    "Appointment Date": bodyField("appointmentDate", "Appointment Date"),
    "Appointment Time": bodyField("appointmentTime", "Appointment Time"),
    "Job Status": bodyField("jobStatus", "Job Status") || "Scheduled",
    "Service Type": bodyField("serviceType", "Service Type") || "Dryer Vent Cleaning",
    "Service Description": bodyField("serviceDescription", "Service Description"),
    "Quoted Price": bodyField("quotedPrice", "Quoted Price"),
    "Final Price": bodyField("finalPrice", "Final Price"),
    "Payment Status": bodyField("paymentStatus", "Payment Status") || "Not Invoiced",
    "Payment Method": bodyField("paymentMethod", "Payment Method"),
    "Technician Notes": bodyField("technicianNotes", "Technician Notes"),
    "Before Photo Folder URL": bodyField("beforePhotoFolderUrl", "Before Photo Folder URL"),
    "After Photo Folder URL": bodyField("afterPhotoFolderUrl", "After Photo Folder URL"),
    "Date Completed": bodyField("dateCompleted", "Date Completed"),
    "Next Service Date": bodyField("nextServiceDate", "Next Service Date"),
    "Google Drive Folder ID": bodyField("googleDriveFolderId", "Google Drive Folder ID"),
    "Google Drive Folder URL": bodyField("googleDriveFolderUrl", "Google Drive Folder URL"),
    "Signed Work Order File ID": bodyField("signedWorkOrderFileId", "Signed Work Order File ID"),
    "Signed Work Order URL": bodyField("signedWorkOrderUrl", "Signed Work Order URL"),
    "Signed Work Order File Name": bodyField("signedWorkOrderFileName", "Signed Work Order File Name"),
    "Signed Work Order Uploaded At": bodyField("signedWorkOrderUploadedAt", "Signed Work Order Uploaded At"),
    "Created At": existing["Created At"] || timestamp,
    "Updated At": timestamp,
    Archived: clean(body.archived || body.Archived || existing.Archived || "FALSE"),
  };
}

function jobToClient(record) {
  return {
    id: readRecordValue(record, "Job ID"),
    customerId: readRecordValue(record, "Customer ID"),
    appointmentDate: readRecordValue(record, "Appointment Date"),
    appointmentTime: readRecordValue(record, "Appointment Time"),
    jobStatus: readRecordValue(record, "Job Status"),
    serviceType: readRecordValue(record, "Service Type"),
    serviceDescription: readRecordValue(record, "Service Description"),
    quotedPrice: readRecordValue(record, "Quoted Price"),
    finalPrice: readRecordValue(record, "Final Price"),
    paymentStatus: readRecordValue(record, "Payment Status"),
    paymentMethod: readRecordValue(record, "Payment Method"),
    technicianNotes: readRecordValue(record, "Technician Notes"),
    beforePhotoFolderUrl: readRecordValue(record, "Before Photo Folder URL"),
    afterPhotoFolderUrl: readRecordValue(record, "After Photo Folder URL"),
    dateCompleted: readRecordValue(record, "Date Completed"),
    nextServiceDate: readRecordValue(record, "Next Service Date"),
    googleDriveFolderId: readRecordValue(record, "Google Drive Folder ID"),
    googleDriveFolderUrl: readRecordValue(record, "Google Drive Folder URL"),
    signedWorkOrderFileId: readRecordValue(record, "Signed Work Order File ID"),
    signedWorkOrderUrl: readRecordValue(record, "Signed Work Order URL"),
    signedWorkOrderFileName: readRecordValue(record, "Signed Work Order File Name"),
    signedWorkOrderUploadedAt: readRecordValue(record, "Signed Work Order Uploaded At"),
    createdAt: readRecordValue(record, "Created At"),
    updatedAt: readRecordValue(record, "Updated At"),
  };
}

function dateDiffDays(dateString, baseDate = todayDate()) {
  if (!dateString) {
    return null;
  }
  const target = new Date(`${dateString}T00:00:00`);
  const base = new Date(`${baseDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) {
    return null;
  }
  return Math.round((target.getTime() - base.getTime()) / 86400000);
}

function expenseFromBody(body, existing = {}) {
  const timestamp = nowIso();
  const bodyField = (camelName, sheetName) => {
    if (Object.prototype.hasOwnProperty.call(body, camelName)) return clean(body[camelName]);
    if (Object.prototype.hasOwnProperty.call(body, sheetName)) return clean(body[sheetName]);
    return clean(existing[sheetName]);
  };
  const vendor = bodyField("vendor", "Vendor");
  const total = clean(body.totalAmount ?? body["Total Amount"] ?? existing["Total Amount"]);
  if (!vendor) {
    const error = new Error("Vendor / Store is required.");
    error.statusCode = 400;
    throw error;
  }
  if (total === "" || Number.isNaN(Number(total)) || Number(total) < 0) {
    const error = new Error("Enter a valid total amount.");
    error.statusCode = 400;
    throw error;
  }
  return {
    "Expense ID": existing["Expense ID"] || body.expenseId || id("exp"),
    Date: bodyField("date", "Date") || todayDate(),
    Vendor: vendor,
    Category: bodyField("category", "Category") || "Other Business Expense",
    Description: bodyField("description", "Description"),
    Subtotal: clean(body.subtotal ?? body.Subtotal ?? existing.Subtotal),
    "Sales Tax": clean(body.salesTax ?? body["Sales Tax"] ?? existing["Sales Tax"]),
    "Total Amount": total,
    "Payment Method": bodyField("paymentMethod", "Payment Method"),
    Notes: bodyField("notes", "Notes"),
    "Customer ID": bodyField("customerId", "Customer ID"),
    "Job ID": bodyField("jobId", "Job ID"),
    "Receipt File Name": bodyField("receiptFileName", "Receipt File Name"),
    "Receipt MIME Type": bodyField("receiptMimeType", "Receipt MIME Type"),
    "Google Drive File ID": bodyField("googleDriveFileId", "Google Drive File ID"),
    "Google Drive File URL": bodyField("googleDriveFileUrl", "Google Drive File URL"),
    "Created At": existing["Created At"] || timestamp,
    "Updated At": timestamp,
    Archived: clean(body.archived || body.Archived || existing.Archived || "FALSE"),
  };
}

function expenseToClient(record) {
  return {
    id: readRecordValue(record, "Expense ID"),
    date: readRecordValue(record, "Date"),
    vendor: readRecordValue(record, "Vendor"),
    category: readRecordValue(record, "Category"),
    description: readRecordValue(record, "Description"),
    subtotal: readRecordValue(record, "Subtotal"),
    salesTax: readRecordValue(record, "Sales Tax"),
    totalAmount: readRecordValue(record, "Total Amount"),
    paymentMethod: readRecordValue(record, "Payment Method"),
    notes: readRecordValue(record, "Notes"),
    customerId: readRecordValue(record, "Customer ID"),
    jobId: readRecordValue(record, "Job ID"),
    receiptFileName: readRecordValue(record, "Receipt File Name"),
    receiptMimeType: readRecordValue(record, "Receipt MIME Type"),
    googleDriveFileId: readRecordValue(record, "Google Drive File ID"),
    googleDriveFileUrl: readRecordValue(record, "Google Drive File URL"),
    createdAt: readRecordValue(record, "Created At"),
    updatedAt: readRecordValue(record, "Updated At"),
  };
}

function photoToClient(record) {
  return {
    id: readRecordValue(record, "Photo ID"), jobId: readRecordValue(record, "Job ID"), customerId: readRecordValue(record, "Customer ID"),
    category: readRecordValue(record, "Category"), notes: readRecordValue(record, "Notes"), fileName: readRecordValue(record, "File Name"),
    mimeType: readRecordValue(record, "MIME Type"), googleDriveFileId: readRecordValue(record, "Google Drive File ID"),
    googleDriveFileUrl: readRecordValue(record, "Google Drive File URL"), uploadedAt: readRecordValue(record, "Uploaded At"),
  };
}

function documentToClient(record) {
  return {
    id: readRecordValue(record, "Document ID"), jobId: readRecordValue(record, "Job ID"), customerId: readRecordValue(record, "Customer ID"),
    documentType: readRecordValue(record, "Document Type"), fileName: readRecordValue(record, "File Name"), mimeType: readRecordValue(record, "MIME Type"),
    notes: readRecordValue(record, "Notes"), googleDriveFileId: readRecordValue(record, "Google Drive File ID"),
    googleDriveFileUrl: readRecordValue(record, "Google Drive File URL"), uploadedAt: readRecordValue(record, "Uploaded At"),
  };
}

module.exports = {
  clean,
  customerFromBody,
  customerToClient,
  dateDiffDays,
  documentToClient,
  expenseFromBody,
  expenseToClient,
  hasCustomerData,
  hasJobData,
  id,
  isArchived,
  jobFromBody,
  jobToClient,
  nowIso,
  photoToClient,
  readRecordValue,
  todayDate,
};
