const { html } = require("./_shared/http");

exports.handler = async function handler() {
  return html(200, `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>Mister Clean My Vent CRM</title>
    <link rel="manifest" href="/crm-assets/manifest.webmanifest">
    <link rel="stylesheet" href="/crm-assets/admin.css">
    <meta name="theme-color" content="#143d1f">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-title" content="MCMV CRM">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  </head>
  <body>
    <main id="crm-app" class="crm-app" aria-live="polite">
      <section class="crm-loading">
        <p>Loading Mister Clean My Vent CRM...</p>
      </section>
    </main>
    <script src="/crm-assets/admin-app.js" defer></script>
  </body>
</html>`);
};

