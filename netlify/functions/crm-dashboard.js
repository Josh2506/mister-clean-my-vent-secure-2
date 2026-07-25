const { requireSession } = require("./_shared/auth");
const { getRows } = require("./_shared/google-sheets");
const { customerToClient, dateDiffDays, hasCustomerData, hasJobData, isArchived, jobToClient, todayDate } = require("./_shared/crm-records");
const { json } = require("./_shared/http");

function latestDueByCustomer(jobs) {
  const dueMap = new Map();
  jobs.forEach((job) => {
    if (!job.nextServiceDate) {
      return;
    }
    const existing = dueMap.get(job.customerId);
    if (!existing || String(job.nextServiceDate).localeCompare(existing.nextServiceDate) > 0) {
      dueMap.set(job.customerId, job);
    }
  });
  return dueMap;
}

exports.handler = async function handler(event) {
  const auth = requireSession(event);
  if (auth.response) {
    return auth.response;
  }

  try {
    const [customerRows, jobRows] = await Promise.all([getRows("Customers"), getRows("Jobs")]);
    const customers = customerRows.filter(hasCustomerData).filter((row) => !isArchived(row)).map(customerToClient);
    const jobs = jobRows.filter(hasJobData).filter((row) => !isArchived(row)).map(jobToClient);
    const customerById = new Map(customers.map((customer) => [customer.id, customer]));
    const today = todayDate();

    const todayJobs = jobs
      .filter((job) => job.appointmentDate === today && job.jobStatus !== "Canceled")
      .map((job) => ({ ...job, customer: customerById.get(job.customerId) || null }));

    const dueMap = latestDueByCustomer(jobs);
    const dueRecords = Array.from(dueMap.values())
      .map((job) => ({
        ...job,
        customer: customerById.get(job.customerId) || null,
        daysUntilDue: dateDiffDays(job.nextServiceDate, today),
      }))
      .filter((record) => record.customer && record.daysUntilDue !== null);

    const overdue = dueRecords.filter((record) => record.daysUntilDue < 0).sort((a, b) => a.daysUntilDue - b.daysUntilDue);
    const dueSoon30 = dueRecords.filter((record) => record.daysUntilDue >= 0 && record.daysUntilDue <= 30).sort((a, b) => a.daysUntilDue - b.daysUntilDue);
    const dueSoon60 = dueRecords.filter((record) => record.daysUntilDue > 30 && record.daysUntilDue <= 60).sort((a, b) => a.daysUntilDue - b.daysUntilDue);
    const dueSoon90 = dueRecords.filter((record) => record.daysUntilDue > 60 && record.daysUntilDue <= 90).sort((a, b) => a.daysUntilDue - b.daysUntilDue);
    const unpaidJobs = jobs
      .filter((job) => !["Paid", "Not Invoiced"].includes(job.paymentStatus))
      .map((job) => ({ ...job, customer: customerById.get(job.customerId) || null }));

    return json(200, {
      today,
      stats: {
        customers: customers.length,
        jobs: jobs.length,
        todayJobs: todayJobs.length,
        overdue: overdue.length,
        dueSoon30: dueSoon30.length,
        unpaidJobs: unpaidJobs.length,
      },
      todayJobs,
      overdue,
      dueSoon30,
      dueSoon60,
      dueSoon90,
      unpaidJobs,
    });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "CRM dashboard request failed." });
  }
};
