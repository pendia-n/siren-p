import type { APIRoute } from "astro";
import { bindings } from "../../../lib/runtime";
import { stripe } from "../../../lib/stripe";

export const POST: APIRoute = async ({ request, url, locals }) => {
  if (!locals.user) return Response.redirect(`${url.origin}/signin`, 303);
  if (request.headers.get("Origin") !== url.origin)
    return new Response("Invalid origin.", { status: 403 });
  const row = await bindings.DB.prepare(
    "SELECT stripe_customer_id FROM memberships WHERE user_id=?",
  )
    .bind(locals.user.id)
    .first<{ stripe_customer_id: string }>();
  if (!row?.stripe_customer_id)
    return Response.redirect(`${url.origin}/pricing`, 303);
  try {
    const portal = await stripe(
      "billing_portal/sessions",
      new URLSearchParams({
        customer: row.stripe_customer_id,
        return_url: `${url.origin}/profile`,
      }),
    );
    if (!String(portal.url).startsWith("https://billing.stripe.com/"))
      throw new Error("Invalid portal URL");
    return Response.redirect(portal.url, 303);
  } catch {
    return new Response("Billing settings are temporarily unavailable.", {
      status: 503,
    });
  }
};
