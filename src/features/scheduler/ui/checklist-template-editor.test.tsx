import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import messages from "@/i18n/messages/en.json";
import { ChecklistTemplateEditor } from "./checklist-template-editor";

function ChecklistHarness({
  canAdd = true,
  initialItems = [],
}: {
  canAdd?: boolean;
  initialItems?: string[];
}) {
  const [items, setItems] = useState<string[]>(initialItems);
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <output aria-label="Checklist items">{JSON.stringify(items)}</output>
      <ChecklistTemplateEditor
        value={items}
        onChange={setItems}
        canAdd={canAdd}
      />
    </NextIntlClientProvider>
  );
}

describe("ChecklistTemplateEditor", () => {
  it("adds items inline with Enter and removes an individual item", async () => {
    const user = userEvent.setup();
    render(<ChecklistHarness />);

    await user.click(screen.getByRole("button", { name: "Add checklist item" }));
    await user.type(
      screen.getByRole("textbox", { name: "Checklist item 1" }),
      "Inspect belt",
    );
    await user.keyboard("{Enter}");
    await user.type(
      screen.getByRole("textbox", { name: "Checklist item 2" }),
      "Check lubrication",
    );

    expect(screen.getByLabelText("Checklist items")).toHaveTextContent(
      '["Inspect belt","Check lubrication"]',
    );

    await user.click(
      screen.getByRole("button", { name: "Remove checklist item 1" }),
    );

    expect(screen.getByLabelText("Checklist items")).toHaveTextContent(
      '["Check lubrication"]',
    );
    expect(
      screen.getByRole("textbox", { name: "Checklist item 1" }),
    ).toHaveValue("Check lubrication");
  });

  it("prevents adding checklist items until the maintenance point is named", async () => {
    const user = userEvent.setup();
    render(
      <ChecklistHarness canAdd={false} initialItems={["Inspect belt"]} />,
    );

    expect(
      screen.getByRole("button", { name: "Add checklist item" }),
    ).toBeDisabled();
    await user.type(
      screen.getByRole("textbox", { name: "Checklist item 1" }),
      " again",
    );
    await user.keyboard("{Enter}");

    expect(screen.getByLabelText("Checklist items")).toHaveTextContent(
      '["Inspect belt again"]',
    );
    expect(
      screen.queryByRole("textbox", { name: "Checklist item 2" }),
    ).not.toBeInTheDocument();
  });
});
