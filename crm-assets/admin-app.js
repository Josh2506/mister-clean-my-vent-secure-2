const app = document.querySelector("#crm-app");
const inFlightGetRequests = new Map();

const state = {
  customers: [],
  selectedCustomer: null,
  dashboard: null,
  jobs: [],
  allJobs: [],
  expenses: [],
  expenseSummary: { total: 0, categoryTotals: {} },
  expenseCategories: [],
  selectedJob: null,
  dashboardMonth: "",
  taxYear: "",
  mileage: [],
  mileageRates: [],
  mileageSettings: { DEFAULT_VEHICLE: "2007 Toyota Tacoma", HOME_OFFICE_QUALIFIED: "FALSE" },
  mileageDocuments: [],
  mileageYear: "",
  calendar: { connected: false },
};

const defaultExpenseCategories = [
  "Gas / Fuel", "Parts & Materials", "Tools & Equipment", "Vehicle / Maintenance",
  "Advertising / Marketing", "Subcontractor / Labor", "Office / Business Supplies",
  "Insurance", "Other Business Expense",
];

const photoCategories = ["Before", "During", "After", "Damage", "Equipment / Setup", "Receipt / Material", "Other"];
const documentTypes = ["Estimate", "Invoice", "Receipt", "Service Certificate", "Customer Document", "Insurance Document", "Other"];

const serviceOptions = [
  "Dryer Vent Cleaning",
  "Exterior Dryer Vent Cleaning",
  "Bird Nest Removal",
  "Dryer Vent Inspection",
  "Gutter Cleaning",
  "Gutter Guard Installation",
  "House Washing",
  "Driveway Cleaning",
  "Sidewalk Cleaning",
  "Patio Cleaning",
  "Pressure Washing",
  "Other",
];

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function api(path, options = {}) {
  const method = options.method || "GET";
  if (method === "GET" && inFlightGetRequests.has(path)) return inFlightGetRequests.get(path);
  const request = (async () => {
    const requestPath = method === "GET" ? `${path}${path.includes("?") ? "&" : "?"}_=${Date.now()}` : path;
    const response = await fetch(requestPath, {
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "CRM request failed.");
    return data;
  })();
  if (method === "GET") inFlightGetRequests.set(path, request);
  try {
    return await request;
  } finally {
    if (method === "GET") inFlightGetRequests.delete(path);
  }
}

function showNotice(message, type = "success") {
  const notice = document.querySelector("#crm-toast");
  if (!notice) {
    return;
  }
  notice.textContent = message;
  notice.classList.toggle("error", type === "error");
  notice.classList.add("show");
  window.clearTimeout(showNotice.timeout);
  showNotice.timeout = window.setTimeout(() => {
    notice.classList.remove("show");
  }, 5200);
}

function switchScreen(screenName) {
  document.querySelectorAll(".crm-bottom-nav button").forEach((button) => {
    button.classList.toggle("active", button.dataset.screen === screenName);
  });
  document.querySelectorAll(".crm-screen").forEach((screen) => {
    screen.classList.toggle("active", screen.id === `screen-${screenName}`);
  });
}

function showLogin(message = "") {
  app.innerHTML = `
    <section class="crm-login">
      <form class="crm-login-card" id="login-form">
        <h1>Mister Clean My Vent CRM</h1>
        <p>Private customer and service dashboard.</p>
        <div class="crm-field">
          <label for="login-email">Email</label>
          <input id="login-email" name="email" type="email" autocomplete="username" required>
        </div>
        <div class="crm-field">
          <label for="login-password">Password</label>
          <input id="login-password" name="password" type="password" autocomplete="current-password" required>
        </div>
        <button class="crm-btn" type="submit">Log In</button>
        <p class="crm-status ${message ? "error" : ""}" id="login-status">${escapeHtml(message)}</p>
      </form>
    </section>
  `;

  document.querySelector("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = document.querySelector("#login-status");
    const submit = event.currentTarget.querySelector("button");
    submit.disabled = true;
    status.textContent = "Checking login...";
    status.classList.remove("error");
    try {
      await api("/api/crm/login", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),
      });
      await showDashboard();
    } catch (error) {
      status.textContent = error.message;
      status.classList.add("error");
    } finally {
      submit.disabled = false;
    }
  });
  bindMobileInputFocus(app);
}

function shell() {
  app.innerHTML = `
    <section class="crm-shell">
      <header class="crm-header">
        <div class="crm-brand">
          <img src="/assets/mister-clean-my-vent-logo.png" alt="Mister Clean My Vent">
          <div>
            <strong>Mister Clean My Vent CRM</strong>
            <span id="crm-user">Private dashboard</span>
          </div>
        </div>
        <button class="crm-btn secondary" id="logout-button" type="button">Log Out</button>
      </header>
      <nav class="crm-bottom-nav" aria-label="CRM navigation">
        <button type="button" class="active" data-screen="dashboard">Dashboard</button>
        <button type="button" data-screen="customers">Customers</button>
        <button type="button" data-screen="due">Due Soon</button>
        <button type="button" data-screen="expenses">Expenses</button>
        <button type="button" data-screen="sales-tax">Sales Tax</button>
        <button type="button" data-screen="mileage">Mileage</button>
        <button type="button" data-screen="profile">Profile</button>
      </nav>
      <div class="crm-toast" id="crm-toast" role="status" aria-live="polite"></div>
      <div class="crm-content">
        <section id="screen-dashboard" class="crm-screen active"></section>
        <section id="screen-customers" class="crm-screen"></section>
        <section id="screen-due" class="crm-screen"></section>
        <section id="screen-expenses" class="crm-screen"></section>
        <section id="screen-sales-tax" class="crm-screen"></section>
        <section id="screen-mileage" class="crm-screen"></section>
        <section id="screen-profile" class="crm-screen"></section>
      </div>
      <div class="crm-modal" id="customer-modal" aria-hidden="true"></div>
      <div class="crm-modal" id="job-modal" aria-hidden="true"></div>
      <div class="crm-modal" id="expense-modal" aria-hidden="true"></div>
      <div class="crm-modal" id="mileage-modal" aria-hidden="true"></div>
      <div class="crm-modal" id="asset-modal" aria-hidden="true"></div>
      <div class="crm-modal" id="preview-modal" aria-hidden="true"></div>
    </section>
  `;

  document.querySelector("#logout-button").addEventListener("click", async () => {
    await api("/api/crm/logout", { method: "POST" }).catch(() => null);
    showLogin();
  });

  document.querySelectorAll(".crm-bottom-nav button").forEach((button) => {
    button.addEventListener("click", () => {
      switchScreen(button.dataset.screen);
    });
  });
  bindMobileInputFocus(app);
}

function setModalLock() {
  const hasOpenModal = Boolean(document.querySelector(".crm-modal.open"));
  document.body.classList.toggle("crm-modal-lock", hasOpenModal);
}

function focusFirstEditableField(form) {
  const firstInput = form.querySelector("input:not([type='hidden']):not([disabled]), select:not([disabled]), textarea:not([disabled])");
  if (firstInput && window.matchMedia("(min-width: 821px)").matches) {
    window.setTimeout(() => firstInput.focus(), 80);
  }
}

function bindMobileInputFocus(root = document) {
  const editableFields = root.querySelectorAll("input:not([type='hidden']):not([disabled]), textarea:not([disabled]), select:not([disabled])");
  editableFields.forEach((fieldElement) => {
    if (fieldElement.dataset.mobileFocusBound === "true") {
      return;
    }
    fieldElement.dataset.mobileFocusBound = "true";
    fieldElement.addEventListener("touchend", () => {
      window.setTimeout(() => fieldElement.focus({ preventScroll: true }), 0);
    }, { passive: true });
  });
}

function toDateValue(dateString) {
  if (!dateString) {
    return 0;
  }
  const normalizedDate = String(dateString).slice(0, 10);
  const date = new Date(`${normalizedDate}T00:00:00`);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatDisplayDate(dateString) {
  if (!dateString) {
    return "Not set";
  }
  const normalizedDate = String(dateString).slice(0, 10);
  const date = new Date(`${normalizedDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return normalizedDate;
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number.isFinite(amount) ? amount : 0);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function fileUrl(fileId, download = false) {
  return `/api/crm/file?id=${encodeURIComponent(fileId)}${download ? "&download=true" : ""}`;
}

function fileToPayload(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (file.size > 4 * 1024 * 1024) return reject(new Error("Choose a file smaller than 4 MB."));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The selected file could not be read."));
    reader.onload = () => resolve({ name: file.name, type: file.type || "application/octet-stream", base64: String(reader.result).split(",")[1] || "" });
    reader.readAsDataURL(file);
  });
}

function showSelectedFilePreview(file, container) {
  if (!container) return;
  if (container.dataset.objectUrl) URL.revokeObjectURL(container.dataset.objectUrl);
  container.dataset.objectUrl = "";
  if (!file) { container.innerHTML = ""; return; }
  if (String(file.type || "").startsWith("image/") && !/hei[cf]/i.test(file.type || file.name)) {
    const objectUrl = URL.createObjectURL(file); container.dataset.objectUrl = objectUrl;
    container.innerHTML = `<img class="crm-local-preview" src="${objectUrl}" alt="Selected upload preview"><p>Check that the image is clear. Tap the upload button again to retake or choose another.</p>`;
  } else {
    container.innerHTML = `<p><strong>Selected:</strong> ${escapeHtml(file.name)}</p><p>Tap the upload button again to choose another file.</p>`;
  }
}

function customerById(id) {
  return state.customers.find((customer) => customer.id === id) || null;
}

function jobById(id) {
  return state.allJobs.find((job) => job.id === id) || null;
}

function jobLabel(job) {
  const customer = customerById(job.customerId);
  return `${customer?.name || "Customer"} - ${job.serviceType || "Service"} - ${formatDisplayDate(jobServiceDate(job))}`;
}

function jobServiceDate(job) {
  return job.dateCompleted || job.appointmentDate || (job.createdAt ? job.createdAt.slice(0, 10) : "");
}

function sortJobsNewestFirst(jobs) {
  return [...(jobs || [])].sort((jobA, jobB) => {
    const dateDifference = toDateValue(jobServiceDate(jobB)) - toDateValue(jobServiceDate(jobA));
    if (dateDifference !== 0) {
      return dateDifference;
    }
    return String(jobB.createdAt || "").localeCompare(String(jobA.createdAt || ""));
  });
}

function jobsForCustomer(customerId) {
  return sortJobsNewestFirst(state.allJobs.filter((job) => job.customerId === customerId));
}

function getCustomerServiceSummary(customerId) {
  const jobs = jobsForCustomer(customerId);
  const lastJob = jobs[0] || null;
  const nextServiceJob = jobs
    .filter((job) => job.nextServiceDate)
    .sort((jobA, jobB) => toDateValue(jobA.nextServiceDate) - toDateValue(jobB.nextServiceDate))[0] || null;

  return {
    count: jobs.length,
    lastJob,
    lastServiceDate: lastJob ? jobServiceDate(lastJob) : "",
    lastServiceType: lastJob?.serviceType || "",
    nextServiceDate: nextServiceJob?.nextServiceDate || "",
  };
}

function serviceVisitLabel(count) {
  return `${count} service visit${count === 1 ? "" : "s"}`;
}

function monthKey(dateString) {
  return String(dateString || "").slice(0, 7);
}

function monthLabel(month) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return "Selected month";
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function moneyValue(value) {
  const amount = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function jobSubtotal(job) {
  return moneyValue(job?.subtotal || job?.finalPrice || job?.quotedPrice);
}

function jobSalesTax(job) {
  return moneyValue(job?.salesTax);
}

function jobTotalAmount(job) {
  const savedTotal = moneyValue(job?.totalAmount);
  return savedTotal || jobSubtotal(job) + jobSalesTax(job);
}

function dashboardMonthOptions() {
  const currentMonth = monthKey(state.dashboard?.today || new Date().toISOString());
  const months = new Set([currentMonth]);
  state.allJobs.forEach((job) => {
    const month = monthKey(job.dateCompleted || job.appointmentDate);
    if (month) months.add(month);
  });
  return [...months].sort().reverse();
}

function monthlyJobSummary(month) {
  const monthJobs = state.allJobs.filter((job) => monthKey(job.dateCompleted || job.appointmentDate) === month);
  const completedJobs = monthJobs.filter((job) => job.jobStatus === "Completed" || Boolean(job.dateCompleted));
  const scheduledJobs = monthJobs.filter((job) => !["Completed", "Canceled"].includes(job.jobStatus) && !job.dateCompleted);
  const revenue = completedJobs.reduce((total, job) => total + jobSubtotal(job), 0);
  return {
    completedJobs: completedJobs.map((job) => ({ ...job, customer: customerById(job.customerId) })),
    scheduledJobs,
    revenue,
  };
}

function dayDifference(dateString, baseDate) {
  if (!dateString) return null;
  const target = new Date(`${dateString}T00:00:00`);
  const base = new Date(`${baseDate}T00:00:00`);
  if (Number.isNaN(target.getTime()) || Number.isNaN(base.getTime())) return null;
  return Math.round((target.getTime() - base.getTime()) / 86400000);
}

function rebuildDashboardFromState() {
  const today = state.dashboard?.today || todayIso();
  const customersById = new Map(state.customers.map((customer) => [customer.id, customer]));
  const withCustomer = (job) => ({ ...job, customer: customersById.get(job.customerId) || null });
  const todayJobs = state.allJobs.filter((job) => job.appointmentDate === today && job.jobStatus !== "Canceled").map(withCustomer);
  const latestDue = new Map();
  state.allJobs.forEach((job) => {
    if (!job.nextServiceDate) return;
    const existing = latestDue.get(job.customerId);
    if (!existing || String(job.nextServiceDate).localeCompare(existing.nextServiceDate) > 0) latestDue.set(job.customerId, job);
  });
  const dueRecords = [...latestDue.values()].map((job) => ({ ...withCustomer(job), daysUntilDue: dayDifference(job.nextServiceDate, today) }))
    .filter((job) => job.customer && job.daysUntilDue !== null);
  const overdue = dueRecords.filter((job) => job.daysUntilDue < 0).sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  const dueSoon30 = dueRecords.filter((job) => job.daysUntilDue >= 0 && job.daysUntilDue <= 30).sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  const dueSoon60 = dueRecords.filter((job) => job.daysUntilDue > 30 && job.daysUntilDue <= 60).sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  const dueSoon90 = dueRecords.filter((job) => job.daysUntilDue > 60 && job.daysUntilDue <= 90).sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  const unpaidJobs = state.allJobs.filter((job) => !["Paid", "Not Invoiced"].includes(job.paymentStatus)).map(withCustomer);
  state.dashboard = {
    ...(state.dashboard || {}),
    today,
    stats: {
      customers: state.customers.length,
      jobs: state.allJobs.length,
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
  };
}

function upsertJobInState(savedJob) {
  const existingIndex = state.allJobs.findIndex((job) => job.id === savedJob.id);
  if (existingIndex >= 0) state.allJobs[existingIndex] = savedJob;
  else state.allJobs.push(savedJob);
  state.allJobs = sortJobsNewestFirst(state.allJobs);
  if (state.selectedCustomer) state.jobs = jobsForCustomer(state.selectedCustomer.id);
  rebuildDashboardFromState();
}

function renderDashboard() {
  const dashboard = state.dashboard;
  const availableMonths = dashboardMonthOptions();
  if (!state.dashboardMonth || !availableMonths.includes(state.dashboardMonth)) state.dashboardMonth = monthKey(dashboard.today);
  const monthly = monthlyJobSummary(state.dashboardMonth);
  document.querySelector("#screen-dashboard").innerHTML = `
    <div class="crm-page-title">
      <h1>Today</h1>
      <p>${escapeHtml(dashboard.today)} service dashboard.</p>
      <div class="crm-actions">
        <button class="crm-btn" type="button" id="add-work-order-button">Add Work Order</button>
        <button class="crm-btn" type="button" id="add-customer-button">Add Customer</button>
        <button class="crm-btn" type="button" id="add-expense-button">Add Expense</button>
        <button class="crm-btn secondary" type="button" id="refresh-button">Refresh</button>
      </div>
    </div>
    <div class="crm-grid">
      <section class="crm-panel crm-col-4">
        <h2>Snapshot</h2>
        <div class="crm-stats">
          <div class="crm-stat"><strong>${dashboard.stats.todayJobs}</strong><span>Today</span></div>
          <div class="crm-stat"><strong>${dashboard.stats.overdue}</strong><span>Overdue</span></div>
          <div class="crm-stat"><strong>${dashboard.stats.dueSoon30}</strong><span>Due 30 Days</span></div>
          <div class="crm-stat"><strong>${dashboard.stats.customers}</strong><span>Customers</span></div>
        </div>
      </section>
      <section class="crm-panel crm-col-8">
        <h2>Today's Jobs</h2>
        <div class="crm-list">${renderJobCards(dashboard.todayJobs, true)}</div>
      </section>
      <section class="crm-panel crm-col-12">
        <div class="crm-panel-heading">
          <div><h2>Monthly Progress</h2><p>Completed work and scheduled jobs for ${escapeHtml(monthLabel(state.dashboardMonth))}.</p></div>
          <div class="crm-field crm-month-picker"><label for="dashboard-month">Month</label><select id="dashboard-month">${availableMonths.map((month) => `<option value="${escapeHtml(month)}" ${month === state.dashboardMonth ? "selected" : ""}>${escapeHtml(monthLabel(month))}</option>`).join("")}</select></div>
        </div>
        <div class="crm-stats crm-monthly-stats">
          <div class="crm-stat"><strong>${monthly.completedJobs.length}</strong><span>Jobs completed</span></div>
          <div class="crm-stat"><strong>${monthly.scheduledJobs.length}</strong><span>Still scheduled</span></div>
          <div class="crm-stat"><strong>${escapeHtml(formatMoney(monthly.revenue))}</strong><span>Completed revenue (before tax)</span></div>
        </div>
        <h3 class="crm-subheading">Jobs Done</h3>
        <div class="crm-list">${renderJobCards(monthly.completedJobs, true)}</div>
      </section>
      <section class="crm-panel crm-col-12">
        <h2>Unpaid or Partially Paid</h2>
        <div class="crm-list">${renderJobCards(dashboard.unpaidJobs, true)}</div>
      </section>
      <section class="crm-panel crm-col-12 crm-calendar-status">
        <div class="crm-panel-heading"><div><h2>Google Calendar</h2><p>${state.calendar.connected ? `Connected to ${escapeHtml(state.calendar.name || "business calendar")} · ${escapeHtml(state.calendar.timeZone || "America/New_York")}` : `Not connected${state.calendar.error ? ` · ${escapeHtml(state.calendar.error)}` : ""}`}</p></div><button class="crm-btn secondary" id="calendar-test" type="button">Test Calendar Connection</button></div>
        <p><strong>Status:</strong> ${state.calendar.connected ? "Connected" : "Needs setup"} · <strong>Last successful sync:</strong> ${escapeHtml(state.calendar.lastSync || "None yet")}</p>
      </section>
    </div>
  `;
  document.querySelector("#add-work-order-button").addEventListener("click", openWorkOrderPicker);
  document.querySelector("#add-customer-button").addEventListener("click", () => openCustomerModal());
  document.querySelector("#add-expense-button").addEventListener("click", () => openExpenseModal());
  document.querySelector("#refresh-button").addEventListener("click", showDashboard);
  document.querySelector("#dashboard-month").addEventListener("change", (event) => {
    state.dashboardMonth = event.target.value;
    renderDashboard();
  });
  document.querySelector("#calendar-test").addEventListener("click", async (event) => {
    const button = event.currentTarget; button.disabled = true; button.textContent = "Testing...";
    try { const result = await api("/api/crm/calendar", { method: "POST", body: "{}" }); state.calendar = result.calendar; renderDashboard(); showNotice("Google Calendar connection and write access verified."); }
    catch (error) { showNotice(error.message, "error"); button.disabled = false; button.textContent = "Test Calendar Connection"; }
  });
  bindJobButtons(document.querySelector("#screen-dashboard"));
}

function salesTaxYears() {
  const currentYear = String(state.dashboard?.today || todayIso()).slice(0, 4);
  const years = new Set([currentYear]);
  state.allJobs.forEach((job) => {
    if (job.paymentStatus !== "Paid" || !(job.jobStatus === "Completed" || job.dateCompleted)) return;
    const year = String(job.dateCompleted || job.appointmentDate || "").slice(0, 4);
    if (/^\d{4}$/.test(year)) years.add(year);
  });
  return [...years].sort().reverse();
}

function salesTaxReport(year) {
  const paidCompleted = state.allJobs.filter((job) => {
    const serviceDate = job.dateCompleted || job.appointmentDate || "";
    return job.paymentStatus === "Paid"
      && (job.jobStatus === "Completed" || Boolean(job.dateCompleted))
      && serviceDate.startsWith(`${year}-`);
  });
  const months = Array.from({ length: 12 }, (_, index) => ({
    index,
    label: new Date(Number(year), index, 1).toLocaleDateString(undefined, { month: "long" }),
    taxableSubtotal: 0,
    salesTax: 0,
    totalAmount: 0,
    jobs: 0,
  }));
  paidCompleted.forEach((job) => {
    const monthIndex = Number(String(job.dateCompleted || job.appointmentDate).slice(5, 7)) - 1;
    if (!months[monthIndex]) return;
    const taxable = Boolean(job.taxable) || jobSalesTax(job) > 0;
    if (taxable) months[monthIndex].taxableSubtotal += jobSubtotal(job);
    months[monthIndex].salesTax += jobSalesTax(job);
    months[monthIndex].totalAmount += jobTotalAmount(job);
    months[monthIndex].jobs += 1;
  });
  const quarters = Array.from({ length: 4 }, (_, quarterIndex) => {
    const quarterMonths = months.slice(quarterIndex * 3, quarterIndex * 3 + 3);
    return {
      label: `Q${quarterIndex + 1}`,
      taxableSubtotal: quarterMonths.reduce((sum, month) => sum + month.taxableSubtotal, 0),
      salesTax: quarterMonths.reduce((sum, month) => sum + month.salesTax, 0),
      totalAmount: quarterMonths.reduce((sum, month) => sum + month.totalAmount, 0),
      jobs: quarterMonths.reduce((sum, month) => sum + month.jobs, 0),
    };
  });
  return {
    months,
    quarters,
    taxableSubtotal: months.reduce((sum, month) => sum + month.taxableSubtotal, 0),
    salesTax: months.reduce((sum, month) => sum + month.salesTax, 0),
    totalAmount: months.reduce((sum, month) => sum + month.totalAmount, 0),
    jobs: paidCompleted.length,
  };
}

function renderSalesTax() {
  const screen = document.querySelector("#screen-sales-tax");
  if (!screen) return;
  const years = salesTaxYears();
  if (!state.taxYear || !years.includes(state.taxYear)) state.taxYear = years[0];
  const report = salesTaxReport(state.taxYear);
  screen.innerHTML = `
    <div class="crm-page-title">
      <h1>Sales Tax Summary</h1>
      <p>New Jersey sales tax collected from completed and paid work orders. Tax is kept separate from business revenue.</p>
    </div>
    <section class="crm-panel">
      <div class="crm-panel-heading">
        <div><h2>${escapeHtml(state.taxYear)} Yearly Summary</h2><p>Only taxable amounts marked on paid, completed services contribute to sales tax.</p></div>
        <div class="crm-field crm-month-picker"><label for="sales-tax-year">Year</label><select id="sales-tax-year">${years.map((year) => `<option value="${year}" ${year === state.taxYear ? "selected" : ""}>${year}</option>`).join("")}</select></div>
      </div>
      <div class="crm-stats crm-tax-year-stats">
        <div class="crm-stat"><strong>${formatMoney(report.taxableSubtotal)}</strong><span>Taxable sales subtotal</span></div>
        <div class="crm-stat"><strong>${formatMoney(report.salesTax)}</strong><span>Sales tax collected</span></div>
        <div class="crm-stat"><strong>${report.jobs}</strong><span>Completed and paid work orders</span></div>
      </div>
    </section>
    <section class="crm-panel crm-tax-section">
      <h2>Quarterly</h2>
      <div class="crm-tax-quarter-grid">${report.quarters.map((quarter) => `<article class="crm-card crm-tax-card"><h3>${quarter.label}</h3><p><span>Taxable subtotal</span><strong>${formatMoney(quarter.taxableSubtotal)}</strong></p><p><span>Sales tax</span><strong>${formatMoney(quarter.salesTax)}</strong></p><p><span>Paid work orders</span><strong>${quarter.jobs}</strong></p></article>`).join("")}</div>
    </section>
    <section class="crm-panel crm-tax-section">
      <h2>Monthly</h2>
      <div class="crm-tax-table-wrap"><table class="crm-tax-table"><thead><tr><th>Month</th><th>Paid Work Orders</th><th>Taxable Subtotal</th><th>Sales Tax Collected</th></tr></thead><tbody>${report.months.map((month) => `<tr><td>${month.label}</td><td>${month.jobs}</td><td>${formatMoney(month.taxableSubtotal)}</td><td><strong>${formatMoney(month.salesTax)}</strong></td></tr>`).join("")}</tbody></table></div>
    </section>`;
  screen.querySelector("#sales-tax-year").addEventListener("change", (event) => {
    state.taxYear = event.target.value;
    renderSalesTax();
  });
}

function mileageYears() {
  const current = String(state.dashboard?.today || todayIso()).slice(0, 4);
  return [...new Set([current, ...state.mileage.map((entry) => String(entry.date || "").slice(0, 4)).filter((year) => /^\d{4}$/.test(year))])].sort().reverse();
}

function mileageSummary(entries) {
  const totals = entries.reduce((summary, entry) => {
    summary.total += Number(entry.totalMiles || 0); summary.business += Number(entry.businessMiles || 0); summary.personal += Number(entry.personalMiles || 0);
    summary.deduction += Number(entry.potentialDeduction || 0); summary.parking += Number(entry.parkingAndTolls || 0); return summary;
  }, { total: 0, business: 0, personal: 0, deduction: 0, parking: 0 });
  const odometer = entries.filter((entry) => entry.startingOdometer !== "" && entry.endingOdometer !== "").sort((a, b) => a.date.localeCompare(b.date));
  totals.startOdometer = odometer[0]?.startingOdometer || "—";
  totals.endOdometer = odometer[odometer.length - 1]?.endingOdometer || "—";
  totals.businessUse = totals.total ? (totals.business / totals.total) * 100 : 0;
  return totals;
}

function mileagePeriodEntries(period) {
  const now = new Date(`${state.dashboard?.today || todayIso()}T12:00:00`);
  const year = state.mileageYear || String(now.getFullYear());
  const yearEntries = state.mileage.filter((entry) => String(entry.date).startsWith(`${year}-`));
  if (period === "year") return yearEntries;
  if (period === "month") return yearEntries.filter((entry) => String(entry.date).slice(0, 7) === `${year}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const day = now.getDay(); const monday = new Date(now); monday.setDate(now.getDate() - ((day + 6) % 7));
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const iso = (date) => date.toISOString().slice(0, 10);
  return yearEntries.filter((entry) => entry.date >= iso(monday) && entry.date <= iso(sunday));
}

function exportMileageCsv() {
  const entries = mileagePeriodEntries("year");
  const columns = ["Date", "Vehicle", "Entry Type", "Starting Odometer", "Ending Odometer", "Total Miles", "Personal/Nonqualifying Miles", "Eligible Business Miles", "Starting Location", "Destinations", "Business Purpose", "Source", "Review Status", "IRS Rate", "Potential Deduction", "Parking and Tolls", "Notes"];
  const values = entries.map((entry) => [entry.date, entry.vehicle, entry.entryType, entry.startingOdometer, entry.endingOdometer, entry.totalMiles, entry.personalMiles, entry.businessMiles, entry.startingLocation, entry.destinations, entry.businessPurpose, entry.mileageSource, entry.reviewStatus, entry.irsRate, entry.potentialDeduction, entry.parkingAndTolls, entry.notes]);
  const csv = [columns, ...values].map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = `Mister-Clean-My-Vent-Mileage-${state.mileageYear}.csv`; link.click(); URL.revokeObjectURL(url);
}

function renderMileage() {
  const screen = document.querySelector("#screen-mileage"); if (!screen) return;
  const years = mileageYears(); if (!state.mileageYear || !years.includes(state.mileageYear)) state.mileageYear = years[0];
  const yearEntries = mileagePeriodEntries("year"); const year = mileageSummary(yearEntries); const month = mileageSummary(mileagePeriodEntries("month")); const week = mileageSummary(mileagePeriodEntries("week"));
  const rates = state.mileageRates || [];
  screen.innerHTML = `<div class="crm-page-title"><h1>Mileage Tracker</h1><p>Business mileage records for the 2007 Toyota Tacoma, with review flags and supporting Drive documents.</p><div class="crm-actions"><button class="crm-btn" id="mileage-add" type="button">Log Mileage</button><button class="crm-btn secondary" id="mileage-export" type="button">Export CSV</button><button class="crm-btn secondary" id="mileage-print" type="button">Print / Save PDF</button></div></div>
    <section class="crm-panel"><div class="crm-panel-heading"><div><h2>${escapeHtml(state.mileageYear)} Mileage Summary</h2><p>Potential deductions are estimates based on eligible business miles and the configured IRS rate—not guaranteed tax savings.</p></div><div class="crm-field crm-month-picker"><label for="mileage-year">Year</label><select id="mileage-year">${years.map((value) => `<option ${value === state.mileageYear ? "selected" : ""}>${value}</option>`).join("")}</select></div></div>
      <div class="crm-stats crm-mileage-stats"><div class="crm-stat"><strong>${year.business.toFixed(1)}</strong><span>Business miles this year</span></div><div class="crm-stat"><strong>${month.business.toFixed(1)}</strong><span>Business miles this month</span></div><div class="crm-stat"><strong>${week.business.toFixed(1)}</strong><span>Business miles this week</span></div><div class="crm-stat"><strong>${formatMoney(year.deduction)}</strong><span>Potential mileage deduction</span></div><div class="crm-stat"><strong>${year.personal.toFixed(1)}</strong><span>Personal / nonqualifying</span></div><div class="crm-stat"><strong>${year.total.toFixed(1)}</strong><span>Total annual miles logged</span></div><div class="crm-stat"><strong>${year.startOdometer}</strong><span>Annual starting odometer</span></div><div class="crm-stat"><strong>${year.endOdometer}</strong><span>Annual ending odometer</span></div><div class="crm-stat"><strong>${year.businessUse.toFixed(1)}%</strong><span>Business-use percentage</span></div><div class="crm-stat"><strong>${formatMoney(year.parking)}</strong><span>Parking & tolls (separate)</span></div></div>
    </section>
    <section class="crm-panel"><div class="crm-panel-heading"><div><h2>Mileage Rate Table</h2><p>Rates are date-based and configurable. Parking and tolls remain separate so they are not double counted.</p></div></div><div class="crm-list">${rates.map((rate) => `<article class="crm-card"><h3>${escapeHtml(rate.start)} through ${escapeHtml(rate.end)}</h3><p><strong>${Number(rate.rate).toFixed(3)} per mile</strong> · ${escapeHtml(rate.source || "Configured rate")}</p><button class="crm-btn secondary" data-edit-mileage-rate="${escapeHtml(rate.id)}" type="button">Edit Rate</button></article>`).join("")}</div><label class="crm-setting"><input id="home-office-qualified" type="checkbox" ${String(state.mileageSettings.HOME_OFFICE_QUALIFIED).toUpperCase() === "TRUE" ? "checked" : ""}> Home office is currently documented as qualifying</label><p class="crm-help">This setting records your current position; it does not automatically treat the first or last trip of the day as deductible. Uncertain trips should be marked Needs Review.</p></section>
    <section class="crm-panel crm-mileage-report" id="mileage-report"><h2>Annual Mileage Log</h2><div class="crm-list">${yearEntries.length ? yearEntries.map((entry) => `<article class="crm-card"><div class="crm-panel-heading"><div><h3>${escapeHtml(formatDisplayDate(entry.date))} · ${escapeHtml(entry.businessPurpose || "Business travel")}</h3><p>${escapeHtml(entry.startingLocation || "Start not listed")} → ${escapeHtml(entry.destinations || "Destination not listed")}</p></div><span class="crm-badge ${entry.reviewStatus === "Needs Review" ? "warning" : "success"}">${escapeHtml(entry.reviewStatus)}</span></div><p><strong>${Number(entry.businessMiles || 0).toFixed(1)} business</strong> of ${Number(entry.totalMiles || 0).toFixed(1)} total miles · ${escapeHtml(entry.mileageSource)}${entry.mileageSource === "Reconstructed" ? " (not an odometer record)" : ""}</p><p>Potential deduction: ${formatMoney(entry.potentialDeduction)} · Parking/tolls: ${formatMoney(entry.parkingAndTolls)}</p><div class="crm-actions"><button class="crm-btn warning" data-edit-mileage="${escapeHtml(entry.id)}" type="button">Edit</button><button class="crm-btn danger" data-delete-mileage="${escapeHtml(entry.id)}" type="button">Delete</button>${state.mileageDocuments.filter((doc) => doc.mileageId === entry.id).map((doc) => `<button class="crm-btn secondary" data-view-file="${escapeHtml(doc.googleDriveFileId)}" type="button">${escapeHtml(doc.fileName)}</button>`).join("")}</div></article>`).join("") : `<div class="crm-empty">No mileage has been logged for ${escapeHtml(state.mileageYear)}.</div>`}</div></section>`;
  screen.querySelector("#mileage-add").addEventListener("click", () => openMileageModal());
  screen.querySelector("#mileage-export").addEventListener("click", exportMileageCsv);
  screen.querySelector("#mileage-print").addEventListener("click", () => { document.body.classList.add("printing-mileage"); window.print(); window.setTimeout(() => document.body.classList.remove("printing-mileage"), 500); });
  screen.querySelector("#mileage-year").addEventListener("change", (event) => { state.mileageYear = event.target.value; renderMileage(); });
  screen.querySelector("#home-office-qualified").addEventListener("change", async (event) => { const value = event.target.checked ? "TRUE" : "FALSE"; await api("/api/crm/mileage", { method: "POST", body: JSON.stringify({ action: "saveSetting", key: "HOME_OFFICE_QUALIFIED", value, description: "Whether a qualifying home office is currently documented." }) }); state.mileageSettings.HOME_OFFICE_QUALIFIED = value; showNotice("Home-office qualification setting saved."); });
  screen.querySelectorAll("[data-edit-mileage]").forEach((button) => button.addEventListener("click", () => openMileageModal(state.mileage.find((entry) => entry.id === button.dataset.editMileage))));
  screen.querySelectorAll("[data-delete-mileage]").forEach((button) => button.addEventListener("click", async () => { if (!confirm("Delete this mileage entry? The spreadsheet row will be archived.")) return; await api(`/api/crm/mileage?id=${encodeURIComponent(button.dataset.deleteMileage)}`, { method: "DELETE" }); state.mileage = state.mileage.filter((entry) => entry.id !== button.dataset.deleteMileage); renderMileage(); showNotice("Mileage entry removed."); }));
  screen.querySelectorAll("[data-view-file]").forEach((button) => button.addEventListener("click", () => openFilePreview(button.dataset.viewFile, "Mileage document")));
  screen.querySelectorAll("[data-edit-mileage-rate]").forEach((button) => button.addEventListener("click", async () => { const rate = rates.find((item) => item.id === button.dataset.editMileageRate); const value = prompt(`Mileage rate per mile for ${rate.start} through ${rate.end}:`, rate.rate); if (value === null) return; const amount = Number(value); if (!Number.isFinite(amount) || amount < 0) return showNotice("Enter a valid rate.", "error"); const result = await api("/api/crm/mileage", { method: "POST", body: JSON.stringify({ action: "saveRate", ...rate, rate: amount }) }); state.mileageRates = rates.map((item) => item.id === rate.id ? result.rate : item); renderMileage(); showNotice("Mileage rate updated."); }));
}

function openMileageModal(entry = null, presetJob = null) {
  const modal = document.querySelector("#mileage-modal"); const job = presetJob || jobById(entry?.jobId); const customer = customerById(job?.customerId || entry?.customerId);
  modal.classList.add("open"); modal.setAttribute("aria-hidden", "false"); modal.innerHTML = `<form class="crm-modal-card" id="mileage-form" role="dialog" aria-modal="true"><h2>${entry ? "Edit Mileage" : "Log Mileage"}</h2><input type="hidden" name="mileageId" value="${escapeHtml(entry?.id || "")}"><input type="hidden" name="customerId" value="${escapeHtml(customer?.id || "")}"><input type="hidden" name="jobId" value="${escapeHtml(job?.id || "")}"><div class="crm-form-grid">
    ${field("Date", "date", entry?.date || job?.dateCompleted || job?.appointmentDate || todayIso(), true, "date")}${field("Vehicle", "vehicle", entry?.vehicle || state.mileageSettings.DEFAULT_VEHICLE || "2007 Toyota Tacoma", true)}
    ${selectField("Entry Type", "entryType", entry?.entryType || "Day Route", ["Trip", "Day Route"])}${selectField("Mileage Source", "mileageSource", entry?.mileageSource || "Odometer", ["Odometer", "GPS", "Reconstructed", "Manual"])}
    ${field("Starting Odometer", "startingOdometer", entry?.startingOdometer || "", false, "number")}${field("Ending Odometer", "endingOdometer", entry?.endingOdometer || "", false, "number")}${field("Total Miles (GPS / reconstructed / manual)", "totalMiles", entry?.totalMiles || "", false, "number")}${field("Personal or Nonqualifying Miles", "personalMiles", entry?.personalMiles || "0", true, "number")}
    ${field("Starting Location", "startingLocation", entry?.startingLocation || "")}${field("Locations / Destinations", "destinations", entry?.destinations || (customer ? [customer.streetAddress, customer.city, customer.state].filter(Boolean).join(", ") : ""))}
    ${field("Business Purpose", "businessPurpose", entry?.businessPurpose || (job ? `${job.serviceType} for ${customer?.name || "customer"}` : ""), true, "text", "full")}${selectField("Review Status", "reviewStatus", entry?.reviewStatus || (entry?.mileageSource === "Reconstructed" ? "Needs Review" : "Reviewed"), ["Reviewed", "Needs Review", "Nonqualifying"])}
    ${field("Parking and Tolls (Separate)", "parkingAndTolls", entry?.parkingAndTolls || "0", false, "number")}${textareaField("Notes", "notes", entry?.notes || "")}
    <div class="crm-field full"><label for="mileageFile">Supporting Document (Optional)</label><label class="crm-upload-button" for="mileageFile">Take Photo / Upload Supporting File</label><input class="crm-file-input" id="mileageFile" type="file" accept="image/*,.pdf,.heic,.heif"><small>GPS screenshot, route documentation, receipt, or other support. Reconstructed mileage remains clearly labeled.</small></div>
    <div class="crm-field full crm-help" id="mileage-calculation"></div></div><div class="crm-actions"><button class="crm-btn" type="submit">Save Mileage</button><button class="crm-btn secondary" data-close-modal type="button">Cancel</button></div><p class="crm-status" id="mileage-status"></p></form>`;
  setModalLock(); const form = modal.querySelector("#mileage-form"); bindMobileInputFocus(form); modal.querySelector("[data-close-modal]").addEventListener("click", () => closeModal(modal));
  const preview = () => { const source = form.elements.mileageSource.value; const start = Number(form.elements.startingOdometer.value || 0); const end = Number(form.elements.endingOdometer.value || 0); const total = source === "Odometer" ? Math.max(0, end - start) : Number(form.elements.totalMiles.value || 0); const personal = Number(form.elements.personalMiles.value || 0); const business = Math.max(0, total - personal); form.querySelector("#mileage-calculation").textContent = `${total.toFixed(1)} total miles · ${business.toFixed(1)} eligible business miles. ${source === "Reconstructed" ? "Reconstructed estimate—not an actual odometer reading." : ""}`; };
  ["mileageSource", "startingOdometer", "endingOdometer", "totalMiles", "personalMiles"].forEach((name) => form.elements[name].addEventListener("input", preview)); preview();
  form.addEventListener("submit", async (event) => { event.preventDefault(); const status = form.querySelector("#mileage-status"); const submit = form.querySelector("button[type='submit']"); submit.disabled = true; status.textContent = "Saving mileage...";
    try { const body = Object.fromEntries(new FormData(form)); const saved = await api("/api/crm/mileage", { method: entry ? "PUT" : "POST", body: JSON.stringify(body) }); const index = state.mileage.findIndex((item) => item.id === saved.mileage.id); if (index >= 0) state.mileage[index] = saved.mileage; else state.mileage.unshift(saved.mileage); const file = form.querySelector("#mileageFile").files[0]; if (file) { status.textContent = "Uploading supporting document..."; const uploaded = await api("/api/crm/mileage-assets", { method: "POST", body: JSON.stringify({ mileageId: saved.mileage.id, category: "Supporting Documentation", file: await fileToPayload(file) }) }); state.mileageDocuments.push(uploaded.document); } closeModal(modal); renderMileage(); switchScreen("mileage"); showNotice("Mileage saved to Google Sheets."); }
    catch (error) { status.textContent = error.message; status.classList.add("error"); } finally { submit.disabled = false; }
  });
}

function renderCustomers() {
  document.querySelector("#screen-customers").innerHTML = `
    <div class="crm-page-title">
      <h1>Customers</h1>
      <p>Search, call, navigate, add notes, and open service history.</p>
      <div class="crm-actions">
        <input id="customer-search" type="search" placeholder="Search customers..." aria-label="Search customers">
        <button class="crm-btn" type="button" id="customer-add">Add Customer</button>
        <button class="crm-btn secondary" type="button" id="customer-refresh">Refresh</button>
      </div>
    </div>
    <div class="crm-list" id="customer-list">${renderCustomerCards(state.customers)}</div>
  `;
  document.querySelector("#customer-add").addEventListener("click", () => openCustomerModal());
  document.querySelector("#customer-refresh").addEventListener("click", async () => {
    await loadData();
    switchScreen("customers");
    showNotice("Customer list refreshed from Google Sheets.");
  });
  document.querySelector("#customer-search").addEventListener("input", (event) => {
    const search = event.target.value.toLowerCase();
    const filtered = state.customers.filter((customer) => [
      customer.name,
      customer.phone,
      customer.email,
      customer.streetAddress,
      customer.city,
      customer.leadSource,
      customer.neighborhood,
      customer.notes,
    ].join(" ").toLowerCase().includes(search));
    document.querySelector("#customer-list").innerHTML = renderCustomerCards(filtered);
    bindCustomerButtons();
  });
  bindCustomerButtons();
  bindMobileInputFocus(document.querySelector("#screen-customers"));
}

function renderDue() {
  const dashboard = state.dashboard;
  document.querySelector("#screen-due").innerHTML = `
    <div class="crm-page-title">
      <h1>Due Soon</h1>
      <p>Follow-ups based on each customer's next-service date.</p>
    </div>
    <div class="crm-grid">
      <section class="crm-panel crm-col-12"><h2>Overdue</h2><div class="crm-list">${renderJobCards(dashboard.overdue, true)}</div></section>
      <section class="crm-panel crm-col-4"><h2>0-30 Days</h2><div class="crm-list">${renderJobCards(dashboard.dueSoon30, true)}</div></section>
      <section class="crm-panel crm-col-4"><h2>31-60 Days</h2><div class="crm-list">${renderJobCards(dashboard.dueSoon60, true)}</div></section>
      <section class="crm-panel crm-col-4"><h2>61-90 Days</h2><div class="crm-list">${renderJobCards(dashboard.dueSoon90, true)}</div></section>
    </div>
  `;
  bindJobButtons(document.querySelector("#screen-due"));
}

function expenseFilterDates(period) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const iso = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  if (period === "lastMonth") return { from: iso(new Date(year, month - 1, 1)), to: iso(new Date(year, month, 0)) };
  if (period === "thisYear") return { from: `${year}-01-01`, to: `${year}-12-31` };
  if (period === "all") return { from: "", to: "" };
  return { from: iso(new Date(year, month, 1)), to: iso(new Date(year, month + 1, 0)) };
}

function filteredExpenses() {
  const screen = document.querySelector("#screen-expenses");
  const value = (id) => screen?.querySelector(`#${id}`)?.value || "";
  const dates = value("expense-period") === "custom" ? { from: value("expense-from"), to: value("expense-to") } : expenseFilterDates(value("expense-period") || "thisMonth");
  const search = value("expense-search").toLowerCase();
  return state.expenses.filter((expense) => (!dates.from || expense.date >= dates.from) && (!dates.to || expense.date <= dates.to))
    .filter((expense) => !value("expense-category-filter") || expense.category === value("expense-category-filter"))
    .filter((expense) => !value("expense-vendor-filter") || expense.vendor === value("expense-vendor-filter"))
    .filter((expense) => !value("expense-customer-filter") || expense.customerId === value("expense-customer-filter"))
    .filter((expense) => !value("expense-job-filter") || expense.jobId === value("expense-job-filter"))
    .filter((expense) => !value("expense-payment-filter") || expense.paymentMethod === value("expense-payment-filter"))
    .filter((expense) => !search || [expense.vendor, expense.category, expense.description, expense.customer?.name, expense.job?.serviceType].join(" ").toLowerCase().includes(search));
}

function expenseSummary(expenses) {
  const categoryTotals = {};
  let total = 0;
  expenses.forEach((expense) => {
    const amount = Number(expense.totalAmount || 0) || 0;
    total += amount;
    categoryTotals[expense.category] = (categoryTotals[expense.category] || 0) + amount;
  });
  return { total, categoryTotals };
}

function renderExpenseResults() {
  const expenses = filteredExpenses();
  const summary = expenseSummary(expenses);
  const cards = ["Parts & Materials", "Gas / Fuel", "Tools & Equipment", "Advertising / Marketing", "Subcontractor / Labor"];
  document.querySelector("#expense-summary").innerHTML = `<div class="crm-stat"><strong>${formatMoney(summary.total)}</strong><span>Total Expenses</span></div>${cards.map((category) => `<div class="crm-stat"><strong>${formatMoney(summary.categoryTotals[category] || 0)}</strong><span>${escapeHtml(category)}</span></div>`).join("")}`;
  const empty = `<div class="crm-empty">No expenses match these filters.</div>`;
  document.querySelector("#expense-list").innerHTML = expenses.length ? expenses.map((expense) => expenseCard(expense)).join("") : empty;
  document.querySelector("#expense-table-body").innerHTML = expenses.map((expense) => `<tr><td>${escapeHtml(formatDisplayDate(expense.date))}</td><td>${escapeHtml(expense.vendor)}</td><td>${escapeHtml(expense.category)}</td><td>${escapeHtml(expense.description || "—")}</td><td>${escapeHtml(expense.customer?.name || "General")}${expense.job ? `<br><small>${escapeHtml(expense.job.serviceType)}</small>` : ""}</td><td>${formatMoney(expense.totalAmount)}</td><td>${expense.googleDriveFileId ? `<button class="crm-link-button" data-view-file="${escapeHtml(expense.googleDriveFileId)}" type="button">${String(expense.receiptMimeType || "").startsWith("image/") ? `<img class="crm-table-thumb" src="${fileUrl(expense.googleDriveFileId)}" alt="Receipt from ${escapeHtml(expense.vendor)}">` : "View"}</button>` : "—"}</td><td><button class="crm-link-button" data-edit-expense="${escapeHtml(expense.id)}" type="button">Edit</button> · <button class="crm-link-button danger-text" data-delete-expense="${escapeHtml(expense.id)}" type="button">Delete</button></td></tr>`).join("");
  bindExpenseButtons();
}

function expenseCard(expense) {
  const receipt = expense.googleDriveFileId && String(expense.receiptMimeType || "").startsWith("image/")
    ? `<button class="crm-receipt-thumb" data-view-file="${escapeHtml(expense.googleDriveFileId)}" type="button"><img src="${fileUrl(expense.googleDriveFileId)}" alt="Receipt from ${escapeHtml(expense.vendor)}"><span>View Receipt</span></button>`
    : expense.googleDriveFileId ? `<button class="crm-btn secondary" data-view-file="${escapeHtml(expense.googleDriveFileId)}" type="button">View Receipt</button>` : "";
  return `<article class="crm-card crm-expense-card"><div><h3>${escapeHtml(expense.vendor)}</h3><p>${escapeHtml(formatDisplayDate(expense.date))} · ${escapeHtml(expense.category)}</p><p>${escapeHtml(expense.customer?.name || "General business expense")}${expense.job ? ` — ${escapeHtml(expense.job.serviceType)}` : ""}</p></div><strong class="crm-money">${formatMoney(expense.totalAmount)}</strong>${receipt}<div class="crm-actions"><button class="crm-btn warning" data-edit-expense="${escapeHtml(expense.id)}" type="button">Edit</button><button class="crm-btn danger" data-delete-expense="${escapeHtml(expense.id)}" type="button">Delete</button></div></article>`;
}

function renderExpenses() {
  const categories = state.expenseCategories.length ? state.expenseCategories : defaultExpenseCategories;
  document.querySelector("#screen-expenses").innerHTML = `<div class="crm-page-title"><h1>Expenses</h1><p>Track receipts, business spending, and job costs.</p><div class="crm-actions"><button class="crm-btn" id="expense-add" type="button">Add Expense</button></div></div>
    <section class="crm-panel"><div class="crm-filter-grid"><div class="crm-field"><label for="expense-period">Date</label><select id="expense-period"><option value="thisMonth">This Month</option><option value="lastMonth">Last Month</option><option value="thisYear">This Year</option><option value="all">All Time</option><option value="custom">Custom Date Range</option></select></div>${field("From", "expense-from", "", false, "date")}${field("To", "expense-to", "", false, "date")}<div class="crm-field"><label for="expense-search">Search</label><input id="expense-search" type="search" placeholder="Vendor, customer, job..."></div>${selectField("Category", "expense-category-filter", "", categories)}${selectField("Vendor", "expense-vendor-filter", "", [...new Set(state.expenses.map((expense) => expense.vendor).filter(Boolean))].sort())}${selectField("Customer", "expense-customer-filter", "", state.customers.map((customer) => ({ value: customer.id, label: customer.name })))}${selectField("Job", "expense-job-filter", "", state.allJobs.map((job) => ({ value: job.id, label: jobLabel(job) })))}${selectField("Payment", "expense-payment-filter", "", ["Cash", "Credit Card", "Debit Card", "Check", "ACH / Bank", "Other"])}</div></section>
    <div class="crm-stats crm-expense-stats" id="expense-summary"></div>
    <section class="crm-panel crm-expense-mobile" id="expense-list"></section>
    <section class="crm-panel crm-expense-desktop"><div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>Date</th><th>Vendor</th><th>Category</th><th>Description</th><th>Customer / Job</th><th>Amount</th><th>Receipt</th><th>Actions</th></tr></thead><tbody id="expense-table-body"></tbody></table></div></section>`;
  document.querySelector("#expense-add").addEventListener("click", () => openExpenseModal());
  document.querySelectorAll("#screen-expenses input, #screen-expenses select").forEach((control) => control.addEventListener("input", renderExpenseResults));
  renderExpenseResults();
  bindMobileInputFocus(document.querySelector("#screen-expenses"));
}

function renderProfile() {
  const customer = state.selectedCustomer;
  const screen = document.querySelector("#screen-profile");
  if (!customer) {
    screen.innerHTML = `
      <div class="crm-page-title">
        <h1>Customer Profile</h1>
        <p>Select a customer to view service history.</p>
      </div>
      <div class="crm-empty">No customer selected yet.</div>
    `;
    return;
  }

  const profileJobs = sortJobsNewestFirst(state.jobs.length ? state.jobs : jobsForCustomer(customer.id));
  const lastJob = profileJobs[0] || null;
  const nextServiceJob = profileJobs
    .filter((job) => job.nextServiceDate)
    .sort((jobA, jobB) => toDateValue(jobA.nextServiceDate) - toDateValue(jobB.nextServiceDate))[0] || null;

  screen.innerHTML = `
    <div class="crm-page-title">
      <h1>${escapeHtml(customer.name || "Customer")}</h1>
      <p>${escapeHtml([customer.streetAddress, customer.city, customer.state, customer.zipCode].filter(Boolean).join(", "))}</p>
      <div class="crm-actions">
        ${customer.phone ? `<a class="crm-btn" href="tel:${escapeHtml(customer.phone.replace(/[^0-9+]/g, ""))}">Call</a>` : ""}
        ${customer.streetAddress ? `<a class="crm-btn secondary" target="_blank" rel="noopener" href="${mapsUrl(customer)}">Directions</a>` : ""}
        <button class="crm-btn secondary" type="button" id="edit-selected-customer">Edit</button>
        <button class="crm-btn" type="button" id="add-work-order-profile">Add Work Order</button>
      </div>
    </div>
    <div class="crm-grid">
      <section class="crm-panel crm-col-5">
        <h2>Customer Details</h2>
        <p><strong>Phone:</strong> ${escapeHtml(customer.phone || "Not added")}</p>
        <p><strong>Email:</strong> ${escapeHtml(customer.email || "Not added")}</p>
        <p><strong>Lead Source:</strong> ${escapeHtml(customer.leadSource || "Not added")}</p>
        <p><strong>Community:</strong> ${escapeHtml(customer.neighborhood || "Not added")}</p>
        <p><strong>Notes:</strong> ${escapeHtml(customer.notes || "No notes")}</p>
      </section>
      <section class="crm-panel crm-col-7">
        <h2>Service Summary</h2>
        <div class="crm-stats">
          <div class="crm-stat"><strong>${profileJobs.length}</strong><span>Total service visits</span></div>
          <div class="crm-stat"><strong>${escapeHtml(formatDisplayDate(lastJob ? jobServiceDate(lastJob) : ""))}</strong><span>Last service${lastJob?.serviceType ? `: ${escapeHtml(lastJob.serviceType)}` : ""}</span></div>
          <div class="crm-stat"><strong>${escapeHtml(formatDisplayDate(nextServiceJob?.nextServiceDate || ""))}</strong><span>Next service</span></div>
          <div class="crm-stat"><strong>${escapeHtml(lastJob?.paymentStatus || "Not set")}</strong><span>Last payment status</span></div>
        </div>
        <p>Add each visit here, even when the same customer books a different service later.</p>
      </section>
      <section class="crm-panel crm-col-12">
        <div class="crm-panel-heading"><div><h2>Service History</h2><p>Completed visits and previous work for this customer.</p></div><button class="crm-btn" type="button" id="add-service-button">Add Service</button></div>
        <div class="crm-list">${renderJobCards(profileJobs, false, true)}</div>
      </section>
    </div>
  `;

  document.querySelector("#edit-selected-customer").addEventListener("click", () => openCustomerModal(customer));
  document.querySelector("#add-work-order-profile").addEventListener("click", () => openJobModal(customer, "work-order"));
  document.querySelector("#add-service-button").addEventListener("click", () => openJobModal(customer, "service"));
  bindJobButtons(screen);
}

function renderCustomerCards(customers) {
  if (!customers.length) {
    return `<div class="crm-empty">No customers found.</div>`;
  }

  return customers.map((customer) => {
    const summary = getCustomerServiceSummary(customer.id);
    return `
    <article class="crm-card">
      <h3>${escapeHtml(customer.name || "Unnamed Customer")}</h3>
      <p>${escapeHtml([customer.streetAddress, customer.city, customer.state, customer.zipCode].filter(Boolean).join(", "))}</p>
      <p>${escapeHtml(customer.phone || "No phone")} ${customer.leadSource ? `<span class="crm-badge">${escapeHtml(customer.leadSource)}</span>` : ""}</p>
      <p><strong>Last service:</strong> ${summary.count ? `${escapeHtml(formatDisplayDate(summary.lastServiceDate))} - ${escapeHtml(summary.lastServiceType || "Service")}` : "No service visits saved yet."}</p>
      <p><strong>Next service:</strong> ${escapeHtml(formatDisplayDate(summary.nextServiceDate))} <span class="crm-badge">${escapeHtml(serviceVisitLabel(summary.count))}</span></p>
      <div class="crm-actions">
        ${customer.phone ? `<a class="crm-btn secondary" href="tel:${escapeHtml(customer.phone.replace(/[^0-9+]/g, ""))}">Call</a>` : ""}
        ${customer.streetAddress ? `<a class="crm-btn secondary" target="_blank" rel="noopener" href="${mapsUrl(customer)}">Directions</a>` : ""}
        <button class="crm-btn" type="button" data-view-customer="${escapeHtml(customer.id)}">View</button>
        <button class="crm-btn warning" type="button" data-edit-customer="${escapeHtml(customer.id)}">Edit</button>
        <button class="crm-btn danger" type="button" data-archive-customer="${escapeHtml(customer.id)}">Archive</button>
      </div>
    </article>
    `;
  }).join("");
}

function renderJobCards(jobs, showCustomer, allowRemove = false) {
  const sortedJobs = sortJobsNewestFirst(jobs);
  if (!sortedJobs.length) {
    return `<div class="crm-empty">Nothing here yet.</div>`;
  }

  return sortedJobs.map((job) => {
    const customerName = showCustomer && job.customer ? `<p><strong>${escapeHtml(job.customer.name)}</strong></p>` : "";
    const due = job.daysUntilDue === undefined ? "" : `<span class="crm-badge">${job.daysUntilDue < 0 ? `${Math.abs(job.daysUntilDue)} days overdue` : `Due in ${job.daysUntilDue} days`}</span>`;
    const serviceDate = jobServiceDate(job);
    return `
      <article class="crm-card">
        <h3>${escapeHtml(job.serviceType || "Service")}</h3>
        ${customerName}
        <p><strong>Service date:</strong> ${escapeHtml(formatDisplayDate(serviceDate))}${job.appointmentTime ? ` at ${escapeHtml(job.appointmentTime)}` : ""}</p>
        <p>Status: ${escapeHtml(job.jobStatus || "Not set")} | Payment: ${escapeHtml(job.paymentStatus || "Not set")}</p>
        ${(job.subtotal || job.finalPrice || job.quotedPrice) ? `<div class="crm-financial-lines"><p><strong>Subtotal:</strong> ${formatMoney(jobSubtotal(job))}</p><p><strong>Sales Tax (6.625%):</strong> ${formatMoney(jobSalesTax(job))}</p><p><strong>Total Amount:</strong> ${formatMoney(jobTotalAmount(job))}</p></div>` : ""}
        <p><span class="crm-badge ${job.signedWorkOrderFileId ? "success" : "muted"}">${job.signedWorkOrderFileId ? "✓ Signed Work Order" : "No Signed Work Order Uploaded"}</span></p>
        <p>Next service: ${escapeHtml(formatDisplayDate(job.nextServiceDate))} ${due}</p>
        ${job.technicianNotes ? `<p>${escapeHtml(job.technicianNotes)}</p>` : ""}
        <div class="crm-actions">
          <button class="crm-btn secondary" type="button" data-view-job="${escapeHtml(job.id)}">Open Work Order</button>
          <button class="crm-btn warning" type="button" data-edit-service="${escapeHtml(job.id)}">Edit Service</button>
          ${job.jobStatus === "Completed" || job.dateCompleted ? `<button class="crm-btn secondary" type="button" data-log-mileage="${escapeHtml(job.id)}">Log Mileage</button>` : ""}
          ${allowRemove ? `<button class="crm-btn danger" type="button" data-remove-service="${escapeHtml(job.id)}">Remove Service</button>` : ""}
        </div>
      </article>
    `;
  }).join("");
}

function bindJobButtons(root = document) {
  root.querySelectorAll("[data-view-job]").forEach((button) => button.addEventListener("click", () => openJobDetail(button.dataset.viewJob)));
  root.querySelectorAll("[data-edit-service]").forEach((button) => button.addEventListener("click", () => {
    const job = jobById(button.dataset.editService);
    const customer = customerById(job?.customerId);
    if (job && customer) openJobModal(customer, "service", job);
  }));
  root.querySelectorAll("[data-remove-service]").forEach((button) => button.addEventListener("click", () => removeService(button.dataset.removeService, button)));
  root.querySelectorAll("[data-log-mileage]").forEach((button) => button.addEventListener("click", () => openMileageModal(null, jobById(button.dataset.logMileage))));
}

async function removeService(jobId, button) {
  if (!confirm("Are you sure you want to remove this service from this customer?")) return false;
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Removing...";
  try {
    await api(`/api/crm/jobs?id=${encodeURIComponent(jobId)}`, { method: "DELETE" });
    state.allJobs = state.allJobs.filter((job) => job.id !== jobId);
    state.jobs = state.jobs.filter((job) => job.id !== jobId);
    if (state.selectedJob?.id === jobId) state.selectedJob = null;
    rebuildDashboardFromState();
    renderDashboard();
    renderCustomers();
    renderDue();
    renderExpenses();
    renderSalesTax();
    renderProfile();
    switchScreen("profile");
    showNotice("Service removed from this customer.");
    return true;
  } catch (error) {
    button.disabled = false;
    button.textContent = originalLabel;
    showNotice(error.message || "Service could not be removed.", "error");
    return false;
  }
}

function bindCustomerButtons() {
  document.querySelectorAll("[data-view-customer]").forEach((button) => {
    button.addEventListener("click", async () => {
      const customer = state.customers.find((item) => item.id === button.dataset.viewCustomer);
      if (!customer) {
        showNotice("That customer was not found. Refreshing the customer list now.", "error");
        await loadData();
        switchScreen("customers");
        return;
      }
      state.selectedCustomer = customer;
      state.jobs = jobsForCustomer(customer.id);
      switchScreen("profile");
      renderProfile();
    });
  });

  document.querySelectorAll("[data-edit-customer]").forEach((button) => {
    button.addEventListener("click", () => {
      const customer = state.customers.find((item) => item.id === button.dataset.editCustomer);
      openCustomerModal(customer);
    });
  });

  document.querySelectorAll("[data-archive-customer]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Archive this customer?")) {
        return;
      }
      try {
        await api(`/api/crm/customers?id=${encodeURIComponent(button.dataset.archiveCustomer)}`, { method: "DELETE" });
        await loadData();
        switchScreen("customers");
        showNotice("Customer archived.");
      } catch (error) {
        await loadData();
        switchScreen("customers");
        showNotice(error.message || "Customer could not be archived.", "error");
      }
    });
  });
}

function mapsUrl(customer) {
  const query = [customer.streetAddress, customer.city, customer.state, customer.zipCode].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function openCustomerModal(customer = null) {
  const modal = document.querySelector("#customer-modal");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.innerHTML = `
    <form class="crm-modal-card" id="customer-form">
      <h2>${customer ? "Edit Customer" : "Add Customer"}</h2>
      <input type="hidden" name="customerId" value="${escapeHtml(customer?.id || "")}">
      <div class="crm-form-grid">
        ${field("First Name", "firstName", customer?.firstName || "", true)}
        ${field("Last Name", "lastName", customer?.lastName || "")}
        ${field("Phone", "phone", customer?.phone || "", false, "tel")}
        ${field("Email", "email", customer?.email || "", false, "email")}
        ${field("Street Address", "streetAddress", customer?.streetAddress || "", false, "text", "full")}
        ${field("City", "city", customer?.city || "")}
        ${field("State", "state", customer?.state || "NJ")}
        ${field("ZIP Code", "zipCode", customer?.zipCode || "")}
        ${selectField("Lead Source", "leadSource", customer?.leadSource || "", ["Google", "Referral", "Door Hanger", "Facebook", "Repeat Customer", "Branchburg", "Other"])}
        ${field("Neighborhood or Community", "neighborhood", customer?.neighborhood || "")}
        ${selectField("Preferred Contact", "preferredContactMethod", customer?.preferredContactMethod || "", ["Call", "Text", "Email"])}
        ${selectField("Customer Status", "customerStatus", customer?.customerStatus || "Active", ["Active", "Lead", "Scheduled", "Recently Serviced", "Archived"])}
        ${textareaField("Notes", "notes", customer?.notes || "")}
      </div>
      <div class="crm-actions">
        <button class="crm-btn" type="submit">${customer ? "Save Customer" : "Add Customer"}</button>
        <button class="crm-btn secondary" type="button" data-close-modal>Cancel</button>
      </div>
      <p class="crm-status" id="customer-status"></p>
    </form>
  `;

  setModalLock();
  const form = modal.querySelector("#customer-form");
  focusFirstEditableField(form);
  bindMobileInputFocus(form);
  modal.querySelector("[data-close-modal]").addEventListener("click", () => closeModal(modal));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = modal.querySelector("#customer-status");
    const submit = event.currentTarget.querySelector("button[type='submit']");
    const formData = Object.fromEntries(new FormData(event.currentTarget));
    const method = customer ? "PUT" : "POST";
    status.textContent = "Saving...";
    status.classList.remove("error");
    submit.disabled = true;
    try {
      await api("/api/crm/customers", { method, body: JSON.stringify(formData) });
      closeModal(modal);
      await loadData();
      switchScreen("customers");
      showNotice(customer ? "Customer updated and saved to Google Sheets." : "Customer saved to Google Sheets.");
    } catch (error) {
      status.textContent = error.message;
      status.classList.add("error");
      showNotice(error.message || "Customer could not be saved.", "error");
    } finally {
      submit.disabled = false;
    }
  });
}

function openWorkOrderPicker() {
  if (!state.customers.length) {
    showNotice("Add a customer before creating a work order.", "error");
    openCustomerModal();
    return;
  }
  const modal = document.querySelector("#job-modal");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.innerHTML = `
    <form class="crm-modal-card crm-picker-card" id="work-order-customer-form">
      <h2>Add Work Order</h2>
      <p>Choose the customer for this work order.</p>
      <div class="crm-field"><label for="work-order-customer">Customer</label><select id="work-order-customer" name="customerId" required>
        <option value="">Select a customer...</option>
        ${[...state.customers].sort((a, b) => a.name.localeCompare(b.name)).map((customer) => `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.name || "Unnamed Customer")} ${customer.streetAddress ? `— ${escapeHtml(customer.streetAddress)}` : ""}</option>`).join("")}
      </select></div>
      <div class="crm-actions"><button class="crm-btn" type="submit">Continue</button><button class="crm-btn secondary" type="button" data-close-modal>Cancel</button></div>
    </form>`;
  setModalLock();
  const form = modal.querySelector("#work-order-customer-form");
  bindMobileInputFocus(form);
  modal.querySelector("[data-close-modal]").addEventListener("click", () => closeModal(modal));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const selectedCustomer = customerById(new FormData(form).get("customerId"));
    if (selectedCustomer) openJobModal(selectedCustomer, "work-order");
  });
}

function openJobModal(customer = null, mode = "service", job = null) {
  const isWorkOrder = mode === "work-order";
  const isEditing = Boolean(job);
  const today = state.dashboard?.today || todayIso();
  const modal = document.querySelector("#job-modal");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.innerHTML = `
    <form class="crm-modal-card" id="job-form">
      <h2>${isEditing ? "Edit Service" : isWorkOrder ? "Add Work Order" : "Add Service"}${customer ? ` for ${escapeHtml(customer.name)}` : ""}</h2>
      ${customer ? `<input type="hidden" name="customerId" value="${escapeHtml(customer.id)}">` : searchableCustomerField()}
      <input type="hidden" name="calendarCustomerName" value="${escapeHtml(customer?.name || "")}">
      <input type="hidden" name="calendarJobAddress" value="${escapeHtml(customer ? [customer.streetAddress, customer.city, customer.state, customer.zipCode].filter(Boolean).join(", ") : "")}">
      <input type="hidden" name="jobId" value="${escapeHtml(job?.id || "")}">
      <div class="crm-form-grid">
        ${field("Appointment Date", "appointmentDate", job?.appointmentDate || (isWorkOrder ? "" : today), false, "date")}
        ${field("Appointment Time", "appointmentTime", job?.appointmentTime || "", false, "time")}
        ${field("Estimated Duration (Minutes)", "estimatedDurationMinutes", job?.estimatedDurationMinutes || "60", false, "number")}
        ${selectField("Job Status", "jobStatus", job?.jobStatus || (isWorkOrder ? "Scheduled" : "Completed"), ["Lead", "Estimate Scheduled", "Estimate Sent", "Scheduled", "In Progress", "Completed", "Canceled"])}
        ${selectField("Service Type", "serviceType", job?.serviceType || "Dryer Vent Cleaning", serviceOptions)}
        ${field("Quoted Price", "quotedPrice", job?.quotedPrice || "")}
        ${selectField("Taxable Service", "taxable", job?.taxable ? "Taxable" : "Non-Taxable", ["Non-Taxable", "Taxable"])}
        ${field("Subtotal (Before Tax)", "subtotal", job?.subtotal || job?.finalPrice || "", false, "number")}
        ${readonlyMoneyField("Sales Tax (6.625%)", "salesTax", job?.salesTax || "0.00")}
        ${readonlyMoneyField("Total Amount (Including Tax)", "totalAmount", job?.totalAmount || job?.subtotal || job?.finalPrice || "0.00")}
        ${selectField("Payment Status", "paymentStatus", job?.paymentStatus || "Not Invoiced", ["Not Invoiced", "Unpaid", "Partially Paid", "Paid"])}
        ${field("Payment Method", "paymentMethod", job?.paymentMethod || "")}
        ${field("Date Completed", "dateCompleted", job?.dateCompleted || (isWorkOrder ? "" : today), false, "date")}
        ${field("Next Service Date", "nextServiceDate", job?.nextServiceDate || "", false, "date")}
        ${textareaField("Service Description", "serviceDescription", job?.serviceDescription || "")}
        ${textareaField("Technician Notes", "technicianNotes", job?.technicianNotes || "")}
      </div>
      <div class="crm-actions">
        <button class="crm-btn" type="submit">${isEditing ? "Save Changes" : isWorkOrder ? "Save Work Order" : "Save Service"}</button>
        <button class="crm-btn secondary" type="button" data-close-modal>Cancel</button>
        ${isEditing ? `<button class="crm-btn danger" type="button" id="remove-service-modal">Remove Service</button>` : ""}
      </div>
      <p class="crm-status" id="job-status"></p>
    </form>
  `;

  setModalLock();
  const form = modal.querySelector("#job-form");
  focusFirstEditableField(form);
  bindMobileInputFocus(form);
  const refreshTaxAmounts = () => {
    const subtotal = moneyValue(form.elements.subtotal.value);
    const salesTax = form.elements.taxable.value === "Taxable" ? Math.round((subtotal * 0.06625 + Number.EPSILON) * 100) / 100 : 0;
    form.elements.salesTax.value = salesTax.toFixed(2);
    form.elements.totalAmount.value = (Math.round((subtotal + salesTax + Number.EPSILON) * 100) / 100).toFixed(2);
  };
  form.elements.subtotal.addEventListener("input", refreshTaxAmounts);
  form.elements.taxable.addEventListener("change", refreshTaxAmounts);
  refreshTaxAmounts();
  modal.querySelector("[data-close-modal]").addEventListener("click", () => closeModal(modal));
  if (isEditing) {
    modal.querySelector("#remove-service-modal").addEventListener("click", async (event) => {
      if (await removeService(job.id, event.currentTarget)) closeModal(modal);
    });
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = modal.querySelector("#job-status");
    const submit = event.currentTarget.querySelector("button[type='submit']");
    status.textContent = "Saving service...";
    status.classList.remove("error");
    submit.disabled = true;
    try {
      const formData = Object.fromEntries(new FormData(event.currentTarget));
      if (!customer) {
        const matchedCustomer = state.customers.find((item) => item.name.toLowerCase() === String(formData.customerLookup || "").trim().toLowerCase());
        if (!matchedCustomer) throw new Error("Choose a Customer from the list.");
        formData.customerId = matchedCustomer.id;
        formData.calendarCustomerName = matchedCustomer.name;
        formData.calendarJobAddress = [matchedCustomer.streetAddress, matchedCustomer.city, matchedCustomer.state, matchedCustomer.zipCode].filter(Boolean).join(", ");
      }
      const saved = await api("/api/crm/jobs", { method: isEditing ? "PUT" : "POST", body: JSON.stringify(formData) });
      closeModal(modal);
      const savedCustomerId = customer?.id || formData.customerId;
      state.selectedCustomer = state.customers.find((item) => item.id === savedCustomerId) || customer;
      upsertJobInState(saved.job);
      state.jobs = jobsForCustomer(savedCustomerId);
      renderDashboard();
      renderCustomers();
      renderDue();
      renderExpenses();
      renderSalesTax();
      renderProfile();
      switchScreen("profile");
      showNotice(`${isEditing ? "Service changes" : isWorkOrder ? "Work Order" : "Service"} saved to Google Sheets.`);
    } catch (error) {
      status.textContent = error.message;
      status.classList.add("error");
      showNotice(error.message || "Service could not be saved.", "error");
    } finally {
      submit.disabled = false;
    }
  });
}

function searchableJobField(job = null) {
  return `<div class="crm-field full"><label for="jobLookup">Job (Optional)</label><input id="jobLookup" name="jobLookup" list="job-options" value="${escapeHtml(job ? jobLabel(job) : "")}" placeholder="Start typing a customer or service" autocomplete="off"><datalist id="job-options">${state.allJobs.map((item) => `<option value="${escapeHtml(jobLabel(item))}"></option>`).join("")}</datalist></div>`;
}

function openExpenseModal(expense = null, presetJob = null) {
  const modal = document.querySelector("#expense-modal");
  const selectedJob = presetJob || jobById(expense?.jobId);
  const selectedCustomer = customerById(selectedJob?.customerId || expense?.customerId);
  modal.classList.add("open"); modal.setAttribute("aria-hidden", "false"); modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true");
  modal.innerHTML = `<form class="crm-modal-card" id="expense-form"><h2>${expense ? "Edit Expense" : "Add Expense"}</h2><input type="hidden" name="expenseId" value="${escapeHtml(expense?.id || "")}"><div class="crm-form-grid">
    ${field("Date", "date", expense?.date || todayIso(), true, "date")}${field("Vendor / Store", "vendor", expense?.vendor || "", true)}
    ${selectField("Category", "category", expense?.category || "", state.expenseCategories.length ? state.expenseCategories : defaultExpenseCategories)}${field("Description", "description", expense?.description || "")}
    ${field("Subtotal", "subtotal", expense?.subtotal || "", false, "number")}${field("Sales Tax", "salesTax", expense?.salesTax || "", false, "number")}${field("Total Amount", "totalAmount", expense?.totalAmount || "", true, "number")}
    ${selectField("Payment Method", "paymentMethod", expense?.paymentMethod || "", ["Cash", "Credit Card", "Debit Card", "Check", "ACH / Bank", "Other"])}
    ${searchableCustomerField(selectedCustomer, "Customer (Optional)")}${searchableJobField(selectedJob)}${textareaField("Notes", "notes", expense?.notes || "")}
    <div class="crm-field full"><label for="receiptFile">Receipt Photo / File</label><label class="crm-upload-button" for="receiptFile">${expense?.googleDriveFileId ? "Replace Receipt" : "Take Photo / Upload Receipt"}</label><input class="crm-file-input" id="receiptFile" type="file" accept="image/*,.heic,.heif,application/pdf"><small>Take a photo or choose JPG, JPEG, PNG, HEIC (when supported), or PDF up to 4 MB. Originals are not compressed.</small><div id="receipt-file-name">${expense?.receiptFileName ? escapeHtml(expense.receiptFileName) : "No receipt selected"}</div><div id="receipt-local-preview"></div></div>
    ${expense?.googleDriveFileId ? `<div class="crm-field full"><button class="crm-btn secondary" type="button" data-view-file="${escapeHtml(expense.googleDriveFileId)}">View Current Receipt</button></div>` : ""}
  </div><div class="crm-actions"><button class="crm-btn" type="submit">Save Expense</button><button class="crm-btn secondary" type="button" data-close-modal>Cancel</button></div><p class="crm-status" id="expense-status"></p></form>`;
  setModalLock();
  const form = modal.querySelector("#expense-form");
  const customerLookup = form.querySelector("#customerLookup");
  const jobLookup = form.querySelector("#jobLookup");
  jobLookup.addEventListener("change", () => {
    const matched = state.allJobs.find((item) => jobLabel(item).toLowerCase() === jobLookup.value.trim().toLowerCase());
    if (matched) customerLookup.value = customerById(matched.customerId)?.name || "";
  });
  ["subtotal", "salesTax"].forEach((name) => form.elements[name].addEventListener("input", () => {
    if (form.elements.subtotal.value || form.elements.salesTax.value) form.elements.totalAmount.value = ((Number(form.elements.subtotal.value) || 0) + (Number(form.elements.salesTax.value) || 0)).toFixed(2);
  }));
  form.querySelector("#receiptFile").addEventListener("change", (event) => { const selected = event.target.files[0]; form.querySelector("#receipt-file-name").textContent = selected?.name || "No receipt selected"; showSelectedFilePreview(selected, form.querySelector("#receipt-local-preview")); });
  form.querySelectorAll("[data-view-file]").forEach((button) => button.addEventListener("click", () => openFilePreview(button.dataset.viewFile, expense?.receiptFileName || "Receipt", expense?.googleDriveFileUrl)));
  modal.querySelector("[data-close-modal]").addEventListener("click", () => closeModal(modal));
  focusFirstEditableField(form); bindMobileInputFocus(form);
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); const status = form.querySelector("#expense-status"); const submit = form.querySelector("button[type='submit']"); submit.disabled = true; status.textContent = "Saving expense and receipt...";
    try {
      const body = Object.fromEntries(new FormData(form));
      const matchedJob = state.allJobs.find((item) => jobLabel(item).toLowerCase() === String(body.jobLookup || "").trim().toLowerCase());
      const matchedCustomer = state.customers.find((item) => item.name.toLowerCase() === String(body.customerLookup || "").trim().toLowerCase());
      if (body.jobLookup && !matchedJob) throw new Error("Choose a Job from the list or leave it blank.");
      if (body.customerLookup && !matchedCustomer && !matchedJob) throw new Error("Choose a Customer from the list or leave it blank.");
      body.jobId = matchedJob?.id || ""; body.customerId = matchedJob?.customerId || matchedCustomer?.id || "";
      body.file = await fileToPayload(form.querySelector("#receiptFile").files[0]);
      await api("/api/crm/expenses", { method: expense ? "PUT" : "POST", body: JSON.stringify(body) });
      closeModal(modal); await loadData(); switchScreen(presetJob ? "profile" : "expenses"); showNotice("Expense saved to Google Sheets and the receipt stored in Google Drive.");
      if (presetJob) await openJobDetail(presetJob.id);
    } catch (error) { status.textContent = error.message; status.classList.add("error"); showNotice(error.message, "error"); } finally { submit.disabled = false; }
  });
}

function bindExpenseButtons() {
  document.querySelectorAll("[data-view-file]").forEach((button) => {
    if (button.dataset.bound) return; button.dataset.bound = "true";
    button.addEventListener("click", () => {
      const expense = state.expenses.find((item) => item.googleDriveFileId === button.dataset.viewFile);
      openFilePreview(button.dataset.viewFile, expense?.receiptFileName || "Receipt", expense?.googleDriveFileUrl);
    });
  });
  document.querySelectorAll("[data-edit-expense]").forEach((button) => button.addEventListener("click", () => openExpenseModal(state.expenses.find((item) => item.id === button.dataset.editExpense))));
  document.querySelectorAll("[data-delete-expense]").forEach((button) => button.addEventListener("click", () => openDeleteExpenseDialog(state.expenses.find((item) => item.id === button.dataset.deleteExpense), button.closest(".crm-job-detail") ? state.selectedJob?.id : "")));
}

function openDeleteExpenseDialog(expense, returnJobId = "") {
  if (!expense) return;
  const modal = document.querySelector("#asset-modal"); modal.classList.add("open"); modal.setAttribute("aria-hidden", "false");
  modal.innerHTML = `<section class="crm-modal-card" role="dialog" aria-modal="true"><h2>Delete Expense</h2><p>Choose what to remove. Keeping the Drive file protects the original receipt.</p><div class="crm-actions"><button class="crm-btn danger" id="delete-record-only" type="button">Delete Expense Record Only</button>${expense.googleDriveFileId ? `<button class="crm-btn danger" id="delete-record-file" type="button">Delete Expense and Receipt File</button>` : ""}<button class="crm-btn secondary" data-close-modal type="button">Cancel</button></div><p class="crm-status" id="delete-status"></p></section>`;
  setModalLock(); modal.querySelector("[data-close-modal]").addEventListener("click", () => closeModal(modal));
  const remove = async (deleteFile) => {
    if (deleteFile && !confirm("Delete the original receipt file from Google Drive? This cannot be undone from the CRM.")) return;
    try { await api(`/api/crm/expenses?id=${encodeURIComponent(expense.id)}&deleteFile=${deleteFile}`, { method: "DELETE" }); closeModal(modal); await loadData(); if (returnJobId) await openJobDetail(returnJobId); else switchScreen("expenses"); showNotice(deleteFile ? "Expense and Drive receipt deleted." : "Expense record deleted; Drive receipt kept."); } catch (error) { modal.querySelector("#delete-status").textContent = error.message; }
  };
  modal.querySelector("#delete-record-only").addEventListener("click", () => remove(false));
  modal.querySelector("#delete-record-file")?.addEventListener("click", () => remove(true));
}

function openFilePreview(fileId, title, driveUrl = "") {
  const modal = document.querySelector("#preview-modal"); modal.classList.add("open"); modal.setAttribute("aria-hidden", "false");
  modal.innerHTML = `<section class="crm-modal-card crm-preview-card" role="dialog" aria-modal="true"><div class="crm-preview-header"><h2>${escapeHtml(title || "File Preview")}</h2><button class="crm-btn secondary" data-close-modal type="button">Close</button></div><iframe class="crm-file-preview" title="${escapeHtml(title || "File preview")}" src="${fileUrl(fileId)}"></iframe><div class="crm-actions"><a class="crm-btn" href="${fileUrl(fileId, true)}">Download / Open Original</a>${driveUrl ? `<a class="crm-btn secondary" target="_blank" rel="noopener" href="${escapeHtml(driveUrl)}">Open in Google Drive</a>` : ""}</div></section>`;
  setModalLock(); modal.querySelector("[data-close-modal]").addEventListener("click", () => closeModal(modal));
}

async function openJobDetail(jobId) {
  const modal = document.querySelector("#job-modal"); modal.classList.add("open"); modal.setAttribute("aria-hidden", "false"); modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true"); modal.innerHTML = `<section class="crm-modal-card"><p>Loading Work Order...</p></section>`; setModalLock();
  try {
    const data = await api(`/api/crm/job-assets?jobId=${encodeURIComponent(jobId)}`); state.selectedJob = data.job;
    const signed = data.job.signedWorkOrderFileId;
    modal.innerHTML = `<section class="crm-modal-card crm-job-detail"><div class="crm-preview-header"><div><h2>${escapeHtml(data.job.serviceType || "Work Order")}</h2><p>${escapeHtml(data.customer.name)} · ${escapeHtml(formatDisplayDate(jobServiceDate(data.job)))}</p><p><span class="crm-badge ${data.job.calendarSyncStatus === "Synced" ? "success" : "muted"}">Calendar: ${escapeHtml(data.job.calendarSyncStatus || "Not scheduled")}</span>${data.job.calendarSyncError ? ` <small>${escapeHtml(data.job.calendarSyncError)}</small>` : ""}</p></div><div class="crm-actions"><button class="crm-btn warning" id="job-edit-service" type="button">Edit Service</button><button class="crm-btn secondary" id="job-log-mileage" type="button">Log Mileage</button><button class="crm-btn secondary" data-close-modal type="button">Close</button></div></div>
      <div class="crm-stats crm-job-financial-stats"><div class="crm-stat"><strong>${formatMoney(data.job.subtotal || data.totals.revenue)}</strong><span>Subtotal (before tax)</span></div><div class="crm-stat"><strong>${formatMoney(data.job.salesTax)}</strong><span>Sales Tax (6.625%)</span></div><div class="crm-stat"><strong>${formatMoney(data.job.totalAmount || data.totals.totalAmount)}</strong><span>Total Amount</span></div><div class="crm-stat"><strong>${formatMoney(data.totals.totalExpenses)}</strong><span>Total Job Expenses</span></div><div class="crm-stat"><strong>${formatMoney(data.totals.grossProfit)}</strong><span>Gross Profit (before tax)</span></div></div>
      <section class="crm-subpanel"><h3>Job Expenses</h3><div class="crm-job-costs"><span>Parts & Materials <strong>${formatMoney(data.totals.partsMaterials)}</strong></span><span>Fuel / Travel <strong>${formatMoney(data.totals.fuelTravel)}</strong></span><span>Labor / Subcontractor <strong>${formatMoney(data.totals.laborSubcontractor)}</strong></span><span>Other Expenses <strong>${formatMoney(data.totals.other)}</strong></span></div><div class="crm-actions"><button class="crm-btn" id="job-add-expense" type="button">+ Add Expense</button></div>${data.expenses.length ? data.expenses.map(expenseCard).join("") : `<div class="crm-empty">No expenses linked to this Job.</div>`}</section>
      <section class="crm-subpanel"><h3>Signed Work Order</h3>${signed ? `<p class="crm-badge success">✓ Signed Work Order</p><p>${escapeHtml(data.job.signedWorkOrderFileName)}</p><div class="crm-actions"><button class="crm-btn secondary" data-preview-asset="${escapeHtml(signed)}" data-title="${escapeHtml(data.job.signedWorkOrderFileName)}" data-drive-url="${escapeHtml(data.job.signedWorkOrderUrl)}" type="button">View Signed Work Order</button><button class="crm-btn" data-upload-asset="signedWorkOrder" type="button">Replace Photo</button><button class="crm-btn danger" data-delete-asset="signedWorkOrder" data-job-id="${escapeHtml(jobId)}" type="button">Delete Photo</button></div>` : `<p class="crm-badge muted">No Signed Work Order Uploaded</p><div class="crm-actions"><button class="crm-btn" data-upload-asset="signedWorkOrder" type="button">Take Photo / Upload Signed Work Order</button></div>`}</section>
      <section class="crm-subpanel"><h3>Job Photos</h3><div class="crm-actions"><button class="crm-btn" data-upload-asset="photo" type="button">+ Add Photos</button></div><div class="crm-gallery">${data.photos.length ? data.photos.map((photo) => `<article class="crm-gallery-item"><button type="button" data-preview-asset="${escapeHtml(photo.googleDriveFileId)}" data-title="${escapeHtml(photo.fileName)}" data-drive-url="${escapeHtml(photo.googleDriveFileUrl)}"><img src="${fileUrl(photo.googleDriveFileId)}" alt="${escapeHtml(photo.category)} job photo"><span>${escapeHtml(photo.category)}</span></button><button class="crm-link-button danger-text" data-delete-asset="photo" data-id="${escapeHtml(photo.id)}" type="button">Delete</button></article>`).join("") : `<div class="crm-empty">No Job Photos uploaded.</div>`}</div></section>
      <section class="crm-subpanel"><h3>Job Documents</h3><div class="crm-actions"><button class="crm-btn" data-upload-asset="document" type="button">Upload File</button>${data.job.googleDriveFolderUrl ? `<a class="crm-btn secondary" target="_blank" rel="noopener" href="${escapeHtml(data.job.googleDriveFolderUrl)}">Open Job Folder in Google Drive</a>` : ""}</div><div class="crm-list">${data.documents.length ? data.documents.map((doc) => `<article class="crm-card"><h3>${escapeHtml(doc.documentType)}</h3><p>${escapeHtml(doc.fileName)}</p><div class="crm-actions"><button class="crm-btn secondary" data-preview-asset="${escapeHtml(doc.googleDriveFileId)}" data-title="${escapeHtml(doc.fileName)}" data-drive-url="${escapeHtml(doc.googleDriveFileUrl)}" type="button">View File</button><button class="crm-btn danger" data-delete-asset="document" data-id="${escapeHtml(doc.id)}" type="button">Delete</button></div></article>`).join("") : `<div class="crm-empty">No documents uploaded.</div>`}</div></section></section>`;
    modal.querySelector("[data-close-modal]").addEventListener("click", () => closeModal(modal));
    modal.querySelector("#job-edit-service").addEventListener("click", () => openJobModal(data.customer, "service", data.job));
    modal.querySelector("#job-log-mileage").addEventListener("click", () => openMileageModal(null, data.job));
    modal.querySelector("#job-add-expense").addEventListener("click", () => openExpenseModal(null, data.job));
    modal.querySelectorAll("[data-preview-asset]").forEach((button) => button.addEventListener("click", () => openFilePreview(button.dataset.previewAsset, button.dataset.title, button.dataset.driveUrl)));
    modal.querySelectorAll("[data-upload-asset]").forEach((button) => button.addEventListener("click", () => openAssetUpload(data.job, button.dataset.uploadAsset)));
    modal.querySelectorAll("[data-delete-asset]").forEach((button) => button.addEventListener("click", () => deleteJobAsset(data.job, button.dataset.deleteAsset, button.dataset.id)));
    bindExpenseButtons();
  } catch (error) { modal.innerHTML = `<section class="crm-modal-card"><h2>Work Order</h2><p class="crm-status error">${escapeHtml(error.message)}</p><button class="crm-btn secondary" data-close-modal type="button">Close</button></section>`; modal.querySelector("[data-close-modal]").addEventListener("click", () => closeModal(modal)); }
}

function openAssetUpload(job, assetType) {
  const modal = document.querySelector("#asset-modal"); const isPhoto = assetType === "photo"; const isDocument = assetType === "document"; const title = isPhoto ? "Add Job Photos" : isDocument ? "Upload Job Document" : "Signed Work Order";
  modal.classList.add("open"); modal.setAttribute("aria-hidden", "false");
  const acceptedFiles = isDocument ? ".pdf,.doc,.docx,image/*,.heic,.heif" : "image/*,.heic,.heif,application/pdf";
  modal.innerHTML = `<form class="crm-modal-card" id="asset-form" role="dialog" aria-modal="true"><h2>${title}</h2>${isPhoto ? selectField("Photo Category", "category", "Before", photoCategories) : ""}${isDocument ? selectField("Document Type", "documentType", "Estimate", documentTypes) : ""}${(isPhoto || isDocument) ? textareaField("Notes", "notes", "") : ""}<div class="crm-field"><label class="crm-upload-button" for="assetFile">${isPhoto ? "Take Photo / Choose From Library" : assetType === "signedWorkOrder" ? "Take Photo / Upload Signed Work Order" : "Upload File"}</label><input class="crm-file-input" id="assetFile" type="file" accept="${acceptedFiles}" ${isPhoto ? "multiple" : ""} required><small>Take a photo or choose an existing file. Originals are stored without compression. Maximum 4 MB per file.</small><div id="asset-local-preview"></div></div><div class="crm-actions"><button class="crm-btn" type="submit">Upload</button><button class="crm-btn secondary" data-close-modal type="button">Cancel</button></div><p class="crm-status" id="asset-status"></p></form>`;
  setModalLock(); const form = modal.querySelector("#asset-form"); modal.querySelector("[data-close-modal]").addEventListener("click", () => closeModal(modal));
  form.querySelector("#assetFile").addEventListener("change", (event) => showSelectedFilePreview(event.target.files[0], form.querySelector("#asset-local-preview")));
  form.addEventListener("submit", async (event) => { event.preventDefault(); const files = [...form.querySelector("#assetFile").files]; const status = form.querySelector("#asset-status"); const submit = form.querySelector("button[type='submit']"); submit.disabled = true;
    try { for (let index = 0; index < files.length; index += 1) { status.textContent = `Uploading ${index + 1} of ${files.length}...`; const body = { assetType, jobId: job.id, category: form.elements.category?.value, documentType: form.elements.documentType?.value, notes: form.elements.notes?.value, file: await fileToPayload(files[index]) }; await api("/api/crm/job-assets", { method: "POST", body: JSON.stringify(body) }); } closeModal(modal); await loadData(false); showNotice(`${title} saved in Google Drive.`); await openJobDetail(job.id); } catch (error) { status.textContent = error.message; status.classList.add("error"); } finally { submit.disabled = false; }
  });
}

function deleteJobAsset(job, assetType, idValue = "") {
  const modal = document.querySelector("#asset-modal"); modal.classList.add("open"); modal.setAttribute("aria-hidden", "false");
  const important = assetType === "signedWorkOrder"; modal.innerHTML = `<section class="crm-modal-card" role="dialog" aria-modal="true"><h2>Delete ${important ? "Signed Work Order" : "Attachment"}</h2><p>You can remove only the CRM record and keep the original Drive file, or remove both.</p><div class="crm-actions"><button class="crm-btn danger" id="asset-record-only" type="button">Delete Record Only</button><button class="crm-btn danger" id="asset-record-file" type="button">Delete Record and Drive File</button><button class="crm-btn secondary" data-close-modal type="button">Cancel</button></div><p class="crm-status" id="asset-delete-status"></p></section>`;
  setModalLock(); modal.querySelector("[data-close-modal]").addEventListener("click", () => closeModal(modal));
  const remove = async (deleteFile) => { if (deleteFile && !confirm(`Delete the original ${important ? "signed Work Order" : "file"} from Google Drive?`)) return; try { await api(`/api/crm/job-assets?assetType=${encodeURIComponent(assetType)}&jobId=${encodeURIComponent(job.id)}&id=${encodeURIComponent(idValue)}&deleteFile=${deleteFile}`, { method: "DELETE" }); closeModal(modal); await loadData(false); showNotice(deleteFile ? "Record and Drive file deleted." : "CRM record deleted; Drive file kept."); await openJobDetail(job.id); } catch (error) { modal.querySelector("#asset-delete-status").textContent = error.message; } };
  modal.querySelector("#asset-record-only").addEventListener("click", () => remove(false)); modal.querySelector("#asset-record-file").addEventListener("click", () => remove(true));
}

function closeModal(modal) {
  modal.querySelectorAll("[data-object-url]").forEach((container) => {
    if (container.dataset.objectUrl) URL.revokeObjectURL(container.dataset.objectUrl);
  });
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  modal.removeAttribute("role");
  modal.removeAttribute("aria-modal");
  modal.innerHTML = "";
  setModalLock();
}

function field(label, name, value, required = false, type = "text", className = "") {
  const inputAttributes = {
    firstName: 'autocomplete="given-name" autocapitalize="words"',
    lastName: 'autocomplete="family-name" autocapitalize="words"',
    phone: 'autocomplete="tel" inputmode="tel"',
    email: 'autocomplete="email" inputmode="email" autocapitalize="none"',
    streetAddress: 'autocomplete="street-address" autocapitalize="words"',
    city: 'autocomplete="address-level2" autocapitalize="words"',
    state: 'autocomplete="address-level1" autocapitalize="characters"',
    zipCode: 'autocomplete="postal-code" inputmode="numeric"',
    quotedPrice: 'inputmode="decimal"',
    finalPrice: 'inputmode="decimal"',
    subtotal: 'inputmode="decimal" step="0.01" min="0"',
    salesTax: 'inputmode="decimal" step="0.01" min="0"',
    totalAmount: 'inputmode="decimal" step="0.01" min="0"',
  };

  return `<div class="crm-field ${className}">
    <label for="${name}">${label}</label>
    <input id="${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" ${inputAttributes[name] || ""} ${required ? "required" : ""}>
  </div>`;
}

function readonlyMoneyField(label, name, value) {
  return `<div class="crm-field crm-calculated-field">
    <label for="${name}">${label}</label>
    <input id="${name}" name="${name}" type="number" step="0.01" min="0" value="${escapeHtml(value)}" readonly aria-readonly="true">
  </div>`;
}

function textareaField(label, name, value) {
  return `<div class="crm-field full">
    <label for="${name}">${label}</label>
    <textarea id="${name}" name="${name}" autocapitalize="sentences">${escapeHtml(value)}</textarea>
  </div>`;
}

function searchableCustomerField(customer = null, label = "Customer") {
  const optional = label.includes("Optional");
  return `<div class="crm-field full"><label for="customerLookup">${escapeHtml(label)}</label><input id="customerLookup" name="customerLookup" list="customer-options" value="${escapeHtml(customer?.name || "")}" placeholder="Start typing a customer name" autocomplete="off" ${optional ? "" : "required"}><datalist id="customer-options">${state.customers.map((item) => `<option value="${escapeHtml(item.name)}">${escapeHtml([item.city, item.phone].filter(Boolean).join(" · "))}</option>`).join("")}</datalist></div>`;
}

function selectField(label, name, value, options) {
  return `<div class="crm-field">
    <label for="${name}">${label}</label>
    <select id="${name}" name="${name}">
      <option value="">Select...</option>
      ${options.map((option) => {
        const optionValue = typeof option === "object" ? option.value : option;
        const optionLabel = typeof option === "object" ? option.label : option;
        return `<option value="${escapeHtml(optionValue)}" ${optionValue === value ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`;
      }).join("")}
    </select>
  </div>`;
}

async function loadData(renderAll = true) {
  const dashboardData = await api("/api/crm/dashboard");
  state.dashboard = dashboardData;
  state.customers = dashboardData.customers || [];
  state.allJobs = sortJobsNewestFirst(dashboardData.jobs || []);
  state.expenses = dashboardData.expenses || [];
  state.expenseSummary = dashboardData.expenseSummary || { total: 0, categoryTotals: {} };
  state.expenseCategories = dashboardData.expenseCategories || defaultExpenseCategories;
  state.mileage = dashboardData.mileage || [];
  state.mileageRates = dashboardData.mileageRates || [];
  state.mileageSettings = dashboardData.mileageSettings || state.mileageSettings;
  state.mileageDocuments = dashboardData.mileageDocuments || [];
  state.calendar = dashboardData.calendar || { connected: false };
  if (state.selectedCustomer) {
    state.selectedCustomer = state.customers.find((customer) => customer.id === state.selectedCustomer.id) || state.selectedCustomer;
    state.jobs = jobsForCustomer(state.selectedCustomer.id);
  }
  if (renderAll) {
    renderDashboard();
    renderCustomers();
    renderDue();
    renderExpenses();
    renderSalesTax();
    renderMileage();
    renderProfile();
  }
}

async function showDashboard() {
  shell();
  try {
    const session = await api("/api/crm/session");
    document.querySelector("#crm-user").textContent = session.email;
    await loadData();
  } catch (error) {
    showLogin(error.message);
  }
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/crm-assets/service-worker.js").catch(() => null);
}

showDashboard();
