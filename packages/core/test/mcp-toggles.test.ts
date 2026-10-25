import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { Global } from "@opencode/util/global"
import type { Mcp } from "@opencode/schema/mcp"
import { McpToggles } from "@opencode/core/mcp/toggles"
import { tmpdir } from "./fixture/tmpdir"

const servers = new Map<string, Mcp.ServerConfig>([
  ["supabase", { type: "remote", url: "https://mcp.supabase.com/mcp", disabled: true }],
  ["docs", { type: "remote", url: "https://example.com/mcp" }],
])

describe("McpToggles", () => {
  test("keeps the user's on and off choices for the next start", async () => {
    await using tmp = await tmpdir()
    const previous = process.env.SUPERVIBECODE_MCP_TOGGLES
    delete process.env.SUPERVIBECODE_MCP_TOGGLES

    try {
      const run = <A>(effect: Effect.Effect<A, never, Global.Service>) =>
        Effect.runPromise(effect.pipe(Effect.provideService(Global.Service, Global.make({ state: tmp.path }))))

      await run(
        Effect.gen(function* () {
          const toggles = yield* McpToggles.make()

          expect(toggles.apply(servers)).toEqual(servers)
          yield* toggles.remember("supabase", true)
          yield* toggles.remember("docs", false)
        }),
      )

      const restarted = await run(McpToggles.make().pipe(Effect.map((toggles) => toggles.apply(servers))))

      expect(restarted.get("supabase")?.disabled).toBe(false)
      expect(restarted.get("docs")?.disabled).toBe(true)
    } finally {
      process.env.SUPERVIBECODE_MCP_TOGGLES = previous
    }
  })
})
