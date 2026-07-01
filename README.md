# Process Central Documentation

User and administrator documentation for Process Central, built with
[Mintlify](https://mintlify.com) (`docs.json` + MDX) and auto-generated
screenshots captured with Playwright.

## Structure

```
docs.json                 Mintlify config (theme, navigation, branding)
introduction.mdx          Landing page
getting-started/          Signing in, navigation
user-guide/               Day-to-day features (SOPs, tasks, reporting, …)
admin/                    Owner/admin functions (users, billing, audit, …)
images/screenshots/       Auto-generated screenshots (see below)
logo/ , favicon.png       Branding assets referenced by docs.json
scripts/                  Screenshot capture script
```

## Local preview

```bash
npm install
npm run dev          # starts the Mintlify dev server
```

## Updating screenshots

Screenshots are captured directly from the running application, so the docs
always reflect the current UI. Configure `.env` first:

```
APP_URL=https://app.processcentral.co.nz
PS_EMAIL=your-capture-account@example.com
PS_PASSWORD=********
```

Then, one-time setup:

```bash
npm install
npm run install-browsers   # installs Chromium
npm run capture:auth       # opens a real browser to sign in once
```

The login page is protected by a **Cloudflare Turnstile** challenge that a
headless browser can't pass. `capture:auth` opens a visible browser (pre-filled
from `.env`) so you can complete sign-in and any challenge yourself. Your
authenticated session is saved to `.auth/state.json` (git-ignored).

After that, capturing is fully automatic and reuses the saved session:

```bash
npm run capture            # refreshes images/screenshots/*.png
```

Use an **owner/admin** account on a well-populated organisation so every
screen — including admin-only areas — renders with real content. Re-running
overwrites the PNGs in place. If the session expires, just run
`npm run capture:auth` again.

## Deploying to Cloudflare Pages

1. Push this repository to your Git provider.
2. In Cloudflare Pages, create a project from the repo.
3. Build command: `npx mintlify build` (or per Mintlify's current guidance);
   output directory as required by Mintlify.
4. Deploy.

> Screenshots are committed to the repo, so a deploy shows the last captured
> UI. Re-run `npm run capture` and commit before deploying to refresh them.
