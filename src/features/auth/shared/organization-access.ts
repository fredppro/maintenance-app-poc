import { createAccessControl } from "better-auth/plugins/access";

const fullOrganizationAccess = {
  organization: ["update", "delete"],
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
