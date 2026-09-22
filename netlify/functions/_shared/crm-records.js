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
  Taxable: ["Taxable", "Is Taxable", "Taxable Service"],
  Subtotal: ["Subtotal", "Pre-Tax Amount"],
  "Sales Tax": ["Sales Tax", "Tax Amount"],
  "Total Amount": ["Total Amount", "Total", "Amount Including Tax"],
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
  "Estimated Duration Minutes": ["Estimated Duration Minutes", "Duration Minutes"],
  "Calendar Event ID": ["Calendar Event ID", "Google Calendar Event ID"],
  "Calendar Sync Status": ["Calendar Sync Status"],
  "Calendar Last Synced At": ["Calendar Last Synced At"],
  "Calendar Sync Error": ["Calendar Sync Error"],
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
    "Subtotal",
    "Total Amount",
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

const NJ_SALES_TAX_RATE = 0.06625;

function moneyNumber(value) {
  const amount = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function roundMoney(value) {
  return Math.round((moneyNumber(value) + Number.EPSILON) * 100) / 100;
}

function moneyString(value) {
  return roundMoney(value).toFixed(2);
}

function isTaxableValue(value) {
  return ["TRUE", "YES", "TAXABLE", "1"].includes(clean(value).toUpperCase());
}

function calculateJobAmounts(subtotalValue, taxableValue) {
  const subtotal = roundMoney(subtotalValue);
  const salesTax = isTaxableValue(taxableValue) ? roundMoney(subtotal * NJ_SALES_TAX_RATE) : 0;
  return {
    subtotal: moneyString(subtotal),
    salesTax: moneyString(salesTax),
    totalAmount: moneyString(subtotal + salesTax),
  };
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
    ...existing,
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

  const hasBodyField = (camelName, sheetName) => Object.prototype.hasOwnProperty.call(body, camelName)
    || Object.prototype.hasOwnProperty.call(body, sheetName);
  const taxableInput = hasBodyField("taxable", "Taxable")
    ? (Object.prototype.hasOwnProperty.call(body, "taxable") ? body.taxable : body.Taxable)
    : readRecordValue(existing, "Taxable");
  const taxable = isTaxableValue(taxableInput);
  const subtotalInput = Object.prototype.hasOwnProperty.call(body, "subtotal")
    ? body.subtotal
    : clean(body.Subtotal)
      ? body.Subtotal
      : Object.prototype.hasOwnProperty.call(body, "finalPrice")
        ? body.finalPrice
        : Object.prototype.hasOwnProperty.call(body, "Final Price")
          ? body["Final Price"]
          : readRecordValue(existing, "Subtotal") || readRecordValue(existing, "Final Price") || readRecordValue(existing, "Quoted Price");
  const hasAmount = clean(subtotalInput) !== "";
  if (hasAmount && (!Number.isFinite(Number(String(subtotalInput).replace(/[$,]/g, ""))) || moneyNumber(subtotalInput) < 0)) {
    const error = new Error("Enter a valid subtotal amount.");
    error.statusCode = 400;
    throw error;
  }
  const amounts = hasAmount ? calculateJobAmounts(subtotalInput, taxable ? "TRUE" : "FALSE") : { subtotal: "", salesTax: "", totalAmount: "" };

  return {
    ...existing,
    "Job ID": existing["Job ID"] || body.jobId || id("job"),
    "Customer ID": customerId,
    "Appointment Date": bodyField("appointmentDate", "Appointment Date"),
    "Appointment Time": bodyField("appointmentTime", "Appointment Time"),
    "Job Status": bodyField("jobStatus", "Job Status") || "Scheduled",
    "Service Type": bodyField("serviceType", "Service Type") || "Dryer Vent Cleaning",
    "Service Description": bodyField("serviceDescription", "Service Description"),
    "Quoted Price": bodyField("quotedPrice", "Quoted Price"),
    "Final Price": amounts.subtotal,
    Taxable: taxable ? "TRUE" : "FALSE",
    Subtotal: amounts.subtotal,
    "Sales Tax": amounts.salesTax,
    "Total Amount": amounts.totalAmount,
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
    "Estimated Duration Minutes": bodyField("estimatedDurationMinutes", "Estimated Duration Minutes") || "60",
    "Calendar Event ID": bodyField("calendarEventId", "Calendar Event ID"),
    "Calendar Sync Status": bodyField("calendarSyncStatus", "Calendar Sync Status"),
    "Calendar Last Synced At": bodyField("calendarLastSyncedAt", "Calendar Last Synced At"),
    "Calendar Sync Error": bodyField("calendarSyncError", "Calendar Sync Error"),
    "Created At": existing["Created At"] || timestamp,
    "Updated At": timestamp,
    Archived: clean(body.archived || body.Archived || existing.Archived || "FALSE"),
  };
}

function jobToClient(record) {
  const taxable = isTaxableValue(readRecordValue(record, "Taxable"));
  const legacySubtotal = readRecordValue(record, "Subtotal") || readRecordValue(record, "Final Price") || readRecordValue(record, "Quoted Price");
  const calculated = clean(legacySubtotal) ? calculateJobAmounts(legacySubtotal, taxable ? "TRUE" : "FALSE") : { subtotal: "", salesTax: "", totalAmount: "" };
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
    taxable,
    subtotal: readRecordValue(record, "Subtotal") || calculated.subtotal,
    salesTax: readRecordValue(record, "Sales Tax") || calculated.salesTax,
    totalAmount: readRecordValue(record, "Total Amount") || calculated.totalAmount,
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
    estimatedDurationMinutes: readRecordValue(record, "Estimated Duration Minutes") || "60",
    calendarEventId: readRecordValue(record, "Calendar Event ID"),
    calendarSyncStatus: readRecordValue(record, "Calendar Sync Status"),
    calendarLastSyncedAt: readRecordValue(record, "Calendar Last Synced At"),
    calendarSyncError: readRecordValue(record, "Calendar Sync Error"),
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
    ...existing,
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

function mileageFromBody(body, existing = {}, rate = 0) {
  const timestamp = nowIso();
  const value = (camelName, sheetName) => Object.prototype.hasOwnProperty.call(body, camelName)
    ? clean(body[camelName])
    : Object.prototype.hasOwnProperty.call(body, sheetName)
      ? clean(body[sheetName])
      : clean(existing[sheetName]);
  const date = value("date", "Date") || todayDate();
  const source = value("mileageSource", "Mileage Source") || "Odometer";
  const startText = value("startingOdometer", "Starting Odometer");
  const endText = value("endingOdometer", "Ending Odometer");
  const manualTotal = value("totalMiles", "Total Miles");
  const personalText = value("personalMiles", "Personal or Nonqualifying Miles") || "0";
  const numberOrError = (text, label, required = false) => {
    if (text === "" && !required) return null;
    const result = Number(text);
    if (!Number.isFinite(result) || result < 0) {
      const error = new Error(`${label} must be a non-negative number.`);
      error.statusCode = 400;
      throw error;
    }
    return result;
  };
  const start = numberOrError(startText, "Starting odometer", source === "Odometer");
  const end = numberOrError(endText, "Ending odometer", source === "Odometer");
  if (start !== null && end !== null && end < start) {
    const error = new Error("Ending odometer cannot be lower than starting odometer.");
    error.statusCode = 400;
    throw error;
  }
  const total = source === "Odometer" ? roundMoney(end - start) : roundMoney(numberOrError(manualTotal, "Total miles", true));
  const personal = roundMoney(numberOrError(personalText, "Personal or nonqualifying miles", true));
  if (personal > total) {
    const error = new Error("Personal or nonqualifying miles cannot exceed total miles.");
    error.statusCode = 400;
    throw error;
  }
  const business = roundMoney(total - personal);
  const appliedRate = Number(rate || value("irsRate", "IRS Rate") || 0);
  return {
    ...existing,
    "Mileage ID": existing["Mileage ID"] || body.mileageId || id("mil"),
    Date: date,
    Vehicle: value("vehicle", "Vehicle") || "2007 Toyota Tacoma",
    "Entry Type": value("entryType", "Entry Type") || "Day Route",
    "Starting Odometer": start === null ? "" : String(start),
    "Ending Odometer": end === null ? "" : String(end),
    "Total Miles": String(total),
    "Personal or Nonqualifying Miles": String(personal),
    "Eligible Business Miles": String(business),
    "Starting Location": value("startingLocation", "Starting Location"),
    Destinations: value("destinations", "Destinations"),
    "Business Purpose": value("businessPurpose", "Business Purpose"),
    "Mileage Source": source,
    "Review Status": value("reviewStatus", "Review Status") || (source === "Odometer" ? "Reviewed" : "Needs Review"),
    "Customer ID": value("customerId", "Customer ID"),
    "Job ID": value("jobId", "Job ID"),
    "IRS Rate": String(appliedRate),
    "Potential Deduction": moneyString(business * appliedRate),
    "Home Office Qualified": value("homeOfficeQualified", "Home Office Qualified") || "FALSE",
    "Parking and Tolls": moneyString(value("parkingAndTolls", "Parking and Tolls") || 0),
    Notes: value("notes", "Notes"),
    "Created At": existing["Created At"] || timestamp,
    "Updated At": timestamp,
    Archived: value("archived", "Archived") || "FALSE",
  };
}

function mileageToClient(record) {
  return {
    id: readRecordValue(record, "Mileage ID"), date: readRecordValue(record, "Date"), vehicle: readRecordValue(record, "Vehicle"),
    entryType: readRecordValue(record, "Entry Type"), startingOdometer: readRecordValue(record, "Starting Odometer"), endingOdometer: readRecordValue(record, "Ending Odometer"),
    totalMiles: readRecordValue(record, "Total Miles"), personalMiles: readRecordValue(record, "Personal or Nonqualifying Miles"), businessMiles: readRecordValue(record, "Eligible Business Miles"),
    startingLocation: readRecordValue(record, "Starting Location"), destinations: readRecordValue(record, "Destinations"), businessPurpose: readRecordValue(record, "Business Purpose"),
    mileageSource: readRecordValue(record, "Mileage Source"), reviewStatus: readRecordValue(record, "Review Status"), customerId: readRecordValue(record, "Customer ID"), jobId: readRecordValue(record, "Job ID"),
    irsRate: readRecordValue(record, "IRS Rate"), potentialDeduction: readRecordValue(record, "Potential Deduction"), homeOfficeQualified: readRecordValue(record, "Home Office Qualified") === "TRUE",
    parkingAndTolls: readRecordValue(record, "Parking and Tolls"), notes: readRecordValue(record, "Notes"), createdAt: readRecordValue(record, "Created At"), updatedAt: readRecordValue(record, "Updated At"),
  };
}

module.exports = {
  NJ_SALES_TAX_RATE,
  calculateJobAmounts,
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
  mileageFromBody,
  mileageToClient,
  nowIso,
  photoToClient,
  readRecordValue,
  todayDate,
};
