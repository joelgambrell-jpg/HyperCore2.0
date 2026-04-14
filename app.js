/* app.js (FULL drop-in) */
(function () {
  const params = new URLSearchParams(location.search);
  const id = (params.get("id") || "").trim();
  const eq = (params.get("eq") || "").trim();

  function loadEqMeta(){
    if (!eq) return null;
    const primaryKey = `nexus_meta_${eq}`;
    const legacyKey = "nexus_meta_";
    try{
      const raw = localStorage.getItem(primaryKey);
      if (raw) return JSON.parse(raw);
      const legacyRaw = localStorage.getItem(legacyKey);
      if (legacyRaw) return JSON.parse(legacyRaw);
    }catch(e){}
    return null;
  }

  // Require FORMS + valid ID
  if (!id || !window.FORMS || !window.FORMS[id]) {
    document.body.innerHTML =
      '<div style="background:#b60000;color:white;padding:40px;font-family:Arial">' +
      "<h2>Invalid or missing form ID</h2>" +
      "<p>Example: <code>form.html?id=rif</code></p>" +
      "</div>";
    return;
  }

  const cfg = window.FORMS[id];

  document.title = cfg.title || "Form";
  const pageTitle = document.getElementById("page-title");
  const sectionTitle = document.getElementById("section-title");
  if (pageTitle) pageTitle.textContent = cfg.title || "";
  if (sectionTitle) sectionTitle.textContent = cfg.sectionTitle || "";

  const eqLabel = document.getElementById("eqLabel");
  if (eqLabel) eqLabel.textContent = eq ? `Equipment: ${eq}` : "";

  if (cfg.backgroundImage) {
    document.body.style.backgroundImage = `url("${cfg.backgroundImage}")`;
  }

  const buttonsWrap = document.getElementById("buttonsWrap");
  const buttonsEl = document.getElementById("buttons");
  const mediaEl = document.getElementById("media");

  // Storage keys used by equipment.html
  function stepKey(stepId){ return `nexus_${eq || "NO_EQ"}_step_${stepId}`; }
  function landingKey(){ return `nexus_${eq || "NO_EQ"}_landing_complete`; }

  // =========================
  // Firebase sync (optional)
  // =========================
  async function fbSetStep(eqId, stepId, isDone){
    try{
      if (!window.NEXUS_FB?.db || !eqId || !stepId) return;
      const { db, auth } = window.NEXUS_FB;

      const { doc, setDoc, serverTimestamp } =
        await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");

      const ref = doc(db, "equipment", eqId, "steps", stepId);
      await setDoc(ref, {
        done: !!isDone,
        updatedAt: serverTimestamp(),
        updatedBy: auth?.currentUser?.uid || null
      }, { merge:true });
    }catch(e){
      console.warn("Firebase step sync failed:", e);
    }
  }

  let fbUnsub = null;
  async function fbListenStep(eqId, stepId){
    try{
      if (!window.NEXUS_FB?.db || !eqId || !stepId) return;
      const { db } = window.NEXUS_FB;

      const { doc, onSnapshot } =
        await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");

      const ref = doc(db, "equipment", eqId, "steps", stepId);

      fbUnsub = onSnapshot(ref, (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() || {};
        if (data.done) localStorage.setItem(stepKey(stepId), "1");
        else localStorage.removeItem(stepKey(stepId));
        refreshStepBtn();
      });
    }catch(e){
      console.warn("Firebase listener failed:", e);
    }
  }

  // =========================
  // Step Complete button (ALL TASKS)
  // =========================
  const stepBtn = document.getElementById("stepCompleteBtn");

  // pages that should never be completable
  const NON_COMPLETABLE = new Set(["construction","phenolic","transformer","supporting","megger_reporting"]);
  const hideToggle = NON_COMPLETABLE.has(id);

  // Hide immediately (prevents flash)
  if (stepBtn) stepBtn.style.display = "none";

  function usable(){ return !!(eq && id); }
  function done(){ return !!(eq && id && localStorage.getItem(stepKey(id)) === "1"); }

  // =========================
  // Completion gating (prevents false COMPLETE)
  // - Only allow setting step done if there is real saved data for that step.
  // - This matches the same "signals" your package_export.html uses.
  // =========================
  function readJSON(key){
    try{
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }catch(e){ return null; }
  }

  function hasAnyFilledRow(rows){
    const out = (Array.isArray(rows) ? rows : []);
    return out.some(r => Object.values(r || {}).some(x => String(x || "").trim() !== ""));
  }

  function localHasAnyKeyWithPrefix(prefix){
    try{
      for (let i=0;i<localStorage.length;i++){
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) return true;
      }
    }catch(e){}
    return false;
  }

  function prefodHasSavedDoc(eqId){
    try{
      if (!eqId) return false;

      // Known primary keys used across your builds
      const knownKeys = [
        `nexus_${eqId}_prefod_checklist_v1`,
        `nexus_${eqId}_prefod_checklist`,
        `nexus_${eqId}_prefod`,
        `nexus_${eqId}_form_prefod`,
        `prefod_${eqId}`,
        `nexus_prefod_${eqId}`,
        `nexus_${eqId}_prefod_v1`,
        `nexus_${eqId}_prefod_v2`,
        `nexus_${eqId}_prefod_log_v1`,
      ];

      for (const k of knownKeys){
        const doc = readJSON(k);
        if (doc && typeof doc === "object") return true;
      }

      // Fallback scan (prefod + eq in key)
      const eqLower = String(eqId).toLowerCase();
      for (let i=0;i<localStorage.length;i++){
        const k = localStorage.key(i);
        if (!k) continue;
        const kl = k.toLowerCase();
        if (kl.indexOf("prefod") === -1) continue;
        if (kl.indexOf(eqLower) === -1) continue;
        const doc = readJSON(k);
        if (doc && typeof doc === "object") return true;
      }
    }catch(e){}
    return false;
  }

  function isStepActuallyComplete(stepId){
    const sid = String(stepId || "").trim();

    // RIF/L2: "complete" if any saved digital doc exists (your export reads these)
    if (sid === "rif"){
      return localHasAnyKeyWithPrefix(`nexus/equipment/${eq||"NO_EQ"}/rifs/`);
    }
    if (sid === "l2"){
      return localHasAnyKeyWithPrefix(`nexus/equipment/${eq||"NO_EQ"}/l2s/`);
    }

    // Meg (Line/Load): requires saved meg log with at least header/rows
    if (sid === "meg" || sid === "megohmmeter_line" || sid === "megohmmeter_load"){
      const meg =
        readJSON(`nexus_${eq||"NO_EQ"}_meg_log_v2`) ||
        readJSON(`nexus_${eq||"NO_EQ"}_meg_log_v1`);

      if (!meg) return false;

      const hasHeader =
        String(meg.testDate||'').trim() ||
        String(meg.tech||'').trim() ||
        String(meg.notes||'').trim();

      const hasRows =
        hasAnyFilledRow(meg.lineRows) ||
        hasAnyFilledRow(meg.loadRows);

      return !!(hasHeader || hasRows);
    }

    // Torque: requires saved torque log with at least one row or tilt result
    if (sid === "torque"){
      const torque = readJSON(`nexus_${eq||"NO_EQ"}_torque_log_v1`);
      if (!torque) return false;

      const hasRows = hasAnyFilledRow(torque.rows);
      const hasTilt = !!(torque.tilt && typeof torque.tilt === "object" && Object.keys(torque.tilt).length);
      return !!(hasRows || hasTilt);
    }

    // FPV photo: requires saved image blob
    if (sid === "fpv_photo"){
      const blob = (localStorage.getItem(`nexus_${eq||"NO_EQ"}_fpv_photo_blob`) || "");
      return blob.startsWith("data:image/");
    }

    // Pre-FOD: requires a saved prefod doc
    if (sid === "prefod"){
      return prefodHasSavedDoc(eq || "NO_EQ");
    }

    // Default: allow manual completion for unknown steps (keeps existing behavior)
    return true;
  }

  async function setDoneState(nextDone){
    if (!usable()) return false;

    // If turning ON, gate completion based on real saved data for that step.
    if (nextDone){
      if (!isStepActuallyComplete(id)){
        alert("Not complete yet: required saved data not found for this step.");
        return false;
      }
    }

    if (cfg.completedKey){
      if (nextDone) localStorage.setItem(cfg.completedKey, "true");
      else localStorage.removeItem(cfg.completedKey);
    }

    if (nextDone){
      localStorage.setItem(stepKey(id), "1");
      localStorage.setItem(landingKey(), "1");
    } else {
      localStorage.removeItem(stepKey(id));
    }

    await fbSetStep(eq, id, nextDone);
    return true;
  }

  function refreshStepBtn(){
    if (!stepBtn) return;

    if (hideToggle){
      stepBtn.style.display = "none";
      return;
    }

    // Show on ALL task pages
    stepBtn.style.display = "block";
    stepBtn.disabled = !usable();
    stepBtn.title = usable() ? "" : "Missing eq or id in URL";

    const isDone = done();
    stepBtn.classList.toggle("complete", isDone);
    stepBtn.textContent = isDone ? "Step Complete ✓" : "Mark Step Complete";
  }

  if (stepBtn){
    stepBtn.addEventListener("click", async () => {
      if (!usable()) return;
      const next = !done();
      const ok = await setDoneState(next);
      // If user tried to mark complete but gate failed, keep UI consistent.
      if (!ok && next){
        // Ensure not marked complete
        try{ localStorage.removeItem(stepKey(id)); }catch(e){}
      }
      refreshStepBtn();
    });
  }

  // keep in sync
  refreshStepBtn();
  window.addEventListener("storage", refreshStepBtn);
  window.addEventListener("focus", refreshStepBtn);
  window.addEventListener("pageshow", refreshStepBtn);

  if (usable() && !hideToggle) fbListenStep(eq, id);

  window.addEventListener("beforeunload", () => {
    try{ if (fbUnsub) fbUnsub(); }catch(e){}
  });

  function withEq(href) {
    if (!eq || !href) return href;
    if (/^https?:\/\//i.test(href)) return href;

    const u = new URL(href, location.href);
    if (u.origin !== location.origin) return href;

    u.searchParams.set("eq", eq);

    if (u.pathname.endsWith("/submit.html") || u.pathname.endsWith("submit.html")) {
      if (!u.searchParams.get("form") && !u.searchParams.get("id")) {
        u.searchParams.set("form", id);
      }
    }

    return u.pathname + u.search + u.hash;
  }

  // =========================
  // Resolve special href tokens (per-equipment links)
  // =========================
  function getFirstNonEmptyLocalStorage(keys){
    for (const k of keys){
      try{
        const v = (localStorage.getItem(k) || "").trim();
        if (v) return v;
      }catch(e){}
    }
    return "";
  }

  function getMetaUrlGuess(meta){
    if (!meta || typeof meta !== "object") return "";
    // try a handful of likely property names without breaking anything
    const candidates = [
      meta.procoreEquipmentUrl,
      meta.procoreEquipmentURL,
      meta.procore_equipment_url,
      meta.procoreUrl,
      meta.procoreURL,
      meta.procore_url,
      meta.equipmentProcoreUrl,
      meta.equipment_procore_url
    ].map(v => String(v || "").trim()).filter(Boolean);

    return candidates[0] || "";
  }

  function resolveHref(href){
    if (!href) return href;

    // Pre-FOD → use per-equipment Procore URL saved on equipment page
    if (href === "NEXUS_PROCORE_PREFOD") {
      const key = `nexus_${eq || "NO_EQ"}_prefod_procore_url`;
      const saved = (localStorage.getItem(key) || "").trim();
      return saved || "https://login.procore.com/?cookies_enabled=true";
    }

    // RIF → use per-equipment Procore Equipment URL (same one you enter on Setup)
    // This tries several likely keys + the meta blob, so it works even if your setup page key name differs.
    if (href === "NEXUS_PROCORE_RIF") {
      const eqId = eq || "NO_EQ";

      // 1) direct per-step keys (if you add later)
      const direct = getFirstNonEmptyLocalStorage([
        `nexus_${eqId}_rif_procore_url`,
        `nexus_${eqId}_procore_rif_url`
      ]);

      if (direct) return direct;

      // 2) equipment procore keys (most likely what your setup page is already saving)
      const equipmentLevel = getFirstNonEmptyLocalStorage([
        `nexus_${eqId}_procore_equipment_url`,
        `nexus_${eqId}_equipment_procore_url`,
        `nexus_${eqId}_procore_url`,
        `nexus_${eqId}_procore`,
        `nexus_${eqId}_procoreEquipmentUrl`
      ]);

      if (equipmentLevel) return equipmentLevel;

      // 3) meta object (nexus_meta_${eq})
      const meta = loadEqMeta();
      const metaGuess = getMetaUrlGuess(meta);
      if (metaGuess) return metaGuess;

      // fallback
      return "https://login.procore.com/?cookies_enabled=true";
    }

    return href;
  }

  // =========================
  // IMPORTANT: Kill the legacy SOP button entirely.
  // We render SOP as a normal .btn entry so it matches styling.
  // =========================
  (function hardHideLegacySopBtn(){
    const sopBtn = document.getElementById("openSopBtn");
    if (!sopBtn) return;
    sopBtn.style.display = "none";
    sopBtn.onclick = null;
  })();

  // EMBED MODE
  if (cfg.embedUrl) {
    if (buttonsWrap) buttonsWrap.style.display = "none";
    if (mediaEl){
      mediaEl.style.display = "block";
      mediaEl.innerHTML = `<iframe class="embed" src="${withEq(cfg.embedUrl)}" title="${cfg.title || ""}"></iframe>`;
    }
    return;
  }

  // IMAGE MODE
  if (cfg.imageUrl) {
    if (buttonsWrap) buttonsWrap.style.display = "none";
    if (mediaEl){
      mediaEl.style.display = "block";
      mediaEl.innerHTML = `
        <img id="mainImg" src="${cfg.imageUrl}" alt="${cfg.title || "Image"}" style="max-width:100%;border-radius:18px;cursor:zoom-in;">
        <div style="margin-top:12px;">
          <a class="btn" href="${cfg.imageUrl}" target="_blank" rel="noopener noreferrer">Open Image in New Tab</a>
        </div>
      `;
    }
    return;
  }

  // BUTTON MODE
  if (buttonsWrap) buttonsWrap.style.display = "inline-block";
  if (mediaEl) mediaEl.style.display = "none";
  if (buttonsEl) buttonsEl.innerHTML = "";

  const btnList = Array.isArray(cfg.buttons) ? [...cfg.buttons] : [];

  // --- helpers to prevent duplicates ---
  const norm = (s) => String(s || "").toLowerCase().trim();
  function hasButton(matchFn){
    return btnList.some((b) => matchFn(b || {}));
  }

  // TORQUE: SOP under Torque Application Log (only if not already present)
  if (id === "torque") {
    const alreadyHasTorqueSop = hasButton((b) => {
      const t = norm(b.text);
      const h = String(b.href || "");
      return t === "torque sop" || /torque_sop\.html/i.test(h);
    });

    if (!alreadyHasTorqueSop) {
      btnList.splice(1, 0, {
        text: "Torque SOP",
        href: "torque_sop.html",
        newTab: true
      });
    }
  }

  // MEG: SOP under Megohmmeter Test Log (only if not already present)
  const MEG_IDS = new Set(["meg","megohmmeter_line","megohmmeter_load"]);
  if (MEG_IDS.has(id)) {
    const alreadyHasMegSop = hasButton((b) => {
      const t = norm(b.text);
      const h = String(b.href || "");
      return t === "megohmmeter sop" || /megohmmeter_sop\.html/i.test(h);
    });

    if (!alreadyHasMegSop) {
      btnList.splice(1, 0, {
        text: "Megohmmeter SOP",
        href: "megohmmeter_sop.html",
        newTab: false
      });
    }
  }

  btnList.forEach((b) => {
    const a = document.createElement("a");
    a.className = "btn";
    a.textContent = b.text || "Open";
    a.href = withEq(resolveHref(b.href) || "#");

    if (b.newTab || /^https?:\/\//i.test(a.href)) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }

    buttonsEl.appendChild(a);
  });

  refreshStepBtn();
})();
