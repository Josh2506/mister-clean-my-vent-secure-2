(() => {
  const measurementId = "G-8G4DFWG5QD";
  let initialized = false;

  const configure = () => {
    if (initialized) return true;
    if (
      window.mcmvMetaConsent?.current() !== "granted" ||
      navigator.globalPrivacyControl === true
    ) return false;

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", measurementId);

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.append(script);
    initialized = true;
    return true;
  };

  configure();
  window.addEventListener("mcmv:advertising-consent", (event) => {
    if (event.detail === "granted") configure();
  });
})();
