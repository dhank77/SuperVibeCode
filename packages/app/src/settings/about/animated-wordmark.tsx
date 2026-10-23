import { createEffect, For, on, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"

const target = ["S", "u", "p", "e", "r", "V", "i", "b", "e", "C", "o", "d", "e"] as const

// Where each letter starts. The narrow "i" never changes, so the scrambled letters keep their slots.
const offsets = [0, 30, 60, 90, 120, 150, 180, 192, 222, 252, 282, 312, 342]

const choices = ["C", "S", "V", "b", "d", "e", "o", "p", "r", "u"] as const

export function AnimatedWordmark(props: { active: boolean }) {
  const [state, setState] = createStore({ letters: [...target] })
  const timers = new Set<ReturnType<typeof setTimeout>>()

  createEffect(
    on(
      () => props.active,
      (active) => {
        timers.forEach(clearTimeout)
        timers.clear()

        if (!active || matchMedia("(prefers-reduced-motion: reduce)").matches) {
          setState("letters", [...target])

          return
        }

        const starts = target.map((letter) =>
          letter === "i" ? letter : choices[Math.floor(Math.random() * choices.length)],
        )
        const settles = target.map((letter) => (letter === "i" ? 0 : 6 + Math.floor(Math.random() * 8)))
        const last = Math.max(...settles)
        setState("letters", starts)

        Array.from({ length: last }, (_, index) => index + 1).forEach((tick) => {
          const timer = setTimeout(() => {
            setState(
              "letters",
              target.map((letter, index) =>
                tick >= settles[index] ? letter : choices[Math.floor(Math.random() * choices.length)],
              ),
            )
            timers.delete(timer)
          }, tick * 75)

          timers.add(timer)
        })
      },
    ),
  )

  onCleanup(() => timers.forEach(clearTimeout))

  return (
    <svg class="settings-about-wordmark" viewBox="0 0 366 42" aria-hidden="true">
      <defs>
        <symbol id="settings-about-letter-C" viewBox="0 0 24 42">
          <path class="settings-about-letter-shadow" d="M6 30L6 18L24 18L24 30Z" />
          <path d="M6 6L6 30L24 30L24 36L0 36L0 0L24 0L24 6Z" />
        </symbol>
        <symbol id="settings-about-letter-S" viewBox="0 0 24 42">
          <path class="settings-about-letter-shadow" d="M18 30L0 30L0 18L18 18Z" />
          <path d="M6 6L6 12L24 12L24 36L0 36L0 30L18 30L18 18L0 18L0 0L24 0L24 6Z" />
        </symbol>
        <symbol id="settings-about-letter-V" viewBox="0 0 24 42">
          <path class="settings-about-letter-shadow" d="M18 18L18 30L6 30L6 18Z" />
          <path d="M6 30L0 30L0 0L6 0ZM6 30L18 30L18 0L24 0L24 30L18 30L18 36L6 36Z" />
        </symbol>
        <symbol id="settings-about-letter-b" viewBox="0 0 24 42">
          <path class="settings-about-letter-shadow" d="M18 18L18 30L6 30L6 18Z" />
          <path d="M0 0L6 0L6 6L24 6L24 36L0 36ZM6 30L18 30L18 12L6 12Z" />
        </symbol>
        <symbol id="settings-about-letter-d" viewBox="0 0 24 42">
          <path class="settings-about-letter-shadow" d="M18 18L18 30L6 30L6 18Z" />
          <path d="M0 6L18 6L18 0L24 0L24 36L0 36ZM6 30L18 30L18 12L6 12Z" />
        </symbol>
        <symbol id="settings-about-letter-e" viewBox="0 0 24 42">
          <path class="settings-about-letter-shadow" d="M24 24L24 30L6 30L6 24Z" />
          <path d="M0 6L24 6L24 24L6 24L6 30L24 30L24 36L0 36ZM18 12L6 12L6 18L18 18Z" />
        </symbol>
        <symbol id="settings-about-letter-i" viewBox="0 0 6 42">
          <path d="M6 36L0 36L0 12L6 12ZM0 0L6 0L6 6L0 6Z" />
        </symbol>
        <symbol id="settings-about-letter-o" viewBox="0 0 24 42">
          <path class="settings-about-letter-shadow" d="M18 18L18 30L6 30L6 18Z" />
          <path d="M0 6L24 6L24 36L0 36ZM6 30L18 30L18 12L6 12Z" />
        </symbol>
        <symbol id="settings-about-letter-p" viewBox="0 0 24 42">
          <path class="settings-about-letter-shadow" d="M18 18L18 30L6 30L6 18Z" />
          <path d="M0 6L24 6L24 36L6 36L6 42L0 42ZM6 30L18 30L18 12L6 12Z" />
        </symbol>
        <symbol id="settings-about-letter-r" viewBox="0 0 24 42">
          <path d="M0 6L24 6L24 18L18 18L18 12L6 12L6 36L0 36Z" />
        </symbol>
        <symbol id="settings-about-letter-u" viewBox="0 0 24 42">
          <path class="settings-about-letter-shadow" d="M18 18L18 30L6 30L6 18Z" />
          <path d="M0 6L6 6L6 30L18 30L18 6L24 6L24 36L0 36Z" />
        </symbol>
      </defs>
      <For each={state.letters}>
        {(letter, index) => (
          <use
            href={`#settings-about-letter-${letter}`}
            x={offsets[index()]}
            width={letter === "i" ? 6 : 24}
            height="42"
          />
        )}
      </For>
    </svg>
  )
}
