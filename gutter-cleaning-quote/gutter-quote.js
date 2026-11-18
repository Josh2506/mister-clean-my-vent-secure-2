const gutterQuoteForm = document.querySelector(".gutter-quote-form");
const gutterQuoteStatus = gutterQuoteForm?.querySelector(".form-status");
const campaignKeys = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
];
const campaignStorageKey = "mcmv_gutter_quote_campaign";

const safeSessionGet = (key) => {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSessionSet = (key, value) => {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Tracking persistence is optional; the form remains functional without it.
  }
};

const getCampaignData = () => {
  let stored = {};
  const storedValue = safeSessionGet(campaignStorageKey);
  if (storedValue) {
    try {
      stored = JSON.parse(storedValue) || {};
    } catch {
      stored = {};
    }
  }

  const params = new URLSearchParams(window.location.search);
  campaignKeys.forEach((key) => {
    const value = params.get(key);
    if (value) stored[key] = value.slice(0, 500);
  });
  safeSessionSet(campaignStorageKey, JSON.stringify(stored));
  return stored;
};

const campaignData = getCampaignData();
campaignKeys.forEach((key) => {
  const input = gutterQuoteForm?.elements.namedItem(key);
  if (input) input.value = campaignData[key] || "";
});

window.mcmvMetaTracking?.pageView();

const createSubmissionId = () => {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `gutter-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

gutterQuoteForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!gutterQuoteForm.checkValidity()) {
    gutterQuoteForm.reportValidity();
    return;
  }

  const submitButton = gutterQuoteForm.querySelector("button[type='submit']");
  if (submitButton.disabled) return;

  const submissionId = createSubmissionId();
  gutterQuoteForm.elements.namedItem("submission-id").value = submissionId;
  gutterQuoteForm.elements.namedItem("submitted-at").value = new Date().toISOString();
  gutterQuoteForm.elements.namedItem("landing-url").value = window.location.href;
  gutterQuoteForm.elements.namedItem("referrer").value = document.referrer || "Direct / unavailable";

  const originalButtonText = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = "Sending Request…";
  gutterQuoteStatus.textContent = "Sending your estimate request securely…";
  gutterQuoteStatus.classList.remove("error");

  try {
    const formData = new FormData(gutterQuoteForm);
    const response = await fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(formData).toString(),
    });

    if (!response.ok) throw new Error("Netlify form submission failed");

    safeSessionSet(
      "mcmv_gutter_quote_pending_lead",
      JSON.stringify({ submissionId, submittedAt: Date.now() }),
    );
    gutterQuoteForm.reset();
    window.location.assign("/gutter-cleaning-thank-you/?submitted=1");
  } catch {
    gutterQuoteStatus.textContent = "We couldn't send your request. Please try again or call or text (732) 626-0685.";
    gutterQuoteStatus.classList.add("error");
    submitButton.disabled = false;
    submitButton.textContent = originalButtonText;
  }
});
