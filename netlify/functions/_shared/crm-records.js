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

function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function isArchived(record) {
  return String(record.Archived || "").toUpperCase() === "TRUE";
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
    "General Notes",
  ].some((field) => clean(record[field]));
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
  ].some((field) => clean(record[field]));
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
  return {
    id: record["Customer ID"],
    firstName: record["First Name"],
    lastName: record["Last Name"],
    name: `${record["First Name"] || ""} ${record["Last Name"] || ""}`.trim(),
    phone: record.Phone,
    email: record.Email,
    streetAddress: record["Street Address"],
    city: record.City,
    state: record.State,
    zipCode: record["ZIP Code"],
    leadSource: record["Lead Source"],
    neighborhood: record["Neighborhood or Community"],
    preferredContactMethod: record["Preferred Contact Method"],
    dateAdded: record["Date Added"],
    customerStatus: record["Customer Status"],
    notes: record["General Notes"],
    createdAt: record["Created At"],
    updatedAt: record["Updated At"],
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
    id: record["Job ID"],
    customerId: record["Customer ID"],
    appointmentDate: record["Appointment Date"],
    appointmentTime: record["Appointment Time"],
    jobStatus: record["Job Status"],
    serviceType: record["Service Type"],
    serviceDescription: record["Service Description"],
    quotedPrice: record["Quoted Price"],
    finalPrice: record["Final Price"],
    paymentStatus: record["Payment Status"],
    paymentMethod: record["Payment Method"],
    technicianNotes: record["Technician Notes"],
    beforePhotoFolderUrl: record["Before Photo Folder URL"],
    afterPhotoFolderUrl: record["After Photo Folder URL"],
    dateCompleted: record["Date Completed"],
    nextServiceDate: record["Next Service Date"],
    createdAt: record["Created At"],
    updatedAt: record["Updated At"],
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
  todayDate,
};
