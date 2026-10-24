import { expect, test } from "bun:test"
import { commitMessage, commitPage, desktopLink } from "./git"

test("commitMessage takes the prompt's first line", () => {
  expect(commitMessage("\n  Add a login page \nwith Google", "Update")).toBe("Add a login page")
  expect(commitMessage(undefined, "Update")).toBe("Update")
  expect(commitMessage("x".repeat(80), "Update")).toHaveLength(72)
})

test("desktopLink encodes any platform's path", () => {
  expect(desktopLink("C:\\Users\\me\\My Site")).toBe("x-github-client://openLocalRepo/C%3A%5CUsers%5Cme%5CMy%20Site")
  expect(desktopLink("/home/me/site")).toBe("x-github-client://openLocalRepo/%2Fhome%2Fme%2Fsite")
})

test("commitPage follows each host's commit path", () => {
  expect(commitPage("https://github.com/me/site", "abc1234")).toBe("https://github.com/me/site/commit/abc1234")
  expect(commitPage("https://gitlab.com/g/site", "abc1234")).toBe("https://gitlab.com/g/site/-/commit/abc1234")
  expect(commitPage("https://bitbucket.org/t/site", "abc1234")).toBe("https://bitbucket.org/t/site/commits/abc1234")
})
