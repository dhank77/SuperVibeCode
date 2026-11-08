import { Schema } from "effect"
import { Plugin, Store } from "@opencode/plugin/gui"
import en from "./i18n/en"

export default Plugin.define({
  stores: {
    // The sign-in dialog opens by itself once, on the first launch with the SuperVibeCode service available.
    prefs: Store.global(Schema.Struct({ introduced: Schema.Boolean }), { introduced: false }),
  },
  i18n: { en },
})
