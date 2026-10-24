export * as SuperVibeCodeMcpPlugin from "./supervibecode-mcp.js"

import { define } from "@opencode/plugin/effect/plugin"
import { Effect } from "effect"

/**
 * Services SuperVibeCode works with out of the box. Each starts turned off, so nothing connects or asks for a sign-in
 * until the user turns it on for a session; turning it on signs in with the service's own OAuth. A server of the same
 * name in the user's config replaces the built-in one.
 */
export const Plugin = define({
  id: "supervibecode.mcp",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.mcp.transform((editor) => {
      // Databases, auth, storage and edge functions for the apps the agent builds.
      if (!editor.get("supabase"))
        editor.set("supabase", { type: "remote", url: "https://mcp.supabase.com/mcp", disabled: true })
    })
  }),
})
