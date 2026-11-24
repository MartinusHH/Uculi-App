import { existsSync, readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

// Uculi familiecode: alleen tegen de Firestore-emulator.
// TESTCODE123 is een nepcode; echte codes staan nooit in de repo.

const CODE = "TESTCODE123";
const DAY = 24 * 60 * 60 * 1000;
const RULES = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
// firestore.rules.orig = Uculi-regels vóór dit blok (in de harness; in de repo optioneel).
const ORIG_URL = new URL("../firestore.rules.orig", import.meta.url);
const RULES_ORIG = existsSync(ORIG_URL) ? readFileSync(ORIG_URL, "utf8") : null;
const BLOCK_URL = new URL("../familiecode-block.rules", import.meta.url);
const BLOCK = existsSync(BLOCK_URL) ? readFileSync(BLOCK_URL, "utf8") : null;
// Must match isAccessSuperuser() in Uculi's firestore.rules (existing check, reused).
const SUPERUSER_EMAIL = /request\.auth\.token\.email == '([^']+)'/.exec(RULES)[1];

function codeDoc(overrides = {}) {
  return {
    type: "familyPremium",
    expiresAt: Timestamp.fromMillis(Date.now() + 60 * DAY),
    active: true,
    used: 0,
    maxUses: 15,
    ...overrides,
  };
}

function grant(overrides = {}) {
  return { code: CODE, type: "familyPremium", createdAt: serverTimestamp(), ...overrides };
}

describe("Uculi firestore rules: accessCodes en codeAccess (familiecode)", () => {
  /** @type {import("@firebase/rules-unit-testing").RulesTestEnvironment} */
  let testEnv;

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "demo-uculi-rules",
      firestore: { rules: RULES },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedCode();
  });

  after(async () => {
    await testEnv.cleanup();
  });

  async function seedCode(overrides = {}, id = CODE) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "accessCodes", id), codeDoc(overrides));
    });
  }

  async function seed(path, data) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), ...path), data);
    });
  }

  async function codeData(id = CODE) {
    let d = null;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      d = (await getDoc(doc(ctx.firestore(), "accessCodes", id))).data();
    });
    return d;
  }
  const used = async (id = CODE) => (await codeData(id)).used;

  const user = (uid = "alice") =>
    testEnv.authenticatedContext(uid, { email: `${uid}@example.nl`, email_verified: true }).firestore();
  const anon = () => testEnv.unauthenticatedContext().firestore();
  const su = () =>
    testEnv.authenticatedContext("su-uid", { email: SUPERUSER_EMAIL, email_verified: true }).firestore();
  const suUnverified = () =>
    testEnv.authenticatedContext("su-uid", { email: SUPERUSER_EMAIL, email_verified: false }).firestore();

  /** Same batch as the app: create codeAccess/{uid} + used + 1. */
  function redeem(db, uid, g = grant(), code = CODE, step = increment(1)) {
    const batch = writeBatch(db);
    batch.set(doc(db, "codeAccess", uid), g);
    batch.update(doc(db, "accessCodes", code), { used: step });
    return batch.commit();
  }

  /** Same batch as /beheer: revoke codeAccess/{uid} + used - 1 + lastRevokedUid. */
  function revoke(db, uid, code = CODE, { step = increment(-1), lastUid = uid, withCode = true } = {}) {
    const batch = writeBatch(db);
    batch.update(doc(db, "codeAccess", uid), { revoked: true, revokedAt: serverTimestamp() });
    if (withCode) batch.update(doc(db, "accessCodes", code), { used: step, lastRevokedUid: lastUid });
    return batch.commit();
  }

  // ---------- inwisselen ----------
  it("geldige code inwisselen lukt; eigen toegang leesbaar; used = 1", async () => {
    await assertSucceeds(redeem(user(), "alice"));
    const snap = await assertSucceeds(getDoc(doc(user(), "codeAccess", "alice")));
    assert(JSON.stringify(Object.keys(snap.data()).sort()) === JSON.stringify(["code", "createdAt", "type"]));
    assert((await used()) === 1);
  });

  it("zonder inloggen geweigerd", async () => {
    await assertFails(redeem(anon(), "alice"));
  });

  it("verkeerde code geweigerd", async () => {
    await assertFails(redeem(user(), "alice", grant({ code: "FOUTCODE999" }), "FOUTCODE999"));
  });

  it("verlopen code geweigerd", async () => {
    await seedCode({ expiresAt: Timestamp.fromMillis(Date.now() - DAY) });
    await assertFails(redeem(user(), "alice"));
  });

  it("uitgezette code geweigerd", async () => {
    await seedCode({ active: false });
    await assertFails(redeem(user(), "alice"));
  });

  it("inwisselen voor een andere uid geweigerd", async () => {
    await assertFails(redeem(user("alice"), "bob"));
  });

  it("tweede keer inwisselen geweigerd", async () => {
    await assertSucceeds(redeem(user(), "alice"));
    await assertFails(redeem(user(), "alice"));
    assert((await used()) === 1);
  });

  it("limiet bereikt (15 van 15) geweigerd", async () => {
    await seedCode({ used: 15, maxUses: 15 });
    await assertFails(redeem(user(), "alice"));
  });

  it("laatste plek (14 van 15) lukt nog", async () => {
    await seedCode({ used: 14, maxUses: 15 });
    await assertSucceeds(redeem(user(), "alice"));
  });

  it("ophogen met 2 geweigerd", async () => {
    await assertFails(redeem(user(), "alice", grant(), CODE, increment(2)));
  });

  it("ophogen zonder toegangsdocument geweigerd", async () => {
    await assertFails(updateDoc(doc(user(), "accessCodes", CODE), { used: increment(1) }));
  });

  it("toegangsdocument zonder ophogen geweigerd", async () => {
    await assertFails(setDoc(doc(user(), "codeAccess", "alice"), grant()));
  });

  it("toegang voor code A met ophogen van code B geweigerd", async () => {
    await seedCode({}, "ANDERECODE");
    await assertFails(redeem(user(), "alice", grant(), "ANDERECODE"));
  });

  it("verkeerd type, extra veld (app, revoked) of eigen createdAt geweigerd", async () => {
    await assertFails(redeem(user(), "alice", grant({ type: "paidCustomer" })));
    await assertFails(redeem(user(), "alice", grant({ revoked: false })));
    await assertFails(redeem(user(), "alice", grant({ app: "uculi" })));
    await assertFails(redeem(user(), "alice", grant({ createdAt: Timestamp.now() })));
  });

  // ---------- gewone gebruiker ----------
  it("gebruiker kan eigen toegang niet aanpassen of verwijderen", async () => {
    await assertSucceeds(redeem(user(), "alice"));
    await assertFails(updateDoc(doc(user(), "codeAccess", "alice"), { revoked: false }));
    await assertFails(updateDoc(doc(user(), "codeAccess", "alice"), { revoked: true, revokedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(user(), "codeAccess", "alice")));
  });

  it("gebruiker en bezoeker kunnen accessCodes niet lezen of opvragen", async () => {
    await assertFails(getDoc(doc(user(), "accessCodes", CODE)));
    await assertFails(getDocs(collection(user(), "accessCodes")));
    await assertFails(getDoc(doc(anon(), "accessCodes", CODE)));
    await assertFails(getDocs(collection(anon(), "accessCodes")));
  });

  it("gebruiker kan de codeAccess-lijst niet opvragen en andermans toegang niet lezen", async () => {
    await assertSucceeds(redeem(user(), "alice"));
    await assertFails(getDocs(collection(user("alice"), "codeAccess")));
    await assertFails(getDocs(collection(user("bob"), "codeAccess")));
    await assertFails(getDoc(doc(user("bob"), "codeAccess", "alice")));
    await assertFails(getDoc(doc(anon(), "codeAccess", "alice")));
  });

  it("gebruiker kan codes niet aanmaken, bewerken of verwijderen", async () => {
    await assertFails(setDoc(doc(user(), "accessCodes", "EIGENCODE"), codeDoc()));
    await assertFails(updateDoc(doc(user(), "accessCodes", CODE), { maxUses: 15, active: true }));
    await assertFails(updateDoc(doc(user(), "accessCodes", CODE), { expiresAt: Timestamp.fromMillis(Date.now() + 999 * DAY) }));
    await assertFails(deleteDoc(doc(user(), "accessCodes", CODE)));
  });

  it("gewone gebruiker kan used nooit verlagen, ook niet met intrekken van zichzelf", async () => {
    await seedCode({ used: 3 });
    await assertSucceeds(redeem(user(), "alice"));
    await assertFails(updateDoc(doc(user(), "accessCodes", CODE), { used: increment(-1) }));
    await assertFails(updateDoc(doc(user(), "accessCodes", CODE), { used: increment(-1), lastRevokedUid: "alice" }));
    await assertFails(revoke(user(), "alice"));
    await assertFails(revoke(user("bob"), "alice"));
    assert((await used()) === 4);
  });

  // ---------- superuser ----------
  it("superuser kan codes aanmaken (used 0), bewerken, lezen, opvragen en verwijderen", async () => {
    await assertSucceeds(setDoc(doc(su(), "accessCodes", "NIEUWECODE1"), codeDoc()));
    await assertSucceeds(updateDoc(doc(su(), "accessCodes", "NIEUWECODE1"), {
      active: false, maxUses: 10, expiresAt: Timestamp.fromMillis(Date.now() + 30 * DAY),
    }));
    await assertSucceeds(getDoc(doc(su(), "accessCodes", CODE)));
    await assertSucceeds(getDocs(collection(su(), "accessCodes")));
    await assertSucceeds(deleteDoc(doc(su(), "accessCodes", "NIEUWECODE1")));
  });

  it("superuser: ongeldige codes geweigerd (maxUses > 15, used niet 0, kleine letters, extra veld)", async () => {
    await assertFails(setDoc(doc(su(), "accessCodes", "NIEUWECODE2"), codeDoc({ maxUses: 16 })));
    await assertFails(setDoc(doc(su(), "accessCodes", "NIEUWECODE2"), codeDoc({ used: 5 })));
    await assertFails(setDoc(doc(su(), "accessCodes", "kleinecode"), codeDoc()));
    await assertFails(setDoc(doc(su(), "accessCodes", "NIEUWECODE2"), codeDoc({ note: "x" })));
    await assertFails(updateDoc(doc(su(), "accessCodes", CODE), { maxUses: 25 }));
  });

  it("superuser kan used niet los aanpassen (alleen via intrekken)", async () => {
    await seedCode({ used: 3 });
    await assertFails(updateDoc(doc(su(), "accessCodes", CODE), { used: 0 }));
    await assertFails(updateDoc(doc(su(), "accessCodes", CODE), { used: increment(1) }));
    await assertFails(updateDoc(doc(su(), "accessCodes", CODE), { used: increment(-1) }));
  });

  it("superuser kan codeAccess lezen en opvragen", async () => {
    await assertSucceeds(redeem(user(), "alice"));
    await assertSucceeds(getDoc(doc(su(), "codeAccess", "alice")));
    await assertSucceeds(getDocs(collection(su(), "codeAccess")));
  });

  it("superuser met onbevestigd e-mailadres heeft geen beheerrechten", async () => {
    await assertFails(getDoc(doc(suUnverified(), "accessCodes", CODE)));
    await assertFails(getDocs(collection(suUnverified(), "codeAccess")));
    await assertFails(setDoc(doc(suUnverified(), "accessCodes", "NIEUWECODE3"), codeDoc()));
  });

  it("app-config admin (isAdminEmail) is geen superuser voor codes", async () => {
    await seed(["app-config", "admin"], { enabledEmails: ["moderator@example.nl"] });
    const mod = testEnv.authenticatedContext("mod", { email: "moderator@example.nl", email_verified: true }).firestore();
    await assertFails(getDoc(doc(mod, "accessCodes", CODE)));
    await assertFails(getDocs(collection(mod, "codeAccess")));
    await assertFails(setDoc(doc(mod, "accessCodes", "NIEUWECODE4"), codeDoc()));
  });

  // ---------- intrekken ----------
  it("superuser intrekken + used - 1 in één batch lukt; plek komt vrij", async () => {
    await assertSucceeds(redeem(user(), "alice"));
    assert((await used()) === 1);
    await assertSucceeds(revoke(su(), "alice"));
    const after = await codeData();
    assert(after.used === 0 && after.lastRevokedUid === "alice");
    const snap = await getDoc(doc(user(), "codeAccess", "alice"));
    assert(snap.data().revoked === true);
  });

  it("used - 1 zonder intrekken geweigerd", async () => {
    await assertSucceeds(redeem(user(), "alice"));
    await assertFails(updateDoc(doc(su(), "accessCodes", CODE), { used: increment(-1), lastRevokedUid: "alice" }));
    assert((await used()) === 1);
  });

  it("intrekken zonder used - 1 geweigerd (teller blijft kloppen)", async () => {
    await assertSucceeds(redeem(user(), "alice"));
    await assertFails(revoke(su(), "alice", CODE, { withCode: false }));
  });

  it("intrekken met verlagen met 2, of met de uid van een ander, geweigerd", async () => {
    await seedCode({ used: 4 });
    await assertSucceeds(redeem(user(), "alice"));
    await assertSucceeds(redeem(user("bob"), "bob"));
    await assertFails(revoke(su(), "alice", CODE, { step: increment(-2) }));
    await assertFails(revoke(su(), "alice", CODE, { lastUid: "bob" }));
  });

  it("intrekken voor code A met verlagen van code B geweigerd", async () => {
    await seedCode({ used: 2 }, "ANDERECODE");
    await assertSucceeds(redeem(user(), "alice"));
    await assertFails(revoke(su(), "alice", "ANDERECODE"));
  });

  it("dubbel verlagen voor dezelfde persoon geweigerd", async () => {
    await seedCode({ used: 5 });
    await assertSucceeds(redeem(user(), "alice"));
    await assertSucceeds(revoke(su(), "alice"));
    assert((await used()) === 5);
    await assertFails(revoke(su(), "alice"));
    await assertFails(updateDoc(doc(su(), "accessCodes", CODE), { used: increment(-1), lastRevokedUid: "alice" }));
    assert((await used()) === 5);
  });

  it("used nooit onder 0", async () => {
    await seed(["codeAccess", "carol"], { code: CODE, type: "familyPremium", createdAt: Timestamp.now() });
    await seedCode({ used: 0 });
    await assertFails(revoke(su(), "carol"));
    assert((await used()) === 0);
  });

  it("ingetrokken persoon kan niet opnieuw activeren", async () => {
    await assertSucceeds(redeem(user(), "alice"));
    await assertSucceeds(revoke(su(), "alice"));
    await assertFails(redeem(user(), "alice"));
    assert((await used()) === 0);
  });

  it("intrekken kan nog als de code zelf al verwijderd is", async () => {
    await assertSucceeds(redeem(user(), "alice"));
    await assertSucceeds(deleteDoc(doc(su(), "accessCodes", CODE)));
    await assertSucceeds(revoke(su(), "alice", CODE, { withCode: false }));
  });

  // ---------- bestaande Uculi-regels niet losser ----------
  it("firestore.rules = origineel + alleen het familiecode-blok (verder niets veranderd)", { skip: !RULES_ORIG || !BLOCK }, () => {
    assert(RULES.includes(BLOCK));
    assert(RULES.replace(BLOCK, "") === RULES_ORIG);
  });

  it("bestaande regels: access/{email} blijft dicht voor gebruikers, superuser ongewijzigd", async () => {
    await assertFails(getDocs(collection(user(), "access")));
    await assertFails(setDoc(doc(user(), "access", "alice@example.nl"), { email: "alice@example.nl" }));
    await assertSucceeds(getDocs(collection(su(), "access")));
    await seed(["access", "alice@example.nl"], { email: "alice@example.nl" });
    await assertSucceeds(getDoc(doc(user(), "access", "alice@example.nl")));
    await assertFails(updateDoc(doc(su(), "access", "alice@example.nl"), { email: "x" }));
  });

  it("bestaande regels: catch-all, app-config en moderatie blijven dicht", async () => {
    await assertFails(setDoc(doc(user(), "willekeurig", "x"), { a: 1 }));
    await assertFails(getDoc(doc(anon(), "willekeurig", "x")));
    await assertFails(setDoc(doc(user(), "app-config", "admin"), { enabledEmails: ["alice@example.nl"] }));
    await assertFails(getDocs(collection(user(), "moderation-log")));
    await assertFails(getDocs(collection(user(), "shopping-lists")));
  });
});

function assert(ok) {
  if (!ok) throw new Error("assertion failed");
}
