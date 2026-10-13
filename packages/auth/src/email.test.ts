import { afterEach, describe, expect, it, vi } from "vitest";
import { sendAuthEmail } from "./email.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("account emails", () => {
  it.each(["verify", "reset"] as const)(
    "sends the %s link with the correct subject",
    async (purpose) => {
      vi.stubEnv("RESEND_API_KEY", "test-key");
      vi.stubEnv("EMAIL_FROM", "Excalidraw <auth@example.com>");
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response("{}", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      await sendAuthEmail({
        to: "person@example.com",
        url: "https://app.example.com/link?token=test",
        purpose,
      });
      const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(body.to).toEqual(["person@example.com"]);
      expect(body.subject).toMatch(
        purpose === "reset" ? /Reset.*password/ : /Verify.*email/,
      );
      expect(body.text).toContain("https://app.example.com/link?token=test");
    },
  );
  it("reports provider failures instead of claiming an email was sent", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "auth@example.com");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("Provider unavailable", { status: 503 }),
        ),
    );
    await expect(
      sendAuthEmail({
        to: "person@example.com",
        url: "https://app.example.com",
        purpose: "reset",
      }),
    ).rejects.toThrow("503");
  });
});
