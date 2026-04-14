/* NEXUS Firebase bridge (optional).
   - Reads role from existing Firebase access base (custom claims or users/{uid}.role).
   - Sets NEXUS role so all data-min-role gating works.
   - Exposes hook surface for saving and uploading (to be implemented as you wire pages).
*/
(function(){
  async function resolveRole(){
    // Prefer custom claims: token.claims.role
    try{
      const auth = window.firebaseAuth || (window.firebase && window.firebase.auth && window.firebase.auth());
      const user = auth && auth.currentUser;
      if(user && typeof user.getIdTokenResult === "function"){
        const token = await user.getIdTokenResult(true);
        const role = token && token.claims && token.claims.role;
        if(role) return String(role).toLowerCase();
      }
    }catch(e){}

    // Fallback: Firestore users/{uid}.role
    try{
      const auth = window.firebaseAuth || (window.firebase && window.firebase.auth && window.firebase.auth());
      const user = auth && auth.currentUser;
      const db = window.firebaseDb || (window.firebase && window.firebase.firestore && window.firebase.firestore());
      if(user && db && db.collection){
        const snap = await db.collection("users").doc(user.uid).get();
        const role = snap && snap.exists && snap.data && snap.data().role;
        if(role) return String(role).toLowerCase();
      }
    }catch(e){}

    return null;
  }

  async function syncRole(){
    if(!window.NEXUS || typeof window.NEXUS.setRole !== "function") return;
    const role = await resolveRole();
    if(role) window.NEXUS.setRole(role);
  }

  // Expose surface
  window.NEXUS_FIREBASE = window.NEXUS_FIREBASE || {};
  window.NEXUS_FIREBASE.syncRole = syncRole;

  // Placeholders to be implemented later (keep calls safe)
  window.NEXUS_FIREBASE.saveForm = window.NEXUS_FIREBASE.saveForm || (async function(eq, formType, payload){ return; });
  window.NEXUS_FIREBASE.uploadPackageToProcore = window.NEXUS_FIREBASE.uploadPackageToProcore || (async function(eq, blob, meta){ return; });

  // Listen for auth changes if available
  try{
    const auth = window.firebaseAuth || (window.firebase && window.firebase.auth && window.firebase.auth());
    if(auth && typeof auth.onAuthStateChanged === "function"){
      auth.onAuthStateChanged(function(){ syncRole(); });
    }else{
      // If auth loads later, user can call NEXUS_FIREBASE.syncRole()
      setTimeout(syncRole, 800);
    }
  }catch(e){}
})();