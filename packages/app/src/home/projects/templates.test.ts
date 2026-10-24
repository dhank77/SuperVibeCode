import { describe, expect, test } from "bun:test"
import { LARAVEL_MARKER, packageName, projectDirectory, projectTemplates, validProjectName } from "./templates"

describe("project templates", () => {
  test("every Node template is a runnable npm project with a dev script", () => {
    projectTemplates
      .filter((template) => template.needs === "node")
      .forEach((template) => {
        const files = template.files("Coffee Shop")
        const manifest = JSON.parse(files["package.json"]!)

        expect(manifest.name).toBe("coffee-shop")
        expect(manifest.scripts.dev).toBeString()
        expect(files[".gitignore"]).toContain("node_modules")
        expect(files["AGENTS.md"]).toContain("Tailwind")
      })
  })

  test("Laravel starts empty but for the marker its setup removes", () => {
    const laravel = projectTemplates.find((template) => template.id === "laravel")!

    expect(Object.keys(laravel.files("app"))).toEqual([LARAVEL_MARKER])
    expect(laravel.setup).toContain(LARAVEL_MARKER)
  })

  test("names are folder and package safe", () => {
    expect(validProjectName("my-app")).toBe(true)
    expect(validProjectName("Coffee Shop 2")).toBe(true)
    expect(validProjectName("../escape")).toBe(false)
    expect(validProjectName("ends.")).toBe(false)
    expect(validProjectName("a/b")).toBe(false)
    expect(packageName("My App!")).toBe("my-app")
  })

  test("joins with the separator the parent already uses", () => {
    expect(projectDirectory("/Users/me/SuperVibeCode/", "site")).toBe("/Users/me/SuperVibeCode/site")
    expect(projectDirectory("C:\\Users\\me", "site")).toBe("C:\\Users\\me\\site")
  })
})
