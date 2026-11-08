import { Schema } from "effect"
import { Ipc } from "@opencode/plugin/gui"

export const Policy = Schema.Struct({
  /**
   * - `unknown`: not checked yet, the policy couldn't be read, or this build doesn't check.
   * - `current`: at or above the latest version.
   * - `outdated`: below the latest version, at or above the minimum.
   * - `required`: below the minimum; the app can't be used until it updates.
   */
  status: Schema.Literals(["unknown", "current", "outdated", "required"]),
  current: Schema.String,
  latest: Schema.optional(Schema.String),
  /** The publisher's message for an update the app requires. */
  message: Schema.optional(Schema.String),
  /** The page to download the latest version. */
  download: Schema.String,
  /** The site serving the one-command installers. */
  site: Schema.String,
  os: Schema.Literals(["mac", "windows", "linux"]),
})

export type Policy = typeof Policy.Type

/** Which versions the publisher still supports, read by main from the site's version.json. */
export const Upgrade = Ipc.define({
  id: "upgrade",
  state: Policy,
  methods: {
    /** Reads the policy again, as after the user updated outside the app. */
    refresh: { output: Policy },
  },
  events: {},
})
