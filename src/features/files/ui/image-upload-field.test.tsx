import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/i18n/messages/en.json";
import { ImageUploadField, type ImageUploadValue } from "./image-upload-field";

vi.mock("../client/image", async () => ({
  ...(await vi.importActual<typeof import("../client/image")>("../client/image")),
  resizeImage: vi.fn(),
}));

import { resizeImage } from "../client/image";

const labels = {
  choose: "Upload photo",
  replace: "Replace photo",
  remove: "Remove photo",
  emptyTitle: "No photo yet",
  emptyDescription: "PNG, JPEG or WebP. Up to 10 MB.",
  imageAlt: "Equipment photo",
  noImage: "No photo",
};

function Harness({
  initialValue = { fileId: null, pending: null },
  uploadProgress = null,
  uploading = false,
  uploadError = null,
}: {
  initialValue?: ImageUploadValue;
  uploadProgress?: number | null;
  uploading?: boolean;
  uploadError?: "network" | null;
}) {
  const [value, setValue] = useState(initialValue);
  const [currentUploadError, setUploadError] = useState(uploadError);
  return (
    <ImageUploadField
      id="equipment-image"
      value={value}
      onChange={setValue}
      onUploadErrorClear={() => setUploadError(null)}
      prepareImage={(file) =>
        resizeImage(file, { maxEdge: 640, type: "image/jpeg" })
      }
      labels={labels}
      uploading={uploading}
      uploadProgress={uploadProgress}
      uploadError={currentUploadError}
    />
  );
}

function renderField(props: Parameters<typeof Harness>[0] = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Harness {...props} />
    </NextIntlClientProvider>,
  );
}

describe("ImageUploadField", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:preview");
    URL.revokeObjectURL = vi.fn();
    vi.mocked(resizeImage).mockReset();
  });

  it("shows a clear keyboard-operable empty state", () => {
    renderField();

    expect(screen.getByText("No photo yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload photo" })).toBeInTheDocument();
    const input = screen.getByTestId("image-upload-input");
    expect(input).toHaveClass("hidden");
    expect(input).toHaveAttribute("aria-hidden", "true");
    expect(input).toHaveAttribute("accept", "image/png,image/jpeg,image/webp");
  });

  it("shows the selected image, original filename, size, and ready state", async () => {
    const user = userEvent.setup();
    vi.mocked(resizeImage).mockResolvedValue(
      new Blob(["resized"], { type: "image/jpeg" }),
    );
    renderField();

    await user.upload(
      screen.getByTestId("image-upload-input"),
      new File(["image bytes"], "very-long-maintenance-photo.png", {
        type: "image/png",
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("img", { name: "Equipment photo" }),
      ).toHaveAttribute("src", "blob:preview");
    });
    expect(screen.getByText("very-long-maintenance-photo.png")).toBeInTheDocument();
    expect(screen.getByText(/Ready to upload when you save/)).toBeInTheDocument();
    expect(resizeImage).toHaveBeenCalledWith(
      expect.objectContaining({ name: "very-long-maintenance-photo.png" }),
      { maxEdge: 640, type: "image/jpeg" },
    );
  });

  it("keeps an unsupported file visible in an accessible validation alert", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderField();

    await user.upload(
      screen.getByTestId("image-upload-input"),
      new File(["document"], "maintenance-plan.svg", {
        type: "image/svg+xml",
      }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("maintenance-plan.svg");
    expect(alert).toHaveTextContent("Choose a PNG, JPEG or WebP image.");
    expect(resizeImage).not.toHaveBeenCalled();
  });

  it("shows only real upload progress and disables file actions while uploading", () => {
    renderField({
      initialValue: {
        fileId: null,
        pending: new Blob(["resized"], { type: "image/jpeg" }),
        fileName: "photo.jpg",
        fileSize: 2048,
      },
      uploading: true,
      uploadProgress: 42,
    });

    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "42",
    );
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace photo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Discard selected image" })).toBeDisabled();
  });

  it("shows uploaded files as confirmed attachments with remove and replace actions", () => {
    renderField({
      initialValue: {
        fileId: "stored-file-1",
        pending: null,
        fileName: "photo.jpg",
        fileSize: 2048,
      },
    });

    expect(screen.getByRole("img", { name: "Equipment photo" })).toHaveAttribute(
      "src",
      "/api/files/stored-file-1",
    );
    expect(screen.getByText(/Uploaded successfully/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace photo" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Remove photo" })).toBeEnabled();
  });

  it("retains a failed upload for retry and restores the current image when a replacement is discarded", async () => {
    const user = userEvent.setup();
    renderField({
      initialValue: {
        fileId: "stored-file-1",
        pending: new Blob(["replacement"], { type: "image/jpeg" }),
        fileName: "replacement.jpg",
        fileSize: 1024,
      },
      uploadError: "network",
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Save again to retry, or replace the image.",
    );
    expect(document.querySelector('[data-slot="attachment"]')).toHaveAttribute(
      "data-state",
      "error",
    );

    await user.click(screen.getByRole("button", { name: "Discard selected image" }));
    expect(screen.getByRole("img", { name: "Equipment photo" })).toHaveAttribute(
      "src",
      "/api/files/stored-file-1",
    );
    expect(screen.getByText(/Uploaded successfully/)).toBeInTheDocument();
  });
});
