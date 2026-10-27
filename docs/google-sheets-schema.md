# Google Sheets Schema

Create a private Google Sheet named `Mister Clean My Vent CRM` with these tabs.

## Customers

| Column |
| --- |
| Customer ID |
| First Name |
| Last Name |
| Phone |
| Email |
| Street Address |
| City |
| State |
| ZIP Code |
| Lead Source |
| Neighborhood or Community |
| Preferred Contact Method |
| Date Added |
| Customer Status |
| General Notes |
| Created At |
| Updated At |
| Archived |

## Jobs

| Column |
| --- |
| Job ID |
| Customer ID |
| Appointment Date |
| Appointment Time |
| Job Status |
| Service Type |
| Service Description |
| Quoted Price |
| Final Price |
| Taxable |
| Subtotal |
| Sales Tax |
| Total Amount |
| Payment Status |
| Payment Method |
| Technician Notes |
| Before Photo Folder URL |
| After Photo Folder URL |
| Date Completed |
| Next Service Date |
| Estimated Duration Minutes |
| Calendar Event ID |
| Calendar Sync Status |
| Calendar Last Synced At |
| Calendar Sync Error |
| Created At |
| Updated At |
| Archived |

## Mileage

The `Mileage` tab stores odometer, GPS, reconstructed, and manual records with total, personal/nonqualifying, and eligible business miles kept separately. It also records location, purpose, review status, customer/job links, the date-effective IRS rate, estimated deduction, home-office qualification snapshot, parking/tolls, and audit timestamps.

MileIQ imports extend these rows with start/end timestamps, end location, MileIQ classification/purpose/vehicle, report and Gmail message identifiers, a stable source fingerprint, MileIQ's reported rate, and import timestamp. Raw miles stay separate from the CRM's date-effective deduction calculation.

## Mileage Documents

Stores Drive metadata for GPS screenshots, route records, and other supporting files linked by Mileage ID. File bytes remain in the existing protected CRM Drive folder.

## Mileage Rates

| Effective Start | Effective End | Business Rate |
| --- | --- | --- |
| 2026-01-01 | 2026-06-30 | 0.725 |
| 2026-07-01 | 2026-12-31 | 0.76 |

## CRM Settings

Stores the default vehicle (`2007 Toyota Tacoma`) and the current documented home-office qualification setting. This setting does not automatically classify first/last trips as deductible.

## Vehicles

Maps MileIQ vehicle names to CRM display names. The initial active/default mapping is `Toyota Tacoma 2007` → `2007 Toyota Tacoma`; additional vehicles can be added without changing imported history.

## MileIQ Imports

Stores one audit row per processed report, including Gmail/report identifiers, CSV hash, counts for found, business, inserted, duplicate, and rejected rows, status, and error summary.

## Reminders

| Column |
| --- |
| Reminder ID |
| Customer ID |
| Job ID |
| Reminder Type |
| Due Date |
| Reminder Status |
| Contact Method |
| Date Contacted |
| Customer Response |
| Follow-Up Date |
| Notes |
| Created At |
| Updated At |

## Leads

| Column |
| --- |
| Lead ID |
| First Name |
| Last Name |
| Phone |
| Email |
| Address |
| City |
| ZIP Code |
| Lead Source |
| Campaign |
| Neighborhood or Community |
| Service Requested |
| Date Received |
| Lead Status |
| Estimate Amount |
| Follow-Up Date |
| Notes |
| Converted Customer ID |
| Created At |
| Updated At |

## Services

| Column |
| --- |
| Service ID |
| Service Name |
| Default Price |
| Default Reminder Months |
| Active |
| Notes |

Starter service rows:

| Service ID | Service Name | Default Price | Default Reminder Months | Active | Notes |
| --- | --- | --- | --- | --- | --- |
| svc_dryer_vent_cleaning | Dryer Vent Cleaning |  | 12 | TRUE | Annual reminder by default |
| svc_air_duct_cleaning_residential | Air Duct Cleaning — Residential (Cleaning Only) |  |  | TRUE | Estimate based on systems, property size, access, and scope |
| svc_air_duct_cleaning_commercial | Air Duct Cleaning — Commercial (Cleaning Only) |  |  | TRUE | Estimate based on systems, property size, access, and scope |
| svc_exterior_dryer_vent_cleaning | Exterior Dryer Vent Cleaning |  | 12 | TRUE |  |
| svc_gutter_cleaning | Gutter Cleaning |  | 6 | TRUE |  |
| svc_house_washing | House Washing |  | 24 | TRUE |  |
| svc_patio_cleaning | Patio Cleaning |  | 12 | TRUE |  |
| svc_driveway_cleaning | Driveway Cleaning |  | 12 | TRUE |  |
| svc_pressure_washing | Pressure Washing |  | 12 | TRUE |  |
| svc_other | Other |  |  | TRUE |  |
