import { Button } from "@opencode/ui/button"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { TextField } from "@opencode/ui/text-field"
import { showToast } from "@opencode/ui/toast"
import { createMemo, For, Match, onCleanup, Show, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { renderSVG } from "uqr"
import { usePlugin, type ServerRef } from "@opencode/plugin/gui"
import { call, formatBalance, formatRupiah, type SignIn, type Status, type Topup } from "./api"
import type definition from "./index"

const PRESETS = [50_000, 100_000, 250_000]
const POLL_MS = 3_000

type Payment = Extract<Topup, { status: "ok" }>

/** Signs in to the SuperVibeCode AI service, shows the balance, and tops it up with QRIS. */
export default function AccountDialog(props: {
  server: ServerRef
  status: Status
  /** Reloads the status, for the balance after a sign-in or a payment. */
  refresh(): Promise<void>
  close(): void
}) {
  const ctx = usePlugin<typeof definition>()
  const [form, setForm] = createStore({
    email: props.status.email ?? "",
    password: "",
    code: "",
    mfaToken: "",
    amount: String(PRESETS[0]),
    busy: false,
    error: "",
    payment: undefined as Payment | undefined,
  })
  const timer: { id?: ReturnType<typeof setTimeout> } = {}
  onCleanup(() => clearTimeout(timer.id))

  const locale = () => ctx.locale.locale()
  const open = (path: string) => ctx.system.openExternal(`${props.status.origin}${path}`)

  const run = async <T,>(work: () => Promise<T>) => {
    setForm({ busy: true, error: "" })
    const result = await work().catch((error: unknown) => {
      setForm("error", error instanceof Error ? error.message : ctx.t("error.generic"))

      return undefined
    })
    setForm("busy", false)

    return result
  }

  const settle = async (result: SignIn | undefined) => {
    if (!result) return
    if (result.status === "error") return setForm("error", result.message)
    if (result.status === "verify") return setForm("error", ctx.t("verify.email"))
    if (result.status === "mfa") return setForm({ mfaToken: result.mfaToken, password: "" })
    setForm({ mfaToken: "", password: "", code: "" })
    await props.refresh()
    showToast({ variant: "success", title: ctx.t("welcome.toast") })
  }

  const signIn = () =>
    run(() => call(props.server, "login", { email: form.email.trim(), password: form.password })).then(settle)

  const verify = () =>
    run(() =>
      call(props.server, "verify", { email: form.email.trim(), mfaToken: form.mfaToken, code: form.code.trim() }),
    ).then(settle)

  const signOut = () => run(() => call(props.server, "logout", {})).then(() => props.refresh())

  const amount = () => Number(form.amount.replace(/\D/g, ""))
  const inRange = () =>
    amount() >= (props.status.minTopupIdr ?? 1) && amount() <= (props.status.maxTopupIdr ?? Number.MAX_SAFE_INTEGER)

  const poll = (orderId: string) => {
    timer.id = setTimeout(async () => {
      const result = await call(props.server, "topupStatus", { orderId }).catch(() => undefined)

      if (result?.status !== "ok" || result.state === "pending") return poll(orderId)
      setForm("payment", undefined)
      if (result.state !== "completed")
        return showToast({ variant: "error", title: ctx.t("topup.failed", { state: result.state }) })
      showToast({ variant: "success", title: ctx.t("topup.done") })
      await props.refresh()
    }, POLL_MS)
  }

  const topup = () =>
    run(() => call(props.server, "topup", { amountIdr: amount() })).then((result) => {
      if (!result) return
      if (result.status === "error") return setForm("error", result.message)
      setForm("payment", result)
      // A payment without a QR code is paid on the provider's page.
      if (!result.paymentCode && result.paymentUrl) ctx.system.openExternal(result.paymentUrl)
      poll(result.orderId)
    })

  const qr = createMemo(() => {
    const code = form.payment?.paymentCode

    if (!code) return

    return renderSVG(code, { border: 2, blackColor: "#000", whiteColor: "#fff" })
  })

  const field = "flex flex-col gap-3"

  return (
    <Dialog fit containerClass="max-w-[min(420px,calc(100vw-32px))]">
      <DialogHeader>
        <DialogTitleGroup title={ctx.t("dialog.title")} description={ctx.t("dialog.description")} />
      </DialogHeader>
      <DialogBody class="flex flex-col gap-4 px-4 pb-4">
        <Switch>
          <Match when={(!props.status.signedIn || props.status.sessionExpired) && form.mfaToken}>
            <form
              class={field}
              onSubmit={(event) => {
                event.preventDefault()
                void verify()
              }}
            >
              <TextField
                label={ctx.t("verify.code")}
                description={ctx.t("verify.description")}
                value={form.code}
                autocomplete="one-time-code"
                onChange={(value) => setForm("code", value)}
                error={form.error || undefined}
                validationState={form.error ? "invalid" : "valid"}
              />
              <Button type="submit" variant="contrast" disabled={form.busy || !form.code.trim()}>
                {ctx.t("verify.submit")}
              </Button>
            </form>
          </Match>

          <Match when={!props.status.signedIn || props.status.sessionExpired}>
            <form
              class={field}
              onSubmit={(event) => {
                event.preventDefault()
                void signIn()
              }}
            >
              <Show when={props.status.sessionExpired}>
                <p class="text-13-regular text-v2-text-text-muted">{ctx.t("account.expired")}</p>
              </Show>
              <Show when={props.status.captcha}>
                <p class="text-13-regular text-v2-text-text-muted">{ctx.t("signIn.captcha")}</p>
              </Show>
              <TextField
                label={ctx.t("signIn.email")}
                type="email"
                autocomplete="email"
                value={form.email}
                onChange={(value) => setForm("email", value)}
              />
              <TextField
                label={ctx.t("signIn.password")}
                type="password"
                autocomplete="current-password"
                value={form.password}
                onChange={(value) => setForm("password", value)}
                error={form.error || undefined}
                validationState={form.error ? "invalid" : "valid"}
              />
              <Button type="submit" variant="contrast" disabled={form.busy || !form.email.trim() || !form.password}>
                {ctx.t("signIn.submit")}
              </Button>
              <div class="flex flex-wrap justify-between gap-2">
                <Show when={props.status.registration}>
                  <Button type="button" size="small" variant="ghost" onClick={() => open("/register")}>
                    {ctx.t("signIn.register")}
                  </Button>
                </Show>
                <Button type="button" size="small" variant="ghost-muted" onClick={() => open("/forgot-password")}>
                  {ctx.t("signIn.forgot")}
                </Button>
                <Show when={props.status.signedIn}>
                  <Button
                    type="button"
                    size="small"
                    variant="ghost-muted"
                    disabled={form.busy}
                    onClick={() => void signOut()}
                  >
                    {ctx.t("account.signOut")}
                  </Button>
                </Show>
              </div>
            </form>
          </Match>

          <Match when={form.payment}>
            {(payment) => (
              <div class="flex flex-col items-center gap-3">
                <p class="text-14-medium text-v2-text-text-base">{formatRupiah(payment().amountIdr, locale())}</p>
                <Show when={qr()}>
                  <div
                    class="aspect-square w-full max-w-[260px] rounded-[6px] bg-white p-2 [&>svg]:size-full"
                    role="img"
                    aria-label={ctx.t("topup.qr")}
                    innerHTML={qr()}
                  />
                </Show>
                <p class="text-center text-13-regular text-v2-text-text-muted">{ctx.t("topup.scan")}</p>
                <div class="flex gap-2">
                  <Show when={payment().paymentUrl}>
                    {(url) => (
                      <Button size="small" variant="ghost" onClick={() => ctx.system.openExternal(url())}>
                        {ctx.t("topup.link")}
                      </Button>
                    )}
                  </Show>
                  <Button
                    size="small"
                    variant="ghost-muted"
                    onClick={() => {
                      clearTimeout(timer.id)
                      setForm("payment", undefined)
                    }}
                  >
                    {ctx.t("topup.cancel")}
                  </Button>
                </div>
              </div>
            )}
          </Match>

          <Match when={props.status.signedIn}>
            <div class="flex flex-col gap-1">
              <span class="text-12-regular text-v2-text-text-muted">{props.status.email}</span>
              <span class="text-12-regular text-v2-text-text-muted">{ctx.t("account.balance")}</span>
              <span class="text-20-medium text-v2-text-text-base">{formatBalance(props.status, locale())}</span>
            </div>

            <Show
              when={props.status.topup}
              fallback={<p class="text-13-regular text-v2-text-text-muted">{ctx.t("topup.unavailable")}</p>}
            >
              <form
                class={field}
                onSubmit={(event) => {
                  event.preventDefault()
                  void topup()
                }}
              >
                <span class="text-14-medium text-v2-text-text-base">{ctx.t("topup.title")}</span>
                <div class="flex flex-wrap gap-2">
                  <For each={PRESETS}>
                    {(preset) => (
                      <Button
                        type="button"
                        size="small"
                        variant={amount() === preset ? "contrast" : "outline"}
                        onClick={() => setForm("amount", String(preset))}
                      >
                        {formatRupiah(preset, locale())}
                      </Button>
                    )}
                  </For>
                </div>
                <TextField
                  label={ctx.t("topup.amount")}
                  inputMode="numeric"
                  value={form.amount}
                  onChange={(value) => setForm("amount", value.replace(/\D/g, ""))}
                  description={
                    props.status.minTopupIdr && props.status.maxTopupIdr
                      ? ctx.t("topup.range", {
                          min: formatRupiah(props.status.minTopupIdr, locale()),
                          max: formatRupiah(props.status.maxTopupIdr, locale()),
                        })
                      : undefined
                  }
                  error={form.error || undefined}
                  validationState={form.error ? "invalid" : "valid"}
                />
                <Button type="submit" variant="contrast" disabled={form.busy || !inRange()}>
                  {ctx.t("topup.submit")}
                </Button>
              </form>
            </Show>

            <div class="flex flex-wrap justify-between gap-2">
              <Button size="small" variant="ghost" onClick={() => open("/")}>
                {ctx.t("account.website")}
              </Button>
              <Button size="small" variant="ghost-muted" disabled={form.busy} onClick={() => void signOut()}>
                {ctx.t("account.signOut")}
              </Button>
            </div>
          </Match>
        </Switch>
      </DialogBody>
    </Dialog>
  )
}
