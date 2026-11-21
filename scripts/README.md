# Admin SDK scripts (never run from the client)

These scripts require Firebase Admin credentials (or Auth/Firestore emulators).
Do not commit service-account JSON or `firebase-config.js` secrets.

## set-superuser-claim.mjs

Sets or clears the Auth custom claim `superuser` for one account.

```bash
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  node scripts/set-superuser-claim.mjs --email someone@example.com
```

## set-legacy-premium.mjs

One-time switch-day script: marks every Auth user that already exists with
`users/{uid}.legacyPremium = true`. Firestore rules keep that field immutable
for clients afterward.

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  node scripts/set-legacy-premium.mjs --dry-run --switch-day 2026-11-21
```
