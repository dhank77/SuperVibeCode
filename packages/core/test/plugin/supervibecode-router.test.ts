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

  test("orders models from free and cheapest to most expensive", () => {
    const models = SuperVibeCodeRouterPlugin.readModels([
      {
        slug: "claude-opus-5",
        name: "claude-opus-5",
        owned_by: "anthropic",
        context_length: 1_000_000,
        prompt_price_nano: 6_000_000_000,
        completion_price_nano: 30_000_000_000,
      },
      {
        slug: "claude-haiku-5-5",
        name: "claude-haiku-5-5",
        owned_by: "anthropic",
        context_length: 1_000_000,
        prompt_price_nano: 120_000_000,
        completion_price_nano: 600_000_000,
      },
      {
        slug: "glm-5.3-flash",
        name: "glm-5.3-flash",
        owned_by: "z.ai",
        context_length: 1_000_000,
        prompt_price_nano: 0,
        completion_price_nano: 0,
        is_free: true,
      },
    ])

    expect(models.map((item) => item.slug)).toEqual(["glm-5.3-flash", "claude-haiku-5-5", "claude-opus-5"])
  })
})
