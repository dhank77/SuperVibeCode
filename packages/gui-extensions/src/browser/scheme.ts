import { execFile } from "node:child_process"
import electron from "electron"
import type { Scheme } from "./chromium"

const windowsKey = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize"

/**
 * The computer's own light or dark appearance. The app sets Electron's theme to its own, which every page would see as
 * its prefers-color-scheme; a browser page should see the computer's instead. Undefined where Electron already reports
 * the computer's appearance to pages (Linux, where the app leaves Electron's theme alone).
 */
export function createSystemScheme(changed: (scheme: Scheme | undefined) => void) {
  let value = readSync()

  const update = (next: Scheme | undefined) => {
    if (next === value) return
    value = next
    changed(next)
  }

  const refresh = () => {
    if (process.platform === "darwin") return update(readSync())

    if (process.platform === "win32") void readWindows().then(update)
  }

  if (process.platform === "win32") refresh()
  electron.nativeTheme.on("updated", refresh)
  // Windows has no notification for the apps' setting, so it is read again when the user comes back to the app.
  electron.app.on("browser-window-focus", refresh)

  const subscription =
    process.platform === "darwin"
      ? electron.systemPreferences.subscribeNotification("AppleInterfaceThemeChangedNotification", refresh)
      : undefined

  return {
    current: () => value,
    dispose() {
      electron.nativeTheme.off("updated", refresh)
      electron.app.off("browser-window-focus", refresh)

      if (subscription !== undefined) electron.systemPreferences.unsubscribeNotification(subscription)
    },
  }
}

function readSync(): Scheme | undefined {
  if (process.platform !== "darwin") return undefined

  // macOS sets this only while the appearance is dark, including when Auto has switched to dark.
  return electron.systemPreferences.getUserDefault("AppleInterfaceStyle", "string") === "Dark" ? "dark" : "light"
}

// Windows keeps the apps' light or dark setting in the registry; reg.exe ships with every version.
function readWindows() {
  return new Promise<Scheme | undefined>((resolve) => {
    execFile("reg", ["query", windowsKey, "/v", "AppsUseLightTheme"], { windowsHide: true }, (error, stdout) => {
      if (error) return resolve(undefined)

      const match = /AppsUseLightTheme\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(stdout)

      if (!match) return resolve(undefined)
      resolve(Number.parseInt(match[1], 16) === 0 ? "dark" : "light")
    })
  })
}
