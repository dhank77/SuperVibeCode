import { expect, test } from "bun:test"
import { commitMessage, desktopLink } from "./git"

test("commitMessage takes the prompt's first line", () => {
  expect(commitMessage("\n  Add a login page \nwith Google", "Update")).toBe("Add a login page")
  expect(commitMessage(undefined, "Update")).toBe("Update")
  expect(commitMessage("x".repeat(80), "Update")).toHaveLength(72)
})

test("desktopLink encodes any platform's path", () => {
  expect(desktopLink("C:\\Users\\me\\My Site")).toBe("x-github-client://openLocalRepo/C%3A%5CUsers%5Cme%5CMy%20Site")
  expect(desktopLink("/home/me/site")).toBe("x-github-client://openLocalRepo/%2Fhome%2Fme%2Fsite")
})
