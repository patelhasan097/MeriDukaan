/* ================================================
   MERI DUKAAN v5.0 — DATABASE & SYNC ENGINE
   Real-time Firestore, Offline Fallbacks & CRUD
   ================================================ */

// ============ AUTHENTICATION HANDLER ============
async function handleAuthenticated(user) {
    currentUser = user;
    
    try {
        // 1. Check if user is the OWNER
        const ownerSnap = await fdb.collection('businesses')
            .where('ownerUid', '==', user.uid)
            .get(); // Smart fetch: tries server first, falls back to cache

        if (!ownerSnap.empty) {
            businessId = ownerSnap.docs[0].id;
            userRole = 'owner';
        } else {
            // 2. Check if user is a TEAM MEMBER (Staff/Admin)
            const memberSnap = await fdb.collection('businesses')
                .where('memberEmails', 'array-contains', user.email.toLowerCase())
                .get();

            if (!memberSnap.empty) {
                businessId = memberSnap.docs[0].id;
                const bData = memberSnap.docs[0].data();
                const member = (bData.members || []).find(m => m.email.toLowerCase() === user.email.toLowerCase());
                userRole = member ? member.role : 'staff';
            } else {
                // 3. New User — Create Business Profile
                businessId = user.uid;
                await fdb.collection('businesses').doc(businessId).set({
                    ownerUid: user.uid,
                    ownerEmail: user.email,
                    ownerName: user.displayName || 'Owner',
                    ownerPhoto: user.photoURL || '',
                    pin: '',
                    members: [],
                    memberEmails: [],
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                userRole = 'owner';
            }
        }

        // Setup References & Listeners
        businessRef = fdb.collection('businesses').doc(businessId);
        localStorage.setItem('mdBusinessId', businessId);
        setupListeners();

        // Check PIN Security
        const bizDoc = await businessRef.get();
        const bizData = bizDoc.data();

        if (!bizData.pin) {
            // First time PIN setup
            initPinSetup();
        } else {
            localStorage.setItem('mdPin', bizData.pin);
            initPinLogin(user);
        }

    } catch (err) {
        console.error('[Auth/DB] Setup error:', err);

        // ★ BUG FIX: Robust Offline Login Fallback for Staff & Owners
        const cachedBizId = localStorage.getItem('mdBusinessId');
        const cachedPin = localStorage.getItem('mdPin');

        if (cachedBizId && cachedPin) {
            businessId = cachedBizId;
            businessRef = fdb.collection('businesses').doc(businessId);
            setupListeners();
            initPinLogin(user, true); // True = Offline mode flag
            showToast('Working from local offline cache', 'error');
        } else {
            showToast('Internet required for first-time login', 'error');
            const btn = document.getElementById('googleBtn');
            if (btn) btnLoading(btn, false);
            goTo('loginScreen');
        }
    }
}


// ============ REAL-TIME LISTENERS (SYNC) ============
function setupListeners() {
    unsubscribers.forEach(u => u());
    unsubscribers = [];
    if (!businessRef) return;

    // 1. Customers
    unsubscribers.push(
        businessRef.collection('customers').orderBy('name').onSnapshot(snap => {
            allCustomers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (isScreenActive('customerScreen') && typeof loadCusts === 'function') loadCusts();
            if (isScreenActive('quickSaleScreen') && typeof loadQuickSale === 'function') loadQuickSale();
        })
    );

    // 2. Sales
    unsubscribers.push(
        businessRef.collection('sales').onSnapshot(snap => {
            allSales = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (isScreenActive('salesScreen') && typeof loadSales === 'function') loadSales();
            if (isScreenActive('dashboardScreen') && typeof refreshDash === 'function') refreshDash();
            if (isScreenActive('quickSaleScreen') && typeof loadQuickSale === 'function') loadQuickSale();
            if (isScreenActive('creditScreen') && typeof loadCredit === 'function') loadCredit();
        })
    );

    // 3. Expenses
    unsubscribers.push(
        businessRef.collection('expenses').onSnapshot(snap => {
            allExpenses = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (isScreenActive('expenseScreen') && typeof loadExps === 'function') loadExps();
            if (isScreenActive('dashboardScreen') && typeof refreshDash === 'function') refreshDash();
        })
    );

    // 4. Waste
    unsubscribers.push(
        businessRef.collection('waste').onSnapshot(snap => {
            allWaste = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (isScreenActive('wasteScreen') && typeof loadWasteList === 'function') loadWasteList();
            if (isScreenActive('dashboardScreen') && typeof refreshDash === 'function') refreshDash();
        })
    );

    // 5. Credit Payments
    unsubscribers.push(
        businessRef.collection('creditPayments').onSnapshot(snap => {
            allCreditPayments = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (isScreenActive('creditScreen') && typeof loadCredit === 'function') loadCredit();
            if (isScreenActive('dashboardScreen') && typeof refreshDash === 'function') refreshDash();
        })
    );
}


// ============ FIRESTORE CRUD WRAPPERS ============
function fsAdd(col, data) {
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    data.createdBy = currentUser ? currentUser.email : '';
    return businessRef.collection(col).add(data);
}

function fsUpdate(col, docId, data) {
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    data.updatedBy = currentUser ? currentUser.email : '';
    return businessRef.collection(col).doc(docId).update(data);
}

function fsDelete(col, docId) {
    return businessRef.collection(col).doc(docId).delete();
}

function canModify() {
    return userRole !== 'staff';
}