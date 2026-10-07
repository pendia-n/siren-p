import { defineMiddleware } from "astro:middleware";
import { session } from "./lib/auth";
import { bindings } from "./lib/runtime";

const guestOnly = new Set(["/", "/signin", "/signup", "/recovery"]);
const privatePages = new Set(["/studio", "/profile", "/security"]);
export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname.replace(/\/$/, "") || "/";
  // The allowlisted public art endpoint is independent of account sessions.
  if (path.startsWith("/media/")) return next();
  context.locals.user = null;
  context.locals.sessionId = null;
  try {
    const current = await session(bindings, context.cookies);
    if (current) {
      context.locals.user = current.user;
      context.locals.sessionId = current.id;
    }
  } catch {
    return new Response(
      "Your account is temporarily unavailable. Please try again shortly.",
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (privatePages.has(path) && !context.locals.user)
    return context.redirect("/signin", 303);
  if (guestOnly.has(path) && context.locals.user)
    return context.redirect("/studio", 303);
  const upstream = await next();
  // Redirect responses have immutable headers. Preserve their status/location
  // in a writable response before applying the shared security headers.
  const response = new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: new Headers(upstream.headers),
  });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  if (import.meta.env.PROD) {
    response.headers.set("Strict-Transport-Security", "max-age=31536000");
    response.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com",
    );
  }
  return response;
});
