import { app } from "electron"

type Channel = "local" | "dev" | "beta" | "prod"

const raw = import.meta.env.OPENCODE_CHANNEL

export const CHANNEL: Channel = raw === "local" || raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

export const VERSION = app.isPackaged ? app.getVersion() : (process.env.OPENCODE_VERSION ?? app.getVersion())

const appNames: Record<string, string> = {
  dev: "SuperVibeCode Dev",
  beta: "SuperVibeCode Beta",
  prod: "SuperVibeCode",
}

const appIDs: Record<string, string> = {
  dev: "ai.supervibecode.desktop.dev",
  beta: "ai.supervibecode.desktop.beta",
  prod: "ai.supervibecode.desktop",
}

// Local renderer/server mode keeps the dev application identity.
export const APP_NAME = app.isPackaged ? appNames[CHANNEL] : "SuperVibeCode Dev"

export const APP_ID = app.isPackaged ? appIDs[CHANNEL] : "ai.supervibecode.desktop.dev"
