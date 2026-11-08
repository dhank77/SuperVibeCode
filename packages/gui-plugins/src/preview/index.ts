import { Schema } from "effect"
import { Plugin, Store } from "@opencode/plugin/gui"
import en from "./i18n/en"

export default Plugin.define({
  stores: {
    // Opens the preview by itself once a dev server announces its address. Off, the address waits for the command.
    prefs: Store.global(Schema.Struct({ auto: Schema.Boolean }), { auto: true }),
    // The last command that started a dev server in the session and the directory it ran in, so a session opened
    // again from the history starts it with one click. An empty command means none yet.
    dev: Store.session(Schema.Struct({ command: Schema.String, cwd: Schema.String }), { command: "", cwd: "" }),
  },
  i18n: { en },
})
