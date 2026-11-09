import { handle } from "@astrojs/cloudflare/handler";
import { runNewsEdition } from "./lib/news-jobs";
import { refreshDemoScene } from "./lib/sol-demo";
import type { Bindings } from "./lib/auth";
export default {
  fetch: handle,
  async scheduled(
    controller: ScheduledController,
    env: Bindings,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(runNewsEdition(env, new Date(controller.scheduledTime)));
    ctx.waitUntil(refreshDemoScene(env, controller.scheduledTime));
  },
};
