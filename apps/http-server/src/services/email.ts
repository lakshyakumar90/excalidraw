const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM;

export async function sendVerificationEmail(to: string, url: string) {
  if (!resendApiKey || !emailFrom) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[auth] Email verification link for ${to}: ${url}`);
      return;
    }
    throw new Error(
      "Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM.",
    );
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [to],
      subject: "Verify your Excalidraw email",
      text: `Verify your email address to finish creating your Excalidraw account:\n\n${url}\n\nThis link expires in one hour.`,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Could not send verification email (${response.status}): ${detail}`,
    );
  }
}
