export * as BuiltinSkills from "./builtin-skills.js"

import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { AbsolutePath } from "../../schema.js"
import { Skill } from "../../skill.js"

/**
 * The published copy of SuperVibeCode's bundled skills. A compiled build has no repository beside it, so it pulls the
 * same folders from here once, keeps them in the cache, and refreshes a skill when its version in index.json changes.
 */
export const remote = "https://raw.githubusercontent.com/dhank77/SuperVibeCode/main/skills/"

/** The repository's skills folder, when this module runs from a source checkout. */
export function local(from = import.meta.url) {
  if (!from.startsWith("file:")) return undefined

  // src/config/plugin → the repository root, five levels up from this file's folder.
  const directory = path.resolve(path.dirname(fileURLToPath(from)), "../../../../../skills")

  return existsSync(path.join(directory, "index.json")) ? directory : undefined
}

/**
 * The design skills SuperVibeCode ships, available without installing anything: the repository's own folder when it
 * runs from source, otherwise the published copy. Setting SUPERVIBECODE_BUILTIN_SKILLS=0 turns them off.
 */
export function source(
  env: Record<string, string | undefined> = process.env,
  from = import.meta.url,
): Skill.DirectorySource | Skill.UrlSource | undefined {
  if (env.SUPERVIBECODE_BUILTIN_SKILLS === "0") return undefined
  const directory = local(from)

  if (directory) return Skill.DirectorySource.make({ type: "directory", path: AbsolutePath.make(directory) })

  return Skill.UrlSource.make({ type: "url", url: remote })
}
