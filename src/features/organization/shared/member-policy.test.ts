import { describe, expect, it } from "vitest";
import { organizationRoles } from "@/features/auth/shared/organization-access";
import {
  canAssignOrganizationRole,
  canManageOrganizationMember,
  isOrganizationManager,
} from "./member-policy";

describe("organization member role policy", () => {
  it("does not expose Better Auth member mutation APIs to client roles", () => {
    expect(organizationRoles.owner.statements.member).toEqual([]);
    expect(organizationRoles.admin.statements.member).toEqual([]);
  });

  it("keeps organization deletion on the owner-only grace-period flow", () => {
    expect(organizationRoles.owner.statements.organization).not.toContain("delete");
    expect(organizationRoles.admin.statements.organization).not.toContain("delete");
  });

  it("allows only owners to invite admins and never permits owner invitations", () => {
    expect(canAssignOrganizationRole("owner", "admin")).toBe(true);
    expect(canAssignOrganizationRole("admin", "admin")).toBe(false);
    expect(canAssignOrganizationRole("admin", "maintenance_manager")).toBe(true);
    expect(canAssignOrganizationRole("owner", "owner")).toBe(false);
    expect(canAssignOrganizationRole("maintenance_manager", "read_only")).toBe(
      false,
    );
  });

  it("protects owners and limits admins to managing lower-privileged members", () => {
    expect(canManageOrganizationMember("owner", "owner", "read_only")).toBe(
      false,
    );
    expect(canManageOrganizationMember("admin", "admin", "read_only")).toBe(
      false,
    );
    expect(
      canManageOrganizationMember("admin", "read_only", "maintenance_manager"),
    ).toBe(true);
    expect(canManageOrganizationMember("admin", "read_only", "admin")).toBe(
      false,
    );
    expect(isOrganizationManager("maintenance_manager")).toBe(false);
  });
});
