/**
 * Offline check for this package's browser half, `client.js`.
 *
 * The browser half is plain JavaScript outside the TypeScript build, and the
 * Host caches its "is this a client package?" verdict per package until restart,
 * so neither the compiler nor a live page covers it. This script runs the real
 * artifact instead: it loads `client.js` the way the browser module table does,
 * drives `apply` through fake `locale`, `slots`, and `configForms` services, and
 * renders the contributed component with real React for both views the Plugins
 * page asks for. The Plugins page declares `plugins.row.config` only when it
 * mounts, so the fake slot service defers injections and the check fires the
 * declaration by hand — which is what catches a registration that would throw
 * `slot "plugins.row.config" is not declared` in the browser.
 *
 * Usage: node tools/client-check.mjs [path/to/client.js]
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const target = process.argv[2] ?? new URL('../client.js', import.meta.url).pathname
const PACKAGE = '@deepseek-ai/dsh-web-search-camofox'
const ROW_KEY = `${PACKAGE}#web-search-camofox`

const failures = []
/** @param ok - whether the check holds. @param what - what was asserted. @param detail - observed value on failure. */
function check(ok, what, detail) {
  if (ok) {
    console.log(`  ok   ${what}`)
    return
  }
  failures.push(what)
  console.log(`  FAIL ${what}${detail === undefined ? '' : ` — ${String(detail)}`}`)
}

// 1. Load the artifact exactly as the browser module table does.
let registered
globalThis.window = { __ModuleLoader__: { load: (module) => { registered = module } } }
new Function('window', readFileSync(target, 'utf8'))(globalThis.window)
check(registered !== undefined, 'client.js registers itself with the module loader')
check(registered?.id === PACKAGE, 'module id equals the package name', registered?.id)

const client = registered.factory((id) => {
  if (id === 'react') return React
  throw new Error(`unexpected require: ${id}`)
})
check(Array.isArray(client?.inject) && client.inject.includes('configForms'), 'apply declares the configForms service', client?.inject)

// 2. Drive apply through fake services.
const locales = []
const registrations = []
const injected = []
const pending = []
const subscriptions = []
const disposers = []
const served = new Set(['web-search-camofox'])
const writes = []
const formState = {
  status: 'ready', writable: true, mode: 'host', revision: 3,
  value: { engine: 'searx-ingres', baseURL: 'http://localhost:9377', retries: 2 },
  user: { engine: 'searx-ingres' },
}
const form = {
  getSnapshot: () => formState,
  subscribe: (listener) => { form.listener = listener; return () => { form.listener = undefined } },
  set: async (field, value) => { writes.push(['set', field, value]); return true },
  unset: async (field) => { writes.push(['unset', field]); return true },
}
const ctx = {
  effect: (run) => { const off = run(); if (typeof off === 'function') disposers.push(off) },
  locale: {
    bind: (ns) => (key) => `[${ns}:${key}]`,
    register: (ns, dictionaries) => { locales.push({ ns, dictionaries }); return () => {} },
  },
  configForms: {
    get: (ns) => { form.namespace = ns; return form },
    whileServed: (namespaces, register) => register(new Set(namespaces.filter(ns => served.has(ns)))),
  },
  slots: {
    // The Plugins page declares this slot when it mounts, so injection defers.
    inject: (name, build) => { injected.push(name); pending.push(build); return () => {} },
    subscribe: (name, listener) => { subscriptions.push({ name, listener }); return () => {} },
    register: (options, component) => { registrations.push({ options, component }); return () => {} },
  },
}
client.apply(ctx)

check(registrations.length === 0, 'nothing is registered while the slot is still undeclared', registrations.length)
check(subscriptions[0]?.name === 'plugins.row.config', 'the card watches the slot it needs', subscriptions[0]?.name)
/** Simulate the Plugins page mounting: slot listeners fire and deferred injections reconcile. */
function declareSlot() {
  for (const sub of subscriptions) sub.listener()
  for (const build of pending.splice(0, pending.length)) build()
}
declareSlot()
check(registrations.length === 1, 'the slot declaration contributes one registration', registrations.length)
declareSlot()
check(registrations.length === 1, 'a later declaration never registers the key twice', registrations.length)

const registration = registrations[0]
check(registration !== undefined, 'one slot registration is contributed')
check(registration?.options.name === 'plugins.row.config', 'it targets plugins.row.config', registration?.options.name)
check(registration?.options.key === ROW_KEY, 'keyed by <package name>#<row id>', registration?.options.key)
check(registration?.options.locale === 'settings.webSearchCamofox', 'it binds its own locale namespace', registration?.options.locale)
check(locales[0]?.ns === 'settings.webSearchCamofox', 'the dictionary is registered under that namespace', locales[0]?.ns)
for (const language of ['en', 'zh']) {
  const dictionary = locales[0]?.dictionaries?.[language] ?? {}
  check(Object.keys(dictionary).length > 30, `${language} dictionary is complete`, Object.keys(dictionary).length)
}
check(form.namespace === 'web-search-camofox', 'the form is read from the host plugin namespace', form.namespace)

// 3. Render both views the Plugins page asks for.
const face = registration.options.inject()
const t = ctx.locale.bind(registration.options.locale)
/** @param view - the view the page asks for. @returns the rendered markup. */
function render(view) {
  return renderToStaticMarkup(React.createElement(registration.component, {
    view,
    t,
    useCamofoxCard: (selector) => selector(face.hooks.camofoxCard.getSnapshot()),
    set: face.set,
    reset: face.reset,
  }))
}

const page = render('page')
check(page.includes('<select'), 'the page renders a control set with a select', page.slice(0, 80))
check(page.includes('value="searx-ingres"'), 'the engine select carries the live value')
check(page.includes('optgroup'), 'engines are grouped')
check((page.match(/<option/g) ?? []).length === 18, 'all 18 engines are offered', (page.match(/<option/g) ?? []).length)
check(page.includes('>duckduckgo<') && page.includes('>yandex<'), 'the direct engines are offered')
check(page.includes('overridden'), 'an overridden field is marked')
check(page.includes('http://localhost:9377'), 'the camofox endpoint is shown')
check(page.includes('@deepseek-ai') === false, 'no implementation detail leaks into the page')
const summary = render('summary')
check(summary.includes('searx-ingres') && summary.includes('9377'), 'the summary one-liner names engine and endpoint', summary)

const direct = renderToStaticMarkup(React.createElement(registration.component, {
  view: 'page', t,
  useCamofoxCard: (selector) => selector({ status: 'ready', writable: true, value: { engine: 'yandex' }, user: { engine: 'yandex' }, pending: null, notice: null }),
  set: () => {}, reset: () => {},
}))
check(direct.includes('value="yandex"'), 'a direct engine carries its own selection')
check(direct.includes('yandex.com/search'), 'the page names the result page a direct engine opens', direct.slice(0, 200))
check(direct.includes('directNote'), 'a direct engine explains the bot-wall risk')

// 4. Writes reach the form; an empty text clears the field instead.
face.set('engine', 'google')
face.reset('baseURL')
await new Promise(resolve => setTimeout(resolve, 0))
check(JSON.stringify(writes) === JSON.stringify([['set', 'engine', 'google'], ['unset', 'baseURL']]), 'actions write through the settings form', JSON.stringify(writes))
check(face.hooks.camofoxCard.getSnapshot().notice?.kind === 'ok', 'the page reports a accepted write', JSON.stringify(face.hooks.camofoxCard.getSnapshot().notice))

// 5. A lost namespace and a read-only document degrade instead of crashing.
const readOnly = renderToStaticMarkup(React.createElement(registration.component, {
  view: 'page', t,
  useCamofoxCard: (selector) => selector({ status: 'ready', writable: false, value: {}, user: {}, pending: null, notice: null }),
  set: () => {}, reset: () => {},
}))
check(readOnly.includes('readOnly'), 'a read-only document says so', readOnly.slice(0, 120))
const gone = renderToStaticMarkup(React.createElement(registration.component, {
  view: 'page', t,
  useCamofoxCard: (selector) => selector({ status: 'unavailable', writable: false, value: {}, user: {}, pending: null, notice: null }),
  set: () => {}, reset: () => {},
}))
check(gone.includes('unavailable'), 'a namespace the Host stops serving degrades to one line')

for (const off of disposers) off()
check(form.listener === undefined, 'the form subscription is released on dispose', form.listener)

console.log(failures.length === 0 ? '\nall checks passed' : `\n${failures.length} check(s) failed`)
process.exit(failures.length === 0 ? 0 : 1)