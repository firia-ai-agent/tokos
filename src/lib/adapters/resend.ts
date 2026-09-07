import { Resend } from "resend";
import { hasResend } from "@/lib/env";
import { assertPhiFree } from "@/lib/phi";

export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
  tags?: Record<string, string>;
}) {
  assertPhiFree(
    { subject: input.subject, ...input.tags },
    "resend",
  );

  if (!hasResend()) {
    console.info("[resend-stub]", {
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
    return { provider: "stub" as const, id: `stub-email-${crypto.randomUUID()}` };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = input.from || process.env.RESEND_FROM || "Tokos <hello@localhost>";
  const result = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return { provider: "resend" as const, id: result.data?.id ?? "resend-unknown" };
}
