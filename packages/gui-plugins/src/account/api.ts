import type { ServerRef } from "@opencode/plugin/gui"

/** What the server's SuperVibeCode service plugin reports; `undefined` when the build has no service configured. */
export type Status = {
  readonly origin: string
  readonly signedIn: boolean
  readonly email?: string
  readonly name?: string
  readonly sessionExpired: boolean
  readonly balanceNano?: number
  readonly registration: boolean
  readonly captcha: boolean
  readonly topup: boolean
  readonly idrPerUsd?: number
  readonly minTopupIdr?: number
  readonly maxTopupIdr?: number
}

export type SignIn =
  | { readonly status: "signed-in" }
  | { readonly status: "mfa"; readonly mfaToken: string }
  | { readonly status: "verify" }
  | { readonly status: "error"; readonly message: string }

export type Topup =
  | {
      readonly status: "ok"
      readonly orderId: string
      readonly amountIdr: number
      readonly state: string
      readonly paymentUrl?: string
      readonly paymentCode?: string
    }
  | { readonly status: "error"; readonly message: string }

type Methods = {
  status: [Record<string, never>, Status]
  login: [{ email: string; password: string }, SignIn]
  verify: [{ email: string; mfaToken: string; code: string }, SignIn]
  logout: [Record<string, never>, { ok: boolean }]
  topup: [{ amountIdr: number }, Topup]
  topupStatus: [{ orderId: string }, Topup]
}

/** Calls the account RPC the server's SuperVibeCode service plugin registers. */
export function call<M extends keyof Methods>(server: ServerRef, method: M, input: Methods[M][0]) {
  return server.client.rpc
    .call({ rpcID: "supervibecode.account", method, input })
    .then((response) => (response as { output: Methods[M][1] }).output)
}

/** The balance in rupiah when the service sells in rupiah, else in dollars. */
export function formatBalance(status: Status, locale: string) {
  const usd = (status.balanceNano ?? 0) / 1_000_000_000

  if (status.idrPerUsd)
    return new Intl.NumberFormat(locale, { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
      usd * status.idrPerUsd,
    )

  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(usd)
}

export function formatRupiah(amount: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}
