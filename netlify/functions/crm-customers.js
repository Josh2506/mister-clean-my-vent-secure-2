const { requireSession } = require("./_shared/auth");
const { appendRecord, findRecordById, getRows, updateRecord } = require("./_shared/google-sheets");
const { customerFromBody, customerToClient, isArchived } = require("./_shared/crm-records");
const { json, readJson } = require("./_shared/http");

function matchesSearch(customer, search) {
  if (!search) {
    return true;
  }
  const text = [
    customer.name,
    customer.phone,
    customer.email,
    customer.streetAddress,
    customer.city,
    customer.leadSource,
    customer.neighborhood,
    customer.notes,
  ].join(" ").toLowerCase();
  return text.includes(search.toLowerCase());
}

exports.handler = async function handler(event) {
  const auth = requireSession(event);
  if (auth.response) {
    return auth.response;
  }

  try {
    if (event.httpMethod === "GET") {
      const search = event.queryStringParameters?.search || "";
      const rows = await getRows("Customers");
      const customers = rows
        .filter((row) => !isArchived(row))
        .map(customerToClient)
        .filter((customer) => matchesSearch(customer, search))
        .sort((a, b) => a.name.localeCompare(b.name));
      return json(200, { customers });
    }

    if (event.httpMethod === "POST") {
      const body = readJson(event);
      const customer = customerFromBody(body);
      await appendRecord("Customers", customer);
      return json(201, { customer: customerToClient(customer) });
    }

    if (event.httpMethod === "PUT") {
      const body = readJson(event);
      const customerId = body.customerId || body.id;
      const existing = await findRecordById("Customers", "Customer ID", customerId);
      if (!existing) {
        return json(404, { error: "Customer not found." });
      }
      const updated = customerFromBody({ ...body, customerId }, existing);
      await updateRecord("Customers", existing.rowNumber, updated);
      return json(200, { customer: customerToClient(updated) });
    }

    if (event.httpMethod === "DELETE") {
      const customerId = event.queryStringParameters?.id;
      const existing = await findRecordById("Customers", "Customer ID", customerId);
      if (!existing) {
        return json(404, { error: "Customer not found." });
      }
      const archived = customerFromBody({ ...existing, customerId, archived: "TRUE", customerStatus: "Archived" }, existing);
      await updateRecord("Customers", existing.rowNumber, archived);
      return json(200, { ok: true });
    }

    return json(405, { error: "Method not allowed." });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "CRM customer request failed." });
  }
};

