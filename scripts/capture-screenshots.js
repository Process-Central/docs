/**
 * capture-screenshots.js
 *
 * Logs in to Process Central and captures the screenshots used throughout the
 * documentation. Run from the repository root:
 *
 *   npm install
 *   npm run install-browsers   # one-time: installs the Chromium binary
 *   npm run capture
 *
 * Configuration comes from a .env file in the repo root:
 *
 *   APP_URL     Base URL of the application (e.g. https://app.processcentral.com)
 *   PS_EMAIL    Login email for the capture account
 *   PS_PASSWORD Login password for the capture account
 *
 * The capture account should be an owner/admin on a well-populated
 * organisation so that every screen (including admin-only areas) renders with
 * real content. Re-running overwrites the PNGs in images/screenshots so the
 * docs always show the current UI.
 */

const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')

// Load .env (no dependency on dotenv — keep the script self-contained).
loadEnv(path.join(__dirname, '..', '.env'))

// ── Config ───────────────────────────────────────────────────────────────────
const APP_URL = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '')
const EMAIL = process.env.PS_EMAIL
const PASSWORD = process.env.PS_PASSWORD
const IMAGES_DIR = path.join(__dirname, '..', 'images', 'screenshots')
const AUTH_STATE = path.join(__dirname, '..', '.auth', 'state.json')
const VIEWPORT = { width: 1440, height: 900 }
const SETTLE = 1500 // ms for data (Supabase) queries to populate
const HEADLESS = process.env.HEADLESS !== 'false'
const AUTH_MODE = process.argv.includes('--auth') // one-time manual sign-in

// ── Helpers ──────────────────────────────────────────────────────────────────
function loadEnv(file) {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    console.log(`📁 Created ${dir}`)
  }
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(SETTLE)
}

async function shot(page, name, { fullPage = false } = {}) {
  const filePath = path.join(IMAGES_DIR, `${name}.png`)
  await page.screenshot({ path: filePath, fullPage })
  console.log(`  ✓ ${name}.png`)
}

/**
 * Navigate to `route`, let it settle, run optional `prep`, then screenshot.
 * Failures are logged but never abort the whole run — a missing feature-gated
 * screen shouldn't stop the rest of the captures.
 */
async function capture(page, name, route, prep) {
  try {
    console.log(`\n📸 ${name}  (${route})`)
    await page.goto(`${APP_URL}${route}`)
    await settle(page)
    if (prep) await prep(page)
    await shot(page, name)
  } catch (err) {
    console.log(`  ⚠ skipped ${name}: ${err.message}`)
  }
}

async function login(page) {
  console.log('\n🔐 Signing in…')
  await page.goto(`${APP_URL}/login`)
  await settle(page)

  // If a saved session was restored we may already be inside the app.
  if ((await page.$('input[type="email"]')) === null) {
    console.log('  ✓ Already authenticated')
    return
  }

  // No valid session and the login form is showing. The login page is
  // protected by a Cloudflare Turnstile challenge that a headless browser
  // can't pass, so automated form submission will not work. Use the one-time
  // auth flow instead: `npm run capture:auth`.
  throw new Error(
    'Not authenticated and no saved session found.\n' +
      '   Run the one-time sign-in first:  npm run capture:auth\n' +
      '   That opens a real browser so you can pass the Cloudflare check,\n' +
      `   then saves your session to ${path.relative(process.cwd(), AUTH_STATE)}.`
  )
}

/**
 * One-time interactive sign-in. Opens a headed browser, lets you log in
 * manually (solving any Cloudflare Turnstile challenge), then saves the
 * authenticated session so subsequent `npm run capture` runs are automatic.
 */
async function runAuth() {
  ensureDir(path.dirname(AUTH_STATE))
  console.log('\n🔐 One-time sign-in')
  console.log('   A browser window will open. Sign in to Process Central.')
  console.log('   The session is saved automatically once you reach the app.\n')

  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({ viewport: VIEWPORT })
  const page = await context.newPage()
  await page.goto(`${APP_URL}/login`)

  if (EMAIL) await page.fill('input[type="email"]', EMAIL).catch(() => {})
  if (PASSWORD) await page.fill('input[type="password"]', PASSWORD).catch(() => {})

  // Wait (up to 3 minutes) for the user to finish signing in.
  await page.waitForFunction(() => !document.querySelector('input[type="email"]'), { timeout: 180000 })
  await settle(page)

  await context.storageState({ path: AUTH_STATE })
  console.log(`\n✅ Session saved to ${AUTH_STATE}`)
  await browser.close()
}

// Click a Headless UI tab by its visible label and re-settle.
async function clickTab(page, label) {
  const tab = page.getByRole('tab', { name: label }).first()
  if (await tab.count()) {
    await tab.click()
    await page.waitForTimeout(700)
  }
}

// Open the first real SOP in the SOPository and return true if one was found.
async function openFirstSop(page) {
  await page.goto(`${APP_URL}/sops`)
  await settle(page)
  const link = page.locator('a[href^="/sops/"]:not([href="/sops/new"])').first()
  if (await link.count()) {
    await link.click()
    await settle(page)
    return true
  }
  return false
}

// ── Capture plan ─────────────────────────────────────────────────────────────
async function captureSignIn(browser) {
  console.log('\n📸 signin  (/login)')
  const ctx = await browser.newContext({ viewport: VIEWPORT })
  const page = await ctx.newPage()
  try {
    await page.goto(`${APP_URL}/login`)
    await page.waitForSelector('input[type="email"]', { timeout: 10000 })
    await page.waitForTimeout(500)
    await shot(page, 'signin')
  } catch (err) {
    console.log(`  ⚠ skipped signin: ${err.message}`)
  }
  await ctx.close()
}

async function captureUserAreas(page) {
  await capture(page, 'dashboard', '/')
  await capture(page, 'sopository', '/sops')
  await capture(page, 'sop-new', '/sops/new')

  // SOP view (execution) + edit need a real SOP id.
  console.log('\n📸 sop-view / sop-edit  (first SOP)')
  if (await openFirstSop(page)) {
    await shot(page, 'sop-view')
    const url = page.url()
    const id = url.split('/sops/')[1]?.split(/[/?#]/)[0]
    if (id) await capture(page, 'sop-edit', `/sops/${id}/edit`)
  } else {
    console.log('  ⚠ No SOPs found — create one to capture sop-view/sop-edit')
  }

  await capture(page, 'tasks', '/tasks')
  await capture(page, 'tags', '/tags')
  await capture(page, 'templates', '/templates')
  await capture(page, 'reporting', '/reporting')
  await capture(page, 'process-maps', '/process-maps')
  await capture(page, 'agentic-skills', '/agentic/skills')
  await capture(page, 'agentic-tasks', '/agentic/tasks')
  await capture(page, 'changelog', '/changelog')

  // Personal settings (single scrolling page — top shows profile).
  await capture(page, 'settings-profile', '/settings')
  await capture(page, 'settings-preferences', '/settings', async (p) => {
    await p.evaluate(() => window.scrollTo(0, 500))
    await p.waitForTimeout(300)
  })
}

async function captureAdminAreas(page) {
  await capture(page, 'assignments', '/assignments')
  await capture(page, 'audit', '/audit')
  await capture(page, 'prompt-management', '/settings/prompts')

  // Organisation Settings tabs are index-driven (?tab=N).
  await capture(page, 'org-organisation', '/organisation-settings?tab=0')
  await capture(page, 'org-invite-users', '/organisation-settings?tab=1')
  await capture(page, 'org-manage-users', '/organisation-settings?tab=2')
  await capture(page, 'org-import-export', '/organisation-settings?tab=3')
  await capture(page, 'org-subscription', '/organisation-settings?tab=4')
  await capture(page, 'org-ai-llm', '/organisation-settings?tab=5')
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (AUTH_MODE) {
    await runAuth()
    return
  }

  ensureDir(IMAGES_DIR)
  console.log('\n🚀 Process Central screenshot capture')
  console.log(`   App URL : ${APP_URL}`)
  console.log(`   Output  : ${IMAGES_DIR}`)

  const hasState = fs.existsSync(AUTH_STATE)
  if (!hasState) {
    console.log('   Session : none saved — run `npm run capture:auth` first')
  }

  const browser = await chromium.launch({ headless: HEADLESS })
  try {
    await captureSignIn(browser)

    const context = await browser.newContext({
      viewport: VIEWPORT,
      ...(hasState ? { storageState: AUTH_STATE } : {}),
    })
    const page = await context.newPage()
    await login(page)
    await captureUserAreas(page)
    await captureAdminAreas(page)
    await context.close()
  } finally {
    await browser.close()
  }

  const count = fs.existsSync(IMAGES_DIR) ? fs.readdirSync(IMAGES_DIR).length : 0
  console.log(`\n✅ Done. ${count} files in ${IMAGES_DIR}\n`)
}

main().catch((err) => {
  console.error('\n❌ Screenshot capture failed:', err.message)
  process.exit(1)
})
