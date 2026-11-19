export default async function privacyRegion(_request, context) {
  const countryCode = String(context?.geo?.country?.code || "").toUpperCase();

  return Response.json(
    { consentRequired: countryCode !== "US" },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export const config = { path: "/api/privacy-region" };
