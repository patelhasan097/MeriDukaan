/* ================================================
   MERI DUKAAN v5.0 — MAIN APPLICATION BOOTSTRAP
   Initialization, Global Events & Settings
   ================================================ */

function startApp() {
    console.log('%c🫓 Meri Dukaan V5 Premium %c Cloud-powered Manager ', 
        'background:#e65100;color:white;padding:8px;border-radius:8px 0 0 8px;font-weight:bold;', 
        'background:#121217;color:white;padding:8px;border-radius:0 8px 8px 0;');

    applyTheme();
    updateOfflineBanner();

    let splashDone = false;
    let authReady = false;
    let pendingUser = null;

    function proceed() {
        if (!splashDone || !authReady) return;

        if (pendingUser) {
            handleAuthenticated(pendingUser); // Found in db.js
        } else {
            goTo('loginScreen');
        }
    }

    // Minimum Splash duration (1.2s)
    setTimeout(() => { splashDone = true; proceed(); }, 1200);

    // Auth State Observer
    auth.onAuthStateChanged(user => {
        pendingUser = user;
        authReady = true;
        proceed();
    });
}

// Global UI Interactivity Handlers
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        const overlay = document.querySelector('.overlay.active');
        const bts = document.querySelector('.bts.active');
        if (overlay) closeOverlay(overlay.id);
        if (bts) bts.classList.remove('active');
        hideConfirm();
    }
});

// Launch!
window.onload = startApp;