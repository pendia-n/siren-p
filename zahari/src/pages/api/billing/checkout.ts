import type { APIRoute } from "astro";
import { bindings } from "../../../lib/runtime";
import { PLANS, stripe, type Tier } from "../../../lib/stripe";
import { ASSETS, MODEL_COUNTS } from "../../../lib/product";

export const POST: APIRoute = async ({ request, locals, url }) => {
  const back = (reason: string) =>
    Response.redirect(`${url.origin}/pricing?checkout=${reason}`, 303);
  if (!locals.user) return Response.redirect(`${url.origin}/signin`, 303);
  if (
    request.headers.get("Origin") !== url.origin ||
    request.headers.get("Content-Type") !== "application/x-www-form-urlencoded"
  )
    return Response.json({ error: "Invalid request." }, { status: 403 });
  const body = await request.formData();
  const tier = body.get("tier");
  if (tier !== "one" && tier !== "five" && tier !== "eight")
    return Response.json({ error: "Choose a membership." }, { status: 400 });
  const plan = PLANS[tier as Tier];
  if (!plan.product || !bindings.STRIPE_API_KEY) return back("configuring");
  if ((tier === "five" || tier === "eight") && !bindings.TAVILY_API_KEY)
    return back("news");
  const feed = await bindings.DB.prepare(
    "SELECT COUNT(DISTINCT asset) AS assets FROM market_rows WHERE source_table='st' AND gap='1m' AND source_timestamp>?",
  )
    .bind(new Date(Date.now() - 30 * 60_000).toISOString())
    .first<{ assets: number }>();
  if ((feed?.assets ?? 0) < 8) return back("data");
  try {
    const artworkReady = await Promise.all(
      ASSETS.map(
        async (asset) =>
          (
            await bindings.MODELS.list({
              prefix: `${asset.toLowerCase()}/`,
              limit: 100,
            })
          ).objects.filter((object) => object.key.endsWith(".glb")).length >=
          MODEL_COUNTS[asset],
      ),
    );
    if (artworkReady.some((ready) => !ready)) return back("artwork");
  } catch {
    return back("artwork");
  }
  const existing = await bindings.DB.prepare(
    "SELECT stripe_customer_id,status,current_period_end FROM memberships WHERE user_id=?",
  )
    .bind(locals.user.id)
    .first<{
      stripe_customer_id: string | null;
      status: string;
      current_period_end: number;
    }>();
  if (
    existing?.status === "active" &&
    existing.current_period_end > Date.now() / 1000
  )
    return back("already-member");
  const now = Math.floor(Date.now() / 1000);
  const claim = await bindings.DB.prepare(
    "INSERT INTO checkout_attempts(user_id,expires_at) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET expires_at=excluded.expires_at,session_id=NULL WHERE checkout_attempts.expires_at<? RETURNING user_id",
  )
    .bind(locals.user.id, now + 3600, now)
    .first();
  if (!claim) return back("pending");
  const form = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][product]": plan.product,
    "line_items[0][price_data][unit_amount]": String(plan.cents),
    "line_items[0][price_data][recurring][interval]": "month",
    "line_items[0][quantity]": "1",
    client_reference_id: locals.user.id,
    "metadata[zahari_tier]": tier,
    "subscription_data[metadata][zahari_user_id]": locals.user.id,
    "subscription_data[metadata][zahari_tier]": tier,
    success_url: `${url.origin}/studio?checkout=return`,
    cancel_url: `${url.origin}/pricing`,
    expires_at: String(now + 3600),
  });
  if (existing?.stripe_customer_id)
    form.set("customer", existing.stripe_customer_id);
  try {
    const checkout = await stripe("checkout/sessions", form);
    if (
      !checkout.url ||
      !String(checkout.url).startsWith("https://checkout.stripe.com/")
    )
      throw new Error("Missing Checkout URL");
    await bindings.DB.prepare(
      "UPDATE checkout_attempts SET session_id=? WHERE user_id=?",
    )
      .bind(checkout.id, locals.user.id)
      .run();
    return Response.redirect(checkout.url, 303);
  } catch {
    await bindings.DB.prepare("DELETE FROM checkout_attempts WHERE user_id=?")
      .bind(locals.user.id)
      .run();
    return back("unavailable");
  }
};
