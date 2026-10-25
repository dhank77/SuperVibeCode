// The repository whose GitHub releases hold the installers. Change it here if releases move.
const REPO = "latjoromhi25d-dotcom/SuperVibeCode"

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

// Links: every GitHub link and download button points at REPO.
document.querySelectorAll("[data-repo-link]").forEach((link) => {
  link.href = `https://github.com/${REPO}${link.dataset.path ?? ""}`
})

document.querySelectorAll("[data-file]").forEach((link) => {
  link.href = `https://github.com/${REPO}/releases/latest/download/${link.dataset.file}`
})

// The hero's Download button goes straight to this computer's installer when the platform is clear.
const os = (() => {
  const platform = (navigator.userAgentData?.platform ?? navigator.platform ?? "").toLowerCase()
  const agent = navigator.userAgent.toLowerCase()

  if (/iphone|ipad|android/.test(agent)) return undefined
  if (platform.includes("mac") || agent.includes("mac os")) return "mac"
  if (platform.includes("win") || agent.includes("windows")) return "windows"
  if (platform.includes("linux") || agent.includes("linux")) return "linux"

  return undefined
})()

const labels = { mac: "Download for macOS", windows: "Download for Windows", linux: "Download for Linux" }
const primary = document.getElementById("download-primary")

if (os) {
  document.querySelector(`.platform[data-os="${os}"]`)?.setAttribute("data-current", "")
  primary.textContent = labels[os]

  // macOS cannot tell Apple silicon from Intel in a browser, so Mac users pick on the download section.
  if (os !== "mac") primary.href = document.querySelector(`.platform[data-os="${os}"] [data-file]`).href
}

// Screenshots: three real screens of the app behind a tab list.
const shots = {
  preview: {
    src: "assets/screenshot-preview.webp",
    alt: "A coffee shop site running in the preview beside the conversation",
    caption: "The app the agent built runs beside the conversation, at its real address.",
  },
  code: {
    src: "assets/screenshot-code.webp",
    alt: "The Code tab showing the project's files and a source file beside the conversation",
    caption: "Read every file the agent wrote, and leave line comments for it to act on.",
  },
  mobile: {
    src: "assets/screenshot-mobile.webp",
    alt: "The preview showing the site at a phone's width",
    caption: "Switch the preview to a phone's width to check the responsive layout.",
  },
}

const tabs = Array.from(document.querySelectorAll("[data-shot]"))
const shotImage = document.getElementById("shot-image")
const shotCaption = document.getElementById("shot-caption")
const shotPanel = document.getElementById("shot")

const selectShot = (tab) => {
  const shot = shots[tab.dataset.shot]

  tabs.forEach((item) => {
    item.setAttribute("aria-selected", String(item === tab))
    item.tabIndex = item === tab ? 0 : -1
  })
  shotImage.src = shot.src
  shotImage.alt = shot.alt
  shotCaption.textContent = shot.caption
  shotPanel.setAttribute("aria-labelledby", tab.id)
}

tabs.forEach((tab, index) => {
  tab.tabIndex = index === 0 ? 0 : -1
  tab.addEventListener("click", () => selectShot(tab))
  tab.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return
    const next = tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]

    next.focus()
    selectShot(next)
  })
})

// The demo: a prompt types itself, the agent works through its steps, and the app appears from behind its pixels.
const scenes = {
  coffee: {
    project: "kopi-senja",
    prompt: "Make a landing page for Kopi Senja, a coffee shop in Makassar, with the menu and prices.",
    url: "http://localhost:5173",
    steps: [
      ["", "Planning the page: hero, menu, opening hours"],
      ["", "Writing <b>src/App.tsx</b> and <b>src/index.css</b>"],
      ["done", "<b>npm install</b> finished"],
      ["run", "<b>npm run dev</b> is ready on localhost:5173"],
      ["git", "Committed <b>Make a landing page for Kopi Senja</b>"],
    ],
    site: `<div class="site site-coffee">
      <header>Kopi Senja <span>Menu&nbsp;&nbsp;Visit</span></header>
      <h4>Coffee roasted every morning in Makassar.</h4>
      <p>Beans from Toraja and Gayo, brewed slowly. Open daily from 7 until late.</p>
      <span class="pill">See the menu</span>
      <ul>
        <li><b>Espresso</b>Rp 18.000</li>
        <li><b>Kopi susu aren</b>Rp 22.000</li>
        <li><b>Toraja pour over</b>Rp 28.000</li>
      </ul>
    </div>`,
  },
  portfolio: {
    project: "rina-photo",
    prompt: "Build a dark portfolio for Rina, a wedding photographer, with a photo grid.",
    url: "http://localhost:3000",
    steps: [
      ["", "Choosing a dark, quiet layout so the photos lead"],
      ["", "Writing <b>app/page.tsx</b> and a gallery component"],
      ["done", "<b>npm install</b> finished"],
      ["run", "<b>npm run dev</b> is ready on localhost:3000"],
      ["git", "Committed <b>Build a dark portfolio for Rina</b>"],
    ],
    site: `<div class="site site-portfolio">
      <header>Rina Paramitha, wedding photography</header>
      <h4>Quiet moments, kept for a lifetime.</h4>
      <div class="grid"><i></i><i></i><i></i><i></i><i></i></div>
    </div>`,
  },
  tasks: {
    project: "daily-tasks",
    prompt: "Create a simple task app where I can add tasks and tick them off.",
    url: "http://localhost:5174",
    steps: [
      ["", "Planning the list, the add form and saved state"],
      ["", "Writing <b>src/App.vue</b> with local storage"],
      ["done", "<b>npm install</b> finished"],
      ["run", "<b>npm run dev</b> is ready on localhost:5174"],
      ["git", "Committed <b>Create a simple task app</b>"],
    ],
    site: `<div class="site site-tasks">
      <h4>Today</h4>
      <div class="add"><span>Add a task</span><b>Add</b></div>
      <ul>
        <li class="done">Buy coffee beans</li>
        <li class="done">Reply to Andi</li>
        <li>Send the invoice</li>
        <li>Plan the weekend trip</li>
      </ul>
    </div>`,
  },
}

const promptEl = document.getElementById("demo-prompt")
const logEl = document.getElementById("demo-log")
const titleEl = document.getElementById("demo-title")
const statusEl = document.getElementById("demo-status")
const urlEl = document.getElementById("demo-url")
const screenEl = document.getElementById("demo-screen")
const pixelsEl = document.getElementById("demo-pixels")
const choices = Array.from(document.querySelectorAll("[data-scene]"))

let run = 0

const wait = (ms, id) =>
  new Promise((resolve, reject) => setTimeout(() => (id === run ? resolve() : reject(new Error("replaced"))), ms))

const setStatus = (text, state) => {
  statusEl.textContent = text
  statusEl.dataset.state = state
}

const coverScreen = () => {
  const columns = 24
  const rows = Math.ceil((screenEl.clientHeight / screenEl.clientWidth) * columns) || 18

  pixelsEl.style.setProperty("--cols", String(columns))
  pixelsEl.replaceChildren(...Array.from({ length: columns * rows }, () => document.createElement("span")))
}

const reveal = async (id) => {
  const cells = Array.from(pixelsEl.children)

  if (reduceMotion) return cells.forEach((cell) => cell.classList.add("gone"))

  // A scatter that sweeps left to right, so the page seems to come in rather than flicker.
  const columns = 24
  const order = cells
    .map((cell, index) => ({ cell, at: (index % columns) / columns + Math.random() * 0.5 }))
    .sort((a, b) => a.at - b.at)
  const batch = Math.ceil(order.length / 18)

  for (let start = 0; start < order.length; start += batch) {
    order.slice(start, start + batch).forEach((item) => item.cell.classList.add("gone"))
    await wait(45, id)
  }
}

const play = async (name) => {
  const id = ++run
  const scene = scenes[name]

  choices.forEach((choice) => choice.setAttribute("aria-pressed", String(choice.dataset.scene === name)))
  titleEl.textContent = scene.project
  urlEl.textContent = "about:blank"
  logEl.replaceChildren()
  promptEl.textContent = ""
  screenEl.querySelector(".site")?.remove()
  pixelsEl.replaceChildren()
  setStatus("Idle", "")

  try {
    if (reduceMotion) promptEl.textContent = scene.prompt

    if (!reduceMotion)
      for (const character of scene.prompt) {
        promptEl.textContent += character
        await wait(character === " " ? 30 : 22, id)
      }

    await wait(350, id)
    setStatus("Working", "working")

    for (const [kind, html] of scene.steps) {
      const item = document.createElement("li")

      item.dataset.kind = kind
      item.innerHTML = html
      logEl.append(item)

      if (kind === "run") {
        // Covered in the same task it is added, so the page never shows before its pixels fall away.
        screenEl.insertAdjacentHTML("afterbegin", scene.site)
        coverScreen()
        urlEl.textContent = scene.url
        setStatus("Running", "running")
        await reveal(id)
      }

      await wait(reduceMotion ? 0 : 650, id)
    }
  } catch {
    // Another prompt was picked; that run takes over.
  }
}

choices.forEach((choice) => choice.addEventListener("click", () => play(choice.dataset.scene)))

// Play once the demo is on screen, so visitors who scroll straight past do not miss it.
new IntersectionObserver(
  (entries, observer) => {
    if (!entries.some((entry) => entry.isIntersecting)) return
    observer.disconnect()
    play("coffee")
  },
  { threshold: 0.15 },
).observe(document.querySelector(".demo"))
