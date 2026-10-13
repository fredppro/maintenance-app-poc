import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import messages from "@/i18n/messages/en.json";
import { SchedulerStoreProvider } from "@/features/scheduler/store/scheduler-provider";
import type { MaintenanceEntry } from "@/features/scheduler/types";
import { MetricsPageClient } from "./metrics-page-client";

function renderPage(state: object) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SchedulerStoreProvider initialState={state}>
        <MetricsPageClient />
      </SchedulerStoreProvider>
    </NextIntlClientProvider>,
  );
}

describe("MetricsPageClient", () => {
  it("shows an empty state without tasks", () => {
    renderPage({ entries: [] });
    expect(screen.getByText("No data yet")).toBeInTheDocument();
  });

  it("summarises totals and completion rate", () => {
    const entries = [
      { id: "1", type: "PREVENTIVE", status: "completed", equipmentId: "e", endTime: new Date("2020-01-01") },
      { id: "2", type: "CORRECTIVE", status: "scheduled", equipmentId: "e", endTime: new Date("2999-01-01") },
    ] as MaintenanceEntry[];
    renderPage({ entries });
    expect(screen.getByText("Total tasks").parentElement).toHaveTextContent("2");
    expect(screen.getByText("Completion rate").parentElement).toHaveTextContent("50%");
  });
});
