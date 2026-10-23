import { Schema } from "effect"
import { Browser } from "../browser/contract"
import { Extension, Store } from "../sdk"
import { Preview } from "./contract"
import en from "./i18n/en"

export default Extension.define({
  id: "preview",
  provides: { preview: Preview },
  uses: { browser: Browser },
  stores: {
    // Opens the preview by itself once a dev server announces its address. Off, the address waits for the command.
    prefs: Store.global(Schema.Struct({ auto: Schema.Boolean }), { auto: true }),
  },
  i18n: { en },
})
