import { resolveChannel } from "./utils"

const arg = process.argv[2]

const channel = arg === "dev" || arg === "beta" || arg === "prod" ? arg : resolveChannel()

const appId = channel === "prod" ? "ai.supervibecode.desktop" : `ai.supervibecode.desktop.${channel}`

const productName =
  channel === "prod" ? "SuperVibeCode" : `SuperVibeCode ${channel.charAt(0).toUpperCase() + channel.slice(1)}`

const summary = `Vibe coding agent with a live app preview${channel !== "prod" ? ` (${channel})` : ""}`

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>${appId}</id>

  <metadata_license>CC0-1.0</metadata_license>
  <project_license>MIT</project_license>

  <name>${productName}</name>
  <summary>${summary}</summary>

  <developer id="io.github.dhank77">
    <name>dhank77</name>
  </developer>

  <description>
    <p>
      SuperVibeCode builds and runs apps with any AI model and shows them live beside the chat. It is based on OpenCode (MIT).
    </p>
  </description>

  <launchable type="desktop-id">${appId}.desktop</launchable>

  <content_rating type="oars-1.1" />

  <url type="bugtracker">https://github.com/dhank77/SuperVibeCode/issues</url>
  <url type="homepage">https://github.com/dhank77/SuperVibeCode</url>
  <url type="vcs-browser">https://github.com/dhank77/SuperVibeCode</url>

</component>
`

await Bun.write(`resources/${appId}.metainfo.xml`, xml)

console.log(`Generated metainfo for ${channel} at resources/${appId}.metainfo.xml`)
