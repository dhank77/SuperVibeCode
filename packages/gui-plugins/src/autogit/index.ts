import { Schema } from "effect"
import { Plugin, Store } from "@opencode/plugin/gui"
import en from "./i18n/en"

export default Plugin.define({
  stores: {
    // Commit the workspace after each agent turn that changed files, and push those commits when git can push without
    // asking for a login.
    prefs: Store.global(Schema.Struct({ commit: Schema.Boolean, push: Schema.Boolean }), { commit: true, push: true }),
  },
  i18n: { en },
})
