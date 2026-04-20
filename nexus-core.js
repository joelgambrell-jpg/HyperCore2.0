(function () {
  "use strict";

  const ROLE_KEY = "nexus_role";
  const STATUS_KEY = "nexus_session_status";
  const VALID_ROLES = ["viewer", "tech", "qcx", "foreman", "superintendent", "admin"];

  function safeText(value) {
    return String(value == null ? "" : value);
  }

  function readText(key, fallback = "") {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function writeText(key, value) {
    try {
      localStorage.setItem(key, safeText(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function removeKey(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      return false;
    }
  }

  function readJSON(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function getQs() {
    try {
      return new URLSearchParams(window.location.search || "");
    } catch (e) {
      return new URLSearchParams("");
    }
  }

  function getEq() {
    const qs = getQs();
    const fromUrl = safeText(qs.get("eq")).trim();
    if (fromUrl) return fromUrl;

    const candidates = [
      "nexus_active_eq",
      "nexus_current_eq",
      "nexus_selected_eq",
      "nexus_eq",
      "eq"
    ];

    for (const key of candidates) {
      const v = safeText(readText(key, "")).trim();
      if (v) return v;
    }

    return "";
  }

  function persistEq(eq) {
    const value = safeText(eq).trim();
    if (!value) return;

    ["nexus_active_eq","nexus_current_eq","nexus_selected_eq","nexus_eq","eq"]
      .forEach(k => writeText(k, value));
  }

  function normalizeRole(role) {
    const value = safeText(role).trim().toLowerCase();
    return VALID_ROLES.includes(value) ? value : "viewer";
  }

  function getRole() {
    return normalizeRole(readText(ROLE_KEY, "viewer"));
  }

  function setRole(role) {
    const value = normalizeRole(role);
    writeText(ROLE_KEY, value);
    syncRoleSelects(value);
    updateSessionBanner();
    return value;
  }

  function getStatus() {
    return safeText(readText(STATUS_KEY, "Ready")) || "Ready";
  }

  function setStatus(text) {
    const value = safeText(text) || "Ready";
    writeText(STATUS_KEY, value);
    updateSessionBanner();
    return value;
  }

  function stepKey(stepId, eq) {
    const equipment = safeText(eq || getEq()) || "NO_EQ";
    return `nexus_${equipment}_step_${safeText(stepId)}`;
  }

  function isStepComplete(stepId, eq) {
    return readText(stepKey(stepId, eq)) === "1";
  }

  function setStepComplete(stepId, done, eq) {
    const key = stepKey(stepId, eq);
    if (done) writeText(key, "1");
    else removeKey(key);
    return !!done;
  }

  function ccsSignedKey(eq) {
    const equipment = safeText(eq || getEq()) || "NO_EQ";
    return `nexus_${equipment}_ccs_signed_off`;
  }

  function isCcsSigned(eq) {
    return readText(ccsSignedKey(eq)) === "1";
  }

  function setCcsSigned(done, eq) {
    const key = ccsSignedKey(eq);
    if (done) writeText(key, "1");
    else removeKey(key);
    return !!done;
  }

  function getEqUrl(path, eq) {
    const equipment = safeText(eq || getEq());
    const url = new URL(path, location.href);
    if (equipment) url.searchParams.set("eq", equipment);
    return url.pathname.split("/").pop() + url.search;
  }

  function back() {
    try {
      if (document.referrer && document.referrer.includes(location.host)) {
        history.back();
        return false;
      }
    } catch(e){}

    const eq = getEq();
    location.href = eq ? `equipment.html?eq=${encodeURIComponent(eq)}` : "equipment.html";
    return false;
  }

  function forceEqOnLinks(root) {
    const eq = getEq();
    if (!eq) return;

    (root || document).querySelectorAll("a[href]").forEach(a=>{
      let href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("http")) return;

      try {
        const url = new URL(href, location.href);
        if (!url.searchParams.get("eq")) {
          url.searchParams.set("eq", eq);
          a.href = url.pathname.split("/").pop() + url.search;
        }
      } catch(e){}
    });
  }

  function syncRoleSelects(role){
    document.querySelectorAll("#nxRoleSelect").forEach(sel=>{
      sel.value = role;
    });
  }

  function updateSessionBanner(){
    const eq = getEq();
    const role = getRole();
    const status = getStatus();

    document.querySelectorAll("[data-nx-eq]").forEach(el=>el.textContent = eq || "(none)");
    document.querySelectorAll("[data-nx-role]").forEach(el=>el.textContent = role);
    document.querySelectorAll("[data-nx-status]").forEach(el=>el.textContent = status);

    syncRoleSelects(role);
  }

  function init(){
    persistEq(getEq());
    updateSessionBanner();
    forceEqOnLinks(document);

    window.addEventListener("focus", updateSessionBanner);
    window.addEventListener("storage", updateSessionBanner);
  }

  const NEXUS = {
    getEq,
    persistEq,
    getRole,
    setRole,
    getStatus,
    setStatus,
    stepKey,
    isStepComplete,
    setStepComplete,
    isCcsSigned,
    setCcsSigned,
    getEqUrl,
    forceEqOnLinks,
    back,
    updateSessionBanner,
    readJSON,
    writeJSON
  };

  window.NEXUS = window.NEXUS || {};
  Object.assign(window.NEXUS, NEXUS);
  window.NEXUS_back = back;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
