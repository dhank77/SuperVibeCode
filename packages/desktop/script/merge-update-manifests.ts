#!/usr/bin/env bun
/**
 * Each architecture's build writes its own update manifest (latest-mac.yml, latest.yml), naming only its own files.
 * The app reads one manifest per platform, so a release ships one with every architecture's files in it.
 *
 *   bun scripts/merge-update-manifests.ts <output.yml> <input.yml>...
 */

const [output, ...inputs] = process.argv.slice(2)

if (!output || inputs.length === 0) throw new Error("usage: merge-update-manifests.ts <output.yml> <input.yml>...")

const manifests = await Promise.all(inputs.map((file) => Bun.file(file).text()))

await Bun.write(output, merge(manifests))

console.log(`${output}: ${inputs.length} manifests merged`)

/** Keeps the first manifest and adds the other manifests' `files` entries to its list. */
function merge(manifests: string[]) {
  const [first, ...rest] = manifests.map(split)

  if (!first) throw new Error("No update manifests to merge")
  const version = first.head.find((line) => line.startsWith("version:"))

  rest.forEach((manifest) => {
    if (manifest.head.find((line) => line.startsWith("version:")) !== version)
      throw new Error("Update manifests are for different versions")
  })

  return [...first.head, "files:", ...first.files, ...rest.flatMap((manifest) => manifest.files), ...first.tail].join(
    "\n",
  )
}

// A manifest is top-level keys around one `files:` list whose entries are indented.
function split(manifest: string) {
  const lines = manifest.replace(/\n+$/, "").split("\n")
  const start = lines.indexOf("files:")

  if (start === -1) throw new Error("Update manifest has no files list")
  const end = lines.findIndex((line, index) => index > start && line !== "" && !line.startsWith(" "))
  const stop = end === -1 ? lines.length : end

  return { head: lines.slice(0, start), files: lines.slice(start + 1, stop), tail: [...lines.slice(stop), ""] }
}
