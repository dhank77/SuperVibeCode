#!/usr/bin/env bun
/**
 * Writes skills/index.json, the list of SuperVibeCode's bundled skills and their files. Compiled builds read it from
 * GitHub to download the skills; each version is a hash of the skill's files, so an edited skill refreshes.
 *
 *   bun script/skills-index.ts          write the index
 *   bun script/skills-index.ts --check  fail when the index is out of date
 */
import { createHash } from "node:crypto"
import { readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const root = path.resolve(import.meta.dir, "../skills")

async function files(directory: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(path.join(directory, prefix), { withFileTypes: true })
  const nested = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith("."))
      .map((entry) =>
        entry.isDirectory()
          ? files(directory, path.posix.join(prefix, entry.name))
          : [path.posix.join(prefix, entry.name)],
      ),
  )

  return nested.flat().toSorted()
}

export async function build() {
  const names = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .toSorted()
  const skills = await Promise.all(
    names.map(async (name) => {
      const list = await files(path.join(root, name))
      const hash = createHash("sha256")

      for (const file of list)
        hash
          .update(file)
          .update("\0")
          .update(await readFile(path.join(root, name, file)))

      return { name, version: hash.digest("hex").slice(0, 12), files: list }
    }),
  )

  return `${JSON.stringify({ skills }, null, 2)}\n`
}

if (import.meta.main) {
  const next = await build()
  const target = path.join(root, "index.json")

  if (process.argv.includes("--check")) {
    const current = await readFile(target, "utf8").catch(() => "")

    if (current !== next) {
      console.error("skills/index.json is out of date. Run: bun script/skills-index.ts")
      process.exit(1)
    }
  } else {
    await writeFile(target, next)
    console.log(`skills/index.json: ${JSON.parse(next).skills.length} skills`)
  }
}
