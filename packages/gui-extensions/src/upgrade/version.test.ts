import { expect, test } from "bun:test"
import { compare } from "./version"

test("compares release versions part by part", () => {
  expect(compare("0.1.9", "0.2.0")).toBeLessThan(0)
  expect(compare("0.10.0", "0.9.9")).toBeGreaterThan(0)
  expect(compare("v1.2", "1.2.0")).toBe(0)
  expect(compare("1.2.0-beta.1", "1.2.0")).toBe(0)
})
