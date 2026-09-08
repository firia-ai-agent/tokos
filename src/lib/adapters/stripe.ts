import Stripe from "stripe";
import { appUrl, hasStripe } from "@/lib/env";
import { phiSafeIds } from "@/lib/phi";

function client() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export async function createCheckoutSession(input: {
  organizationId: string;
  invoiceId: string;
  amountCents: number;
  currency?: string;
  customerEmail: string;
  description: string;
}) {
  const successUrl = `${appUrl()}/api/stripe/return?invoiceId=${input.invoiceId}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${appUrl()}/portal/pay?invoiceId=${input.invoiceId}`;
  const metadata = phiSafeIds({
    organizationId: input.organizationId,
    invoiceId: input.invoiceId,
  });

  if (!hasStripe()) {
    return {
      provider: "stub" as const,
      externalId: `stub-checkout-${input.invoiceId}`,
      url: `${appUrl()}/stub/pay?invoiceId=${input.invoiceId}`,
    };
  }

  const session = await client().checkout.sessions.create({
    mode: "payment",
    customer_email: input.customerEmail,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
    payment_intent_data: { metadata },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.currency ?? "usd",
          unit_amount: input.amountCents,
          product_data: {
            name: input.description,
          },
        },
      },
    ],
  });

  return {
    provider: "stripe" as const,
    externalId: session.id,
    url: session.url!,
  };
}

export async function retrieveCheckoutSession(sessionId: string) {
  if (!hasStripe()) {
    const failed = /fail|cancel/i.test(sessionId);
    return {
      paid: !failed,
      metadata: {} as Record<string, string>,
      amountTotalCents: null as number | null,
      currency: null as string | null,
    };
  }
  const session = await client().checkout.sessions.retrieve(sessionId);
  return {
    paid: session.payment_status === "paid",
    metadata: (session.metadata ?? {}) as Record<string, string>,
    amountTotalCents: session.amount_total,
    currency: session.currency,
  };
}
