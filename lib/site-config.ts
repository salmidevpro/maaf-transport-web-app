import "server-only";

// NEXT_PUBLIC_* values are normally embedded during `next build`. Read the
// legacy setting through a computed key so cPanel's runtime value is honored.
const legacySiteUrlKey = ["NEXT_PUBLIC", "SITE_URL"].join("_");

export function getSiteUrl() {
  return process.env.MAAF_SITE_URL?.trim() || process.env[legacySiteUrlKey]?.trim() || "";
}
