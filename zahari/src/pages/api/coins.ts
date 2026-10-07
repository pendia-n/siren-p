import type { APIRoute } from "astro";
import { bindings } from "../../lib/runtime";
import {
  activeMembership,
  isAsset,
  membership,
  slots,
} from "../../lib/product";

export const POST: APIRoute = async ({ request, url, locals }) => {
  if (!locals.user) return Response.redirect(`${url.origin}/signin`, 303);
  if (request.headers.get("Origin") !== url.origin)
    return new Response("Invalid origin.", { status: 403 });
  const data = await request.formData();
  const asset = data.get("asset");
  const action = data.get("action");
  if (
    typeof asset !== "string" ||
    !isAsset(asset) ||
    !["add", "remove"].includes(String(action))
  )
    return new Response("Invalid choice.", { status: 400 });
  const member = await membership(locals.user.id);
  if (!activeMembership(member) || !member)
    return Response.redirect(`${url.origin}/pricing`, 303);
  if (action === "remove") {
    if (member.tier === "one")
      return new Response(
        "One-coin membership cannot change coin until the next billing cycle.",
        { status: 403 },
      );
    await bindings.DB.prepare(
      "DELETE FROM coin_selections WHERE user_id=? AND asset=?",
    )
      .bind(locals.user.id, asset)
      .run();
    await bindings.DB.prepare(
      "DELETE FROM scene_cache WHERE user_id=? AND asset=?",
    )
      .bind(locals.user.id, asset)
      .run();
  } else {
    if (member.tier === "one") {
      const previous = await bindings.DB.prepare(
        "SELECT asset,selected_at FROM coin_selections WHERE user_id=? LIMIT 1",
      )
        .bind(locals.user.id)
        .first<{ asset: string; selected_at: number }>();
      if (previous && previous.asset !== asset) {
        if (
          previous.selected_at >= member.current_period_start ||
          !member.current_period_start
        )
          return new Response(
            "You can choose a different coin after your next renewal.",
            { status: 403 },
          );
        await bindings.DB.batch([
          bindings.DB.prepare(
            "DELETE FROM coin_selections WHERE user_id=? AND asset=?",
          ).bind(locals.user.id, previous.asset),
          bindings.DB.prepare(
            "INSERT INTO coin_selections(user_id,asset,selected_at) VALUES(?,?,?)",
          ).bind(locals.user.id, asset, Math.floor(Date.now() / 1000)),
        ]);
        return Response.redirect(`${url.origin}/studio`, 303);
      }
    }
    await bindings.DB.prepare(
      "INSERT OR IGNORE INTO coin_selections(user_id,asset,selected_at) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM coin_selections WHERE user_id=?)<?",
    )
      .bind(
        locals.user.id,
        asset,
        Math.floor(Date.now() / 1000),
        locals.user.id,
        slots(member.tier),
      )
      .run();
  }
  return Response.redirect(`${url.origin}/studio`, 303);
};
