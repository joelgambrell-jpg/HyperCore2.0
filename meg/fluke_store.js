/* meg/fluke_store.js (FULL DROP-IN)
   Storage for Fluke-imported megohmmeter sessions.
   - localStorage key: nexus.meg.fluke.sessions.v1
   - mapping key: nexus.meg.fluke.mapping.v1
   Firebase-ready hook: window.NEXUS_FirebaseBridge may later mirror the write.
*/
(function(){
  "use strict";

  const STORE_KEY = "nexus.meg.fluke.sessions.v1";
  const MAP_KEY = "nexus.meg.fluke.mapping.v1";

  function safeJsonParse(raw, fallback){
    try{
      const v = JSON.parse(raw);
      return (v == null ? fallback : v);
    }catch(e){
      return fallback;
    }
  }

  function loadAll(){
    const arr = safeJsonParse(localStorage.getItem(STORE_KEY) || "[]", []);
    return Array.isArray(arr) ? arr : [];
  }

  function saveAll(arr){
    localStorage.setItem(STORE_KEY, JSON.stringify(arr || []));
    // Firebase-ready hook (no-op if not implemented)
    try{
      if (window.NEXUS_FirebaseBridge && typeof window.NEXUS_FirebaseBridge.write === "function"){
        // optional: mirror write
        // window.NEXUS_FirebaseBridge.write(`meg/fluke/sessions`, arr);
      }
    }catch(e){}
  }

  function makeId(){
    return "fluke_" + Date.now() + "_" + Math.random().toString(16).slice(2);
  }

  function upsertSession(session){
    const all = loadAll();
    const s = session && typeof session === "object" ? session : {};
    if (!s.id) s.id = makeId();
    if (!s.createdAt) s.createdAt = new Date().toISOString();

    const idx = all.findIndex(x => x && x.id === s.id);
    if (idx >= 0) all[idx] = s;
    else all.unshift(s);

    saveAll(all);
    return s.id;
  }

  function listSessionsFor(eq){
    const all = loadAll();
    const eqTrim = String(eq||"").trim();
    return all.filter(s => {
      if (!s || typeof s !== "object") return false;
      if (!eqTrim) return true;
      return String(s.equipmentId||"").trim() === eqTrim;
    });
  }

  function clearAll(){
    localStorage.removeItem(STORE_KEY);
  }

  function loadMapping(){
    const m = safeJsonParse(localStorage.getItem(MAP_KEY) || "{}", {});
    return (m && typeof m === "object") ? m : {};
  }

  function saveMapping(map){
    localStorage.setItem(MAP_KEY, JSON.stringify(map || {}));
  }

  function clearMapping(){
    localStorage.removeItem(MAP_KEY);
  }

  window.NEXUS_FlukeStore = {
    STORE_KEY,
    MAP_KEY,
    loadAll,
    saveAll,
    upsertSession,
    listSessionsFor,
    clearAll,
    loadMapping,
    saveMapping,
    clearMapping
  };
})();
