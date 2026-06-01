/* =========================================================
   NEXUS Equipment Registry Engine
   Freeze-focused restore for index_equipment_registry.html
   - No UI feature additions
   - LocalStorage guarded reads/writes
   - BFCache/back-navigation safe
   - Firebase listener cleanup hooks
   ========================================================= */
(function(){
  "use strict";

  if (window.__NEXUS_EQUIPMENT_REGISTRY_ENGINE_LOADED__) return;
  window.__NEXUS_EQUIPMENT_REGISTRY_ENGINE_LOADED__ = true;

  const ROOT = window;
  const REGISTRY_KEY = "nexus_project_equipment";
  const ACTIVE_PROJECT_KEY = "nexus_active_project";
  const DEFAULT_PROJECT = "AWS CMH098";
  const MAX_ROWS = 5000;

  const state = {
    firebaseUnsubs: [],
    lastRegistryJson: "",
    lastRegistryRows: null,
    progressCache: Object.create(null),
    progressCacheAt: 0,
    destroyed: false
  };

  function now(){ return Date.now(); }
  function txt(v){ return (v == null ? "" : String(v)).trim(); }

  function safeParse(raw, fallback){
    if (!raw) return fallback;
    try { return JSON.parse(raw); }
    catch(e){ return fallback; }
  }

  function readStorage(key, fallback){
    try { return localStorage.getItem(key); }
    catch(e){ return fallback == null ? null : fallback; }
  }

  function writeStorage(key, value){
    try {
      const current = localStorage.getItem(key);
      if (current === value) return true;
      localStorage.setItem(key, value);
      return true;
    } catch(e){
      console.warn("NEXUS registry storage write failed:", key, e);
      return false;
    }
  }

  function removeStorage(key){
    try { localStorage.removeItem(key); return true; }
    catch(e){ return false; }
  }

  function normalizeRow(row){
    row = row || {};
    const eq = txt(row.eq || row.id || row.equipmentId || row.name);
    if (!eq) return null;
    return {
      ...row,
      eq,
      type: txt(row.type || row.equipmentType || "equipment"),
      building: txt(row.building || row.bldg || ""),
      phase: txt(row.phase || ""),
      pod: txt(row.pod || ""),
      project: txt(row.project || getActiveProject()),
      updatedAt: row.updatedAt || now()
    };
  }

  function readRegistry(){
    const raw = readStorage(REGISTRY_KEY, "[]") || "[]";
    if (raw === state.lastRegistryJson && state.lastRegistryRows) return state.lastRegistryRows.slice();

    let rows = safeParse(raw, []);
    if (!Array.isArray(rows)) rows = [];
    rows = rows.map(normalizeRow).filter(Boolean).slice(0, MAX_ROWS);

    state.lastRegistryJson = raw;
    state.lastRegistryRows = rows;
    return rows.slice();
  }

  function writeRegistry(rows){
    const normalized = (Array.isArray(rows) ? rows : []).map(normalizeRow).filter(Boolean).slice(0, MAX_ROWS);
    normalized.sort((a,b)=> String(a.eq).localeCompare(String(b.eq), undefined, { numeric:true, sensitivity:"base" }));
    const json = JSON.stringify(normalized);
    const ok = writeStorage(REGISTRY_KEY, json);
    if (ok){
      state.lastRegistryJson = json;
      state.lastRegistryRows = normalized;
    }
    return ok;
  }

  function getActiveProject(){
    return txt(readStorage(ACTIVE_PROJECT_KEY, "")) || DEFAULT_PROJECT;
  }

  function setActiveProject(project){
    const value = txt(project) || DEFAULT_PROJECT;
    writeStorage(ACTIVE_PROJECT_KEY, value);
    return value;
  }

  function listByProject(project){
    const p = txt(project || getActiveProject());
    return readRegistry().filter(row => !p || !row.project || row.project === p);
  }

  function getEquipment(eq){
    const id = txt(eq);
    if (!id) return null;
    return readRegistry().find(row => row.eq === id) || null;
  }

  function upsertEquipment(input){
    const row = normalizeRow(input);
    if (!row) return null;

    const rows = readRegistry();
    const idx = rows.findIndex(r => r.eq === row.eq);
    const merged = idx >= 0 ? { ...rows[idx], ...row, updatedAt: now() } : { ...row, createdAt: row.createdAt || now(), updatedAt: now() };

    if (idx >= 0) rows[idx] = merged;
    else rows.push(merged);

    writeRegistry(rows);
    return merged;
  }

  function deleteEquipment(eq){
    const id = txt(eq);
    if (!id) return false;
    const rows = readRegistry().filter(row => row.eq !== id);
    return writeRegistry(rows);
  }

  function metaKey(eq){ return `nexus_meta_${txt(eq) || "NO_EQ"}`; }

  function readMeta(eq){
    return safeParse(readStorage(metaKey(eq), "{}"), {}) || {};
  }

  function hydrateMetaToRegistry(eq){
    const id = txt(eq);
    if (!id) return null;
    const meta = readMeta(id);
    return upsertEquipment({
      eq: id,
      type: txt(meta.equipmentType || meta.type || "transformer"),
      building: txt(meta.building || ""),
      phase: txt(meta.phase || ""),
      pod: txt(meta.pod || ""),
      project: getActiveProject(),
      status: { mapped:true, needsReview:false, readyToPublish:true }
    });
  }

  function clearProgressCache(){
    state.progressCache = Object.create(null);
    state.progressCacheAt = 0;
  }

  function hasAnyProgress(eq){
    const id = txt(eq);
    if (!id) return false;
    const cacheKey = id;
    const t = now();
    if (state.progressCacheAt && (t - state.progressCacheAt) < 2000 && cacheKey in state.progressCache){
      return !!state.progressCache[cacheKey];
    }

    let found = false;
    try {
      const exact = [
        `nexus_${id}_ccs_signed_off`,
        `nexus_${id}_torque_photo`,
        `nexus_${id}_equipmentType_unlock`
      ];
      for (const k of exact){
        if (localStorage.getItem(k) === "1" || localStorage.getItem(k)){ found = true; break; }
      }
      if (!found){
        const prefixes = [
          `nexus_${id}_step_`,
          `nexus_${id}_torque_`,
          `nexus_${id}_meg_`,
          `nexus_${id}_prefod_`,
          `nexus_${id}_rif_`,
          `nexus_${id}_l2_`
        ];
        const len = Math.min(localStorage.length, 3000);
        for (let i = 0; i < len && !found; i++){
          const k = localStorage.key(i) || "";
          for (const p of prefixes){
            if (k.indexOf(p) === 0){ found = true; break; }
          }
        }
      }
    } catch(e){
      found = false;
    }

    state.progressCache[cacheKey] = found;
    state.progressCacheAt = t;
    return found;
  }

  function registerFirebaseUnsub(fn){
    if (typeof fn === "function") state.firebaseUnsubs.push(fn);
    return fn;
  }

  function cleanup(){
    state.destroyed = true;
    while (state.firebaseUnsubs.length){
      const fn = state.firebaseUnsubs.pop();
      try { fn(); } catch(e){}
    }
    clearProgressCache();
  }

  function onPageShow(evt){
    state.destroyed = false;
    if (evt && evt.persisted){
      clearProgressCache();
      ROOT.__NEXUS_REGISTRY_BFCACHE_RESTORED__ = true;
      setTimeout(function(){
        try { document.dispatchEvent(new CustomEvent("nexus:registry:bfcache-restore")); } catch(e){}
      }, 0);
    }
  }

  ROOT.addEventListener("pagehide", cleanup, { capture:true });
  ROOT.addEventListener("beforeunload", cleanup, { capture:true });
  ROOT.addEventListener("pageshow", onPageShow, { capture:true });
  ROOT.addEventListener("storage", function(evt){
    if (!evt || evt.key === REGISTRY_KEY || (evt.key || "").indexOf("nexus_") === 0){
      state.lastRegistryJson = "";
      state.lastRegistryRows = null;
      clearProgressCache();
    }
  });

  ROOT.NEXUS_REGISTRY = {
    getActiveProject,
    setActiveProject,
    listByProject,
    getEquipment,
    upsertEquipment,
    deleteEquipment,
    hydrateMetaToRegistry,
    hasAnyProgress,
    registerFirebaseUnsub,
    cleanup,
    _safeReadRegistry: readRegistry,
    _version: "freeze-fix-2026-06-01"
  };

  ROOT.__NEXUS_REGISTRY_SAFETY_PATCH_LOADED__ = true;
  ROOT.__NEXUS_REGISTRY_BACK_NAVIGATION_FIX_LOADED__ = true;
})();
