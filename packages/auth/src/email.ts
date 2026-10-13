type AuthEmail = { to: string; url: string; purpose: "verify" | "reset" };

/** Account security emails; room invitations stay in-app. */
export async function sendAuthEmail({ to, url, purpose }: AuthEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const subject =
    purpose === "reset"
      ? "Reset your Excalidraw password"
      : "Verify your Excalidraw email";
  const text =
    purpose === "reset"
      ? `Reset your password using this link:\n\n${url}\n\nIt expires in 30 minutes and can only be used once. If you did not request this, you can ignore this email.`
      : `Verify your email address to finish creating your Excalidraw account:\n\n${url}\n\nThis link expires in one hour.`;

  if (!apiKey || !from) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[auth] ${subject} for ${to}: ${url}`);
      return;
    }
    throw new Error(
      "Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM.",
    );
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!response.ok) {
    throw new Error(
      `Could not send account email (${response.status}): ${await response.text()}`,
    );
  }
}
