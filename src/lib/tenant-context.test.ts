import { describe, expect, it } from "vitest";
import { roleCan, type TenantPermission } from "./tenant-context";

describe("tenant role permissions", () => {
  it.each([
    ["owner", "manageOrganization", true],
    ["admin", "manageMembers", true],
    ["maintenance_manager", "manageMaintenance", true],
    ["maintenance_manager", "manageMembers", false],
    ["read_only", "viewReports", true],
    ["read_only", "manageMaintenance", false],
    ["member", "deleteMaintenance", false],
    ["unknown", "viewMaintenance", false],
  ] satisfies [string, TenantPermission, boolean][])(
    "%s %s => %s",
    (role, permission, allowed) => {
      expect(roleCan(role, permission)).toBe(allowed);
    },
  );
});
