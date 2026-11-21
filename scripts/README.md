# Admin SDK scripts (never run from the client)

These scripts require Firebase Admin credentials (or Auth/Firestore emulators).
Do not commit service-account JSON or `firebase-config.js` secrets.

## set-superuser-claim.mjs

Sets or clears the Auth custom claim `admin` for one account.
Firestore rules require `admin == true` and `email_verified == true` for superuser access.

```bash
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  node scripts/set-superuser-claim.mjs --email someone@example.com
```

### Go-live note

Before deploying the new Firestore rules that check `admin` (instead of the
legacy `superuser` claim), run `set-superuser-claim.mjs` with Admin credentials
for every existing superuser account so they receive the `admin` claim. After
deploy, those users pick up the claim on the next app start / sign-in (forced
token refresh); no logout is required once the claim is set.

## set-legacy-premium.mjs

One-time switch-day script: marks every Auth user that already exists with
`users/{uid}.legacyPremium = true`. Firestore rules keep that field immutable
for clients afterward.

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  node scripts/set-legacy-premium.mjs --dry-run --switch-day 2026-11-21
```
