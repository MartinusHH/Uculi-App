# Uculi

Date: 27 April 2026

Uculi is a single-file recipe app centered around `index.html`, with a local-first free tier and Premium-gated advanced features.

## Repo Status

Current state:

- The free local-first experience is working.
- Premium gates for notebook mode, sharing, PDF export, backup download, cloud sync, publishing, families, custom notebook covers, and sticky notes are in place.
- The public landing, Cook Mode flow, privacy and terms surfaces, and local diagnostics are already in the app.
- Real billing, entitlement restore, and final subscription persistence are still open.

Current working priority:

- UX and UI consistency.
- Stabilizing interactions and incomplete flows.
- Responsive quality and overall feel of the app.
- Billing only after the app feels coherent and dependable.

## Canonical Docs

These are the only planning and setup docs that should stay current:

- `docs/STRICT_LAUNCH_BACKLOG.md` - active launch backlog and execution order.
- `docs/FINAL_BILLING_AI_EXECUTION_PLAN.md` - focused billing implementation plan.
- `docs/PHASE_2_SETUP.md` - Firebase setup for auth, sync, and publishing.

If a note overlaps with one of these files, merge it into the relevant canonical doc instead of creating another parallel plan.

## Product Boundary

### Free

- Up to 3 local recipes on the current device.
- Local editing, search, filtering, notes, timers, favorites, ratings, and onboarding.
- No premium downloads, no cloud sync, and no premium collaboration features.

### Premium

- Notebook mode.
- Recipe sharing.
- PDF export.
- Backup download.
- Cloud sync and publishing.
- Families.
- Custom notebook covers and sticky notes.

### Premium + Firebase

- Google sign-in.
- Firestore-backed sync.
- Publishing to the community feed.
- Cross-device cloud state.

## Quick Start

1. Open `index.html` in a modern browser or VS Code Live Preview.
2. Use the landing page to log in or enter the app directly.
3. Use the app locally right away, and switch into Cook Mode when you want the calmer cooking view.
4. When you want cloud features, follow `docs/PHASE_2_SETUP.md`.
5. When you are ready to replace Premium preview with real billing, follow `docs/FINAL_BILLING_AI_EXECUTION_PLAN.md`.

## Safe Hosting Flow

- Use `index.html` as the marketing landing page and `app.html` as the authenticated app shell.
- Copy `firebase-config.example.js` to `firebase-config.js` before local testing or deploy.
- Firebase Hosting deploys from repo root with an explicit ignore list in `firebase.json`.
- Security headers and a restrictive Content Security Policy are set at the hosting layer before launch.
- Keep `.firebaserc` and `firebase-config.js` local so the public repo does not carry live project bindings.
- Treat `.noop/` as disposable local runtime scratch, not as product source.

For `www.uculi.com`, use `www` as the primary production host and redirect the apex `uculi.com` domain to it once Hosting is connected.

## Repo Layout

- `index.html` - marketing landing page.
- `app.html` - authenticated application UI, state, and logic.
- `firebase-config.example.js` - Firebase config template for local setup.
- `firebase-config.js` - local-only Firebase config (gitignored).
- `firebase.json` - Hosting configuration, rewrites, and security headers.
- `README.md` - high-level repo guide.
- `docs/STRICT_LAUNCH_BACKLOG.md` - active launch backlog.
- `docs/FINAL_BILLING_AI_EXECUTION_PLAN.md` - billing implementation plan.
- `docs/PHASE_2_SETUP.md` - Firebase configuration guide.

## Public Repo Security

This repository is public. Keep these files local only:

- `firebase-config.js`
- `.firebaserc`
- `.env` / `.env.local`
- `Notes.txt`
- `personal/`

Never commit Stripe secrets, webhook secrets, or Firebase service-account JSON files.

After making the repo public, also restrict the Firebase Web API key in Google Cloud Console to your production domains and localhost.

## Next Major Work

1. Finish UX and interaction standardization across remaining screens.
2. Audit the app for broken, inconsistent, or unfinished actions before major new features.
3. Run the next responsive and usability QA pass.
4. Tighten copy, empty states, and visual hierarchy.
5. Only then move into real billing and entitlement work.

## Notes

- The current Premium upgrade path still includes a local preview path for development and testing.
- Billing secrets must never live in `index.html`.
- Firebase setup and billing setup are separate tracks and should stay documented separately.
- The generated `public/` folder is the only web root intended for production deployment.
