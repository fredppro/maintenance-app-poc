import { createAccessControl } from "better-auth/plugins/access";

// Renaming and profile changes go through the audited Organization Settings action, and deleting goes
// through the owner-only deletion request (30-day grace period, export, audit trail) and the operator
// purge job. Better Auth's own update and delete endpoints stay closed to every role.
const fullOrganizationAccess = {
  organization: [],
  member: [],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
} as const;

const adminOrganizationAccess = {
  organization: [],
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
