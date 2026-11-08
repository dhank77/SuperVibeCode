import { Schema } from "effect"
import type { Plugin } from "@opencode/plugin/gui/main"
import { Upgrade, type Policy } from "./contract"
import { compare } from "./version"

// The publisher's policy file. SUPERVIBECODE_VERSION_URL points elsewhere, as for testing a build from source.
const DEFAULT_URL = "https://supervibecode.ai.id/version.json"

// A release goes out every few days at most; the window still asks again when the user says they updated.
const REFRESH_MS = 6 * 60 * 60 * 1000

const Manifest = Schema.Struct({
  minimum: Schema.optional(Schema.String),
  latest: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
  download: Schema.optional(Schema.String),
})

/**
 * Reads which versions are still supported from the publisher's version.json and tells every window. Without the file,
 * offline, or with a file it can't read, the app stays usable: only a policy it read can require an update.
 */
const setup: Plugin.MainSetup = (ctx) => {
  const url = process.env.SUPERVIBECODE_VERSION_URL || DEFAULT_URL
  const enabled = Boolean(process.env.SUPERVIBECODE_VERSION_URL) || (ctx.app.packaged && ctx.app.channel !== "dev")
  const site = new URL(url).origin
  const base: Policy = {
    status: "unknown",
    current: ctx.app.version,
    download: `${site}/#download`,
    site,
    os: process.platform === "darwin" ? "mac" : process.platform === "win32" ? "windows" : "linux",
  }
  const state = { value: base }
  const publish = { changed: () => {} }

  const refresh = async () => {
    if (!enabled) return state.value
    const manifest = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) })
      .then((response) => (response.ok ? response.json() : undefined))
      .then((json) => Schema.decodeUnknownOption(Manifest)(json))
      .catch(() => undefined)

    // A failed read keeps the last answer, so a requirement already known survives a network drop.
    if (!manifest || manifest._tag === "None") return state.value
    state.value = { ...base, ...decide(ctx.app.version, manifest.value) }
    publish.changed()

    return state.value
  }

  const provider = ctx.provide(Upgrade, { state: () => state.value, refresh })
  publish.changed = () => provider.changed()

  void refresh()
  const timer = setInterval(() => void refresh(), REFRESH_MS)
  ctx.onCleanup(() => clearInterval(timer))
}

function decide(current: string, manifest: typeof Manifest.Type) {
  const extra = {
    ...(manifest.latest ? { latest: manifest.latest } : {}),
    ...(manifest.message ? { message: manifest.message } : {}),
    ...(manifest.download ? { download: manifest.download } : {}),
  }

  if (manifest.minimum && compare(current, manifest.minimum) < 0) return { ...extra, status: "required" as const }
  if (manifest.latest && compare(current, manifest.latest) < 0) return { ...extra, status: "outdated" as const }

  return { ...extra, status: "current" as const }
}

export default setup
