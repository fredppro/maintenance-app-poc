import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getImageFileValidationError,
  MAX_SOURCE_BYTES,
  uploadImage,
} from "./image";

class MockXMLHttpRequest extends EventTarget {
  static instances: MockXMLHttpRequest[] = [];

  upload = new EventTarget();
  status = 0;
  responseText = "";
  body: Document | XMLHttpRequestBodyInit | null | undefined;

  constructor() {
    super();
    MockXMLHttpRequest.instances.push(this);
  }

  open = vi.fn();

  send(body?: Document | XMLHttpRequestBodyInit | null) {
    this.body = body;
  }

  reportProgress(loaded: number, total: number) {
    const event = new Event("progress");
    Object.defineProperties(event, {
      lengthComputable: { value: true },
      loaded: { value: loaded },
      total: { value: total },
    });
    this.upload.dispatchEvent(event);
  }

  respond(status: number, response: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(response);
    this.dispatchEvent(new Event("load"));
  }
}

describe("image upload helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    MockXMLHttpRequest.instances = [];
  });

  it("accepts only supported image MIME types and non-empty files under the limit", () => {
    expect(
      getImageFileValidationError(
        new File(["png"], "photo.png", { type: "image/png" }),
      ),
    ).toBeNull();
    expect(
      getImageFileValidationError(
        new File(["svg"], "photo.svg", { type: "image/svg+xml" }),
      ),
    ).toBe("unsupported");
    expect(
      getImageFileValidationError(
        new File([], "empty.png", { type: "image/png" }),
      ),
    ).toBe("empty");
    expect(
      getImageFileValidationError(
        new File([new Uint8Array(MAX_SOURCE_BYTES + 1)], "large.png", {
          type: "image/png",
        }),
      ),
    ).toBe("tooLarge");
  });

  it("reports actual request-byte progress and resolves only after server confirmation", async () => {
    vi.stubGlobal("XMLHttpRequest", MockXMLHttpRequest);
    const onProgress = vi.fn();
    const upload = uploadImage(
      new Blob(["image"], { type: "image/png" }),
      "photo.png",
      onProgress,
    );
    const request = MockXMLHttpRequest.instances[0];

    expect(request?.body).toBeInstanceOf(FormData);
    request?.reportProgress(25, 100);
    expect(onProgress).toHaveBeenCalledWith(25);

    request?.respond(201, { id: "stored-file-1" });
    await expect(upload).resolves.toBe("stored-file-1");
  });

  it("preserves server-side validation failures for the UI to explain", async () => {
    vi.stubGlobal("XMLHttpRequest", MockXMLHttpRequest);
    const upload = uploadImage(new Blob(["image"]), "photo.png");
    MockXMLHttpRequest.instances[0]?.respond(413, { error: "too_large" });

    await expect(upload).rejects.toMatchObject({
      code: "too_large",
    });
  });
});
