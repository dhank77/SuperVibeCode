import { Schema } from "effect"
import { Extension, Store } from "../sdk"
import { Updater } from "../updater/contract"
import { Upgrade } from "./contract"
import en from "./i18n/en"

export default Extension.define({
  id: "upgrade",
  provides: { upgrade: Upgrade },
  uses: { updater: Updater },
  stores: {
    // The latest version whose optional update the user dismissed, so the reminder shows once per release.
    dismissed: Store.global(Schema.Struct({ version: Schema.optional(Schema.String) }), {}),
  },
  i18n: { en },
})
