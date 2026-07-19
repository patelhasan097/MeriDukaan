/* MERI DUKAAN v8 — Global State */
var AppState = {
  firebaseUser: null, bizId: null, isOwner: false,
  businessName: 'My Business', ownerEmail: '',
  upiVpa: '', weekStart: 1, memberEmails: [],
  allSales: [], allExpenses: [], allCustomers: [],
  allCreditPayments: [], allNotes: [], allWaste: [],
  currentScreen: 'loginScreen',
  isOnline: navigator.onLine,
  dataLoading: true
};

function canModify() { return AppState.isOwner; }
function requireBizId() {
  if (!AppState.bizId) throw new Error('Not authenticated');
  return AppState.bizId;
}
