/* NEXUS Snap-on torque storage (localStorage) */

(function () {
  const STORAGE_KEY = "nexus.torque.sessions.v1";

  function safeJsonParse(s) {
    try { return JSON.parse(s); } catch { return null; }
  }

  function loadAll() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = safeJsonParse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }

  function saveAll(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function normalizeText(v) {
    return String(v || "").trim();
  }

  function upsertSession(session) {
    const list = loadAll();
    const s = Object.assign({}, session || {});

    if (!s.id) s.id = uuid();
    if (!s.createdAt) s.createdAt = new Date().toISOString();

    const idx = list.findIndex(function (item) {
      return item && normalizeText(item.id) === normalizeText(s.id);
    });

    if (idx >= 0) {
      list[idx] = s;
    } else {
      list.push(s);
    }

    saveAll(list);
    return s;
  }

  function listSessions(jobId, equipmentId) {
    const list = loadAll();
    const wantedJob = normalizeText(jobId);
    const wantedEq = normalizeText(equipmentId);

    return list
      .filter(function (s) {
        if (!s) return false;

        const sameEq = normalizeText(s.equipmentId) === wantedEq;
        if (!sameEq) return false;

        if (!wantedJob) return true;

        return normalizeText(s.jobId) === wantedJob;
      })
      .sort(function (a, b) {
        return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      });
  }

  function getLatestSession(jobId, equipmentId) {
    const sessions = listSessions(jobId, equipmentId);
    return sessions.length ? sessions[0] : null;
  }

  // expose
  window.NEXUS_SNAPON_STORE = {
    STORAGE_KEY,
    loadAll,
    saveAll,
    upsertSession,
    listSessions,
    getLatestSession,
    uuid,
  };
})();
