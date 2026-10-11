import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildInvitationUrl } from "./invitation-link";

const { settingsFind } = vi.hoisted(() => ({ settingsFind: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { tenantSettings: { findUnique: settingsFind } } }));

const origin = new URL("https://app.example.com");

describe("buildInvitationUrl", () => {
  beforeEach(() => settingsFind.mockReset());

  it("uses the organization's default language", async () => {
    settingsFind.mockResolvedValue({ locale: "pt-pt" });

    const url = await buildInvitationUrl("org-a", "inv-1", origin);

    expect(url.toString()).toBe("https://app.example.com/pt-pt/accept-invitation?id=inv-1");
    expect(settingsFind).toHaveBeenCalledWith({ where: { organizationId: "org-a" }, select: { locale: true } });
  });

  it("falls back to the default language when none is saved or it is unsupported", async () => {
    settingsFind.mockResolvedValue(null);
    expect((await buildInvitationUrl("org-a", "inv-1", origin)).pathname).toBe("/en/accept-invitation");

    settingsFind.mockResolvedValue({ locale: "fr" });
    expect((await buildInvitationUrl("org-a", "inv-1", origin)).pathname).toBe("/en/accept-invitation");
  });
});
