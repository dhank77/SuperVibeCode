import { Option, Schema } from "effect"

/** How to run a project's dev server: an optional install step first, then the server. */
export interface Plan {
  readonly command: string
  readonly install?: string
}

const PackageJson = Schema.fromJsonString(
  Schema.Struct({ scripts: Schema.optional(Schema.Record(Schema.String, Schema.String)) }),
)

const decodePackageJson = Schema.decodeUnknownOption(PackageJson)

/**
 * The dev server a project most likely runs, from the names at its root and its package.json: the package manager its
 * lockfile names (npm without one) runs its `dev`, `start` or `serve` script, and Laravel runs `php artisan serve`.
 * Dependencies install first when their folder is missing. Undefined for a project with no server to start.
 */
export function guessPlan(input: {
  readonly files: readonly string[]
  readonly packageJson?: string
}): Plan | undefined {
  const has = (name: string) => input.files.includes(name)
  const scripts = input.packageJson ? Option.getOrUndefined(decodePackageJson(input.packageJson))?.scripts : undefined
  const script = ["dev", "start", "serve"].find((name) => scripts?.[name] !== undefined)

  if (script) {
    const runner =
      has("bun.lock") || has("bun.lockb") ? "bun" : has("pnpm-lock.yaml") ? "pnpm" : has("yarn.lock") ? "yarn" : "npm"

    const command = runner === "yarn" ? `yarn ${script}` : `${runner} run ${script}`

    return has("node_modules") ? { command } : { command, install: `${runner} install` }
  }

  if (has("artisan"))
    return has("vendor")
      ? { command: "php artisan serve" }
      : { command: "php artisan serve", install: "composer install" }

  return undefined
}
