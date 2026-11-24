# Kleine aanpassingen in app.html (PR #16, head d4e2a13)

1. **Snippet plakken**: `app-familiecode-snippet.js` direct na `function hasCachedAccessGrant() { ... }` (rond regel 8587-8589).

2. **`hasFullAccess()`** (rond regel 8593): één regel erbij, vóór `isPremiumEnforced()`, zodat de code werkt los van `PREMIUM_ENABLED`:
```diff
         function hasFullAccess() {
             if (isAccessSuperuser()) return true;
             if (hasCachedAccessGrant()) return true;
+            if (hasCachedCodeGrant()) return true;
             if (!isPremiumEnforced()) return true;
```

3. **`resetAuthenticatedUserState()`** (rond regel 12980), na `currentUserAccessGrant = false;`:
```diff
             currentUserAccessGrant = false;
+            currentUserCodeGrant = false;
+            codeAccessListCache = [];
```

4. **Na inloggen** (rond regel 13708): de codetoegang samen met de bestaande e-mailtoegang laden:
```diff
-                        accessGrantLoadPromise = refreshCurrentUserAccessGrant()
+                        accessGrantLoadPromise = Promise.all([refreshCurrentUserAccessGrant(), refreshCurrentUserCodeGrant()])
                             .then(() => {
                                 if (isAccessSuperuser()) {
-                                    return loadAccessGrantListForSuperuser();
+                                    return Promise.all([loadAccessGrantListForSuperuser(), loadCodeAccessListForSuperuser()]);
                                 }
```

5. **package.json**, in `"scripts"`:
```json
"test:rules": "npx -y firebase-tools@latest emulators:exec --only firestore --project demo-uculi-rules \"node --test tests/firestore-rules-familiecode.test.mjs\""
```
en in `"devDependencies"`: `"@firebase/rules-unit-testing": "^4.0.1"`, `"firebase": "^11.10.0"`.

`PREMIUM_ENABLED` blijft `false`; Stripe/betalen niet aangeraakt.
