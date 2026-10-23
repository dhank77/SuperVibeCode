import { Contract } from "../sdk"

export interface Preview {
  /**
   * Looks for a dev server address in terminal output from a workspace, and shows it in the routed session when that
   * session runs on the same server and directory.
   *
   * @param input - The terminal's server id (`ServerRef.id`), its workspace directory, and recent output.
   * @returns True when the output named an address, so the caller can start a fresh buffer.
   */
  scan(input: { server: string; directory: string; text: string }): boolean
}

/** The preview extension provides this in every window. */
export const Preview = Contract.define<Preview, "preview">("preview")
