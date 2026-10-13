const assignableRoles = new Set([
  "admin",
  "maintenance_manager",
  "read_only",
  "member",
]);

export function canAssignOrganizationRole(
  actorRole: string,
  assignedRole: string,
) {
  if (!assignableRoles.has(assignedRole)) return false;
  if (actorRole === "owner") return true;
  return actorRole === "admin" && assignedRole !== "admin";
}

export function canManageOrganizationMember(
  actorRole: string,
  targetRole: string,
  nextRole?: string,
) {
  if (targetRole === "owner") return false;
  if (actorRole === "owner") return nextRole !== "owner";
  if (actorRole === "admin") {
    return targetRole !== "admin" && (nextRole === undefined || nextRole !== "admin");
  }
  return false;
}

export function isOrganizationManager(role: string) {
  return role === "owner" || role === "admin";
}
