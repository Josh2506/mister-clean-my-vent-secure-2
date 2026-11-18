/*
 * Meta Pixel is intentionally disabled until Mister Clean My Vent LLC provides
 * its real Meta Dataset/Pixel ID. Add the verified ID below only after approval.
 */
window.MCMV_META_PIXEL_ID = "";

window.mcmvMetaTracking = (() => {
  let initialized = false;

  const configure = () => {
    const pixelId = String(window.MCMV_META_PIXEL_ID || "").trim();
    if (initialized) return true;
    if (!pixelId) return false;

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

    window.fbq("init", pixelId);
    initialized = true;
    return true;
  };

  const pageView = () => {
    if (!configure()) return false;
    window.fbq("track", "PageView");
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
