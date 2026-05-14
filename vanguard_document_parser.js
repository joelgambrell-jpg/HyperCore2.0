from pathlib import Path

code = r'''/* ===========================================================
   NEXUS Vanguard Document Parser
   File: vanguard_document_parser.js

   Purpose:
   - Client-side document intake helper for NEXUS Vanguard.
   - Accepts PDF/text/CSV/Excel-like text uploads.
   - Creates structured, AI-ready document records.
   - Extracts equipment IDs, requirement candidates, references,
     torque candidates, meg thresholds, CCS candidates, conflicts,
     and confidence hints.
   - Saves to localStorage and Firebase live-sync when available.
   - Keeps field UI simple: this is background intelligence only.

   Important:
   - This is a deterministic local parser / preprocessor.
   - Real AI API integration can call the exported payloads later.
   - PDF binary text extraction is limited unless PDF text is already
     readable in-browser or another parser is added.
   =========================================================== */

(function(){
  "use strict";

  const STORAGE_VERSION = "vanguard_document_parser_v1";

  const DEFAULT_PROJECT = "AWS CMH098";

  const INTERNAL_REF_PAGES = {
    rif: "RIF.html",
    receipt: "RIF.html",
    torque: "torque_log.html",
    meg: "meg_log.html",
    megger: "meg_log.html",
    megohmmeter: "meg_log.html",
    l2: "l2_no_procore.html",
    prefod: "prefod.html",
    "pre-fod": "prefod.html",
    fpv: "fpv_photo_capture.html",
    phenolic: "phenolic_display.html",
    readiness: "package_readiness.html",
    package: "package_readiness.html"
  };

  const EQUIPMENT_ID_REGEXES = [
    /\b(TR|XFMR|TX|SWGR|SWBD|PDP|PP|PNL|UPS|ATS|STS|GEN|MCC|PDU|RPP|RTU|AHU|CRAH|CRAC|BDFB|CAB|MSB|MDP|LVSWGR|MVSWGR)[-_ ]?\d{1,4}[A-Z]?\b/gi,
    /\b[A-Z]{2,6}[-_]\d{1,4}[A-Z]?\b/g,
    /\b[A-Z]{1,4}\d{2,4}[A-Z]?\b/g
  ];

  const TORQUE_REGEXES = [
    /\b(?:torque|torqued|tighten|tightened)\D{0,80}(\d+(?:\.\d+)?)\s?(ft[- ]?lb|ft\.?\s?lbs?|lb[- ]?ft|in[- ]?lb|in\.?\s?lbs?|n[- ]?m|nm)\b/gi,
    /\b(\d+(?:\.\d+)?)\s?(ft[- ]?lb|ft\.?\s?lbs?|lb[- ]?ft|in[- ]?lb|in\.?\s?lbs?|n[- ]?m|nm)\D{0,80}(?:torque|lug|bolt|terminal|connection)\b/gi
  ];

  const MEG_REGEXES = [
    /\b(?:meg|megger|megohmmeter|insulation resistance)\D{0,80}(\d+(?:\.\d+)?)\s?(mω|mohm|megohm|megohms|mΩ|MΩ)\b/gi,
    /\b(\d+(?:\.\d+)?)\s?(mω|mohm|megohm|megohms|mΩ|MΩ)\D{0,80}(?:minimum|min|threshold|meg|insulation)\b/gi
  ];

  const VOLTAGE_REGEX = /\b(\d{2,5})\s?(v|vac|volts|kv)\b/gi;
  const BREAKER_REGEX = /\b(\d{2,5})\s?(a|amp|amps|ampere|amperes)\b/gi;
  const BOLT_REGEX = /\b(1\/4|5\/16|3\/8|7\/16|1\/2|9\/16|5\/8|3\/4|7\/8|1)\s?(?:in|inch|")?\s?(?:bolt|hardware|lug|stud)?\b/gi;

  const CCS_KEYWORDS = [
    "receipt inspection",
    "nameplate",
    "shipping damage",
    "phenolic",
    "label",
    "torque",
    "meg",
    "megger",
    "megohmmeter",
    "l2",
    "installation verification",
    "pre-fod",
    "fod",
    "finished product",
    "final photo",
    "clean",
    "debris",
    "foreign object",
    "ground",
    "bond",
    "termination",
    "lug",
    "breaker",
    "interlock",
    "arc flash",
    "directory",
    "panel schedule"
  ];

  function nowISO(){
    return new Date().toISOString();
  }

  function safeText(value){
    return String(value == null ? "" : value).trim();
  }

  function cleanKey(value){
    return safeText(value || "NO_KEY").replace(/[.#$\[\]\/]/g, "_") || "NO_KEY";
  }

  function slug(value){
    return safeText(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "item";
  }

  function readJSON(key, fallback){
    try{
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    }catch(e){
      return fallback;
    }
  }

  function writeJSON(key, value){
    try{
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    }catch(e){
      console.warn("NEXUS Vanguard parser local save failed:", key, e);
      return false;
    }
  }

  function unique(list){
    return Array.from(new Set((list || []).map(safeText).filter(Boolean)));
  }

  function clamp(n, min, max){
    return Math.max(min, Math.min(max, n));
  }

  function normalizeUnit(unit){
    const u = safeText(unit).toLowerCase();
    if(["ft-lb","ft lb","ftlbs","ft lbs","ft. lbs","lb-ft","lb ft"].includes(u)) return "ft-lbs";
    if(["in-lb","in lb","inlbs","in lbs","in. lbs"].includes(u)) return "in-lbs";
    if(["n-m","nm","n m"].includes(u)) return "N·m";
    if(["mω","mohm","megohm","megohms","mΩ".toLowerCase()].includes(u)) return "MΩ";
    if(["v","vac","volts"].includes(u)) return "V";
    if(["kv"].includes(u)) return "kV";
    if(["a","amp","amps","ampere","amperes"].includes(u)) return "A";
    return unit || "";
  }

  function splitLines(text){
    return safeText(text)
      .replace(/\r/g, "\n")
      .split("\n")
      .map(x => x.trim())
      .filter(Boolean);
  }

  function getWindowText(text, index, width){
    const clean = safeText(text);
    const start = Math.max(0, index - width);
    const end = Math.min(clean.length, index + width);
    return clean.slice(start, end).replace(/\s+/g, " ").trim();
  }

  function inferDocumentType(fileName, text){
    const name = safeText(fileName).toLowerCase();
    const body = safeText(text).toLowerCase();

    const checks = [
      ["torque", ["torque", "ft-lb", "ft lbs", "in-lb", "lug torque", "tighten"]],
      ["megohmmeter", ["megger", "megohmmeter", "insulation resistance", "mΩ".toLowerCase(), "megohm"]],
      ["drawing", ["drawing", "sheet", "e-", "one-line", "single line", "schedule"]],
      ["submittal", ["submittal", "shop drawing", "manufacturer", "catalog", "installation manual"]],
      ["specification", ["specification", "section 26", "spec", "shall", "contractor"]],
      ["ccs", ["construction check sheet", "checklist", "inspection item"]],
      ["l2", ["l2", "installation verification"]],
      ["prefod", ["pre-fod", "foreign object", "debris"]],
      ["fpv", ["finished product", "final photo"]]
    ];

    for(const [type, terms] of checks){
      if(terms.some(t => name.includes(t) || body.includes(t))) return type;
    }

    return "document";
  }

  function extractEquipmentIds(text){
    const hits = [];
    const body = safeText(text);

    EQUIPMENT_ID_REGEXES.forEach(regex => {
      regex.lastIndex = 0;
      let m;
      while((m = regex.exec(body))){
        const id = safeText(m[0]).replace(/\s+/g, "-").toUpperCase();
        if(id.length >= 3 && id.length <= 32){
          hits.push(id);
        }
      }
    });

    return unique(hits).slice(0, 300);
  }

  function extractRegexCandidates(text, regexes, kind){
    const body = safeText(text);
    const out = [];

    regexes.forEach(regex => {
      regex.lastIndex = 0;
      let m;
      while((m = regex.exec(body))){
        const value = safeText(m[1]);
        const unit = normalizeUnit(m[2] || "");
        const context = getWindowText(body, m.index, 140);

        out.push({
          kind,
          value,
          unit,
          context,
          raw:m[0],
          index:m.index,
          confidence:scoreCandidateConfidence(kind, context, value, unit)
        });
      }
    });

    return dedupeCandidates(out).slice(0, 200);
  }

  function extractVoltageCandidates(text){
    return extractRegexCandidates(text, [VOLTAGE_REGEX], "voltage").slice(0, 200);
  }

  function extractBreakerCandidates(text){
    return extractRegexCandidates(text, [BREAKER_REGEX], "amperage").slice(0, 200);
  }

  function extractBoltCandidates(text){
    const body = safeText(text);
    const out = [];
    BOLT_REGEX.lastIndex = 0;
    let m;
    while((m = BOLT_REGEX.exec(body))){
      out.push({
        kind:"bolt",
        value:m[1],
        unit:"in",
        context:getWindowText(body, m.index, 100),
        raw:m[0],
        index:m.index,
        confidence:scoreCandidateConfidence("bolt", getWindowText(body, m.index, 100), m[1], "in")
      });
    }
    return dedupeCandidates(out).slice(0, 200);
  }

  function scoreCandidateConfidence(kind, context, value, unit){
    let score = 45;
    const c = safeText(context).toLowerCase();

    if(value) score += 10;
    if(unit) score += 10;

    if(kind === "torque"){
      if(c.includes("torque")) score += 20;
      if(c.includes("lug") || c.includes("terminal") || c.includes("bolt")) score += 10;
      if(c.includes("chart") || c.includes("table")) score += 8;
    }

    if(kind === "megohmmeter"){
      if(c.includes("meg") || c.includes("insulation")) score += 20;
      if(c.includes("minimum") || c.includes("threshold") || c.includes("min")) score += 12;
    }

    if(kind === "voltage"){
      if(c.includes("voltage") || c.includes("rating") || c.includes("nameplate")) score += 15;
    }

    if(kind === "amperage"){
      if(c.includes("breaker") || c.includes("current") || c.includes("rating")) score += 15;
    }

    if(kind === "bolt"){
      if(c.includes("bolt") || c.includes("lug") || c.includes("hardware")) score += 20;
    }

    if(c.includes("typical")) score -= 8;
    if(c.includes("example")) score -= 12;
    if(c.includes("not used")) score -= 20;

    return clamp(score, 0, 100);
  }

  function dedupeCandidates(candidates){
    const seen = new Set();
    const out = [];

    (candidates || []).forEach(c => {
      const key = [
        c.kind,
        c.value,
        c.unit,
        safeText(c.context).slice(0, 80)
      ].join("|");

      if(seen.has(key)) return;
      seen.add(key);
      out.push(c);
    });

    return out.sort((a,b) => (b.confidence || 0) - (a.confidence || 0));
  }

  function extractCCSCandidates(text){
    const lines = splitLines(text);
    const out = [];

    lines.forEach((line, idx) => {
      const lower = line.toLowerCase();
      const hit = CCS_KEYWORDS.find(k => lower.includes(k));
      if(!hit) return;

      const clean = line.replace(/\s+/g, " ").trim();

      if(clean.length < 8 || clean.length > 260) return;

      out.push({
        id:"AI-CCS-" + String(out.length + 1).padStart(3, "0"),
        title:clean,
        description:clean,
        source:"AI extracted from document line " + (idx + 1),
        keyword:hit,
        confidence:lower.includes("shall") || lower.includes("verify") || lower.includes("confirm") ? 84 : 68,
        references:[]
      });
    });

    return dedupeByTitle(out).slice(0, 100);
  }

  function dedupeByTitle(rows){
    const seen = new Set();
    const out = [];

    rows.forEach(r => {
      const key = slug(r.title);
      if(seen.has(key)) return;
      seen.add(key);
      out.push(r);
    });

    return out;
  }

  function inferReferencesForCandidates(docRecord, candidates){
    const ref = {
      name:docRecord.title || docRecord.fileName || "Source Document",
      type:docRecord.type || "document",
      url:docRecord.localUrl || docRecord.url || "",
      notes:"AI-linked source document"
    };

    return (candidates || []).map(c => {
      const copy = Object.assign({}, c);
      copy.references = Array.isArray(copy.references) ? copy.references.slice() : [];
      copy.references.push(ref);
      return copy;
    });
  }

  function createDocumentId(fileName){
    return "DOC-" + slug(fileName || "document") + "-" + Date.now().toString(36);
  }

  function buildDocumentRecord(input){
    const text = safeText(input.text || "");
    const fileName = safeText(input.fileName || input.name || "document.txt");
    const project = safeText(input.project || DEFAULT_PROJECT);
    const type = input.type || inferDocumentType(fileName, text);
    const id = input.id || createDocumentId(fileName);
    const equipmentIds = extractEquipmentIds(text);

    const doc = {
      id,
      project,
      title:input.title || fileName,
      fileName,
      mimeType:input.mimeType || "",
      sizeBytes:input.sizeBytes || 0,
      type,
      revision:input.revision || inferRevision(fileName, text),
      text,
      textPreview:text.slice(0, 2000),
      hash:simpleHash(text + "|" + fileName),
      equipmentIds,
      localUrl:input.localUrl || "",
      url:input.url || "",
      createdAt:nowISO(),
      updatedAt:nowISO(),
      parserVersion:STORAGE_VERSION
    };

    const torque = extractRegexCandidates(text, TORQUE_REGEXES, "torque");
    const meg = extractRegexCandidates(text, MEG_REGEXES, "megohmmeter");
    const voltage = extractVoltageCandidates(text);
    const amperage = extractBreakerCandidates(text);
    const bolts = extractBoltCandidates(text);
    const ccs = inferReferencesForCandidates(doc, extractCCSCandidates(text));

    doc.extractions = {
      torque,
      meg,
      voltage,
      amperage,
      bolts,
      ccs,
      equipmentIds
    };

    doc.summary = summarizeDocument(doc);

    return doc;
  }

  function inferRevision(fileName, text){
    const combined = (safeText(fileName) + "\n" + safeText(text).slice(0, 4000)).toLowerCase();

    const patterns = [
      /\brev(?:ision)?\.?\s*([a-z0-9.-]{1,10})\b/i,
      /\brev\s*#?\s*([a-z0-9.-]{1,10})\b/i,
      /\brevision\s*([a-z0-9.-]{1,10})\b/i
    ];

    for(const p of patterns){
      const m = combined.match(p);
      if(m) return String(m[1] || "").toUpperCase();
    }

    return "";
  }

  function summarizeDocument(doc){
    const e = doc.extractions || {};
    const counts = {
      equipment:(e.equipmentIds || []).length,
      torque:(e.torque || []).length,
      meg:(e.meg || []).length,
      voltage:(e.voltage || []).length,
      amperage:(e.amperage || []).length,
      bolts:(e.bolts || []).length,
      ccs:(e.ccs || []).length
    };

    const confidence = calculateDocumentConfidence(doc, counts);

    return {
      confidence,
      counts,
      status:confidence >= 80 ? "READY" : (confidence >= 55 ? "REVIEW" : "LOW_CONFIDENCE"),
      message:buildSummaryMessage(doc, counts, confidence)
    };
  }

  function calculateDocumentConfidence(doc, counts){
    let score = 35;

    if(doc.text && doc.text.length > 500) score += 15;
    if(counts.equipment) score += 15;
    if(counts.torque || counts.meg || counts.ccs) score += 20;
    if(doc.revision) score += 5;
    if(doc.type && doc.type !== "document") score += 5;

    const totalCandidates = counts.torque + counts.meg + counts.voltage + counts.amperage + counts.ccs;
    if(totalCandidates > 10) score += 5;
    if(totalCandidates === 0) score -= 20;

    return clamp(score, 0, 100);
  }

  function buildSummaryMessage(doc, counts, confidence){
    const parts = [];
    parts.push(doc.type + " parsed");
    if(counts.equipment) parts.push(counts.equipment + " equipment ID(s)");
    if(counts.torque) parts.push(counts.torque + " torque candidate(s)");
    if(counts.meg) parts.push(counts.meg + " meg threshold candidate(s)");
    if(counts.ccs) parts.push(counts.ccs + " CCS candidate step(s)");
    parts.push("confidence " + confidence + "%");
    return parts.join(" • ");
  }

  function simpleHash(text){
    const s = safeText(text);
    let h = 0;
    for(let i=0;i<s.length;i++){
      h = ((h << 5) - h) + s.charCodeAt(i);
      h |= 0;
    }
    return "H" + Math.abs(h).toString(36).toUpperCase();
  }

  async function readFileAsText(file){
    if(!file) return "";

    const name = safeText(file.name).toLowerCase();
    const type = safeText(file.type).toLowerCase();

    if(type.includes("text") || name.endsWith(".txt") || name.endsWith(".csv") || name.endsWith(".json") || name.endsWith(".html")){
      return await file.text();
    }

    if(name.endsWith(".xlsx") || name.endsWith(".xls")){
      return await readSpreadsheetText(file);
    }

    if(name.endsWith(".pdf") || type.includes("pdf")){
      return await readPdfBestEffort(file);
    }

    try{
      return await file.text();
    }catch(e){
      return "";
    }
  }

  async function readSpreadsheetText(file){
    if(!window.XLSX){
      return "[Spreadsheet uploaded but XLSX parser is not loaded. Add xlsx.full.min.js before vanguard_document_parser.js for spreadsheet parsing.]";
    }

    const buf = await file.arrayBuffer();
    const wb = window.XLSX.read(buf, { type:"array", cellDates:true });
    const chunks = [];

    (wb.SheetNames || []).forEach(name => {
      const ws = wb.Sheets[name];
      const rows = window.XLSX.utils.sheet_to_json(ws, { header:1, defval:"" });
      chunks.push("### SHEET: " + name);
      rows.forEach(row => {
        chunks.push((row || []).map(cell => safeText(cell)).join(" | "));
      });
    });

    return chunks.join("\n");
  }

  async function readPdfBestEffort(file){
    if(window.pdfjsLib && window.pdfjsLib.getDocument){
      try{
        const buf = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data:buf }).promise;
        const chunks = [];

        for(let p=1;p<=pdf.numPages;p++){
          const page = await pdf.getPage(p);
          const content = await page.getTextContent();
          const text = (content.items || []).map(item => item.str || "").join(" ");
          chunks.push("### PAGE " + p);
          chunks.push(text);
        }

        return chunks.join("\n");
      }catch(e){
        console.warn("PDF.js parse failed:", e);
      }
    }

    return "[PDF uploaded. Text extraction requires PDF.js or backend parsing. File name: " + safeText(file.name) + "]";
  }

  function saveDocumentRecord(doc){
    if(!doc || !doc.id) return null;

    const projectKey = cleanKey(doc.project || DEFAULT_PROJECT);
    const docKey = `nexus_vanguard_doc_${doc.id}`;
    writeJSON(docKey, doc);

    const projectDocsKey = `nexus_vanguard_project_docs_${projectKey}`;
    const docs = readJSON(projectDocsKey, []);
    const list = Array.isArray(docs) ? docs.filter(d => d && d.id !== doc.id) : [];
    list.unshift({
      id:doc.id,
      title:doc.title,
      fileName:doc.fileName,
      type:doc.type,
      revision:doc.revision,
      equipmentIds:doc.equipmentIds,
      summary:doc.summary,
      updatedAt:doc.updatedAt
    });
    writeJSON(projectDocsKey, list.slice(0, 500));

    const allDocs = readJSON("nexus_vanguard_all_docs", []);
    const all = Array.isArray(allDocs) ? allDocs.filter(d => d && d.id !== doc.id) : [];
    all.unshift({
      id:doc.id,
      project:doc.project,
      title:doc.title,
      fileName:doc.fileName,
      type:doc.type,
      summary:doc.summary,
      updatedAt:doc.updatedAt
    });
    writeJSON("nexus_vanguard_all_docs", all.slice(0, 1000));

    logProjectEvent({
      project:doc.project,
      event:"document_parsed",
      title:doc.title + " • Parsed",
      message:doc.summary && doc.summary.message ? doc.summary.message : "Document parsed.",
      documentId:doc.id,
      updatedAt:nowISO()
    });

    return doc;
  }

  async function saveDocumentRecordToFirebase(doc){
    if(!doc || !window.NexusLiveSync || typeof window.NexusLiveSync.save !== "function") return false;

    try{
      const projectKey = "PROJECT_" + cleanKey(doc.project || DEFAULT_PROJECT);
      await window.NexusLiveSync.save(projectKey, "documents/" + cleanKey(doc.id), doc);
      await window.NexusLiveSync.save(projectKey, "lastDocumentParsed", {
        id:doc.id,
        title:doc.title,
        type:doc.type,
        summary:doc.summary,
        updatedAt:nowISO()
      });
      return true;
    }catch(e){
      console.warn("Vanguard document Firebase save failed:", e);
      return false;
    }
  }

  function logProjectEvent(event){
    const e = Object.assign({
      event:"vanguard_event",
      title:"Vanguard Event",
      message:"",
      updatedAt:nowISO()
    }, event || {});

    const events = readJSON("nexus_vanguard_project_events", []);
    const list = Array.isArray(events) ? events : [];
    list.unshift(e);
    writeJSON("nexus_vanguard_project_events", list.slice(0, 300));
  }

  async function parseFile(file, options){
    const opts = options || {};
    const text = await readFileAsText(file);
    const doc = buildDocumentRecord({
      fileName:file && file.name ? file.name : opts.fileName || "document",
      name:file && file.name ? file.name : opts.name || "document",
      mimeType:file && file.type ? file.type : "",
      sizeBytes:file && file.size ? file.size : 0,
      text,
      project:opts.project || DEFAULT_PROJECT,
      type:opts.type || "",
      revision:opts.revision || "",
      url:opts.url || "",
      localUrl:opts.localUrl || ""
    });

    saveDocumentRecord(doc);
    await saveDocumentRecordToFirebase(doc);

    return doc;
  }

  async function parseFiles(files, options){
    const out = [];
    const list = Array.from(files || []);
    for(const file of list){
      out.push(await parseFile(file, options || {}));
    }
    return out;
  }

  function getProjectDocuments(project){
    const projectKey = cleanKey(project || DEFAULT_PROJECT);
    return readJSON(`nexus_vanguard_project_docs_${projectKey}`, []);
  }

  function getDocument(id){
    return readJSON(`nexus_vanguard_doc_${id}`, null);
  }

  function getAllDocuments(){
    return readJSON("nexus_vanguard_all_docs", []);
  }

  function buildEquipmentRequirementMap(project){
    const docs = getProjectDocuments(project || DEFAULT_PROJECT);
    const map = {};

    docs.forEach(summary => {
      const doc = getDocument(summary.id);
      if(!doc) return;

      const eqIds = doc.equipmentIds && doc.equipmentIds.length ? doc.equipmentIds : ["UNMAPPED"];
      eqIds.forEach(eq => {
        if(!map[eq]){
          map[eq] = {
            eq,
            project:doc.project,
            documents:[],
            torque:[],
            meg:[],
            voltage:[],
            amperage:[],
            bolts:[],
            ccs:[],
            conflicts:[],
            confidence:0,
            updatedAt:nowISO()
          };
        }

        const bucket = map[eq];

        bucket.documents.push({
          id:doc.id,
          title:doc.title,
          fileName:doc.fileName,
          type:doc.type,
          revision:doc.revision,
          confidence:doc.summary ? doc.summary.confidence : 0
        });

        const ext = doc.extractions || {};
        bucket.torque.push(...attachSource(ext.torque || [], doc));
        bucket.meg.push(...attachSource(ext.meg || [], doc));
        bucket.voltage.push(...attachSource(ext.voltage || [], doc));
        bucket.amperage.push(...attachSource(ext.amperage || [], doc));
        bucket.bolts.push(...attachSource(ext.bolts || [], doc));
        bucket.ccs.push(...attachSource(ext.ccs || [], doc));
      });
    });

    Object.keys(map).forEach(eq => {
      const b = map[eq];
      b.torque = dedupeCandidates(b.torque);
      b.meg = dedupeCandidates(b.meg);
      b.voltage = dedupeCandidates(b.voltage);
      b.amperage = dedupeCandidates(b.amperage);
      b.bolts = dedupeCandidates(b.bolts);
      b.ccs = dedupeByTitle(b.ccs);
      b.conflicts = detectRequirementConflicts(b);
      b.confidence = calculateEquipmentConfidence(b);
    });

    return map;
  }

  function attachSource(candidates, doc){
    return (candidates || []).map(c => Object.assign({}, c, {
      sourceDocument:{
        id:doc.id,
        title:doc.title,
        type:doc.type,
        revision:doc.revision,
        url:doc.url || doc.localUrl || ""
      }
    }));
  }

  function detectRequirementConflicts(bucket){
    const conflicts = [];

    function conflictByDifferentValues(kind, rows){
      const values = unique((rows || []).map(r => safeText(r.value + " " + (r.unit || ""))));
      if(values.length > 1){
        conflicts.push({
          kind,
          status:"REVIEW",
          reason:"Multiple " + kind + " values found.",
          values,
          sources:(rows || []).map(r => r.sourceDocument).filter(Boolean)
        });
      }
    }

    conflictByDifferentValues("megohmmeter", bucket.meg);
    conflictByDifferentValues("voltage", bucket.voltage);

    const torqueValues = unique((bucket.torque || []).map(r => safeText(r.value + " " + (r.unit || ""))));
    if(torqueValues.length > 3){
      conflicts.push({
        kind:"torque",
        status:"REVIEW",
        reason:"Multiple torque values found. Human approval should map each value to a connection/hardware type.",
        values:torqueValues,
        sources:(bucket.torque || []).map(r => r.sourceDocument).filter(Boolean)
      });
    }

    return conflicts;
  }

  function calculateEquipmentConfidence(bucket){
    let score = 30;
    if(bucket.documents.length) score += 15;
    if(bucket.torque.length) score += 15;
    if(bucket.meg.length) score += 10;
    if(bucket.ccs.length) score += 10;
    if(bucket.conflicts.length) score -= 20;
    if(bucket.documents.length >= 3) score += 10;
    return clamp(score, 0, 100);
  }

  function publishRequirementMap(project){
    const map = buildEquipmentRequirementMap(project || DEFAULT_PROJECT);
    writeJSON("nexus_vanguard_requirement_map_" + cleanKey(project || DEFAULT_PROJECT), map);

    Object.keys(map).forEach(eq => {
      const bucket = map[eq];
      if(eq === "UNMAPPED") return;

      const requirements = buildApprovedDraftRequirements(bucket);
      writeJSON(`nexus_vanguard_equipment_${eq}`, requirements);

      if(window.NEXUS_VANGUARD && typeof window.NEXUS_VANGUARD.saveRequirements === "function"){
        try{
          window.NEXUS_VANGUARD.saveRequirements(eq, requirements.derived_requirements || requirements);
        }catch(e){}
      }
    });

    logProjectEvent({
      project:project || DEFAULT_PROJECT,
      event:"requirement_map_published",
      title:"Requirement Map Published",
      message:Object.keys(map).length + " equipment bucket(s) created from parsed documents.",
      updatedAt:nowISO()
    });

    return map;
  }

  function buildApprovedDraftRequirements(bucket){
    const torqueRows = (bucket.torque || []).slice(0, 20).map((r, idx) => ({
      connection:"AI-TORQUE-" + String(idx + 1).padStart(3, "0"),
      location:"AI detected context",
      bolt:"",
      boltType:"",
      unit:r.unit || "",
      specValue:r.value || "",
      specMin:r.value || "",
      specMax:r.value || "",
      source:r.sourceDocument ? r.sourceDocument.title : "Parsed document",
      confidence:r.confidence || 0,
      context:r.context || ""
    }));

    const ccsRows = (bucket.ccs || []).slice(0, 60).map((r, idx) => ({
      id:r.id || ("AI-CCS-" + String(idx + 1).padStart(3, "0")),
      title:r.title || r.description || "AI CCS Step",
      description:r.description || r.title || "",
      source:r.source || (r.sourceDocument ? r.sourceDocument.title : "Parsed document"),
      references:r.references || [],
      aiCheck:{
        required:true,
        status:"PENDING",
        reason:"AI-generated CCS candidate requires human approval before field use.",
        confidence:r.confidence || 0,
        createdAt:nowISO()
      }
    }));

    const bestMeg = (bucket.meg || [])[0] || null;

    return {
      eq:bucket.eq,
      project:bucket.project,
      equipmentType:inferEquipmentType(bucket.eq),
      confidence:bucket.confidence,
      conflicts:bucket.conflicts,
      sources:bucket.documents,
      derived_requirements:{
        torque_points:torqueRows,
        meg:bestMeg ? {
          threshold:bestMeg.value + (bestMeg.unit ? " " + bestMeg.unit : ""),
          value:bestMeg.value,
          unit:bestMeg.unit,
          source:bestMeg.sourceDocument ? bestMeg.sourceDocument.title : "Parsed document",
          confidence:bestMeg.confidence || 0
        } : null,
        ccs:ccsRows
      },
      ai:{
        status:bucket.conflicts.length ? "REVIEW" : "READY_FOR_HUMAN_APPROVAL",
        message:bucket.conflicts.length ? "Conflicts detected. Human approval required." : "Draft requirements generated. Human approval required before publish.",
        generatedAt:nowISO()
      },
      publishedAt:nowISO()
    };
  }

  function inferEquipmentType(eq){
    const e = safeText(eq).toUpperCase();
    if(e.includes("TR") || e.includes("XFMR") || e.includes("TX")) return "transformer";
    if(e.includes("SWGR") || e.includes("SWBD")) return "switchgear";
    if(e.includes("UPS")) return "ups";
    if(e.includes("ATS")) return "ats";
    if(e.includes("GEN")) return "generator";
    if(e.includes("PDP") || e.includes("PDU") || e.includes("RPP")) return "distribution";
    if(e.includes("PNL") || e.includes("PP")) return "panelboard";
    return "equipment";
  }

  function installDropZone(element, options){
    const el = typeof element === "string" ? document.querySelector(element) : element;
    if(!el) return false;

    const opts = options || {};
    const onParsed = typeof opts.onParsed === "function" ? opts.onParsed : function(){};

    function setDrag(active){
      try{ el.classList.toggle("dragover", !!active); }catch(e){}
    }

    ["dragenter","dragover"].forEach(evt => {
      el.addEventListener(evt, e => {
        e.preventDefault();
        e.stopPropagation();
        setDrag(true);
      });
    });

    ["dragleave","drop"].forEach(evt => {
      el.addEventListener(evt, e => {
        e.preventDefault();
        e.stopPropagation();
        setDrag(false);
      });
    });

    el.addEventListener("drop", async e => {
      const files = e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files : [];
      const parsed = await parseFiles(files, opts);
      onParsed(parsed);
    });

    return true;
  }

  function createHiddenFileInput(options){
    const opts = options || {};
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = opts.multiple !== false;
    input.accept = opts.accept || ".pdf,.txt,.csv,.xlsx,.xls,.json,.html";
    input.style.display = "none";
    document.body.appendChild(input);

    input.addEventListener("change", async () => {
      const parsed = await parseFiles(input.files || [], opts);
      if(typeof opts.onParsed === "function") opts.onParsed(parsed);
      input.value = "";
    });

    return {
      input,
      open:function(){ input.click(); },
      destroy:function(){ try{ input.remove(); }catch(e){} }
    };
  }

  window.NEXUS_VANGUARD_PARSER = {
    version:STORAGE_VERSION,
    parseFile,
    parseFiles,
    buildDocumentRecord,
    saveDocumentRecord,
    getProjectDocuments,
    getDocument,
    getAllDocuments,
    buildEquipmentRequirementMap,
    publishRequirementMap,
    buildApprovedDraftRequirements,
    installDropZone,
    createHiddenFileInput,
    extractEquipmentIds,
    extractCCSCandidates,
    extractRegexCandidates,
    logProjectEvent,
    inferDocumentType
  };

})();
'''

out = Path("/mnt/data/vanguard_document_parser.js")
out.write_text(code, encoding="utf-8")
print(f"Created {out} ({out.stat().st_size} bytes)")
