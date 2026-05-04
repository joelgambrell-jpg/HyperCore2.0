window.NexusLiveSync = (function () {
  let db = null;
  let activeUnsubscribe = null;
  let lastFirebaseData = null;

  function safeEq(eq) {
    return String(eq || "NO_EQ")
      .trim()
      .replace(/[.#$\[\]/]/g, "_") || "NO_EQ";
  }

  function getDb() {
    if (db) return db;

    if (window.firebaseDb) {
      db = window.firebaseDb;
      return db;
    }

    if (window.firebase && window.firebase.database) {
      db = window.firebase.database();
      return db;
    }

    return null;
  }

  function localKey(eq, section) {
    return "nexus_" + eq + "_" + section;
  }

  function saveLocal(eq, section, data) {
    try {
      localStorage.setItem(localKey(eq, section), JSON.stringify(data || {}));
    } catch (e) {}
  }

  async function save(eq, section, data) {
    const cleanEq = safeEq(eq);
    const payload = {
      ...(data || {}),
      updatedAt: new Date().toISOString()
    };

    saveLocal(cleanEq, section, payload);

    const database = getDb();
    if (!database) return payload;

    try {
      if (window.firebase && window.firebase.database) {
        await database.ref("nexus/equipment/" + cleanEq + "/" + section).set(payload);
      }
    } catch (e) {
      console.warn("NexusLiveSync Firebase save failed:", e);
    }

    return payload;
  }

  function listen(eq, callback) {
    const cleanEq = safeEq(eq);
    const database = getDb();

    if (activeUnsubscribe) {
      try { activeUnsubscribe(); } catch (e) {}
      activeUnsubscribe = null;
    }

    if (!database) {
      callback(null);
      return function () {};
    }

    try {
      const ref = database.ref("nexus/equipment/" + cleanEq);

      ref.on("value", function (snapshot) {
        lastFirebaseData = snapshot.val() || null;
        callback(lastFirebaseData);
      });

      activeUnsubscribe = function () {
        ref.off();
      };

      return activeUnsubscribe;
    } catch (e) {
      console.warn("NexusLiveSync Firebase listen failed:", e);
      callback(null);
      return function () {};
    }
  }

  function getLastFirebaseData() {
    return lastFirebaseData;
  }

  return {
    save,
    listen,
    getLastFirebaseData,
    safeEq
  };
})();
