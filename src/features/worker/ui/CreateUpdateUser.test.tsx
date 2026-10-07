import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/i18n/messages/en.json";
import CreateUpdateWorker from "./CreateUpdateUser";

const { createWorkerMock, updateWorkerMock } = vi.hoisted(() => ({
  createWorkerMock: vi.fn(),
  updateWorkerMock: vi.fn(),
}));

vi.mock("../server/actions", () => ({
  createWorker: createWorkerMock,
  updateWorker: updateWorkerMock,
}));

function renderWorkerForm(initialData?: {
  id?: string;
  name: string;
  email: string;
  phone?: string | null;
  type?: string;
}) {
  const onSaved = vi.fn();

  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CreateUpdateWorker
        initialData={initialData}
        onSaved={onSaved}
      />
      <button type="submit" form="worker-form">
        Save worker
      </button>
    </NextIntlClientProvider>,
  );

  return { onSaved };
}

describe("CreateUpdateWorker", () => {
  beforeEach(() => {
    createWorkerMock.mockReset();
    updateWorkerMock.mockReset();
  });

  it("prevents an invalid email from being submitted", async () => {
    const user = userEvent.setup();
    renderWorkerForm();

    await user.type(screen.getByLabelText("Name"), "Morgan Lee");
    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Save worker" }));

    expect(createWorkerMock).not.toHaveBeenCalled();
    expect(updateWorkerMock).not.toHaveBeenCalled();
  });

  it("creates a worker with the default internal type", async () => {
    const user = userEvent.setup();
    const { onSaved } = renderWorkerForm();
    createWorkerMock.mockResolvedValue({ id: "worker-new" });

    await user.type(screen.getByLabelText("Name"), "Morgan Lee");
    await user.type(screen.getByLabelText("Email"), "morgan@example.test");
    await user.click(screen.getByRole("button", { name: "Save worker" }));

    await waitFor(() => {
      expect(createWorkerMock).toHaveBeenCalledWith({
        name: "Morgan Lee",
        email: "morgan@example.test",
        phone: "",
        type: "INTERNAL",
      });
    });
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("updates an existing worker by ID", async () => {
    const user = userEvent.setup();
    const { onSaved } = renderWorkerForm({
      id: "worker-1",
      name: "Morgan Lee",
      email: "morgan@example.test",
      phone: null,
      type: "INTERNAL",
    });
    updateWorkerMock.mockResolvedValue({ id: "worker-1" });

    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Morgan Smith");
    await user.click(screen.getByRole("button", { name: "Save worker" }));

    await waitFor(() => {
      expect(updateWorkerMock).toHaveBeenCalledWith(
        "worker-1",
        expect.objectContaining({
          name: "Morgan Smith",
          email: "morgan@example.test",
          type: "INTERNAL",
        }),
      );
    });
    expect(createWorkerMock).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledOnce();
  });
});
