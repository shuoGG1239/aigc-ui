import './find-bar.css'

const bar = document.querySelector('.find-bar') as HTMLElement
const input = document.getElementById('q') as HTMLInputElement
const statusEl = document.getElementById('status') as HTMLSpanElement
const prevBtn = document.getElementById('prev') as HTMLButtonElement
const nextBtn = document.getElementById('next') as HTMLButtonElement
const closeBtn = document.getElementById('close') as HTMLButtonElement

let activeQuery = ''
let debounceTimer: ReturnType<typeof setTimeout> | undefined
let findGen = 0
let composing = false

function setStatus(active: number, matches: number): void {
  const q = input.value.trim()
  if (!q) {
    statusEl.hidden = true
    statusEl.textContent = ''
    return
  }
  statusEl.hidden = false
  statusEl.textContent = matches <= 0 ? '0/0' : `${active}/${matches}`
}

function setNavEnabled(on: boolean): void {
  prevBtn.disabled = !on
  nextBtn.disabled = !on
}

/**
 * Electron findNext: true = new session; false = follow-up (next/prev).
 */
async function runFind(opts: { navigate?: boolean; forward?: boolean }): Promise<void> {
  if (composing && !opts.navigate) return

  const q = input.value
  const gen = ++findGen
  const searched = q

  if (!q) {
    activeQuery = ''
    setStatus(0, 0)
    setNavEnabled(false)
    await window.api.find.stop()
    return
  }

  setNavEnabled(true)
  const forward = opts.forward !== false
  const followUp = opts.navigate === true && searched === activeQuery
  activeQuery = searched

  await window.api.find.start(searched, {
    findNext: !followUp,
    forward,
    matchCase: false,
  })

  if (gen !== findGen || input.value !== searched) return
}

function scheduleFind(): void {
  if (composing) return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    void runFind({ navigate: false, forward: true })
  }, 80)
}

function closeBar(): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  bar.classList.remove('is-open')
  void window.api.find.close()
}

function activate(): void {
  // Force reflow so re-open always plays enter transition.
  bar.classList.remove('is-open')
  void bar.offsetWidth
  bar.classList.add('is-open')
  input.focus()
  input.select()
  if (input.value.trim() && !composing) {
    void runFind({ navigate: false, forward: true })
  }
}

function deactivate(): void {
  bar.classList.remove('is-open')
}

input.addEventListener('compositionstart', () => {
  composing = true
  if (debounceTimer) clearTimeout(debounceTimer)
})

input.addEventListener('compositionend', () => {
  composing = false
  scheduleFind()
})

input.addEventListener('input', () => {
  if (composing) return
  scheduleFind()
})

input.addEventListener('keydown', (e) => {
  if (e.isComposing || composing) return
  if (e.key === 'Enter') {
    e.preventDefault()
    void runFind({ navigate: true, forward: !e.shiftKey })
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    closeBar()
  }
})

prevBtn.addEventListener('click', () => {
  void runFind({ navigate: true, forward: false })
})
nextBtn.addEventListener('click', () => {
  void runFind({ navigate: true, forward: true })
})
closeBtn.addEventListener('click', () => closeBar())

window.api.find.onFound((result) => {
  if (!result.finalUpdate) return
  const active = result.matches > 0 ? result.activeMatchOrdinal : 0
  setStatus(active, result.matches)
})

window.api.find.onActivate(() => {
  activate()
})

window.api.find.onDeactivate(() => {
  deactivate()
})

window.api.find.onTheme((mode) => {
  document.documentElement.dataset.theme = mode
})

window.addEventListener('keydown', (e) => {
  if (e.isComposing || composing) return
  const mod = e.ctrlKey || e.metaKey
  if (e.key === 'F3' || (mod && e.key.toLowerCase() === 'g')) {
    e.preventDefault()
    void runFind({ navigate: true, forward: !e.shiftKey })
  }
})

setNavEnabled(false)
