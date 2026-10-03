import type { SessionUser } from "./lib/auth";

declare global {
  namespace App {
    interface Locals {
      user: SessionUser | null;
      sessionId: string | null;
    }
  }
}

export {};
