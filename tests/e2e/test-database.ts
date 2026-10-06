export function validateE2EDatabaseUrl(
  databaseUrl?: string,
  applicationDatabaseUrl?: string,
) {
  if (!databaseUrl) {
    throw new Error(
      "Set E2E_DATABASE_URL to a dedicated test database before running E2E tests.",
    );
  }

  const parsedUrl = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsedUrl.pathname.slice(1));

  if (
    !["postgres:", "postgresql:"].includes(parsedUrl.protocol) ||
    !/(^|_)test$/i.test(databaseName)
  ) {
    throw new Error(
      "E2E_DATABASE_URL must be a PostgreSQL URL for a database whose name ends in '_test'.",
    );
  }

  if (applicationDatabaseUrl) {
    const applicationUrl = new URL(applicationDatabaseUrl);
    const databaseIdentity = (url: URL) =>
      [
        url.protocol,
        url.hostname.toLowerCase(),
        url.port || "5432",
        decodeURIComponent(url.pathname.slice(1)),
      ].join("|");

    if (databaseIdentity(parsedUrl) === databaseIdentity(applicationUrl)) {
      throw new Error(
        "E2E_DATABASE_URL must target a different PostgreSQL database from DATABASE_URL.",
      );
    }
  }

  return databaseUrl;
}
