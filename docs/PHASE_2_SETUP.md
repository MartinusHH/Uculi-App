# Uculi Firebase Setup Guide

Date: 27 April 2026

## Scope

This guide covers Firebase for:

- Google sign-in
- cloud sync
- publishing
- future entitlement mirroring

It does not implement real billing. For billing, use `FINAL_BILLING_AI_EXECUTION_PLAN.md`.

## Prerequisites

- A Firebase project
- A Google account for Firebase administration
- Your local and production domains
- A registrar or DNS provider that can edit records for `uculi.com`

## Step 1: Create The Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Click `Add project`.
3. Name it `Uculi` or your final production name.
4. Accept the terms.
5. Enable or disable Google Analytics based on your preference.
6. Create the project.

## Step 2: Enable Google Authentication

1. In Firebase Console, open `Authentication`.
2. Click `Get started`.
3. Enable the `Google` provider.
4. Set your support email.
5. Save the provider.

## Step 3: Create Firestore

1. Open `Firestore Database`.
2. Create the database in `Production mode`.
3. Choose the region closest to your users.
4. After creation, replace the rules with this baseline:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, create, update, delete: if request.auth != null && request.auth.uid == uid;
    }

    match /published-recipes/{docId} {
      allow read: if true;
      allow create: if request.auth != null && request.resource.data.authorId == request.auth.uid;
      allow update, delete: if request.auth != null && resource.data.authorId == request.auth.uid;
    }

    match /billing-events/{eventId} {
      allow read, write: if false;
    }
  }
}
```

Notes:

- The `users` document should stay private to the authenticated owner.
- `published-recipes` stays publicly readable.
- `billing-events` is reserved for backend-only billing work later.

## Step 4: Register The Web App

1. Open project settings.
2. Register a `Web` app.
3. Copy the Firebase config object.
4. Keep the values you need:

```javascript
{
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
}
```

## Step 5: Add The Config To The App

1. Copy `firebase-config.example.js` to `firebase-config.js`.
2. Replace the placeholder values with your Firebase project config.
3. Keep `firebase-config.js` local only. It is gitignored and must be deployed from your machine.

Example `firebase-config.js`:

```javascript
window.UCULI_FIREBASE_CONFIG = {
  apiKey: "YOUR_ACTUAL_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123def456"
};
```

`app.html` loads this file before `initializeFirebase()` runs.

## Step 6: Authorize Domains

1. In `Authentication`, open the authorized-domains area.
2. Ensure your local domain is allowed.
3. Add `www.uculi.com` before launch.
4. Add `uculi.com` as well if you want the apex domain to redirect to `www.uculi.com`.

## Soft-launch checklist for `mholt-uculi` (Martijn)

Do these in Firebase Console before pointing friends to uculi.com:

1. Project `mholt-uculi` is selected.
2. Authentication → Sign-in method → enable **Email/Password**.
3. Authentication → Sign-in method → enable **Google** (support email = yours).
4. Authentication → Settings → Authorized domains → add `uculi.com` and `www.uculi.com` (keep `localhost` for local tests).
5. Firestore → publish the repo `firestore.rules` (includes private `users/{uid}/private/agreement`).
6. Copy real web app config into local `firebase-config.js` (from Project settings), then deploy Hosting.
7. On Google Cloud / Google Auth Platform, complete the OAuth consent screen for `uculi.com` so visitors do not see an unverified-app warning forever.
8. Smoke-test on phone and desktop: register, login, Google login, open privacy/gebruiksvoorwaarden without losing form fields, sign out.

Local emulator check (already wired in the app):

1. Copy `firebase-config.example.js` → `firebase-config.js` (demo values are fine for emulators).
2. `firebase emulators:start --only auth,firestore --project mholt-uculi`
3. Serve the repo root and open `app.html?emulator=1&auth=register`

## Step 7: Prepare Single-Source Hosting

1. Use `index.html` as the only app shell source.
2. Keep deployment filtering in `firebase.json` (`hosting.ignore`) so only intended files are published.
3. Keep internal planning docs, notes, and future server-side code in ignored paths.

The repo now uses root-based hosting in `firebase.json` with security headers enabled before launch.

## Step 8: Configure Firebase Hosting For `www.uculi.com`

1. In Firebase Console, open `Hosting` and finish initial setup for your project.
2. Use the included `firebase.json` root hosting config with the explicit ignore list.
3. Add `www.uculi.com` as the primary custom domain in Firebase Hosting.
4. Add `uculi.com` as a secondary custom domain and configure it to redirect to `www.uculi.com`.
5. At your domain provider, add the exact DNS records Firebase shows for verification and routing.
6. Wait until Firebase finishes SSL certificate provisioning for both domains.

Notes:

- For `www`, Firebase commonly asks for a CNAME plus a verification record.
- For the apex domain, Firebase may ask for A/AAAA and verification records.
- Use the exact values shown in Firebase instead of guessing or reusing old DNS templates.

## Step 9: Launch Security Checklist

- Deploy with the root-based `firebase.json` configuration and verify ignore rules are intact.
- Keep `.firebaserc` local and outside version control.
- Keep billing secrets and webhook secrets on the server side only.
- Verify Firebase Auth authorized domains include the final live domains.
- Verify `firebase.json` security headers remain active in production.
- Test Google sign-in, sync, publishing, and locked Premium flows on `https://www.uculi.com` before announcing the launch.

## Testing The Firebase Track

In the current build, cloud actions are Premium-gated.

To test Firebase behavior:

1. Open the app.
2. Activate the local Premium preview or later use a real billing entitlement.
3. Open `Settings`.
4. Use `Sign In with Google`.
5. Test sync and recipe publishing.
6. Confirm published recipes appear in the community view and Firestore.

## Firestore Data Shape

### Users

```text
users/{uid}
  email
  displayName
  photoURL
  isPublic
  updatedAt
  billing      // reserved for the billing phase
```

### Published Recipes

```text
published-recipes/{docId}
  title
  ingredients
  instructions
  authorEmail
  authorName
  authorId
  publishedAt
  views
  likes
```

## Troubleshooting

### Firebase config missing

- Re-check the values inside `firebase-config.js`.
- Verify the Firebase project is still active.

### Sign-in button does not work

- Confirm Google auth is enabled.
- Confirm Premium access is active in the app.
- Confirm the current domain is authorized.

### Firestore permission denied

- Re-check the Firestore rules.
- Confirm `authorId` is being written correctly on publish.
- Confirm the signed-in user matches the document owner.

### Published recipes do not appear

- Wait a moment for Firestore propagation.
- Check the browser console.
- Verify the document was created in `published-recipes`.

## Next Step After Firebase Works

Move to `FINAL_BILLING_AI_EXECUTION_PLAN.md` when you are ready to connect real subscription billing.
