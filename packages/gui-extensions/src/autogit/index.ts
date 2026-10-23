import { Schema } from "effect"
import { Extension, Store } from "../sdk"
import en from "./i18n/en"

export default Extension.define({
  id: "autogit",
  stores: {
    // Commit the workspace after each agent turn that changed files, and push those commits when git can push without
    // asking for a login.
    prefs: Store.global(Schema.Struct({ commit: Schema.Boolean, push: Schema.Boolean }), { commit: true, push: true }),
  },
  i18n: { en },
})
