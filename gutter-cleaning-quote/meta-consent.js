const metaConsentStorageKey = "mcmv_advertising_consent_v1";
const metaRegionStorageKey = "mcmv_privacy_region_v1";

const safeStorageGet = (storage, key) => {
  try { return storage.getItem(key); } catch { return null; }
};

const safeStorageSet = (storage, key, value) => {
  try { storage.setItem(key, value); } catch {
    // The form and privacy controls remain usable when storage is unavailable.
  }
};

const readSavedConsent = () => {
  const value = safeStorageGet(window.localStorage, metaConsentStorageKey);
  return value === "granted" || value === "denied" ? value : "unknown";
};

const readRegionalMode = () => {
  const value = safeStorageGet(window.sessionStorage, metaRegionStorageKey);
  return value === "us-opt-out" || value === "prior-consent" ? value : "unknown";
};

const clearMetaCookies = () => {
  ["_fbp", "_fbc"].forEach((name) => {
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
  });
};

let savedMetaConsent = readSavedConsent();
let regionalMetaMode = readRegionalMode();

const currentMetaPermission = () => {
  if (navigator.globalPrivacyControl === true || savedMetaConsent === "denied") return "denied";
  if (savedMetaConsent === "granted" || regionalMetaMode === "us-opt-out") return "granted";
  return "unknown";
};

window.mcmvMetaConsent = {
  current: currentMetaPermission,
  showChoices: () => showMetaConsentBanner(true),
};

const removeMetaConsentBanner = () => document.querySelector(".meta-consent")?.remove();

const announceMetaPermission = () => {
  window.dispatchEvent(new CustomEvent("mcmv:advertising-consent", {
    detail: currentMetaPermission(),
  }));
};

const setMetaConsent = (value) => {
  savedMetaConsent = value;
  safeStorageSet(window.localStorage, metaConsentStorageKey, value);
  if (value === "denied") clearMetaCookies();
  removeMetaConsentBanner();
  announceMetaPermission();
};

function showMetaConsentBanner(force = false) {
  if (navigator.globalPrivacyControl === true || document.querySelector(".meta-consent")) return;
  if (!force && currentMetaPermission() !== "unknown") return;

  const banner = document.createElement("aside");
  banner.className = "meta-consent";
  banner.setAttribute("aria-label", "Advertising cookie choices");
  banner.innerHTML = `
    <div class="meta-consent__copy">
      <strong>Advertising cookie choices</strong>
      <span>We use optional analytics and a Meta Pixel to measure website and ad results. They do not receive the contact details entered in this form. <a href="/privacy-policy/" target="_blank" rel="noopener">Privacy Policy</a></span>
    </div>
    <div class="meta-consent__actions">
      <button type="button" data-meta-consent="denied">Decline</button>
      <button class="allow" type="button" data-meta-consent="granted">Accept</button>
    </div>`;

  banner.addEventListener("click", (event) => {
    const choice = event.target.closest("[data-meta-consent]")?.dataset.metaConsent;
    if (choice === "granted" || choice === "denied") setMetaConsent(choice);
  });
  document.body.append(banner);
}

const resolveRegionalMode = async () => {
  if (regionalMetaMode !== "unknown") return regionalMetaMode;

  try {
    const response = await fetch("/api/privacy-region", {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error("Privacy region lookup failed");
    const result = await response.json();
    regionalMetaMode = result?.consentRequired === false ? "us-opt-out" : "prior-consent";
  } catch {
    regionalMetaMode = "prior-consent";
  }

  safeStorageSet(window.sessionStorage, metaRegionStorageKey, regionalMetaMode);
  return regionalMetaMode;
};

document.addEventListener("DOMContentLoaded", async () => {
  document.querySelectorAll("[data-meta-privacy-choices]").forEach((button) => {
    button.addEventListener("click", () => showMetaConsentBanner(true));
  });

  if (navigator.globalPrivacyControl === true) {
    clearMetaCookies();
    return;
  }
  if (savedMetaConsent !== "unknown") return;

  const mode = await resolveRegionalMode();
  if (mode === "us-opt-out") announceMetaPermission();
  else showMetaConsentBanner();
});
