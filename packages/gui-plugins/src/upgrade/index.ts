import { Schema } from "effect"
import { Plugin, Store } from "@opencode/plugin/gui"
import en from "./i18n/en"

export default Plugin.define({
  stores: {
    // The latest version whose optional update the user dismissed, so the reminder shows once per release.
    dismissed: Store.global(Schema.Struct({ version: Schema.optional(Schema.String) }), {}),
  },
  i18n: { en },
})
