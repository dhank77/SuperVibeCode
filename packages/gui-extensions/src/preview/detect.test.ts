import { describe, expect, test } from "bun:test"
import { detectURL, serverOrigin } from "./detect"

describe("detectURL", () => {
  test.each([
    [
      "vite",
      "\u001b[32m➜\u001b[39m  \u001b[1mLocal\u001b[22m:   \u001b[36mhttp://localhost:\u001b[1m5173\u001b[22m/\u001b[39m",
      "http://localhost:5173/",
    ],
    [
      "next",
      "   ▲ Next.js 15.0.0\n   - Local:        http://localhost:3000\n   - Network:      http://192.168.1.4:3000",
      "http://localhost:3000/",
    ],
    ["laravel", "   INFO  Server running on [http://127.0.0.1:8000].", "http://127.0.0.1:8000/"],
    ["django", "Starting development server at http://127.0.0.1:8000/", "http://127.0.0.1:8000/"],
    ["wildcard bind", "Listening on http://0.0.0.0:4000", "http://localhost:4000/"],
    ["valet host", "Serving on https://shop.test", "https://shop.test/"],
    ["vite base", "  ➜  Local:   http://localhost:5173/app/", "http://localhost:5173/app/"],
    ["port only", "Server is running on port 3000", "http://localhost:3000/"],
  ])("%s", (_name, text, url) => {
    expect(detectURL(text)).toBe(url)
  })

  test("ignores URLs outside an announcement and remote hosts", () => {
    expect(detectURL("fetching http://localhost:9999/api/users failed")).toBeUndefined()
    expect(detectURL("Server running on https://example.com")).toBeUndefined()
    expect(detectURL("added 120 packages in 3s")).toBeUndefined()
  })
})

test("serverOrigin folds loopback hosts", () => {
  expect(serverOrigin("http://127.0.0.1:8000/admin")).toBe(serverOrigin("http://localhost:8000/"))
  expect(serverOrigin("http://localhost:8000/")).not.toBe(serverOrigin("http://localhost:5173/"))
})
