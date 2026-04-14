/* meg/fluke_import.js
   Format-flexible CSV importer:
   - Reads CSV
   - Detects headers + guesses mapping
   - If uncertain, shows mapping UI
   - Normalizes rows into:
     { timestamp, voltage, resistance, units, pi, dar, passFail, notes }
   - Saves to localStorage via NEXUS_FlukeStore
*/
(function(){
  "use strict";

  const $ = (id) => document.getElementById(id);

  const jobIdEl = $("jobId");
  const equipmentIdEl = $("equipmentId");
  const fileEl = $("file");

  const parseBtn = $("parseBtn");
  const saveBtn = $("saveBtn");
  const clearMapBtn = $("clearMapBtn");

  const statusEl = $("status");

  const mappingBlock = $("mappingBlock");
  const previewBlock = $("previewBlock");
  const savedBlock = $("savedBlock");

  const previewMeta = $("previewMeta");
  const previewTable = $("previewTable");
  const sessionList = $("sessionList");

  const mapEls = {
    timestamp: $("map_timestamp"),
    voltage: $("map_voltage"),
    resistance: $("map_resistance"),
    units: $("map_units"),
    pi: $("map_pi"),
    dar: $("map_dar"),
    passFail: $("map_passFail"),
    notes: $("map_notes"),
  };

  const NONE = "__NONE__";

  let parsedState = null; // { headers, rowsRaw, normalizedRows, sourceFileName, mappingUsed, rawText }

  function qs(name){
    try{ return (new URL(location.href)).searchParams.get(name) || ""; }catch(e){ return ""; }
  }

  function setStatus(msg){
    statusEl.textContent = msg || "";
  }

  function escapeHtml(s){
    return String(s ?? "").replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }

  function inferEqAndJob(){
    // Prefer query params
    const job = (qs("building") || qs("job") || qs("jobId") || "").trim();
    const eq = (qs("eq") || qs("equipmentId") || "").trim();

    if (job && !jobIdEl.value.trim()) jobIdEl.value = job;
    if (eq && !equipmentIdEl.value.trim()) equipmentIdEl.value = eq;

    // Fallback
    if (!jobIdEl.value.trim()){
      const b = (localStorage.getItem("nexus_active_building") || "").trim();
      if (b) jobIdEl.value = b;
    }
    if (!equipmentIdEl.value.trim()){
      const e = (localStorage.getItem("nexus_active_eq") || "").trim();
      if (e) equipmentIdEl.value = e;
    }
  }

  function splitCsvLine(line){
    // Basic CSV parser: handles quotes and commas.
    // Good enough for export logs; avoids external libs.
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i=0;i<line.length;i++){
      const ch = line[i];
      if (ch === '"'){
        if (inQ && line[i+1] === '"'){ cur += '"'; i++; }
        else inQ = !inQ;
        continue;
      }
      if (ch === ',' && !inQ){
        out.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
  }

  function parseCsv(text){
    const lines = String(text||"")
      .replace(/\r\n/g,"\n")
      .replace(/\r/g,"\n")
      .split("\n")
      .filter(l => l.trim() !== "");

    if (!lines.length) return { headers:[], rows:[] };

    const headers = splitCsvLine(lines[0]).map(h => h.trim());
    const rows = [];

    for (let i=1;i<lines.length;i++){
      const cols = splitCsvLine(lines[i]);
      const obj = {};
      for (let c=0;c<headers.length;c++){
        obj[headers[c] || ("col_"+c)] = (cols[c] ?? "");
      }
      rows.push(obj);
    }

    return { headers, rows };
  }

  function normalizeHeaderName(h){
    return String(h||"")
      .trim()
      .toLowerCase()
      .replace(/\s+/g," ")
      .replace(/[\(\)\[\]\{\}]/g,"")
      .replace(/[^\w\s\/\-]/g,"")
      .trim();
  }

  function guessMapping(headers){
    const norm = headers.map(h => ({ raw:h, n: normalizeHeaderName(h) }));

    function pick(matchers){
      for (const m of matchers){
        const hit = norm.find(x => x.n === m) || norm.find(x => x.n.includes(m));
        if (hit) return hit.raw;
      }
      return "";
    }

    // Very permissive guesses (works across many export styles)
    const mapping = {
      timestamp: pick(["timestamp","time","date time","datetime","date","test time","measured time","measurement time"]),
      voltage: pick(["voltage","test voltage","v","test v","testvoltage","test-voltage"]),
      resistance: pick(["insulation resistance","resistance","ir","mohm","megohm","ohm","insulation"]),
      units: pick(["units","unit","resistance units","ohm units"]),
      pi: pick(["pi","polarization index","polarization"]),
      dar: pick(["dar","dielectric absorption ratio","absorption ratio"]),
      passFail: pick(["pass/fail","pass fail","result","status","outcome"]),
      notes: pick(["notes","comment","comments","remark","remarks","description"]),
    };

    return mapping;
  }

  function isMappingUsable(mapping){
    // Minimum viable: resistance + (timestamp or voltage)
    const r = String(mapping.resistance||"").trim();
    const t = String(mapping.timestamp||"").trim();
    const v = String(mapping.voltage||"").trim();
    return !!r && (!!t || !!v);
  }

  function buildSelectOptions(selectEl, headers){
    while (selectEl.firstChild) selectEl.removeChild(selectEl.firstChild);

    const optNone = document.createElement("option");
    optNone.value = NONE;
    optNone.textContent = "(none)";
    selectEl.appendChild(optNone);

    headers.forEach(h => {
      const o = document.createElement("option");
      o.value = h;
      o.textContent = h;
      selectEl.appendChild(o);
    });
  }

  function applyMappingToUI(mapping, headers){
    Object.keys(mapEls).forEach(k => buildSelectOptions(mapEls[k], headers));

    Object.keys(mapEls).forEach(k => {
      const val = (mapping && mapping[k]) ? mapping[k] : "";
      mapEls[k].value = val ? val : NONE;
    });
  }

  function getMappingFromUI(){
    const out = {};
    Object.keys(mapEls).forEach(k => {
      const v = mapEls[k].value;
      out[k] = (v && v !== NONE) ? v : "";
    });
    return out;
  }

  function normalizeRows(rowsRaw, mapping){
    const m = mapping || {};
    return (Array.isArray(rowsRaw)?rowsRaw:[]).map(r => {
      const get = (col) => col ? (r[col] ?? "") : "";
      return {
        timestamp: String(get(m.timestamp)).trim(),
        voltage: String(get(m.voltage)).trim(),
        resistance: String(get(m.resistance)).trim(),
        units: String(get(m.units)).trim(),
        pi: String(get(m.pi)).trim(),
        dar: String(get(m.dar)).trim(),
        passFail: String(get(m.passFail)).trim(),
        notes: String(get(m.notes)).trim(),
        _raw: r
      };
    }).filter(x => {
      // keep only rows with something in them
      return Object.keys(x).some(k => k !== "_raw" && String(x[k]||"").trim() !== "");
    });
  }

  function renderPreview(headers, normalizedRows, sourceFileName, mappingUsed){
    previewBlock.style.display = "block";

    const count = normalizedRows.length;
    previewMeta.innerHTML =
      `<div><b>File:</b> <span class="mono">${escapeHtml(sourceFileName||"(unknown)")}</span></div>` +
      `<div><b>Rows parsed:</b> ${count}</div>` +
      `<div><b>Mapping:</b> <span class="mono">${escapeHtml(JSON.stringify(mappingUsed||{}))}</span></div>`;

    const cols = ["timestamp","voltage","resistance","units","pi","dar","passFail","notes"];
    previewTable.innerHTML =
      `<thead><tr>${cols.map(c=>`<th>${escapeHtml(c)}</th>`).join("")}</tr></thead>` +
      `<tbody>` +
      normalizedRows.slice(0, 30).map(row => {
        return `<tr>` + cols.map(c => `<td>${escapeHtml(row[c]||"")}</td>`).join("") + `</tr>`;
      }).join("") +
      `</tbody>`;

    if (count > 30){
      previewTable.innerHTML += `<tfoot><tr><td colspan="${cols.length}" class="mono">Showing first 30 rows</td></tr></tfoot>`;
    }
  }

  function renderSavedList(eq){
    const list = window.NEXUS_FlukeStore.listSessionsFor(eq);
    if (!list.length){
      savedBlock.style.display = "block";
      sessionList.innerHTML = `<div class="mono">No saved sessions yet for this equipment.</div>`;
      return;
    }

    savedBlock.style.display = "block";
    sessionList.innerHTML = list.map(s => {
      const when = s.capturedAt || s.createdAt || "";
      const rows = Array.isArray(s.rows) ? s.rows.length : 0;
      const file = s.sourceFileName || "";
      const job = s.jobId || "";
      return `
        <div class="glass-block" style="margin-top:10px;">
          <div class="section-title">Session</div>
          <div class="mono">id: ${escapeHtml(s.id||"")}</div>
          <div><b>Equipment:</b> ${escapeHtml(s.equipmentId||"")}</div>
          <div><b>Building:</b> ${escapeHtml(job)}</div>
          <div><b>Captured:</b> ${escapeHtml(when)}</div>
          <div><b>File:</b> <span class="mono wrap-anywhere">${escapeHtml(file)}</span></div>
          <div><b>Rows:</b> ${rows}</div>
        </div>
      `;
    }).join("");
  }

  async function readFileAsText(file){
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result||""));
      fr.onerror = reject;
      fr.readAsText(file);
    });
  }

  function buildSession(eq, job, fileName, rawText, headers, rowsRaw, normalizedRows, mappingUsed){
    const nowIso = new Date().toISOString();
    return {
      id: "", // assigned on save
      source: "FLUKE_CONNECT_IMPORT",
      equipmentId: String(eq||"").trim(),
      jobId: String(job||"").trim(),
      sourceFileName: String(fileName||"").trim(),
      capturedAt: nowIso,
      createdAt: nowIso,
      schema: "nexus.meg.fluke.session.v1",
      mappingUsed: mappingUsed || {},
      headers: headers || [],
      rows: normalizedRows || [],
      // keep raw text in case you ever need to re-parse on backend (optional)
      rawCsvText: rawText || ""
    };
  }

  function enableSave(enabled){
    saveBtn.disabled = !enabled;
  }

  parseBtn.addEventListener("click", async function(){
    try{
      inferEqAndJob();

      const eq = equipmentIdEl.value.trim();
      const job = jobIdEl.value.trim();

      if (!eq){
        setStatus("Equipment is required (eq).");
        return;
      }
      if (!fileEl.files || !fileEl.files[0]){
        setStatus("Choose a CSV file first.");
        return;
      }

      enableSave(false);
      previewBlock.style.display = "none";
      mappingBlock.style.display = "none";

      const file = fileEl.files[0];
      setStatus("Reading file…");
      const rawText = await readFileAsText(file);

      setStatus("Parsing CSV…");
      const parsed = parseCsv(rawText);
      const headers = parsed.headers || [];
      const rowsRaw = parsed.rows || [];

      if (!headers.length){
        setStatus("No headers detected. Ensure this is a CSV export (not PDF).");
        return;
      }
      if (!rowsRaw.length){
        setStatus("CSV parsed but no data rows found.");
        return;
      }

      // mapping: saved mapping > guess mapping
      const savedMapping = window.NEXUS_FlukeStore.loadMapping();
      const guessed = guessMapping(headers);

      // prefer saved mapping if it references headers that still exist
      function mappingIsValid(m){
        if (!m || typeof m !== "object") return false;
        return Object.values(m).every(v => !v || headers.includes(v));
      }
      let mapping = mappingIsValid(savedMapping) ? savedMapping : guessed;

      // If still not usable, show mapping UI and require user to pick
      if (!isMappingUsable(mapping)){
        mappingBlock.style.display = "block";
        applyMappingToUI(mapping, headers);
        setStatus("Auto-detect incomplete. Select columns in Mapping, then click Parse & Preview again.");
        parsedState = { headers, rowsRaw, rawText, sourceFileName:file.name, mappingUsed:mapping, normalizedRows:[] };
        return;
      }

      // If mapping is usable, normalize and show preview.
      const normalizedRows = normalizeRows(rowsRaw, mapping);
      if (!normalizedRows.length){
        mappingBlock.style.display = "block";
        applyMappingToUI(mapping, headers);
        setStatus("Parsed but produced no usable rows. Adjust mapping and click Parse & Preview again.");
        parsedState = { headers, rowsRaw, rawText, sourceFileName:file.name, mappingUsed:mapping, normalizedRows:[] };
        return;
      }

      // If UI mapping block is visible, read UI overrides and re-run
      if (mappingBlock.style.display === "block"){
        const uiMap = getMappingFromUI();
        mapping = uiMap;
        window.NEXUS_FlukeStore.saveMapping(mapping);
        const normalizedRows2 = normalizeRows(rowsRaw, mapping);
        if (!normalizedRows2.length){
          setStatus("Mapping saved, but still no usable rows. Choose different columns.");
          parsedState = { headers, rowsRaw, rawText, sourceFileName:file.name, mappingUsed:mapping, normalizedRows:[] };
          return;
        }
        parsedState = { headers, rowsRaw, rawText, sourceFileName:file.name, mappingUsed:mapping, normalizedRows:normalizedRows2 };
        renderPreview(headers, normalizedRows2, file.name, mapping);
        enableSave(true);
        setStatus("Preview ready. Click Save to NEXUS.");
        return;
      }

      parsedState = { headers, rowsRaw, rawText, sourceFileName:file.name, mappingUsed:mapping, normalizedRows };
      renderPreview(headers, normalizedRows, file.name, mapping);

      enableSave(true);
      setStatus("Preview ready. Click Save to NEXUS.");
    }catch(e){
      console.error(e);
      setStatus("Parse failed. Check console for details.");
    }
  });

  saveBtn.addEventListener("click", function(){
    try{
      inferEqAndJob();
      const eq = equipmentIdEl.value.trim();
      const job = jobIdEl.value.trim();

      if (!parsedState || !parsedState.normalizedRows || !parsedState.normalizedRows.length){
        setStatus("Nothing to save. Parse & Preview first.");
        return;
      }
      if (!eq){
        setStatus("Equipment is required.");
        return;
      }

      const session = buildSession(
        eq,
        job,
        parsedState.sourceFileName,
        parsedState.rawText,
        parsedState.headers,
        parsedState.rowsRaw,
        parsedState.normalizedRows,
        parsedState.mappingUsed
      );

      const id = window.NEXUS_FlukeStore.upsertSession(session);
      setStatus("Saved session: " + id);
      renderSavedList(eq);
      enableSave(false);
    }catch(e){
      console.error(e);
      setStatus("Save failed. Check console.");
    }
  });

  clearMapBtn.addEventListener("click", function(){
    try{
      window.NEXUS_FlukeStore.clearMapping();
      setStatus("Column mapping reset. Next parse will attempt auto-detect again.");
    }catch(e){
      setStatus("Could not reset mapping.");
    }
  });

  // When mapping UI is shown, user can change mapping and click Parse again.
  // If they change mapping but forget to re-parse, save remains disabled.

  // initial state
  inferEqAndJob();
  renderSavedList((equipmentIdEl.value||"").trim());
})();
