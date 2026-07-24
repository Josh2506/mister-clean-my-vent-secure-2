# Mister Clean My Vent CRM Setup Plan

This branch prepares the private CRM foundation without changing the public website.

## What the Current Website Uses

- Framework: static HTML, CSS, and JavaScript.
- Hosting: Netlify.
- Database: none yet.
- Authentication: none yet.
- Public form handling: Netlify Forms.
- Deployment: GitHub pushes are deployed by Netlify.

Because the site is static, customer records cannot be safely saved directly from browser JavaScript. The CRM needs private server-side endpoints that check login first, then read and write data.

## Recommended First Version

Use Google Sheets as the simple private database and Netlify Functions as the server-side layer.

- GitHub stores only code and placeholders.
- Netlify stores environment variables and private keys.
- Google Sheets stores customers, jobs, reminders, leads, and service lists.
- The browser never receives Google credentials.
- `/admin` can be the CRM route, but security must come from login and server-side authorization, not the URL being hard to guess.

## Why This Is Safe

- The Google Sheet stays private.
- The service account can access only the CRM spreadsheet you share with it.
- All customer requests go through authenticated server-side functions.
- Secrets stay in Netlify environment variables, not GitHub.
- Customer data is not placed in the public website files.

## Phase 1 Scope

Build only:

- Secure login.
- Basic dashboard.
- Customer database.
- Add, edit, view, search, and archive customers.
- Service history for each customer.
- Next-service-date field.
- Due-soon and overdue customer lists.

Future phases can add photo uploads, invoices, estimates, calendar views, exports, backups, and two-factor authentication.

## Google Sheet Setup

1. Open Google Drive.
2. Create a private Google Sheet named `Mister Clean My Vent CRM`.
3. Add the tabs and columns listed in [Google Sheets Schema](google-sheets-schema.md), or use the setup helper in `tools/create-crm-google-sheet.gs`.
4. Create a Google Cloud service account.
5. Enable the Google Sheets API for that Google Cloud project.
6. Share the spreadsheet with the service account email as an editor.
7. Put the spreadsheet ID and service account credentials into Netlify environment variables.

## Netlify Environment Variables

Add these in Netlify under Site configuration, then Environment variables:

- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_DRIVE_PHOTOS_FOLDER_ID`
- `CRM_ADMIN_EMAILS`
- `CRM_SESSION_SECRET`
- `CRM_RATE_LIMIT_WINDOW_MS`
- `CRM_RATE_LIMIT_MAX_REQUESTS`

Use `.env.example` only as a template. Do not paste real keys into GitHub.

## PWA Plan

The existing website can support a private CRM Progressive Web App, but it needs new private files:

- A CRM-only web app manifest.
- CRM app icons.
- Standalone display mode.
- A service worker that caches only safe CRM app shell files.
- No sensitive customer records in offline cache.

The installed app name should be `Mister Clean My Vent CRM`.

## Deployment Plan

1. Keep all CRM work on a feature branch.
2. Build and test locally.
3. Confirm logged-out users cannot access `/admin` data or API endpoints.
4. Confirm CRM files do not appear in public navigation.
5. Push the branch to GitHub.
6. Let Netlify create a deploy preview.
7. Review the preview.
8. Merge only after the private login and data checks pass.

## Backup Plan

Google Sheets can be exported manually as CSV or XLSX. A later CRM phase can add an admin export button and scheduled backups.

