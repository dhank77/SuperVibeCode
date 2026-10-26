import { expect, test } from "bun:test"
import { guessPlan, STATIC_COMMAND } from "./guess"

const scripts = (value: Record<string, string>) => JSON.stringify({ scripts: value })

test.each([
  ["npm", ["package.json", "node_modules"], scripts({ dev: "vite" }), { command: "npm run dev" }],
  ["install first", ["package.json"], scripts({ dev: "vite" }), { command: "npm run dev", install: "npm install" }],
  ["bun", ["package.json", "bun.lock", "node_modules"], scripts({ dev: "vite" }), { command: "bun run dev" }],
  [
    "pnpm",
    ["package.json", "pnpm-lock.yaml", "node_modules"],
    scripts({ dev: "next dev" }),
    { command: "pnpm run dev" },
  ],
  [
    "yarn start",
    ["package.json", "yarn.lock", "node_modules"],
    scripts({ start: "react-scripts start" }),
    { command: "yarn start" },
  ],
  ["laravel", ["artisan", "composer.json", "vendor"], undefined, { command: "php artisan serve" }],
  [
    "laravel install",
    ["artisan", "composer.json"],
    undefined,
    { command: "php artisan serve", install: "composer install" },
  ],
])("%s", (_name, files, packageJson, plan) => {
  expect(guessPlan({ files, packageJson })).toEqual(plan)
})

test("no plan without a server script", () => {
  expect(guessPlan({ files: ["package.json"], packageJson: scripts({ build: "tsc" }) })).toBeUndefined()
  expect(guessPlan({ files: ["package.json"], packageJson: "{ broken" })).toBeUndefined()
  expect(guessPlan({ files: ["package.json", "index.html"], packageJson: scripts({ build: "tsc" }) })).toBeUndefined()
})

test("a plain HTML site is served as static files", () => {
  expect(guessPlan({ files: ["index.html", "style.css"] })).toEqual({ command: STATIC_COMMAND })
})
