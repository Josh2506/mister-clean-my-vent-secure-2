const { requireSession } = require("./_shared/auth");
const { getRowsBatch, withSheetsMetrics } = require("./_shared/google-sheets");
const { cashCommitmentToClient, customerToClient, dateDiffDays, expenseToClient, hasCustomerData, hasJobData, isArchived, jobToClient, ownerTransactionToClient, todayDate } = require("./_shared/crm-records");
const { mileageToClient } = require("./_shared/crm-records");
const { getCalendarStatus } = require("./_shared/google-calendar");
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
    const [rows, calendar] = await Promise.all([
      getRowsBatch(["Customers", "Jobs", "Expenses", "Mileage", "Mileage Rates", "CRM Settings", "Mileage Documents", "Owner Transactions", "Cash Commitments"]),
      getCalendarStatus(),
    ]);
    const customerRows = rows.Customers;
    const jobRows = rows.Jobs;
    const customers = customerRows.filter(hasCustomerData).filter((row) => !isArchived(row)).map(customerToClient);
    const jobs = jobRows.filter(hasJobData).filter((row) => !isArchived(row)).map(jobToClient);
    const expenses = rows.Expenses.filter((row) => row["Expense ID"] && !isArchived(row)).map(expenseToClient);
    const mileage = rows.Mileage.filter((row) => row["Mileage ID"] && !isArchived(row)).map(mileageToClient)
      .sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`));
    const defaultMileageRates = [
      { id: "rate_2026_h1", start: "2026-01-01", end: "2026-06-30", rate: 0.725, source: "IRS standard mileage rate", active: true },
      { id: "rate_2026_h2", start: "2026-07-01", end: "2026-12-31", rate: 0.76, source: "IRS standard mileage rate", active: true },
    ];
    const mileageRateMap = new Map(defaultMileageRates.map((rate) => [rate.id, rate]));
    rows["Mileage Rates"].filter((row) => row["Rate ID"] && String(row.Active || "TRUE").toUpperCase() !== "FALSE")
      .forEach((row) => mileageRateMap.set(row["Rate ID"], { id: row["Rate ID"], start: row["Effective Start"], end: row["Effective End"], rate: Number(row["Business Rate"] || 0), source: row.Source, notes: row.Notes, active: true }));
    const mileageRates = [...mileageRateMap.values()].sort((a, b) => a.start.localeCompare(b.start));
    const mileageSettings = Object.fromEntries(rows["CRM Settings"].filter((row) => row["Setting Key"]).map((row) => [row["Setting Key"], row["Setting Value"]]));
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
    const ownerTransactions = rows["Owner Transactions"].filter((row) => row["Transaction ID"] && !isArchived(row)).map(ownerTransactionToClient);
    const cashCommitments = rows["Cash Commitments"].filter((row) => row["Commitment ID"] && !isArchived(row)).map(cashCommitmentToClient);
    const ownerSettings = { RECONCILED_BANK_BALANCE: "", RECONCILED_BANK_BALANCE_AS_OF: "", RECONCILED_BANK_BALANCE_STATUS: "Unreconciled", FEDERAL_INCOME_TAX_RESERVE_PERCENT: "10", SELF_EMPLOYMENT_TAX_RESERVE_PERCENT: "15.3", NJ_INCOME_TAX_RESERVE_PERCENT: "3", MINIMUM_OPERATING_CASH_RESERVE: "1000", LLC_TAX_CLASSIFICATION: "Needs Confirmation", ...mileageSettings };
    const currentMonth = today.slice(0, 7); const currentYear = today.slice(0, 4);
    const amountFor = (type, period) => ownerTransactions.filter((tx) => tx.transactionType === type && tx.date.startsWith(period)).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const paidCompletedJobs = jobs.filter((job) => job.paymentStatus === "Paid" && (job.jobStatus === "Completed" || job.dateCompleted));
    const revenue = paidCompletedJobs.reduce((sum, job) => sum + Number(job.subtotal || job.finalPrice || job.quotedPrice || 0), 0);
    const collectedSalesTax = paidCompletedJobs.reduce((sum, job) => sum + Number(job.salesTax || 0), 0);
    const businessProfit = revenue - expenseTotal;
    const federalTaxReserve = Math.max(0, businessProfit * Math.max(0, Number(ownerSettings.FEDERAL_INCOME_TAX_RESERVE_PERCENT || 0)) / 100);
    const selfEmploymentTaxReserve = Math.max(0, businessProfit * Math.max(0, Number(ownerSettings.SELF_EMPLOYMENT_TAX_RESERVE_PERCENT || 0)) / 100);
    const njIncomeTaxReserve = Math.max(0, businessProfit * Math.max(0, Number(ownerSettings.NJ_INCOME_TAX_RESERVE_PERCENT || 0)) / 100);
    const configuredIncomeTaxReserve = federalTaxReserve + selfEmploymentTaxReserve + njIncomeTaxReserve;
    const estimatedTaxPayments = ownerTransactions.filter((tx) => tx.transactionType === "Estimated Tax Payment").reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const taxPaymentsByCategory = ownerTransactions.filter((tx) => tx.transactionType === "Estimated Tax Payment").reduce((totals, tx) => {
      const category = tx.taxCategory || "Uncategorized Estimated Tax";
      totals[category] = (totals[category] || 0) + Number(tx.amount || 0);
      return totals;
    }, {});
    const salesTaxPayments = ownerTransactions.filter((tx) => tx.transactionType === "Sales Tax Payment").reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const salesTaxLiability = Math.max(0, collectedSalesTax - salesTaxPayments);
    const openCommitments = cashCommitments.filter((item) => !["Paid", "Canceled"].includes(item.status));
    const commitmentsTotal = openCommitments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const bankBalance = Number(ownerSettings.RECONCILED_BANK_BALANCE);
    const balanceDate = ownerSettings.RECONCILED_BANK_BALANCE_AS_OF;
    const balanceAge = balanceDate ? Math.abs(dateDiffDays(balanceDate, today)) : null;
    const balanceVerified = Number.isFinite(bankBalance) && balanceDate && ownerSettings.RECONCILED_BANK_BALANCE_STATUS === "Reconciled" && balanceAge <= 45;
    const operatingReserve = Math.max(0, Number(ownerSettings.MINIMUM_OPERATING_CASH_RESERVE || 0));
    const incomeTaxReserveRemaining = Math.max(0, configuredIncomeTaxReserve - estimatedTaxPayments);
    const availableForDraw = balanceVerified ? Math.max(0, bankBalance - salesTaxLiability - commitmentsTotal - incomeTaxReserveRemaining - operatingReserve) : null;
    const monthRevenue = paidCompletedJobs.filter((job) => String(job.dateCompleted || job.appointmentDate).startsWith(currentMonth)).reduce((sum, job) => sum + Number(job.totalAmount || job.subtotal || job.finalPrice || 0), 0);
    const monthCashExpenses = expenses.filter((expense) => expense.date.startsWith(currentMonth) && expense.paymentSource !== "Personal Funds").reduce((sum, expense) => sum + Number(expense.totalAmount || 0), 0);
    const monthContributions = amountFor("Owner's Contribution", currentMonth); const monthDraws = amountFor("Owner's Draw", currentMonth);
    const monthTaxPayments = ownerTransactions.filter((tx) => ["Estimated Tax Payment", "Sales Tax Payment"].includes(tx.transactionType) && tx.date.startsWith(currentMonth)).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const monthOtherCash = ownerTransactions.filter((tx) => tx.transactionType === "Other Cash Adjustment" && tx.date.startsWith(currentMonth)).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const monthEndingCash = balanceVerified ? bankBalance : null;
    const monthStartingCash = balanceVerified ? monthEndingCash - monthRevenue - monthContributions + monthCashExpenses + monthDraws + monthTaxPayments - monthOtherCash : null;
    const yearRevenue = paidCompletedJobs.filter((job) => String(job.dateCompleted || job.appointmentDate).startsWith(currentYear)).reduce((sum, job) => sum + Number(job.totalAmount || job.subtotal || job.finalPrice || 0), 0);
    const yearCashExpenses = expenses.filter((expense) => expense.date.startsWith(currentYear) && expense.paymentSource !== "Personal Funds").reduce((sum, expense) => sum + Number(expense.totalAmount || 0), 0);
    const yearContributions = amountFor("Owner's Contribution", currentYear); const yearDraws = amountFor("Owner's Draw", currentYear);
    const yearTaxPayments = ownerTransactions.filter((tx) => ["Estimated Tax Payment", "Sales Tax Payment"].includes(tx.transactionType) && tx.date.startsWith(currentYear)).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const yearOtherCash = ownerTransactions.filter((tx) => tx.transactionType === "Other Cash Adjustment" && tx.date.startsWith(currentYear)).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const ownerFinance = { transactions: ownerTransactions, commitments: cashCommitments, settings: ownerSettings,
      summary: { currentRecordedCash: Number.isFinite(bankBalance) ? bankBalance : null, balanceAsOf: balanceDate, balanceVerified, balanceAge,
        drawsMonth: amountFor("Owner's Draw", currentMonth), drawsYear: amountFor("Owner's Draw", currentYear), contributionsMonth: amountFor("Owner's Contribution", currentMonth), contributionsYear: amountFor("Owner's Contribution", currentYear),
        revenue, businessProfit, expenseTotal, commitmentsTotal, federalTaxReserve, selfEmploymentTaxReserve, njIncomeTaxReserve, estimatedTaxReserve: configuredIncomeTaxReserve, incomeTaxReserveRemaining, estimatedTaxPayments, taxPaymentsByCategory,
        collectedSalesTax, salesTaxPayments, salesTaxLiability, operatingReserve, availableForDraw,
        monthly: { month: currentMonth, startingCash: monthStartingCash, customerPayments: monthRevenue, ownerContributions: monthContributions, businessCashExpenses: monthCashExpenses, ownerDraws: monthDraws, taxPayments: monthTaxPayments, otherCash: monthOtherCash, endingCash: monthEndingCash },
        annual: { year: currentYear, customerPayments: yearRevenue, ownerContributions: yearContributions, businessCashExpenses: yearCashExpenses, ownerDraws: yearDraws, taxPayments: yearTaxPayments, otherCash: yearOtherCash },
        personalExpenseContributions: expenses.filter((e) => e.paymentSource === "Personal Funds" && e.ownerFundingTreatment === "Owner Contribution").reduce((s,e) => s + Number(e.totalAmount || 0), 0),
        reimbursementsPending: expenses.filter((e) => e.paymentSource === "Personal Funds" && e.reimbursementStatus === "Awaiting Reimbursement").reduce((s,e) => s + Number(e.totalAmount || 0), 0) } };

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
      mileage,
      mileageRates,
      mileageSettings: { DEFAULT_VEHICLE: "2007 Toyota Tacoma", HOME_OFFICE_QUALIFIED: "FALSE", ...mileageSettings },
      mileageDocuments: rows["Mileage Documents"].filter((row) => row["Document ID"] && !isArchived(row)).map((row) => ({ id: row["Document ID"], mileageId: row["Mileage ID"], category: row.Category, fileName: row["File Name"], mimeType: row["MIME Type"], googleDriveFileId: row["Google Drive File ID"], googleDriveFileUrl: row["Google Drive File URL"], uploadedAt: row["Uploaded At"] })),
      calendar,
      ownerFinance,
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
