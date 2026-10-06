import { afterEach, describe, expect, it, vi } from "vitest";
import { sendTransactionalEmail } from "./email";

describe("transactional email delivery", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("requires explicit provider configuration", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("AUTH_EMAIL_FROM", "");

    await expect(
      sendTransactionalEmail({
        to: "person@example.test",
        subject: "Invitation",
        text: "Please accept",
        url: "https://example.test/accept",
      }),
    ).rejects.toThrow("RESEND_API_KEY and AUTH_EMAIL_FROM");
  });

  it("sends escaped email content and reports provider errors", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("AUTH_EMAIL_FROM", "Pilot <pilot@example.test>");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendTransactionalEmail({
      to: "person@example.test",
      subject: "Invitation",
      text: "<script>unsafe</script>",
      url: "https://example.test/?a=1&b=2",
    });

    const [, request] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String(request.body));
    expect(request.headers.Authorization).toBe("Bearer test-key");
    expect(body.html).toContain("&lt;script&gt;unsafe&lt;/script&gt;");
    expect(body.html).toContain("a=1&amp;b=2");

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(
      sendTransactionalEmail({
        to: "person@example.test",
        subject: "Invitation",
        text: "Please accept",
        url: "https://example.test/accept",
      }),
    ).rejects.toThrow("status 503");
  });
});
