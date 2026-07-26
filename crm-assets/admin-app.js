const app = document.querySelector("#crm-app");

const state = {
  customers: [],
  selectedCustomer: null,
  dashboard: null,
  jobs: [],
  allJobs: [],
  dashboardMonth: "",
};

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
  if (!response.ok) {
    throw new Error(data.error || "CRM request failed.");
  }
  return data;
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
        <button type="button" data-screen="profile">Profile</button>
      </nav>
      <div class="crm-toast" id="crm-toast" role="status" aria-live="polite"></div>
      <div class="crm-content">
        <section id="screen-dashboard" class="crm-screen active"></section>
        <section id="screen-customers" class="crm-screen"></section>
        <section id="screen-due" class="crm-screen"></section>
        <section id="screen-profile" class="crm-screen"></section>
      </div>
      <div class="crm-modal" id="customer-modal" aria-hidden="true"></div>
      <div class="crm-modal" id="job-modal" aria-hidden="true"></div>
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
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return "Selected month";
  }
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function moneyValue(value) {
  const amount = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function formatMoney(amount) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function dashboardMonthOptions() {
  const currentMonth = monthKey(state.dashboard?.today || new Date().toISOString());
  const months = new Set([currentMonth]);
  state.allJobs.forEach((job) => {
    const month = monthKey(job.dateCompleted || job.appointmentDate);
    if (month) {
      months.add(month);
    }
  });
  return [...months].sort().reverse();
}

function monthlyJobSummary(month) {
  const monthJobs = state.allJobs.filter((job) => monthKey(job.dateCompleted || job.appointmentDate) === month);
  const completedJobs = monthJobs.filter((job) => job.jobStatus === "Completed" || Boolean(job.dateCompleted));
  const scheduledJobs = monthJobs.filter((job) => !["Completed", "Canceled"].includes(job.jobStatus) && !job.dateCompleted);
  const revenue = completedJobs.reduce((total, job) => total + moneyValue(job.finalPrice || job.quotedPrice), 0);
  const completedWithCustomers = completedJobs.map((job) => ({
    ...job,
    customer: state.customers.find((customer) => customer.id === job.customerId) || null,
  }));
  return { completedJobs: completedWithCustomers, scheduledJobs, revenue };
}

function renderDashboard() {
  const dashboard = state.dashboard;
  const availableMonths = dashboardMonthOptions();
  if (!state.dashboardMonth || !availableMonths.includes(state.dashboardMonth)) {
    state.dashboardMonth = monthKey(dashboard.today);
  }
  const monthly = monthlyJobSummary(state.dashboardMonth);
  document.querySelector("#screen-dashboard").innerHTML = `
    <div class="crm-page-title">
      <h1>Today</h1>
      <p>${escapeHtml(dashboard.today)} service dashboard.</p>
      <div class="crm-actions">
        <button class="crm-btn" type="button" id="add-work-order-button">Add Work Order</button>
        <button class="crm-btn" type="button" id="add-customer-button">Add Customer</button>
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
          <div>
            <h2>Monthly Progress</h2>
            <p>Completed work and scheduled jobs for ${escapeHtml(monthLabel(state.dashboardMonth))}.</p>
          </div>
          <div class="crm-field crm-month-picker">
            <label for="dashboard-month">Month</label>
            <select id="dashboard-month">
              ${availableMonths.map((month) => `<option value="${escapeHtml(month)}" ${month === state.dashboardMonth ? "selected" : ""}>${escapeHtml(monthLabel(month))}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="crm-stats crm-monthly-stats">
          <div class="crm-stat"><strong>${monthly.completedJobs.length}</strong><span>Jobs completed</span></div>
          <div class="crm-stat"><strong>${monthly.scheduledJobs.length}</strong><span>Still scheduled</span></div>
          <div class="crm-stat"><strong>${escapeHtml(formatMoney(monthly.revenue))}</strong><span>Completed revenue</span></div>
        </div>
        <h3 class="crm-subheading">Jobs Done</h3>
        <div class="crm-list">${renderJobCards(monthly.completedJobs, true)}</div>
      </section>
      <section class="crm-panel crm-col-12">
        <h2>Unpaid or Partially Paid</h2>
        <div class="crm-list">${renderJobCards(dashboard.unpaidJobs, true)}</div>
      </section>
    </div>
  `;
  document.querySelector("#add-work-order-button").addEventListener("click", openWorkOrderPicker);
  document.querySelector("#add-customer-button").addEventListener("click", () => openCustomerModal());
  document.querySelector("#refresh-button").addEventListener("click", showDashboard);
  document.querySelector("#dashboard-month").addEventListener("change", (event) => {
    state.dashboardMonth = event.target.value;
    renderDashboard();
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
        <div class="crm-panel-heading">
          <div>
            <h2>Service History</h2>
            <p>Completed visits and previous work for this customer.</p>
          </div>
          <button class="crm-btn" type="button" id="add-service-button">Add Service</button>
        </div>
        <div class="crm-list">${renderJobCards(profileJobs, false)}</div>
      </section>
    </div>
  `;

  document.querySelector("#edit-selected-customer").addEventListener("click", () => openCustomerModal(customer));
  document.querySelector("#add-work-order-profile").addEventListener("click", () => openJobModal(customer, "work-order"));
  document.querySelector("#add-service-button").addEventListener("click", () => openJobModal(customer, "service"));
  document.querySelectorAll("[data-edit-service]").forEach((button) => {
    button.addEventListener("click", () => {
      const job = profileJobs.find((item) => item.id === button.dataset.editService);
      if (job) {
        openJobModal(customer, "service", job);
      }
    });
  });
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

function renderJobCards(jobs, showCustomer) {
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
        <p>Next service: ${escapeHtml(formatDisplayDate(job.nextServiceDate))} ${due}</p>
        ${job.technicianNotes ? `<p>${escapeHtml(job.technicianNotes)}</p>` : ""}
        ${showCustomer ? "" : `
          <div class="crm-actions">
            <button class="crm-btn secondary" type="button" data-edit-service="${escapeHtml(job.id)}">Edit Service</button>
          </div>
        `}
      </article>
    `;
  }).join("");
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
      const jobData = await api(`/api/crm/jobs?customerId=${encodeURIComponent(customer.id)}`);
      state.jobs = sortJobsNewestFirst(jobData.jobs);
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
      <div class="crm-field">
        <label for="work-order-customer">Customer</label>
        <select id="work-order-customer" name="customerId" required>
          <option value="">Select a customer...</option>
          ${[...state.customers].sort((a, b) => a.name.localeCompare(b.name)).map((customer) => `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.name || "Unnamed Customer")} ${customer.streetAddress ? `— ${escapeHtml(customer.streetAddress)}` : ""}</option>`).join("")}
        </select>
      </div>
      <div class="crm-actions">
        <button class="crm-btn" type="submit">Continue</button>
        <button class="crm-btn secondary" type="button" data-close-modal>Cancel</button>
      </div>
    </form>
  `;
  setModalLock();
  const form = modal.querySelector("#work-order-customer-form");
  bindMobileInputFocus(form);
  modal.querySelector("[data-close-modal]").addEventListener("click", () => closeModal(modal));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const customer = state.customers.find((item) => item.id === new FormData(form).get("customerId"));
    if (customer) {
      openJobModal(customer, "work-order");
    }
  });
}

function openJobModal(customer, mode = "service", job = null) {
  const isWorkOrder = mode === "work-order";
  const isEditing = Boolean(job);
  const today = state.dashboard?.today || new Date().toISOString().slice(0, 10);
  const modal = document.querySelector("#job-modal");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.innerHTML = `
    <form class="crm-modal-card" id="job-form">
      <h2>${isEditing ? "Edit Service" : isWorkOrder ? "Add Work Order" : "Add Service"} for ${escapeHtml(customer.name)}</h2>
      <input type="hidden" name="customerId" value="${escapeHtml(customer.id)}">
      <input type="hidden" name="jobId" value="${escapeHtml(job?.id || "")}">
      <div class="crm-form-grid">
        ${field("Appointment Date", "appointmentDate", job?.appointmentDate || (isWorkOrder ? "" : today), false, "date")}
        ${field("Appointment Time", "appointmentTime", job?.appointmentTime || "", false, "time")}
        ${selectField("Job Status", "jobStatus", job?.jobStatus || (isWorkOrder ? "Scheduled" : "Completed"), ["Lead", "Estimate Scheduled", "Estimate Sent", "Scheduled", "In Progress", "Completed", "Canceled"])}
        ${selectField("Service Type", "serviceType", job?.serviceType || "Dryer Vent Cleaning", serviceOptions)}
        ${field("Quoted Price", "quotedPrice", job?.quotedPrice || "")}
        ${field("Final Price", "finalPrice", job?.finalPrice || "")}
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
      </div>
      <p class="crm-status" id="job-status"></p>
    </form>
  `;

  setModalLock();
  const form = modal.querySelector("#job-form");
  focusFirstEditableField(form);
  bindMobileInputFocus(form);
  modal.querySelector("[data-close-modal]").addEventListener("click", () => closeModal(modal));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = modal.querySelector("#job-status");
    const submit = event.currentTarget.querySelector("button[type='submit']");
    status.textContent = "Saving service...";
    status.classList.remove("error");
    submit.disabled = true;
    try {
      await api("/api/crm/jobs", {
        method: isEditing ? "PUT" : "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),
      });
      closeModal(modal);
      await loadData(false);
      state.selectedCustomer = state.customers.find((item) => item.id === customer.id) || customer;
      const jobData = await api(`/api/crm/jobs?customerId=${encodeURIComponent(customer.id)}`);
      state.jobs = sortJobsNewestFirst(jobData.jobs);
      renderDashboard();
      renderCustomers();
      renderDue();
      renderProfile();
      switchScreen("profile");
      showNotice(`${isEditing ? "Service changes" : isWorkOrder ? "Work order" : "Service"} saved to Google Sheets.`);
    } catch (error) {
      status.textContent = error.message;
      status.classList.add("error");
      showNotice(error.message || "Service could not be saved.", "error");
    } finally {
      submit.disabled = false;
    }
  });
}

function closeModal(modal) {
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
  };

  return `<div class="crm-field ${className}">
    <label for="${name}">${label}</label>
    <input id="${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" ${inputAttributes[name] || ""} ${required ? "required" : ""}>
  </div>`;
}

function textareaField(label, name, value) {
  return `<div class="crm-field full">
    <label for="${name}">${label}</label>
    <textarea id="${name}" name="${name}" autocapitalize="sentences">${escapeHtml(value)}</textarea>
  </div>`;
}

function selectField(label, name, value, options) {
  return `<div class="crm-field">
    <label for="${name}">${label}</label>
    <select id="${name}" name="${name}">
      <option value="">Select...</option>
      ${options.map((option) => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
    </select>
  </div>`;
}

async function loadData(renderAll = true) {
  const [dashboardData, customerData, jobData] = await Promise.all([
    api("/api/crm/dashboard"),
    api("/api/crm/customers"),
    api("/api/crm/jobs"),
  ]);
  state.dashboard = dashboardData;
  state.customers = customerData.customers;
  state.allJobs = sortJobsNewestFirst(jobData.jobs || []);
  if (state.selectedCustomer) {
    state.selectedCustomer = state.customers.find((customer) => customer.id === state.selectedCustomer.id) || state.selectedCustomer;
    state.jobs = jobsForCustomer(state.selectedCustomer.id);
  }
  if (renderAll) {
    renderDashboard();
    renderCustomers();
    renderDue();
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
