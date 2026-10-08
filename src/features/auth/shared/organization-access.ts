import { createAccessControl } from "better-auth/plugins/access";

// Deleting an organization goes through the owner-only deletion request (30-day grace period, export,
// audit trail) and the operator purge job, never through Better Auth's immediate delete endpoint.
const fullOrganizationAccess = {
  organization: ["update"],
  member: [],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
} as const;

const adminOrganizationAccess = {
  organization: ["update"],
  member: [],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
} as const;

const noOrganizationAccess = {
  organization: [],
  member: [],
  invitation: [],
  team: [],
  ac: ["read"],
} as const;

export const organizationAccess = createAccessControl({
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
} as const);

export const organizationRoles = {
  owner: organizationAccess.newRole(fullOrganizationAccess),
  admin: organizationAccess.newRole(adminOrganizationAccess),
  member: organizationAccess.newRole(noOrganizationAccess),
  maintenance_manager: organizationAccess.newRole(noOrganizationAccess),
  read_only: organizationAccess.newRole(noOrganizationAccess),
};
