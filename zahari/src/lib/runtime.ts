import { env } from "cloudflare:workers";
import type { Bindings } from "./auth";
export const bindings = env as unknown as Bindings;
