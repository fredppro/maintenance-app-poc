import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import messages from "@/i18n/messages/en.json";
import ptMessages from "@/i18n/messages/pt-pt.json";
import type { OrganizationSettingsView } from "../shared/organization-settings";
import { OrganizationSettingsForm } from "./organization-settings-form";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  refresh: vi.fn(),
  resize: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("@/features/organization/server/settings", () => ({ updateOrganizationSettings: mocks.update }));
vi.mock("@/i18n/routing", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }));
vi.mock("@/features/files/client/image", async () => ({
  ...(await vi.importActual<typeof import("@/features/files/client/image")>("@/features/files/client/image")),
  resizeImage: mocks.resize,
  uploadImage: mocks.upload,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const initial: OrganizationSettingsView = {
  name: "ACME Facilities",
  contactEmail: "office@acme.pt",
  contactPhone: "+351 21 000 0000",
  timezone: "Europe/Lisbon",
  locale: "en",
  logoFileId: null,
};

function renderForm(view: OrganizationSettingsView = initial, locale: "en" | "pt-pt" = "en") {
  URL.createObjectURL = vi.fn(() => "blob:logo");
  URL.revokeObjectURL = vi.fn();
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : ptMessages}>
      <OrganizationSettingsForm initial={view} />
    </NextIntlClientProvider>,
  );
}

const nameField = () => screen.getByLabelText("Organization name");
const saveButton = () => screen.getByRole("button", { name: /Save changes/ });

describe("OrganizationSettingsForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockResolvedValue({ ok: true });
  });

  it("shows the saved values, including the time zone and language", () => {
    renderForm();

    expect(nameField()).toHaveValue("ACME Facilities");
    expect(screen.getByLabelText("Contact email")).toHaveValue("office@acme.pt");
    expect(screen.getByLabelText("Contact phone")).toHaveValue("+351 21 000 0000");
    expect(screen.getByRole("combobox", { name: "Time zone" })).toHaveTextContent("Europe/Lisbon");
    expect(screen.getByRole("combobox", { name: "Default language" })).toHaveTextContent("English");
  });

  it("handles an organization with no contact details and no logo", () => {
    renderForm({ ...initial, contactEmail: "", contactPhone: "" });

    expect(screen.getByLabelText("Contact email")).toHaveValue("");
    expect(screen.getByLabelText("Contact phone")).toHaveValue("");
    expect(screen.getByLabelText("No logo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload logo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove logo" })).not.toBeInTheDocument();
  });

  it("shows the current logo with replace and remove actions", () => {
    renderForm({ ...initial, logoFileId: "file-1" });

    expect(screen.getByRole("img", { name: "ACME Facilities logo" })).toHaveAttribute("src", "/api/files/file-1");
    expect(screen.getByRole("button", { name: "Replace logo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove logo" })).toBeInTheDocument();
  });

  it("keeps Save disabled until something changes", async () => {
    const user = userEvent.setup();
    renderForm();
    expect(saveButton()).toBeDisabled();

    await user.type(nameField(), "!");
    expect(saveButton()).toBeEnabled();
    await user.type(nameField(), "{Backspace}");
    expect(saveButton()).toBeDisabled();
  });

  it("validates on the client and does not call the server with invalid values", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.clear(nameField());
    await user.type(nameField(), "A");
    await user.clear(screen.getByLabelText("Contact email"));
    await user.type(screen.getByLabelText("Contact email"), "nope");
    await user.click(saveButton());

    expect(await screen.findByText("Enter at least 2 characters.")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(nameField()).toHaveAttribute("aria-invalid", "true");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("saves the values, then confirms and refreshes", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.clear(nameField());
    await user.type(nameField(), "  ACME Group  ");
    await user.clear(screen.getByLabelText("Contact phone"));
    await user.click(saveButton());

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Organization settings saved."));
    expect(mocks.update).toHaveBeenCalledWith({
      name: "  ACME Group  ",
      contactEmail: "office@acme.pt",
      contactPhone: "",
      timezone: "Europe/Lisbon",
      locale: "en",
      logoFileId: null,
    });
    expect(mocks.refresh).toHaveBeenCalled();
    expect(nameField()).toHaveValue("ACME Group");
    expect(saveButton()).toBeDisabled();
  });

  it("shows no success message while the save is still running", async () => {
    const user = userEvent.setup();
    let finish: (value: { ok: true }) => void = () => undefined;
    mocks.update.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderForm();

    await user.type(nameField(), "!");
    await user.click(saveButton());

    expect(saveButton()).toBeDisabled();
    expect(saveButton()).toHaveAttribute("aria-busy", "true");
    expect(toast.success).not.toHaveBeenCalled();
    finish({ ok: true });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it("shows the server's field errors and no success message", async () => {
    const user = userEvent.setup();
    mocks.update.mockResolvedValue({ ok: false, errors: { contactPhone: "invalid" } });
    renderForm();

    await user.type(nameField(), "!");
    await user.click(saveButton());

    expect(await screen.findByText("Enter a valid phone number, e.g. +351 21 000 0000.")).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(saveButton()).toBeEnabled();
  });

  it("reports an unexpected failure and keeps the edits", async () => {
    const user = userEvent.setup();
    mocks.update.mockRejectedValue(new Error("forbidden"));
    renderForm();

    await user.type(nameField(), "!");
    await user.click(saveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("The settings could not be saved. Please try again.");
    expect(toast.success).not.toHaveBeenCalled();
    expect(nameField()).toHaveValue("ACME Facilities!");
  });

  describe("logo", () => {
    const pickLogo = async (user: ReturnType<typeof userEvent.setup>, file: File) => {
      await user.upload(screen.getByLabelText("Upload logo", { selector: "input" }), file);
    };

    it("rejects files that are not images without uploading anything", async () => {
      const user = userEvent.setup({ applyAccept: false });
      renderForm();

      await pickLogo(user, new File(["x"], "logo.pdf", { type: "application/pdf" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Choose a PNG, JPEG or WebP image up to 10 MB.");
      expect(mocks.resize).not.toHaveBeenCalled();
      expect(saveButton()).toBeDisabled();
    });

    it("uploads the resized logo on save and sends its file id", async () => {
      const user = userEvent.setup();
      mocks.resize.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
      mocks.upload.mockResolvedValue("file-new");
      renderForm();

      await pickLogo(user, new File(["x"], "logo.png", { type: "image/png" }));
      expect(mocks.upload).not.toHaveBeenCalled();
      await user.click(saveButton());

      await waitFor(() => expect(toast.success).toHaveBeenCalled());
      expect(mocks.upload).toHaveBeenCalledWith(expect.any(Blob), "logo.png");
      expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ logoFileId: "file-new" }));
      expect(screen.getByRole("img", { name: "ACME Facilities logo" })).toHaveAttribute("src", "/api/files/file-new");
    });

    it("keeps the settings unsaved and says so when the upload fails", async () => {
      const user = userEvent.setup();
      mocks.resize.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
      mocks.upload.mockRejectedValue(new Error("upload failed"));
      renderForm();

      await pickLogo(user, new File(["x"], "logo.png", { type: "image/png" }));
      await user.click(saveButton());

      expect(await screen.findByRole("alert")).toHaveTextContent("The logo could not be uploaded. Please try again.");
      expect(mocks.update).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
    });

    it("does not upload the logo twice when the save is retried after a validation error", async () => {
      const user = userEvent.setup();
      mocks.resize.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
      mocks.upload.mockResolvedValue("file-new");
      mocks.update.mockResolvedValueOnce({ ok: false, errors: { contactEmail: "invalid" } });
      renderForm();

      await pickLogo(user, new File(["x"], "logo.png", { type: "image/png" }));
      await user.click(saveButton());
      await screen.findByText("Enter a valid email address.");
      await user.click(saveButton());

      await waitFor(() => expect(toast.success).toHaveBeenCalled());
      expect(mocks.upload).toHaveBeenCalledTimes(1);
      expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({ logoFileId: "file-new" }));
    });

    it("removes the logo on save", async () => {
      const user = userEvent.setup();
      renderForm({ ...initial, logoFileId: "file-1" });

      await user.click(screen.getByRole("button", { name: "Remove logo" }));
      await user.click(saveButton());

      await waitFor(() => expect(toast.success).toHaveBeenCalled());
      expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ logoFileId: null }));
      expect(screen.getByLabelText("No logo")).toBeInTheDocument();
    });
  });

  it("is fully translated in Portuguese", () => {
    renderForm({ ...initial, locale: "pt-pt" }, "pt-pt");

    expect(screen.getByLabelText("Nome da organização")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Fuso horário" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Idioma predefinido" })).toHaveTextContent("Português (PT)");
    expect(screen.getByRole("button", { name: "Guardar alterações" })).toBeInTheDocument();
  });
});
