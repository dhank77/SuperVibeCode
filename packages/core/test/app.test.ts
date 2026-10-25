import { expect, test } from "bun:test"
import { App } from "@opencode/core/app"
import pkg from "../package.json" with { type: "json" }

test("reports the OpenCode version the code is built on, not SuperVibeCode's release number", () => {
  expect(App.useragent(App.make({ name: "sdk", version: "0.1.2", channel: "beta" }))).toBe(
    `opencode/beta/${pkg.version}/sdk`,
  )
})
