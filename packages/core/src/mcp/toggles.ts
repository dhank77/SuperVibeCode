export * as McpToggles from "./toggles.js"

import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { Mcp } from "@opencode/schema/mcp"
import { Global } from "@opencode/util/global"
import { Effect, Option, Schema } from "effect"

const decode = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Boolean)))

/**
 * The user's on or off choice for each MCP server, kept across restarts. Turning a server on or off is otherwise only
 * for the running server, so a server the user turned on (such as the built-in Supabase one, which starts off) went
 * off again with every restart. A choice overrides the server's `disabled` config until the user changes it again.
 */
export const make = Effect.fn("McpToggles.make")(function* () {
  const global = yield* Effect.serviceOption(Global.Service)
  // Tests turn it off, so one test's choice never leaks into another run.
  const file =
    Option.isSome(global) && process.env.SUPERVIBECODE_MCP_TOGGLES !== "0"
      ? path.join(global.value.state, "mcp-enabled.json")
      : undefined
  const text = file ? yield* Effect.promise(() => readFile(file, "utf8").catch(() => "")) : ""
  const choices = { ...Option.getOrElse(decode(text), () => ({})) }

  return {
    /** The servers as the user last chose them: on or off whatever their config says. */
    apply<Name extends string>(servers: ReadonlyMap<Name, Mcp.ServerConfig>) {
      return new Map(
        Array.from(servers, ([name, config]) => {
          const enabled = choices[name]

          return [name, enabled === undefined ? config : { ...config, disabled: !enabled }] as const
        }),
      )
    },
    remember: (name: string, enabled: boolean) =>
      Effect.promise(async () => {
        if (!file || choices[name] === enabled) return
        choices[name] = enabled
        await mkdir(path.dirname(file), { recursive: true })
        await writeFile(file, `${JSON.stringify(choices, null, 2)}\n`)
      }),
  }
})
