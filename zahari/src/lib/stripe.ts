import { bindings } from "./runtime";

export type Tier = "one" | "five" | "eight";
export const PLANS: Record<
  Tier,
  { cents: number; name: string; slots: number }
> = {
  one: { cents: 499, name: "Zahari One Coin", slots: 1 },
  five: { cents: 899, name: "Zahari Five Coins", slots: 5 },
  eight: { cents: 1299, name: "Zahari Eight Coins", slots: 8 },
};

export async function stripe(path: string, form?: URLSearchParams) {
  if (!bindings.STRIPE_API_KEY) throw new Error("Stripe is not configured.");
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: form ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${bindings.STRIPE_API_KEY}`,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form,
  });
  const result = (await response.json()) as Record<string, any>;
  if (!response.ok)
    throw new Error(`Stripe request failed (${response.status}).`);
  return result;
}

export async function verifyStripeSignature(
  payload: string,
  header: string | null,
) {
  if (!header || !bindings.STRIPE_WEBHOOK_SECRET) return false;
  const parts = Object.fromEntries(
    header.split(",").map((part) => part.trim().split("=", 2)),
  );
  const timestamp = Number(parts.t);
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(Date.now() / 1000 - timestamp) > 300
  )
    return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(bindings.STRIPE_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${timestamp}.${payload}`),
    ),
  );
  const expected = Array.from(signature, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  const signatures = header
    .split(",")
    .filter((part) => part.trim().startsWith("v1="))
    .map((part) => part.trim().slice(3));
  return signatures.some(
    (actual) =>
      actual.length === expected.length &&
      actual
        .split("")
        .reduce(
          (diff, char, index) =>
            diff | (char.charCodeAt(0) ^ expected.charCodeAt(index)),
          0,
        ) === 0,
  );
}
