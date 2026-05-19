(function () {
  "use strict";

  function noopAsync() {
    return Promise.resolve(null);
  }

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function getAuth() {
    try {
      return window.firebaseAuth ||
        (window.firebase && window.firebase.auth && window.firebase.auth()) ||
        null;
    } catch (e) {
      return null;
    }
  }

  function getDb() {
    try {
      return window.firebaseDb ||
        (window.firebase && window.firebase.firestore && window.firebase.firestore()) ||
        null;
    } catch (e) {
      return null;
    }
  }

  async function getCurrentUser() {
    try {
      const auth = getAuth();
      return auth && auth.currentUser ? auth.currentUser : null;
    } catch (e) {
      return null;
    }
  }

  async function resolveRole() {
    try {
      const user = await getCurrentUser();
      if (user && typeof user.getIdTokenResult === "function") {
        const token = await user.getIdTokenResult(true);
        const role = token && token.claims && token.claims.role;
        if (role) return safeText(role).toLowerCase();
      }
    } catch (e) {}

    try {
      const user = await getCurrentUser();
      const db = getDb();
      if (user && db && db.collection) {
        const snap = await db.collection("users").doc(user.uid).get();
        const data = snap && snap.exists && typeof snap.data === "function" ? snap.data() : null;
        const role = data && data.role;
        if (role) return safeText(role).toLowerCase();
      }
    } catch (e) {}

    return null;
  }

  async function getUserProfile() {
    try {
      const user = await getCurrentUser();
      if (!user) return null;

      let role = null;
      try {
        role = await resolveRole();
      } catch (e) {}

      const profile = {
        uid: safeText(user.uid),
        email: safeText(user.email),
        displayName: safeText(user.displayName || user.email || "Unknown User"),
        role: safeText(role || "viewer").toLowerCase()
      };

      try {
        localStorage.setItem("nexus_current_user", JSON.stringify(profile));
        localStorage.setItem("nexus_user_profile", JSON.stringify(profile));
      } catch (e) {}

      return profile;
    } catch (e) {
      return null;
    }
  }

  async function syncRole() {
    try {
      if (!window.NEXUS || typeof window.NEXUS.setRole !== "function") return null;
      const role = await resolveRole();
      if (role) {
        window.NEXUS.setRole(role);
        return role;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function normalizeDocKey(eq, formType) {
    const equipment = safeText(eq) || "NO_EQ";
    const form = safeText(formType) || "unknown";
    return `equipment/${equipment}/forms/${form}`;
  }

  async function save(key, payload) {
    try {
      const db = getDb();
      if (!db) return false;

      if (db.doc && typeof db.doc === "function") {
        await db.doc(key).set(payload, { merge: true });
        return true;
      }

      if (db.collection && typeof db.collection === "function") {
        const parts = String(key).split("/").filter(Boolean);
        if (parts.length >= 2) {
          let ref = db.collection(parts[0]).doc(parts[1]);
          let i = 2;
          while (i < parts.length) {
            if (i === parts.length - 1) {
              ref = ref.collection("_docs").doc(parts[i]);
              break;
            }
            ref = ref.collection(parts[i]).doc(parts[i + 1] || "_root");
            i += 2;
          }
          await ref.set(payload, { merge: true });
          return true;
        }
      }
    } catch (e) {
      console.warn("NEXUS_FIREBASE.save failed:", e);
    }
    return false;
  }

  async function load(key) {
    try {
      const db = getDb();
      if (!db) return null;

      if (db.doc && typeof db.doc === "function") {
        const snap = await db.doc(key).get();
        if (snap && snap.exists) return snap.data();
      }
    } catch (e) {
      console.warn("NEXUS_FIREBASE.load failed:", e);
    }
    return null;
  }

  async function write(key, payload) {
    return save(key, payload);
  }

  async function set(key, payload) {
    return save(key, payload);
  }

  async function docSet(key, payload) {
    return save(key, payload);
  }

  async function get(key) {
    return load(key);
  }

  async function read(key) {
    return load(key);
  }

  async function docGet(key) {
    return load(key);
  }

  async function saveForm(eq, formType, payload) {
    try {
      const key = normalizeDocKey(eq, formType);
      const profile = await getUserProfile();

      const doc = Object.assign({}, payload || {}, {
        _meta: Object.assign({}, (payload && payload._meta) || {}, {
          eq: safeText(eq),
          formType: safeText(formType),
          savedAt: new Date().toISOString(),
          savedBy: profile ? profile.displayName : "",
          savedByEmail: profile ? profile.email : "",
          savedByRole: profile ? profile.role : ""
        })
      });

      return await save(key, doc);
    } catch (e) {
      console.warn("NEXUS_FIREBASE.saveForm failed:", e);
      return false;
    }
  }

  async function uploadPackageToProcore(eq, blob, meta) {
    console.warn("NEXUS_FIREBASE.uploadPackageToProcore is not implemented yet.", {
      eq: eq,
      meta: meta || {},
      hasBlob: !!blob
    });
    return null;
  }

  window.NEXUS_FIREBASE = window.NEXUS_FIREBASE || {};
  window.NEXUS_FIREBASE.syncRole = syncRole;
  window.NEXUS_FIREBASE.getUserProfile = getUserProfile;

  window.NEXUS_FIREBASE.save = save;
  window.NEXUS_FIREBASE.set = set;
  window.NEXUS_FIREBASE.write = write;
  window.NEXUS_FIREBASE.docSet = docSet;

  window.NEXUS_FIREBASE.load = load;
  window.NEXUS_FIREBASE.get = get;
  window.NEXUS_FIREBASE.read = read;
  window.NEXUS_FIREBASE.docGet = docGet;

  window.NEXUS_FIREBASE.saveForm = window.NEXUS_FIREBASE.saveForm || saveForm;
  window.NEXUS_FIREBASE.uploadPackageToProcore = window.NEXUS_FIREBASE.uploadPackageToProcore || uploadPackageToProcore;

  try {
    const auth = getAuth();
    if (auth && typeof auth.onAuthStateChanged === "function") {
      auth.onAuthStateChanged(async function () {
        await syncRole();
        await getUserProfile();
      });
    } else {
      setTimeout(async function () {
        await syncRole();
        await getUserProfile();
      }, 800);
    }
  } catch (e) {}

  try {
    window.nexusFirebaseBridge = window.NEXUS_FIREBASE;
    window.nexusFirebase = window.NEXUS_FIREBASE;
    window.NEXUS_FB = window.NEXUS_FB || {};
    window.NEXUS_FB.auth = getAuth();
    window.NEXUS_FB.db = getDb();
  } catch (e) {}
})();
