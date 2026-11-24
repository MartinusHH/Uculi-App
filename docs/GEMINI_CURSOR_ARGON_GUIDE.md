# Gemini 4 Argon ↔ Cursor — handleiding (plak in Gemini)

> **Gebruik:** open Google AI Studio of Gemini web → nieuw chat → plak dit hele document.  
> Daarna plak je eronder je code/diff. Vraag Gemini om een second opinion (bugs, UX, security, soft-launch scope).

Officiële Cursor-modelnaam: **Gemini 4 Argon** (niet “Argon 4” als apart product).

---

## Wat jij wilt bereiken

1. In **Cursor** dagelijks coderen met **Gemini 4 Argon**.
2. In **Gemini / AI Studio** dezelfde model-familie gebruiken als *tweede mening* op gesaneerde code.
3. Cloud Agents (Cursor-VM’s) niet verwarren met “Gemini in de browser”.

---

## Deel A — Gemini in Cursor

### Optie 1: Ingebouwde Cursor-modellen (start hier)

1. **Cursor Settings → Models**  
   - Mac: `Cmd + Shift + J`  
   - Windows/Linux: `Ctrl + Shift + J`
2. Zet relevante Gemini-modellen aan (sommige oudere staan standaard verborgen).
3. In Chat/Agent: model picker (of `Cmd/Ctrl + /`) → kies:
   - **Gemini 4 Argon** — complexe, multi-step coding
   - **Gemini 3.1 Pro** — multimodal / grote context
   - **Gemini 3.8 Flash** — sneller / goedkoper agent-werk
4. Werk met `@file` / `@folder` / diffs zoals normaal.

**Billing:** “Other Models” pool (third-party rates), niet de pure Cursor-model pool.

### Optie 2: Bring Your Own Key (Google AI)

1. Maak een Google AI / Gemini API-key in AI Studio.
2. **Cursor Settings → Models → Google** → key plakken → Save.
3. Kies Gemini in de picker; Google factureert het modelgebruik.

**Let op BYOK:**
- Chat/agent ja; **Tab-autocomplete nee** (blijft Cursor).
- Cursor Zero Data Retention geldt **niet** automatisch — Google’s policy geldt.
- **OpenAI Base URL override** uit laten tenzij je bewust een custom gateway gebruikt.

---

## Deel B — Apart in Gemini laten meedenken

| Rol | Waar | Model |
|-----|------|--------|
| Dagelijks coderen | Cursor IDE | Gemini 4 Argon |
| Tweede review | AI Studio / Gemini web | Zelfde familie |

### Workflow

1. Bouw/review in Cursor.
2. Kopieer naar Gemini **alleen**: relevante files/functies, korte vraag, errors/tests.
3. Vraag om concrete feedback (bestand + wijziging).
4. Breng bruikbare punten terug als gerichte prompt in Cursor.

### Prompt-template (NL) — plak onder dit document

```text
Je bent second-opinion reviewer voor Uculi (single-file app.html, Firebase Auth/Firestore).

Soft launch:
- Focus: accounts, lokaal archief, notebook/cook, Opties, legal, hosting
- Later: Stripe Premium, volledige family-cloud
- Shop-partners = device-local namen; Browse/publish = cloud

Branch: cursor/accounts-soft-launch-d602
Focus van deze review: <vul in: bijv. profile desktop, Browse empty, cook labels>

Regels:
- Geen secrets vragen
- Concreet: bestand + wat te wijzigen
- Soft-launch scope respecteren

Huisstijl (recent):
- Sheet/hero/panel taal (shop, settings, browse, profile)
- Desktop labels vanaf ~900px
- Empty states: sheet-empty / browse-empty (links uitgelijnd, Fraunces h3)
- Nav: Index / Shop / Browse / Profiel|Profile
- Geen fake community-content; lege feed tot iemand publiceert

Code / diff:
<plak hier>
```

---

## Deel C — Niet doen

- Geen `.env`, API-keys, tokens, private keys, klant-PII plakken.
- Cloud Agents ≠ Gemini web.
- BYOK ≠ Cursor Privacy Mode ZDR.
- Geen hele repo dump.
- Verwacht niet dat Tab je Gemini-key gebruikt.

---

## Cheat sheet

| EN | NL |
|----|----|
| Settings → Models | Instellingen → Models |
| Model picker | Modelkeuze in chat/agent |
| Gemini 4 Argon | Officiële Cursor-naam |
| Bring your own key | Eigen Google API-key |
| Second opinion | Extra review in AI Studio / Gemini web |
| Cloud Agents | Cursor cloud-VM, niet Gemini-browser |

---

## Uculi context voor Gemini (kort)

Uculi = recepten-/notebook-app (warm parchment, Fraunces + Outfit, sage/forest/gold). Soft launch = accounts + lokaal + notebook/cook + Opties + legal. UI-richting: volle desktopbreedte, gelabelde knoppen, gecomposeerde empty states. Families: naam+tag+pin nu; live family-cloud later.
