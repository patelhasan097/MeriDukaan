/* ================================================
   MERI DUKAAN v8 — FIREBASE CONFIG
   ⚠️  APNA CONFIG YAHAN DAALO:
   Firebase Console → Project Settings → General
   → Your apps → Config
   ================================================ */
var FIREBASE_CONFIG = {
  apiKey: "AIzaSyAXqAvTLGfjwEniREFH7AHJ_rgLRAiS7SM",
  authDomain: "meridukaan-5beaf.firebaseapp.com",
  projectId: "meridukaan-5beaf",
  storageBucket: "meridukaan-5beaf.firebasestorage.app",
  messagingSenderId: "286377172046",
  appId: "1:286377172046:web:5bc0334b0230299e71771f"
};

/* FCM ke liye (optional - push notifications):
   Firebase Console → Project Settings → Cloud Messaging
   → Web Push certificates → Generate key pair           */
var VAPID_KEY = "BDFvXXBbGkmcVGf2SWnE-54Kn6thC7KPW9s1UNt86r1r71GGxs7jKweCDHAulXzBdj1D3j24GnbOxcmpWQY5RWU";

/* ── Firebase Init ── */
firebase.initializeApp(FIREBASE_CONFIG);
var auth = firebase.auth();
var db   = firebase.firestore();

db.enablePersistence({synchronizeTabs:true}).catch(function(err){
  console.warn('[DB] Persistence:', err.code);
});

/* ── Firestore Helpers ── */
function bizCol(col) {
  return db.collection('businesses').doc(AppState.bizId).collection(col);
}
function bizDoc(col, id) {
  return db.collection('businesses').doc(AppState.bizId).collection(col).doc(id);
}
function bizRef() {
  return db.collection('businesses').doc(AppState.bizId);
}
function batchWrite() {
  return db.batch();
}

function fsAdd(col, data) {
  data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
  return withRetry(function(){ return bizCol(col).add(data); });
}
function fsUpdate(col, id, data) {
  return withRetry(function(){ return bizDoc(col,id).update(data); });
}
function fsDelete(col, id) {
  return withRetry(function(){ return bizDoc(col,id).delete(); });
}
function fsBizSet(data, opts) {
  return withRetry(function(){ return bizRef().set(data, opts||{merge:true}); });
}
function serverTimestamp() {
  return firebase.firestore.FieldValue.serverTimestamp();
}
