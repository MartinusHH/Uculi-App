# Gemini 4 Argon koppelen aan Cursor (en apart laten meedenken)

Plak dit document in Google AI Studio / Gemini als context wanneer je wilt dat Gemini meedenkt over Uculi-code, terwijl je in Cursor met **Gemini 4 Argon** werkt.

Officiële Cursor-naam: **Gemini 4 Argon** (niet “Argon 4” als apart product).

---

## Doel

1. In **Cursor** code schrijven/reviewen met Gemini 4 Argon.
2. In **Gemini / AI Studio** dezelfde model-familie gebruiken als *tweede mening* op gesaneerde code.
3. Duidelijk houden wat Cursor Cloud Agents wel/niet zijn.

---

## Deel A — Gemini in Cursor gebruiken

### Optie 1: Ingebouwde Cursor-modellen (aanbevolen start)

1. Open **Cursor Settings → Models**  
   - Mac: `Cmd + Shift + J`  
   - Windows/Linux: `Ctrl + Shift + J`
2. Zorg dat Gemini-modellen enabled zijn (sommige oudere staan standaard verborgen).
3. In Chat/Agent: open de **model picker** (of `Cmd/Ctrl + /`) en kies:
   - **Gemini 4 Argon** — sterk voor complexe, multi-step coding
   - **Gemini 3.1 Pro** — sterk multimodal / grote context
   - **Gemini 3.8 Flash** — sneller / goedkoper agent-werk
4. Ga verder met `@file` / `@folder` / diffs zoals je gewend bent.

**Billing:** deze vallen in de Cursor “Other Models” pool (third-party rates), niet in de pure Cursor-model pool.

### Optie 2: Bring Your Own Key (Google AI)

1. Maak een Google AI / Gemini API-key (bijv. via Google AI Studio).
2. Ga naar **Cursor Settings → Models → Google**.
3. Plak de key → **Save**.
4. Kies daarna Gemini in de model picker; Google factureert het modelgebruik.

**Belangrijk bij BYOK:**
- Werkt voor chat/agent, **niet** voor Tab-autocomplete (Tab blijft Cursor-modellen).
- Met je eigen key geldt **niet** automatisch Cursor Zero Data Retention — Google’s policy geldt.
- Laat **OpenAI Base URL override** uit staan als je de normale Gemini/Grok/Claude/GPT modellen wilt; override is alleen voor bewuste custom gateways.

---

## Deel B — Apart in Gemini laten meedenken (tweede mening)

| Rol | Waar | Model |
|-----|------|--------|
| Dagelijks coderen, edits, tools | Cursor IDE | Gemini 4 Argon |
| Tweede review / meedenken | Google AI Studio of Gemini web | Zelfde familie (Argon / nieuwste Gemini in Studio) |

### Workflow

1. Bouw of review in Cursor met relevante `@file` context.
2. Kopieer naar Gemini **alleen**:
   - de bestanden/functies die ertoe doen
   - korte probleemstelling
   - relevante errors / testoutput
3. Vraag Gemini om bugs, security, UX of architectuur-feedback.
4. Breng bruikbare punten terug als gerichte prompt in Cursor.

### Prompt-template voor Gemini (NL)

```text
Je bent een second-opinion reviewer voor mijn Uculi-app (single-file app.html,
Firebase Auth/Firestore, soft-launch: accounts + hosting + legal; Stripe later).

Context:
- Branch/PR: cursor/accounts-soft-launch-d602
- Focus van deze review: <bijv. Browse/profile UX, family pin sync, shopping layout>

Regels:
- Geen secrets vragen of aannemen
- Wees concreet: bestandsnaam + wat te wijzigen
- Soft-launch constraints respecteren (geen half-af Stripe, family-cloud is later)

Hier is de code / diff:
<plak hier>
```

---

## Deel C — Wat je níet moet doen

- Geen `.env`, API-keys, tokens, private keys of klant-PII in Gemini plakken.
- Cursor **Cloud Agents** ≠ “Gemini in de browser”. Cloud Agents zijn Cursor-VM’s die repo’s clonen en PR’s maken.
- BYOK ≠ Cursor Privacy Mode ZDR.
- Verwacht niet dat Tab je Gemini-key gebruikt.
- Geen hele repo dump; houd de tweede mening gefocust.

---

## Korte NL cheat sheet

| EN | NL |
|----|----|
| Settings → Models | Instellingen → Models |
| Model picker | Modelkeuze in chat/agent |
| Gemini 4 Argon | Officiële Cursor-naam |
| Bring your own key (Google) | Eigen Google API-key |
| Second opinion | Extra review in AI Studio / Gemini web |
| Cloud Agents | Apart Cursor-product (cloud-VM), niet Gemini-web |

---

## Voor Gemini: Uculi soft-launch context (kort)

Uculi is een recepten-/notebook-app. Soft launch = accounts, lokale archief, notebook/cook, Opties, legal, hosting. Premium/Stripe en volledige family-cloud komen later. Shop-partners zijn device-local namen. Browse + publish zijn cloud-wired. UI-polish richting: volle desktopbreedte, gelabelde knoppen, gecomposeerde empty states (shop/settings/browse/profile-patroon).
