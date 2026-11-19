/* Official Mister Clean My Vent LLC Meta Dataset/Pixel ID. */
window.MCMV_META_PIXEL_ID = "4733805316851448";

window.mcmvMetaTracking = (() => {
  let initialized = false;
  let pageViewSent = false;

  const hasAdvertisingConsent = () =>
    window.mcmvMetaConsent?.current() === "granted" &&
    navigator.globalPrivacyControl !== true;

  const configure = () => {
    const pixelId = String(window.MCMV_META_PIXEL_ID || "").trim();
    if (initialized) return true;
    if (!pixelId || !hasAdvertisingConsent()) return false;

    /* Meta's standard loader is inserted only when a verified ID exists. */
    ((f, b, e, v, n, t, s) => {
      if (f.fbq) return;
      n = f.fbq = function metaQueue() {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = "2.0";
      n.queue = [];
      t = b.createElement(e);
      t.async = true;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

    /* Do not scan form fields or send automatic advanced-matching data. */
    window.fbq("set", "autoConfig", false, pixelId);
    window.fbq("init", pixelId);
    initialized = true;
    return true;
  };

  const pageView = () => {
    if (pageViewSent) return true;
    if (!configure()) return false;
    window.fbq("track", "PageView");
    pageViewSent = true;
    return true;
  };

  const lead = (submissionId) => {
    if (!configure() || !submissionId) return false;
    window.fbq(
      "track",
      "Lead",
      { content_name: "Gutter Cleaning Estimate Request" },
      { eventID: submissionId },
    );
    return true;
  };

  return { pageView, lead };
})();
