const { requireSession } = require("./_shared/auth");
const { getRowsBatch, withSheetsMetrics } = require("./_shared/google-sheets");
const { customerToClient, dateDiffDays, expenseToClient, hasCustomerData, hasJobData, isArchived, jobToClient, todayDate } = require("./_shared/crm-records");
const { json } = require("./_shared/http");

const EXPENSE_CATEGORIES = ["Gas / Fuel", "Parts & Materials", "Tools & Equipment", "Vehicle / Maintenance", "Advertising / Marketing", "Subcontractor / Labor", "Office / Business Supplies", "Insurance", "Other Business Expense"];

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
    const { result, metrics } = await withSheetsMetrics(async () => {
    const rows = await getRowsBatch(["Customers", "Jobs", "Expenses"]);
    const customerRows = rows.Customers;
    const jobRows = rows.Jobs;
    const customers = customerRows.filter(hasCustomerData).filter((row) => !isArchived(row)).map(customerToClient);
    const jobs = jobRows.filter(hasJobData).filter((row) => !isArchived(row)).map(jobToClient);
    const expenses = rows.Expenses.filter((row) => row["Expense ID"] && !isArchived(row)).map(expenseToClient);
    const customerById = new Map(customers.map((customer) => [customer.id, customer]));
    const jobById = new Map(jobs.map((job) => [job.id, job]));
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

    const categoryTotals = {};
    const expenseTotal = expenses.reduce((total, expense) => {
      const amount = Number(expense.totalAmount || 0);
      const safeAmount = Number.isFinite(amount) ? amount : 0;
      categoryTotals[expense.category] = (categoryTotals[expense.category] || 0) + safeAmount;
      return total + safeAmount;
    }, 0);

    return {
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
      customers,
      jobs,
      expenses: expenses.map((expense) => ({
        ...expense,
        customer: customerById.get(expense.customerId) || null,
        job: jobById.get(expense.jobId) || null,
      })),
      expenseSummary: { total: expenseTotal, categoryTotals },
      expenseCategories: EXPENSE_CATEGORIES,
    };
    });
    return json(200, result, {
      "X-CRM-Sheets-Reads": String(metrics.reads),
      "X-CRM-Sheets-Writes": String(metrics.writes),
      "X-CRM-Sheets-Retries": String(metrics.retries),
    });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "CRM dashboard request failed." });
  }
};
