/* ================================================
   MERI DUKAAN v5.0 — CONFIG & FIREBASE ENGINE
   Fixes: Auth Redirect Bug, Offline Persistence
   ================================================ */

// ============ FIREBASE INIT ============
const firebaseConfig = {
    apiKey: "AIzaSyAXqAvTLGfjwEniREFH7AHJ_rgLRAiS7SM",
    authDomain: "meridukaan-5beaf.firebaseapp.com",
    projectId: "meridukaan-5beaf",
    storageBucket: "meridukaan-5beaf.firebasestorage.app",
    messagingSenderId: "286377172046",
    appId: "1:286377172046:web:5bc0334b0230299e71771f"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const fdb = firebase.firestore();

// ★ BUG FIX: Resolving Firestore Multi-Tab Warning & Offline Issues
fdb.settings({
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
    ignoreUndefinedProperties: true 
});

fdb.enablePersistence({ synchronizeTabs: true }).catch(function(err) {
    if (err.code === 'failed-precondition') {
        console.warn('[DB] Multiple tabs open, offline limited to 1 tab.');
    } else if (err.code === 'unimplemented') {
        console.warn('[DB] Offline persistence not supported in this browser.');
    }
});

// ============ GLOBAL STATE ============
let currentUser = null;
let businessId = null;
let businessRef = null;
let userRole = 'owner';
let allCustomers = [];
let allSales = [];
let allExpenses = [];
let allWaste = [];
let allCreditPayments = [];
let unsubscribers = [];
let currentPeriod = 'today';
let curReport = 'daily';
let rptData = {};
let currentTheme = localStorage.getItem('mdTheme') || 'auto';

// Security Lock
let pinAttempts = 0;
let pinLockUntil = 0;


// ============ AUTH BUG FIX ENGINE ============
// ★ BUG FIX: Solving "Missing Initial State" SAML SSO Error
function googleSignIn() {
    const btn = document.getElementById('googleBtn');
    if (btn) btnLoading(btn, true);

    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' }); // Forces account selection

    const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

    // Use Popup first. It avoids the storage-partitioning bug completely.
    auth.signInWithPopup(provider).catch(error => {
        console.warn('[Auth] Popup failed, trying redirect...', error);
        
        // If popup is blocked by browser, only THEN use redirect
        if (error.code === 'auth/popup-blocked' || isPWA) {
            auth.signInWithRedirect(provider);
        } else if (error.code !== 'auth/popup-closed-by-user') {
            showToast('Authentication failed. Check internet.', 'error');
            if (btn) btnLoading(btn, false);
        } else {
            if (btn) btnLoading(btn, false); // User closed popup
        }
    });
}

function signOutAndLogin() {
    unsubscribers.forEach(u => u());
    unsubscribers = [];
    auth.signOut().then(() => {
        currentUser = null; businessId = null; businessRef = null;
        localStorage.removeItem('mdPin');
        goTo('loginScreen');
    });
}