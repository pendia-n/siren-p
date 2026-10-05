import type { APIRoute } from "astro";
import { bindings } from "../../../lib/runtime";
import { stripe, verifyStripeSignature } from "../../../lib/stripe";

export const POST: APIRoute = async ({ request }) => {
  const payload = await request.text();
  if (payload.length > 250_000) return new Response(null, { status: 413 });
  if (
    !(await verifyStripeSignature(
      payload,
      request.headers.get("Stripe-Signature"),
    ))
  )
    return new Response(null, { status: 400 });
  let event: Record<string, any>;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (typeof event.id !== "string" || !event.id.startsWith("evt_"))
    return new Response(null, { status: 400 });
  try {
    const seen = await bindings.DB.prepare(
      "SELECT 1 FROM stripe_events WHERE id=?",
    )
      .bind(event.id)
      .first();
    if (seen) return new Response(null, { status: 200 });
    const object = event.data?.object;
    let subscriptionId: string | undefined;
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      if (typeof object?.client_reference_id === "string")
        await bindings.DB.prepare(
          "DELETE FROM checkout_attempts WHERE user_id=? AND session_id=?",
        )
          .bind(object.client_reference_id, object.id)
          .run();
      if (
        object?.payment_status === "paid" &&
        typeof object.subscription === "string"
      )
        subscriptionId = object.subscription;
    } else if (
      event.type === "invoice.paid" ||
      event.type === "invoice.payment_failed"
    ) {
      subscriptionId =
        object?.parent?.subscription_details?.subscription ??
        object?.subscription;
    } else if (
      typeof event.type === "string" &&
      event.type.startsWith("customer.subscription.")
    ) {
      subscriptionId = object?.id;
    }
    if (subscriptionId?.startsWith("sub_")) {
      const subscription = await stripe(
        `subscriptions/${encodeURIComponent(subscriptionId)}`,
      );
      const userId = subscription.metadata?.zahari_user_id;
      const tier = subscription.metadata?.zahari_tier;
      const periodEnd =
        subscription.items?.data?.[0]?.current_period_end ??
        subscription.current_period_end ??
        0;
      const periodStart =
        subscription.items?.data?.[0]?.current_period_start ??
        subscription.current_period_start ??
        0;
      if (
        typeof userId === "string" &&
        ["one", "five", "eight"].includes(tier) &&
        typeof subscription.customer === "string"
      ) {
        const user = await bindings.DB.prepare("SELECT 1 FROM users WHERE id=?")
          .bind(userId)
          .first();
        if (user)
          await bindings.DB.prepare(
            `INSERT INTO memberships(user_id,stripe_customer_id,stripe_subscription_id,tier,status,current_period_end,updated_at,started_at,current_period_start)
           VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET
           stripe_customer_id=excluded.stripe_customer_id,stripe_subscription_id=excluded.stripe_subscription_id,
           tier=excluded.tier,status=excluded.status,current_period_end=excluded.current_period_end,current_period_start=excluded.current_period_start,updated_at=excluded.updated_at,
           started_at=CASE WHEN memberships.stripe_subscription_id IS excluded.stripe_subscription_id THEN memberships.started_at ELSE excluded.started_at END
           WHERE excluded.started_at>=memberships.started_at`,
          )
            .bind(
              userId,
              subscription.customer,
              subscriptionId,
              tier,
              subscription.status,
              periodEnd,
              Math.floor(Date.now() / 1000),
              subscription.start_date ?? Math.floor(Date.now() / 1000),
              periodStart,
            )
            .run();
      }
    }
    await bindings.DB.prepare(
      "INSERT OR IGNORE INTO stripe_events(id,received_at) VALUES(?,?)",
    )
      .bind(event.id, Math.floor(Date.now() / 1000))
      .run();
    return new Response(null, { status: 200 });
  } catch {
    return new Response(null, { status: 503 });
  }
};
