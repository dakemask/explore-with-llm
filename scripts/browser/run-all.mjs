// Runs browser suites side by side (each in its own Chrome, so their IndexedDBs don't meet) and prints a
// summary. Copy this folder into the session scratchpad (where playwright-core is installed) and run
// `node run-all.mjs [suite …]` there (names without `-suite.mjs`; all by default), with `pnpm dev` on 5173.
// Starts the mock on 8788 (DELAY=20, as the scroll suite needs) unless one is already listening there, and
// stops it again. Set PROJECT to the project folder if it isn't D:/download/project/explore-with-llm-ver2.
import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { connect } from 'node:net'

const project = process.env.PROJECT ?? 'D:/download/project/explore-with-llm-ver2'
const all = readdirSync('.').filter((f) => f.endsWith('-suite.mjs')).map((f) => f.replace('-suite.mjs', ''))
const suites = process.argv.length > 2 ? process.argv.slice(2) : all

const listening = (port) =>
  new Promise((res) => {
    const s = connect(port, 'localhost', () => (s.end(), res(true)))
    s.on('error', () => res(false))
  })
let mock = null
if (!(await listening(8788))) {
  mock = spawn('node', [`${project}/scripts/mock/server.mjs`], { env: { ...process.env, PORT: '8788', DELAY: '20' }, stdio: 'ignore' })
  for (let i = 0; i < 50 && !(await listening(8788)); i++) await new Promise((r) => setTimeout(r, 100))
}

const started = Date.now()
const results = await Promise.all(
  suites.map(
    (name) =>
      new Promise((res) => {
        const t = Date.now()
        let out = ''
        const p = spawn('node', [`${name}-suite.mjs`])
        p.stdout.on('data', (d) => (out += d))
        p.stderr.on('data', (d) => (out += d))
        p.on('close', (code) => res({ name, code, out, secs: Math.round((Date.now() - t) / 1000) }))
      }),
  ),
)
mock?.kill()

let failed = 0
for (const r of results) {
  const ok = r.code === 0 && /ALL PASS/.test(r.out)
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${r.name} (${r.secs}s)`)
  // Failing checks, errors from the page, crashes.
  for (const line of r.out.split('\n')) if (!ok && line && !line.startsWith('PASS')) console.log('    ' + line)
}
console.log(`${failed ? `${failed} suite(s) FAILED` : 'ALL SUITES PASS'} in ${Math.round((Date.now() - started) / 1000)}s`)
process.exit(failed ? 1 : 0)
