export * as App from "./app.js"

import { Context, Layer } from "effect"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import pkg from "../package.json" with { type: "json" }

export interface Info {
  readonly name: string
  readonly version: string
  readonly channel: string
}

export const Metadata = Context.Reference<Info>("@opencode/App", {
  defaultValue: () => make(),
})

export function make(input: Partial<Info> = {}): Info {
  return {
    name: input.name ?? "opencode",
    version: input.version ?? "unknown",
    channel: input.channel ?? "unknown",
  }
}

/**
 * SuperVibeCode numbers its own releases (0.1.x), but OpenCode's services read this header to tell which OpenCode
 * features a client has, and refuse versions older than they support. The code is the OpenCode release this
 * package.json names, so that is the version it reports.
 */
export function useragent(app: Info) {
  return `opencode/${app.channel}/${pkg.version}/${app.name}`
}

export const layer = (input?: Partial<Info>) => Layer.succeed(Metadata, make(input))

export const configured = (input?: Partial<Info>) =>
  makeGlobalNode({ service: Metadata, layer: layer(input), deps: [] })

export const node = configured()
