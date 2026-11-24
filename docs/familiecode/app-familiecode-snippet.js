// ===== Uculi familiecode: plakken in app.html, direct na hasCachedAccessGrant() (rond regel 8590) =====
// Gebruikt de bestaande compat-SDK (firebase.firestore()) en isAccessSuperuser().
// Geen echte code in de repo. Betaalschakelaar PREMIUM_ENABLED blijft false.

let currentUserCodeGrant = false;
let codeAccessListCache = [];

function normalizeAccessCode(input = '') {
    const code = String(input).replace(/\s+/g, '').toUpperCase();
    return /^[A-Z0-9_-]{1,32}$/.test(code) ? code : null;
}

function hasCachedCodeGrant() {
    return currentUserCodeGrant === true;
}

// Eigen codeAccess/{uid} lezen. Telt alleen als revoked niet true is. Geen einddatum.
async function refreshCurrentUserCodeGrant() {
    currentUserCodeGrant = false;
    if (!firebaseInitialized || !isAuthenticated || !currentUser?.uid) return false;
    if (isDeveloperBypassSession()) return false;
    try {
        const snap = await firebase.firestore().collection('codeAccess').doc(currentUser.uid).get();
        currentUserCodeGrant = snap.exists === true && snap.data()?.revoked !== true;
    } catch (error) {
        console.error('Code grant load failed:', error);
        currentUserCodeGrant = false;
    }
    return currentUserCodeGrant;
}

// Code inwisselen: één batch, precies de velden code, type, createdAt + used +1.
// Eén melding voor elke fout, zodat niemand ziet welke codes bestaan.
async function redeemAccessCode(rawInput) {
    const code = normalizeAccessCode(rawInput);
    if (!code || !firebaseInitialized || !isAuthenticated || !currentUser?.uid) return 'refused';
    const db = firebase.firestore();
    const batch = db.batch();
    batch.set(db.collection('codeAccess').doc(currentUser.uid), {
        code,
        type: 'familyPremium',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    batch.update(db.collection('accessCodes').doc(code), {
        used: firebase.firestore.FieldValue.increment(1)
    });
    try {
        await batch.commit();
        currentUserCodeGrant = true;
        refreshCurrentViewAfterBillingChange();
        return 'ok';
    } catch (error) {
        return 'refused'; // UI-tekst (Eurie): "Deze code werkt niet (meer)."
    }
}

// /beheer (alleen superuser): intrekken = revoked + used -1 + lastRevokedUid in één batch.
// Bestaat de code niet meer, dan alleen het intrekken.
async function revokeCodeAccess(uid) {
    if (!isAccessSuperuser()) return false;
    const db = firebase.firestore();
    const grantRef = db.collection('codeAccess').doc(uid);
    const grantSnap = await grantRef.get();
    if (!grantSnap.exists || grantSnap.data().revoked === true) return false;
    const codeRef = db.collection('accessCodes').doc(grantSnap.data().code);
    const codeSnap = await codeRef.get();
    const batch = db.batch();
    batch.update(grantRef, {
        revoked: true,
        revokedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    if (codeSnap.exists) {
        batch.update(codeRef, {
            used: firebase.firestore.FieldValue.increment(-1),
            lastRevokedUid: uid
        });
    }
    await batch.commit();
    return true;
}

// /beheer (alleen superuser): code aanmaken. used start op 0, maxUses 1-15.
async function createAccessCode(rawCode, { maxUses = 15, days = 60 } = {}) {
    if (!isAccessSuperuser()) return false;
    const code = normalizeAccessCode(rawCode);
    if (!code) return false;
    await firebase.firestore().collection('accessCodes').doc(code).set({
        type: 'familyPremium',
        expiresAt: firebase.firestore.Timestamp.fromMillis(Date.now() + days * 24 * 60 * 60 * 1000),
        active: true,
        used: 0,
        maxUses
    });
    return true;
}

// /beheer (alleen superuser): lijsten voor het paneel ("x van 15 gebruikt").
async function loadAccessCodesForSuperuser() {
    if (!isAccessSuperuser()) return [];
    const snap = await firebase.firestore().collection('accessCodes').get();
    return snap.docs.map(d => ({ code: d.id, ...d.data() }));
}

async function loadCodeAccessListForSuperuser() {
    codeAccessListCache = [];
    if (!isAccessSuperuser()) return [];
    const snap = await firebase.firestore().collection('codeAccess').get();
    codeAccessListCache = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    return codeAccessListCache;
}
// ===== einde familiecode-snippet =====
