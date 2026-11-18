const pendingLeadKey = "mcmv_gutter_quote_pending_lead";
const confirmationWindowMs = 30 * 60 * 1000;

const readStorage = (storage, key) => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (storage, key, value) => {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const params = new URLSearchParams(window.location.search);
const pendingRaw = readStorage(window.sessionStorage, pendingLeadKey);
let pendingLead = null;

if (params.get("submitted") === "1" && pendingRaw) {
  try {
    const parsed = JSON.parse(pendingRaw);
    if (
      parsed?.submissionId &&
      Number.isFinite(parsed.submittedAt) &&
      Date.now() - parsed.submittedAt >= 0 &&
      Date.now() - parsed.submittedAt < confirmationWindowMs
    ) {
      pendingLead = parsed;
    }
  } catch {
    pendingLead = null;
  }
}

if (pendingLead) {
  const gaKey = `mcmv_gutter_ga_lead_${pendingLead.submissionId}`;
  if (!readStorage(window.localStorage, gaKey) && typeof window.gtag === "function") {
    window.gtag("event", "generate_lead", {
      lead_source: "Gutter Cleaning Landing Page",
      service: "Gutter Cleaning",
    });
    writeStorage(window.localStorage, gaKey, "1");
  }

  const metaKey = `mcmv_gutter_meta_lead_${pendingLead.submissionId}`;
  if (!readStorage(window.localStorage, metaKey)) {
    const metaSent = window.mcmvMetaTracking?.lead(pendingLead.submissionId);
    if (metaSent) writeStorage(window.localStorage, metaKey, "1");
  }
}
