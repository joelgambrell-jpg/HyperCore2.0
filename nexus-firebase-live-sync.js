window.NexusLiveSync = (function () {
  let activeUnsubscribe = null;
  let lastFirebaseData = null;

  function safeEq(eq) {
    return String(eq || "NO_EQ")
      .trim()
      .replace(/[.#$[\]/]/g, "_") || "NO_EQ";
  }

  function getFirestore() {
    if (window.NEXUS_FB && window.NEXUS_FB.db) {
      return window.NEXUS_FB.db;
    }

    if (window.firebase && window.firebase.firestore) {
      return window.firebase.firestore();
    }

    return null;
  }

  function docRef(eq, section) {
  const db = getFirestore();
  if (!db) return null;

  const cleanEq = safeEq(eq);
  const cleanSection = String(section || "default")
    .trim()
    .replace(/[.#$[\]/]/g, "_") || "default";

  return db
    .collection("hypercore")
    .doc("equipment")
    .collection("items")
    .doc(cleanEq)
    .collection("sections")
    .doc(cleanSection);
}

  function localKey(eq, section) {
    return "hypercore_" + safeEq(eq) + "_" + section;
  }

  function saveLocal(eq, section, data) {
    try {
      localStorage.setItem(localKey(eq, section), JSON.stringify(data || {}));
    } catch (e) {}
  }

  function loadLocal(eq, section) {
    try {
      const raw = localStorage.getItem(localKey(eq, section));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  async function save(eq, section, data) {
    const cleanEq = safeEq(eq);

    const payload = {
      ...(data || {}),
      updatedAt: new Date().toISOString()
    };

    saveLocal(cleanEq, section, payload);

    const ref = docRef(cleanEq, section);
    if (!ref) return payload;

    try {
      await ref.set(
        {
          ...payload,
          section,
          equipmentId: cleanEq,
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
    } catch (e) {
      console.warn("NexusLiveSync Firestore save failed:", e);
    }

    return payload;
  }

  async function load(eq, section) {
    const cleanEq = safeEq(eq);
    const ref = docRef(cleanEq, section);

    if (!ref) {
      return loadLocal(cleanEq, section);
    }

    try {
      const snap = await ref.get();
      const sectionData = snap.exists ? snap.data() : null;
      
      if (sectionData) {
        saveLocal(cleanEq, section, sectionData);
        return sectionData;
      }
    } catch (e) {
      console.warn("NexusLiveSync Firestore load failed:", e);
    }

    return loadLocal(cleanEq, section);
  }

  function listen(eq, callback) {
    const cleanEq = safeEq(eq);
    const ref = docRef(cleanEq, "default");

    if (activeUnsubscribe) {
      try { activeUnsubscribe(); } catch (e) {}
      activeUnsubscribe = null;
    }

    if (!ref) {
      callback(null);
      return function () {};
    }

    try {
      activeUnsubscribe = ref.onSnapshot(function (snap) {
        lastFirebaseData = snap.exists ? snap.data() : null;
        callback(lastFirebaseData);
      });

      return activeUnsubscribe;
    } catch (e) {
      console.warn("NexusLiveSync Firestore listen failed:", e);
      callback(null);
      return function () {};
    }
  }

  function getLastFirebaseData() {
    return lastFirebaseData;
  }

  return {
    save,
    load,
    listen,
    getLastFirebaseData,
    safeEq
  };
})();
