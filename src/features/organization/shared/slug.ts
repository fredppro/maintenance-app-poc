/** URL-safe organization slug; the random suffix keeps equal company names from colliding. */
export function organizationSlug(
  name: string,
  suffix = crypto.randomUUID().slice(0, 8),
) {
  const base = name
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  if (!base) throw new Error("Organization name cannot form a URL slug");
  return `${base}-${suffix}`;
}
