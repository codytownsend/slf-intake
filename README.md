# Simple Little Flowers — Event Inquiry Form

A standalone, mobile-first inquiry form for weddings & events, styled to match the
main site. Deploys to **Cloudflare Pages**; submissions are emailed to
`hello@simplelittleflowers.com` via **Resend** using a Pages Function.

```
intake-form/
├── index.html            # the form (5 steps, progressive reveal)
├── styles.css            # styling (imports tokens.css)
├── tokens.css            # design tokens, mirrored from the main theme
├── form.js               # step nav, conditional logic, validation, submit
├── functions/
│   └── api/
│       └── submit.js     # Cloudflare Pages Function → POST /api/submit
└── README.md
```

## What it collects

Five steps with a progress bar: **Contact → Event basics → Venue & service →
Flowers & style → Budget & details.** Conditional fields (event-type "other",
alternate dates, planner contact, per-item quantities) reveal only when relevant.
Required set is deliberately small — name, email, event type, date, guest count,
location, venue status, delivery, service level, at least one item, substitution
tolerance, budget, and the inquiry acknowledgement.

The form is **flowers-supply-only** — it does not include the "host at the farm"
branch. If that changes, the spec's Branch B fields can be added back.

## Deploy (Cloudflare Pages)

1. **Push this folder to a Git repo** (GitHub/GitLab) or use `wrangler`.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages →** connect the repo.
3. Build settings:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/` (the folder that contains `index.html`)

   Cloudflare automatically compiles the `functions/` directory into routes, so
   `functions/api/submit.js` is served at `/api/submit`. Do **not** put `functions/`
   inside the output directory.

4. Add environment variables under **Settings → Environment variables** (Production
   *and* Preview):

   | Variable | Required | Value |
   |---|---|---|
   | `RESEND_API_KEY` | yes | Your key from resend.com |
   | `FROM_EMAIL` | yes | A verified sender on your domain, e.g. `inquiries@simplelittleflowers.com` |
   | `TO_EMAIL` | no | Where inquiries land (default `hello@simplelittleflowers.com`) |
   | `FARM_NAME` | no | Display name (default `Simple Little Flowers`) |

5. Redeploy so the variables take effect.

### Resend setup (one-time)

1. Create an account at [resend.com](https://resend.com).
2. **Add & verify your domain** `simplelittleflowers.com` (add the DNS records they
   give you). Email will not send from an unverified domain.
3. Create an API key → put it in `RESEND_API_KEY`.
4. Set `FROM_EMAIL` to an address on that verified domain. It does **not** need to be
   a real inbox — replies go to the inquirer / the farm via `reply_to`.

### Local preview

```bash
npx wrangler pages dev .
```

This serves the static files and runs the Function locally. Set the env vars in a
`.dev.vars` file (git-ignored):

```
RESEND_API_KEY=...
FROM_EMAIL=inquiries@simplelittleflowers.com
```

## Emails sent per submission

1. **To the farm** — the full submission as a formatted table. The subject line
   leads with the four decision-critical fields: **date · budget · service level ·
   location**. A flag box appears at the top when a submission trips any of:
   lowest-budget + full-service, "no substitutions", date not locked in, or venue not
   booked. Reply-to is the inquirer, so hitting reply just works.
2. **To the inquirer** — an auto-reply confirming receipt, restating the 3–5 business
   day window, and linking to Instagram.

## Things to edit before going live

- **Starting minimum** — `index.html`, the "Where we start" note still says
  `$X,XXX`. Put the real number in, or delete the note.
- **Instagram / gallery links** — placeholder `https://instagram.com/` appears in the
  success screen (`index.html`), the auto-reply (`functions/api/submit.js`), and the
  "Back to the farm" link. Point them at the real URLs.
- **Seasonality guide** — the bloom list in the collapsible note is a reasonable NW
  Arkansas starting point; adjust to your actual fields.
- **Delivery radius** — the copy says "throughout Northwest Arkansas." Tighten if you
  have a specific mile radius.

## Not included (by design)

- **File uploads.** At the inquiry stage these need extra storage (R2) and complicate
  delivery; the form keeps an inspiration *links* field instead. Add later if wanted.
- **Spreadsheet/CRM storage.** The spec recommends every submission also land in a
  sheet. Easiest add-on: also POST the payload to a Google Sheet (Apps Script webhook)
  or Airtable from inside `submit.js`. Wire it in alongside the Resend calls.
