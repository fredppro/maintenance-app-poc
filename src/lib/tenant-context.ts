import { cookies, headers } from "next/headers";
import { auth } from "@/features/auth/server/auth";
import prisma, { forTenant } from "@/lib/prisma";

export const ACTIVE_SITE_COOKIE = "maintenance_active_site";

export type TenantPermission =
  | "viewMaintenance"
  | "viewReports"
  | "manageMaintenance"
  | "deleteMaintenance"
  | "manageWorkers"
  | "manageSites"
  | "manageMembers"
  | "manageOrganization";

const rolePermissions: Record<string, ReadonlySet<TenantPermission>> = {
  owner: new Set([
    "viewMaintenance",
    "viewReports",
    "manageMaintenance",
    "deleteMaintenance",
    "manageWorkers",
    "manageSites",
    "manageMembers",
    "manageOrganization",
  ]),
  admin: new Set([
    "viewMaintenance",
    "viewReports",
    "manageMaintenance",
    "deleteMaintenance",
    "manageWorkers",
    "manageSites",
    "manageMembers",
    "manageOrganization",
  ]),
  maintenance_manager: new Set([
    "viewMaintenance",
    "viewReports",
    "manageMaintenance",
    "deleteMaintenance",
    "manageWorkers",
  ]),
  read_only: new Set(["viewMaintenance", "viewReports"]),
  // Better Auth's default member role is deliberately least-privileged.
  member: new Set(["viewMaintenance", "viewReports"]),
};

export function roleCan(role: string, permission: TenantPermission) {
  return rolePermissions[role]?.has(permission) ?? false;
}

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Authentication is required");
    this.name = "AuthenticationRequiredError";
  }
}

export class OrganizationRequiredError extends Error {
  constructor() {
    super("An active organization is required");
    this.name = "OrganizationRequiredError";
  }
}

export class SiteSetupRequiredError extends Error {
  constructor() {
    super("The active organization needs a site");
    this.name = "SiteSetupRequiredError";
  }
}

export class SiteSelectionRequiredError extends Error {
  constructor() {
    super("Select an available site to continue");
    this.name = "SiteSelectionRequiredError";
  }
}

export class TenantInactiveError extends Error {
  constructor(readonly status: "SUSPENDED" | "PENDING_DELETION") {
    super(`The organization is ${status.toLowerCase().replace("_", " ")}`);
    this.name = "TenantInactiveError";
  }
}

export class PermissionDeniedError extends Error {
  constructor(permission: TenantPermission) {
    super(`The active role does not allow ${permission}`);
    this.name = "PermissionDeniedError";
  }
}

export async function getAvailableTenantContexts() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new AuthenticationRequiredError();

  const memberships = await prisma.member.findMany({
    where: { userId: session.user.id },
    select: {
      organizationId: true,
      role: true,
      organization: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Sites are row-level secured, so each organization is read in its own tenant scope.
  const perOrganization = await Promise.all(
    memberships.map(async (membership) => {
      const sites = await forTenant(membership.organizationId).site.findMany({
        where: { organizationId: membership.organizationId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      return sites.map((site) => ({
        organizationId: membership.organizationId,
        organizationName: membership.organization.name,
        siteId: site.id,
        siteName: site.name,
        role: membership.role,
        active:
          membership.organizationId === session.session.activeOrganizationId,
      }));
    }),
  );
  return perOrganization.flat();
}

/** Authenticated, active, authorized org context that does not require a selected site. */
export async function setActiveSiteCookie(siteId: string) {
  (await cookies()).set(ACTIVE_SITE_COOKIE, siteId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function getOrganizationContext(
  permission: TenantPermission = "viewMaintenance",
) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });

  if (!session) {
    throw new AuthenticationRequiredError();
  }

  const organizationId = session.session.activeOrganizationId;
  if (!organizationId) {
    throw new OrganizationRequiredError();
  }

  const membership = await prisma.member.findFirst({
    where: { organizationId, userId: session.user.id },
    select: { role: true },
  });

  if (!membership) {
    throw new OrganizationRequiredError();
  }

  const settings = await prisma.tenantSettings.findUnique({
    where: { organizationId },
    select: { status: true },
  });
  if (settings && settings.status !== "ACTIVE") {
    throw new TenantInactiveError(settings.status);
  }

  if (!roleCan(membership.role, permission)) {
    throw new PermissionDeniedError(permission);
  }

  return {
    userId: session.user.id,
    organizationId,
    db: forTenant(organizationId),
    role: membership.role,
  };
}

export async function getTenantContext(
  permission: TenantPermission = "viewMaintenance",
) {
  const { userId, organizationId, db, role } =
    await getOrganizationContext(permission);
  const sites = await db.site.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  if (sites.length === 0) {
    throw new SiteSetupRequiredError();
  }

  const cookieStore = await cookies();
  const requestedSiteId = cookieStore.get(ACTIVE_SITE_COOKIE)?.value;
  const selectedSite =
    sites.find((site) => site.id === requestedSiteId) ??
    (sites.length === 1 ? sites[0] : undefined);

  if (!selectedSite) {
    throw new SiteSelectionRequiredError();
  }

  return {
    userId,
    organizationId,
    db,
    siteId: selectedSite.id,
    siteName: selectedSite.name,
    sites,
    role,
  };
}
