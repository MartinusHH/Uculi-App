# Uculi familiecode: databaseregels + tests (voor Droidie)

Gebaseerd op `MartinusHH/Uculi-App`, PR #16, head `d4e2a13`. Niets is gedeployed. Geen echte code in deze bestanden: de tests gebruiken alleen de nepcode `TESTCODE123`.

## Wat het doet
- `accessCodes/{CODE}`: de naam van het document is de code zelf, in hoofdletters. Velden: `type` (`familyPremium`), `expiresAt`, `active`, `used`, `maxUses` (1 t/m 15) en eventueel `lastRevokedUid`. Gebruikers kunnen codes nooit lezen of opvragen.
- `codeAccess/{uid}`: precies de velden `code`, `type` en `createdAt`. Je maakt het alleen voor je eigen account aan, in één batch samen met `used` +1. Daarna kun je het niet aanpassen of verwijderen. Je kunt alleen je eigen document lezen.
- **Beheerder** is de bestaande `isAccessSuperuser()` uit Uculi: het vaste e-mailadres plus een bevestigd e-mailadres. Dat is dezelfde check als bij `access/{email}`. Er is geen nieuwe uid-lijst gemaakt. Wie via `app-config/admin` (`isAdminEmail`) beheerder is, telt hier bewust niet mee.
- De superuser kan op /beheer codes aanmaken (met `used` 0), bewerken (einddatum, aan/uit, maxUses), lezen, opvragen en verwijderen. Hij kan ook `codeAccess` lezen en opvragen, en intrekken.
- **Intrekken** gebeurt in één batch: `codeAccess/{uid}` krijgt `revoked: true` en `revokedAt`, `used` gaat -1 en `lastRevokedUid` wordt `uid`. De regels controleren dat dit document vóór de batch nog niet ingetrokken was en erna wel. Ze controleren ook dat het bij deze code hoort en dat `used` niet onder 0 komt. Daardoor kan dezelfde persoon geen twee keer een plek teruggeven. Buiten het intrekken kan niemand `used` verlagen, ook de superuser niet. Wie is ingetrokken, kan niet opnieuw activeren.
- De bestaande regels blijven precies hetzelfde. Het blok staat alleen vóór de laatste `match /{document=**}`.

## Bestanden en waar ze heen gaan
| Bestand hier | In de repo |
|---|---|
| `familiecode-block.rules` | Plak dit in `firestore.rules`, direct vóór `match /{document=**} {` (onderaan). |
| `firestore.rules` | Het volledige samengevoegde bestand, ter controle. Het moet gelijk zijn aan jouw resultaat na het plakken. |
| `firestore.rules.diff` | Het verschil met het origineel. Er komen alleen regels bij. |
| `tests/firestore-rules-familiecode.test.mjs` | `tests/firestore-rules-familiecode.test.mjs` |
| `app-familiecode-snippet.js` | Plakken in `app.html`, zie `app-html-EDITS.md` |
| `app-html-EDITS.md` | De 4 kleine aanpassingen in `app.html` plus het testscript in `package.json` |
| `test-run-emulator.log` | Het verslag van de testrun (alleen ter info, niet in de repo zetten) |

## Volledige toegang (entitlement)
Dat regelt `hasFullAccess()` in `app.html` (rond regel 8593). Alle premiumpoorten lopen hierlangs (`hasPremiumAccess`, `accountHasPremiumPlan`). Er komt één regel bij: `if (hasCachedCodeGrant()) return true;`, vóór `isPremiumEnforced()`. Een geldige `codeAccess` die niet is ingetrokken geeft dus volledige toegang, los van `PREMIUM_ENABLED`. Betalen blijft uit.

## Tests draaien
```
npm i -D @firebase/rules-unit-testing@^4.0.1 firebase@^11.10.0
npm run test:rules
```
Die opdracht voert dit uit: `npx -y firebase-tools@latest emulators:exec --only firestore --project demo-uculi-rules "node --test tests/firestore-rules-familiecode.test.mjs"`. Het gebruikt een demo-project, dus de echte database wordt nooit aangeraakt. De test "origineel + alleen het blok" draait alleen in de harness, waar `firestore.rules.orig` en `familiecode-block.rules` naast de regels staan. In de repo slaat hij zichzelf over. Resultaat in de harness (`/workspace/uculi-familiecode-harness`): **37/37 geslaagd**.

## Eerlijke grenzen
- Iedere app heeft een eigen Firebase-project, dus de teller geldt per app.
- Zonder Blaze is er geen rem op de server tegen het raden van codes. Dat beperken we met: inloggen verplicht, een lange code, een einddatum, maxUses ≤ 15 en intrekken. App Check moet apart aan in de console.
- Live gaat het pas na backup + PASS (Mholt-document). De echte code maakt de superuser daarna aan op /beheer of in de console.
