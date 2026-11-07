import { describe, expect, test } from "bun:test"
import { SuperVibeCodeRouterPlugin } from "../../src/plugin/supervibecode-router"

describe("SuperVibeCodeRouterPlugin.origin", () => {
  test("reads the service address without a trailing /v1 or slash", () => {
    expect(SuperVibeCodeRouterPlugin.origin({ SUPERVIBECODE_ROUTER_URL: "https://api.example.com/v1/" })).toBe(
      "https://api.example.com",
    )
  })

  test("is undefined without a usable address", () => {
    expect(SuperVibeCodeRouterPlugin.origin({})).toBeUndefined()
    expect(SuperVibeCodeRouterPlugin.origin({ SUPERVIBECODE_ROUTER_URL: "not a url" })).toBeUndefined()
  })
})
