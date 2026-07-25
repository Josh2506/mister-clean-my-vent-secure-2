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
  if (!customerId) {
    const error = new Error("Customer ID is required.");
    error.statusCode = 400;
    throw error;
  }

  return {
    "Job ID": existing["Job ID"] || body.jobId || id("job"),
    "Customer ID": customerId,
    "Appointment Date": clean(body.appointmentDate || body["Appointment Date"] || existing["Appointment Date"]),
    "Appointment Time": clean(body.appointmentTime || body["Appointment Time"] || existing["Appointment Time"]),
    "Job Status": clean(body.jobStatus || body["Job Status"] || existing["Job Status"] || "Scheduled"),
    "Service Type": clean(body.serviceType || body["Service Type"] || existing["Service Type"] || "Dryer Vent Cleaning"),
    "Service Description": clean(body.serviceDescription || body["Service Description"] || existing["Service Description"]),
    "Quoted Price": clean(body.quotedPrice || body["Quoted Price"] || existing["Quoted Price"]),
    "Final Price": clean(body.finalPrice || body["Final Price"] || existing["Final Price"]),
    "Payment Status": clean(body.paymentStatus || body["Payment Status"] || existing["Payment Status"] || "Not Invoiced"),
    "Payment Method": clean(body.paymentMethod || body["Payment Method"] || existing["Payment Method"]),
    "Technician Notes": clean(body.technicianNotes || body["Technician Notes"] || existing["Technician Notes"]),
    "Before Photo Folder URL": clean(body.beforePhotoFolderUrl || body["Before Photo Folder URL"] || existing["Before Photo Folder URL"]),
    "After Photo Folder URL": clean(body.afterPhotoFolderUrl || body["After Photo Folder URL"] || existing["After Photo Folder URL"]),
    "Date Completed": clean(body.dateCompleted || body["Date Completed"] || existing["Date Completed"]),
    "Next Service Date": clean(body.nextServiceDate || body["Next Service Date"] || existing["Next Service Date"]),
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

module.exports = {
  clean,
  customerFromBody,
  customerToClient,
  dateDiffDays,
  hasCustomerData,
  hasJobData,
  id,
  isArchived,
  jobFromBody,
  jobToClient,
  nowIso,
  readRecordValue,
  todayDate,
};
