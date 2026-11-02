import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/i18n/messages/en.json";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  requestExport: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/features/export/server/actions", () => ({
  requestTenantExport: mocks.requestExport,
}));
vi.mock("@/features/organization/server/lifecycle", () => ({
  cancelOrganizationDeletion: vi.fn(),
  requestOrganizationDeletion: vi.fn(),
}));

import { OrganizationExportCard, type ExportRow } from "./organization-data";

function renderCard(exports: ExportRow[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <OrganizationExportCard exports={exports} />
    </NextIntlClientProvider>,
  );
}

describe("OrganizationExportCard recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requestExport.mockResolvedValue({ id: "export-1" });
  });

  it("allows retrying a stale running export", async () => {
    const user = userEvent.setup();
    renderCard([
      {
        id: "export-1",
        status: "RUNNING",
        error: null,
        createdAt: new Date().toISOString(),
        heartbeatAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
        expiresAt: null,
        size: null,
      },
    ]);

    const retry = screen.getByRole("button", { name: "Retry export" });
    expect(retry).toBeEnabled();
    await user.click(retry);

    await waitFor(() => expect(mocks.requestExport).toHaveBeenCalledOnce());
  });

  it("keeps a recently heartbeating export in progress", () => {
    renderCard([
      {
        id: "export-1",
        status: "RUNNING",
        error: null,
        createdAt: new Date().toISOString(),
        heartbeatAt: new Date(Date.now() - 30 * 1000).toISOString(),
        expiresAt: null,
        size: null,
      },
    ]);

    expect(screen.getByRole("button", { name: /Request export/ })).toBeDisabled();
  });

  it("allows pending exports to be rescheduled", () => {
    renderCard([
      {
        id: "export-1",
        status: "PENDING",
        error: null,
        createdAt: new Date().toISOString(),
        heartbeatAt: null,
        expiresAt: null,
        size: null,
      },
    ]);

    expect(screen.getByRole("button", { name: "Retry export" })).toBeEnabled();
  });

  it("explains when an export exceeds the bounded archive limit", () => {
    renderCard([
      {
        id: "export-1",
        status: "FAILED",
        error: "EXPORT_SIZE_LIMIT",
        createdAt: new Date().toISOString(),
        heartbeatAt: null,
        expiresAt: null,
        size: null,
      },
    ]);

    expect(
      screen.getByText(/exceeds the supported limit of 50,000 records or 48 MiB/i),
    ).toBeInTheDocument();
  });
});
