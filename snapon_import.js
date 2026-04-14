/* Snap-on ConnecTorq CSV import (client-side, iPad-friendly) */

(function () {
  const $ = (id) => document.getElementById(id);

  const statusEl = $("status");
  const parseBtn = $("parseBtn");
  const saveBtn = $("saveBtn");
  const fileEl = $("file");
  const previewBlock = $("previewBlock");
  const savedBlock = $("savedBlock");
  const previewTable = $("previewTable");
  const metaLine = $("metaLine");

  const pillEvents = $("pillEvents");
  const pillPass = $("pillPass");
  const pillFail = $("pillFail");
  const pillUnits = $("pillUnits");

  const jobIdEl = $("jobId");
  const equipmentIdEl = $("equipmentId");

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg || "";
  }

  function qs(name) {
    const u = new URL(window.location.href);
    return u.searchParams.get(name);
  }

  if (jobIdEl) jobIdEl.value = qs("jobId") || "";
  if (equipmentIdEl) equipmentIdEl.value = qs("equipmentId") || qs("eq") || "";

  let parsed = null;

  function showPreview(show) {
    if (!previewBlock) return;
    previewBlock.style.display = show ? "block" : "none";
  }

  function showSaved(show) {
    if (!savedBlock) return;
    savedBlock.style.display = show ? "block" : "none";
  }

  function guessDelimiter(text) {
    const sampleLines = String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .slice(0, 5);

    const candidates = [",", ";", "\t", "|"];
    let best = ",";
    let bestScore = -1;

    for (const c of candidates) {
      let score = 0;
      for (const line of sampleLines) {
        score += (line.split(c).length - 1);
      }
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  function parseCsv(text) {
    const normalized = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const delimiter = guessDelimiter(normalized);

    const rows = [];
    let row = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < normalized.length; i++) {
      const ch = normalized[i];
      const next = normalized[i + 1];

      if (ch === '"') {
        if (inQuotes && next === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        row.push(cur);
        cur = "";
      } else if (ch === "\n" && !inQuotes) {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      } else {
        cur += ch;
      }
    }

    if (cur.length > 0 || row.length > 0) {
      row.push(cur);
      rows.push(row);
    }

    const cleanedRows = rows
      .map((r) => r.map((s) => String(s ?? "").trim()))
      .filter((r) => r.some((x) => String(x).trim() !== ""));

    if (!cleanedRows.length) return { headers: [], rows: [], delimiter };

    const headers = cleanedRows[0];
    const dataRows = cleanedRows.slice(1).filter((r) => r.some((x) => String(x).trim() !== ""));

    const objects = dataRows.map((r) => {
      const obj = {};
      for (let i = 0; i < headers.length; i++) {
        obj[headers[i]] = r[i] ?? "";
      }
      return obj;
    });

    return { headers, rows: objects, delimiter };
  }

  function normHeader(h) {
    return String(h || "")
      .toLowerCase()
      .trim()
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/[%#()]/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  const SYN = {
    timestamp: ["time", "timestamp", "date", "datetime", "recorded at", "event time", "date time"],
    actualTorque: ["actual torque", "torque", "measured torque", "final torque", "torque reading", "actual"],
    targetTorque: ["target torque", "target", "setpoint", "spec", "nominal", "programmed torque"],
    angle: ["angle", "degrees", "deg", "angle degrees", "final angle"],
    passFail: ["status", "pass/fail", "pass fail", "ok", "result status", "judgement", "judgment", "result"],
    units: ["units", "unit", "torque units", "measurement units"],
    toolSerial: ["tool serial", "serial", "tool id", "id", "serial number", "tool serial number"],
    toolModel: ["tool model", "model", "tool type", "device model"]
  };

  function findKey(headers, wantedList) {
    const n = headers.map((h) => ({ raw: h, n: normHeader(h) }));

    for (const wanted of wantedList) {
      const w = normHeader(wanted);
      const exact = n.find((x) => x.n === w);
      if (exact) return exact.raw;
    }

    for (const wanted of wantedList) {
      const w = normHeader(wanted);
      const starts = n.find((x) => x.n.startsWith(w));
      if (starts) return starts.raw;
    }

    for (const wanted of wantedList) {
      const w = normHeader(wanted);
      const partial = n.find((x) => x.n.includes(w) || w.includes(x.n));
      if (partial) return partial.raw;
    }

    return null;
  }

  function numLoose(x) {
    const s = String(x ?? "").replace(/,/g, "");
    const m = s.match(/-?\d+(\.\d+)?/);
    if (!m) return undefined;
    const v = Number(m[0]);
    return Number.isFinite(v) ? v : undefined;
  }

  function pf(x) {
    const v = String(x ?? "").trim().toLowerCase();
    if (!v) return "UNKNOWN";
    if (["pass", "ok", "good", "true", "1", "p", "accept", "accepted"].includes(v)) return "PASS";
    if (["fail", "ng", "bad", "false", "0", "f", "reject", "rejected"].includes(v)) return "FAIL";
    return "UNKNOWN";
  }

  function inferPassFail(row, kPF, kAct, kTgt) {
    if (kPF) {
      const direct = pf(row[kPF]);
      if (direct !== "UNKNOWN") return direct;
    }

    const act = kAct ? numLoose(row[kAct]) : undefined;
    const tgt = kTgt ? numLoose(row[kTgt]) : undefined;

    if (typeof act === "number" && typeof tgt === "number") {
      return act >= tgt ? "PASS" : "FAIL";
    }

    return "UNKNOWN";
  }

  function inferUnits(rows, kUnits, kAct, headers) {
    if (kUnits) {
      for (const r of rows) {
        const v = String(r[kUnits] || "").trim();
        if (v) return v;
      }
    }

    const joinedHeaders = headers.map(normHeader).join(" | ");
    if (joinedHeaders.includes("ft lb") || joinedHeaders.includes("foot pound")) return "ft-lb";
    if (joinedHeaders.includes("in lb") || joinedHeaders.includes("inch pound")) return "in-lb";
    if (joinedHeaders.includes("nm") || joinedHeaders.includes("n m")) return "N·m";

    if (kAct) {
      for (const r of rows) {
        const raw = String(r[kAct] || "");
        if (/ft-?lb|foot/i.test(raw)) return "ft-lb";
        if (/in-?lb|inch/i.test(raw)) return "in-lb";
        if (/n[.\s·-]?m/i.test(raw)) return "N·m";
      }
    }

    return undefined;
  }

  function renderPreview(events) {
    if (!previewTable) return;

    const cols = ["timestamp", "actualTorque", "targetTorque", "angle", "units", "passFail"];
    const head = `<thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead>`;
    const body = `<tbody>${
      events.slice(0, 25).map((e) =>
        `<tr>${cols.map((c) => `<td>${e[c] ?? ""}</td>`).join("")}</tr>`
      ).join("")
    }</tbody>`;

    previewTable.innerHTML = head + body;
  }

  function renderSavedList(jobId, equipmentId) {
    const listEl = $("sessionList");
    if (!listEl || !window.NEXUS_SNAPON_STORE || typeof window.NEXUS_SNAPON_STORE.listSessions !== "function") {
      return;
    }

    const sessions = window.NEXUS_SNAPON_STORE.listSessions(jobId, equipmentId);

    if (!sessions.length) {
      listEl.innerHTML = `<div class="item"><div class="itemTitle">No sessions saved yet.</div></div>`;
      showSaved(true);
      return;
    }

    listEl.innerHTML = sessions.map((s) => {
      const title = `${s.source} • ${s.eventCount} events • ${s.passCount} pass / ${s.failCount} fail`;
      const sub = `${s.sourceFileName || "(manual)"} • capturedAt ${s.capturedAt || s.createdAt || ""}`;
      return `
        <div class="item">
          <div class="itemTop">
            <div>
              <div class="itemTitle">${title}</div>
              <div class="itemSub">${sub}</div>
              <div class="mono">sessionId: ${s.id}</div>
            </div>
          </div>
        </div>
      `;
    }).join("");

    showSaved(true);
  }

  function populateFromSession(session) {
    if (!session) return;

    parsed = {
      fileName: session.sourceFileName || "",
      delimiter: session.delimiter || ",",
      units: session.units,
      toolSerial: session.toolSerial,
      toolModel: session.toolModel,
      capturedAt: session.capturedAt || session.createdAt || new Date().toISOString(),
      headers: session.headers || [],
      events: Array.isArray(session.events) ? session.events : [],
      eventCount: typeof session.eventCount === "number" ? session.eventCount : (session.events || []).length,
      passCount: typeof session.passCount === "number" ? session.passCount : 0,
      failCount: typeof session.failCount === "number" ? session.failCount : 0
    };

    if (pillEvents) pillEvents.textContent = `events: ${parsed.eventCount}`;
    if (pillPass) pillPass.textContent = `pass: ${parsed.passCount}`;
    if (pillFail) pillFail.textContent = `fail: ${parsed.failCount}`;
    if (pillUnits) pillUnits.textContent = `units: ${parsed.units || "—"}`;

    if (metaLine) {
      metaLine.textContent =
        `${parsed.fileName || "(saved session)"} • ${
          parsed.toolModel ? parsed.toolModel + " • " : ""
        }${parsed.toolSerial ? parsed.toolSerial + " • " : ""}capturedAt ${parsed.capturedAt}`;
    }

    renderPreview(parsed.events || []);
    showPreview(true);
    saveBtn.disabled = false;
    setStatus("Loaded latest saved session from local storage.");
  }

  async function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => reject(new Error("File read failed"));
      r.readAsText(file);
    });
  }

  function validateRequiredEls() {
    const missing = [];
    if (!statusEl) missing.push("status");
    if (!parseBtn) missing.push("parseBtn");
    if (!saveBtn) missing.push("saveBtn");
    if (!fileEl) missing.push("file");
    if (!previewBlock) missing.push("previewBlock");
    if (!savedBlock) missing.push("savedBlock");
    if (!previewTable) missing.push("previewTable");
    if (!pillEvents) missing.push("pillEvents");
    if (!pillPass) missing.push("pillPass");
    if (!pillFail) missing.push("pillFail");
    if (!pillUnits) missing.push("pillUnits");
    if (!jobIdEl) missing.push("jobId");
    if (!equipmentIdEl) missing.push("equipmentId");
    return missing;
  }

  const missingEls = validateRequiredEls();
  if (missingEls.length) {
    console.error("Snap-on import missing required elements:", missingEls);
    setStatus(`Page is missing required elements: ${missingEls.join(", ")}`);
    return;
  }

  parseBtn.addEventListener("click", async () => {
    setStatus("");
    showPreview(false);
    saveBtn.disabled = true;
    parsed = null;

    const jobId = jobIdEl.value.trim();
    const equipmentId = equipmentIdEl.value.trim();

    if (!jobId || !equipmentId) {
      return setStatus("Job ID and Equipment ID are required.");
    }

    const file = fileEl.files && fileEl.files[0];
    if (!file) {
      return setStatus("Choose a CSV exported from ConnecTorq.");
    }

    setStatus("Parsing…");

    try {
      const text = await readFileAsText(file);
      const { headers, rows, delimiter } = parseCsv(text);

      if (!headers.length || !rows.length) {
        return setStatus("CSV appears empty or unreadable.");
      }

      const kTs = findKey(headers, SYN.timestamp);
      const kAct = findKey(headers, SYN.actualTorque);
      const kTgt = findKey(headers, SYN.targetTorque);
      const kAng = findKey(headers, SYN.angle);
      const kPF = findKey(headers, SYN.passFail);
      const kUnits = findKey(headers, SYN.units);
      const kSerial = findKey(headers, SYN.toolSerial);
      const kModel = findKey(headers, SYN.toolModel);

      if (!kAct) {
        return setStatus(`Could not find a torque column in the file. Headers found: ${headers.join(" | ")}`);
      }

      const units = inferUnits(rows, kUnits, kAct, headers);

      let toolSerial;
      if (kSerial) {
        const firstWithSerial = rows.find((r) => String(r[kSerial] || "").trim());
        toolSerial = firstWithSerial ? String(firstWithSerial[kSerial] || "").trim() : undefined;
      }

      let toolModel;
      if (kModel) {
        const firstWithModel = rows.find((r) => String(r[kModel] || "").trim());
        toolModel = firstWithModel ? String(firstWithModel[kModel] || "").trim() : undefined;
      }

      const events = rows
        .map((r) => ({
          timestamp: kTs ? String(r[kTs] || "").trim() || undefined : undefined,
          actualTorque: kAct ? numLoose(r[kAct]) : undefined,
          targetTorque: kTgt ? numLoose(r[kTgt]) : undefined,
          angle: kAng ? numLoose(r[kAng]) : undefined,
          units: (kUnits ? String(r[kUnits] || "").trim() : "") || units,
          passFail: inferPassFail(r, kPF, kAct, kTgt),
          raw: r
        }))
        .filter((e) => {
          return (
            e.timestamp !== undefined ||
            e.actualTorque !== undefined ||
            e.targetTorque !== undefined ||
            e.angle !== undefined ||
            e.passFail !== "UNKNOWN"
          );
        });

      if (!events.length) {
        return setStatus(`No usable event rows were detected. Headers found: ${headers.join(" | ")}`);
      }

      const passCount = events.filter((e) => e.passFail === "PASS").length;
      const failCount = events.filter((e) => e.passFail === "FAIL").length;

      let capturedAt = new Date().toISOString();
      const ts0 = events.find((e) => e.timestamp)?.timestamp;
      if (ts0) {
        const d = new Date(ts0);
        if (!isNaN(d.getTime())) capturedAt = d.toISOString();
      }

      parsed = {
        fileName: file.name,
        delimiter,
        units,
        toolSerial,
        toolModel,
        capturedAt,
        headers,
        events,
        eventCount: events.length,
        passCount,
        failCount
      };

      pillEvents.textContent = `events: ${events.length}`;
      pillPass.textContent = `pass: ${passCount}`;
      pillFail.textContent = `fail: ${failCount}`;
      pillUnits.textContent = `units: ${units || "—"}`;

      if (metaLine) {
        metaLine.textContent =
          `${file.name} • delimiter ${delimiter} • ${
            toolModel ? toolModel + " • " : ""
          }${toolSerial ? toolSerial + " • " : ""}capturedAt ${capturedAt}`;
      }

      renderPreview(events);
      showPreview(true);
      saveBtn.disabled = false;
      setStatus("Preview ready. Save to store in NEXUS.");

      renderSavedList(jobId, equipmentId);
    } catch (e) {
      console.error("Snap-on parse failed:", e);
      setStatus(`Parse failed: ${e.message || e}`);
    }
  });

  saveBtn.addEventListener("click", () => {
    const jobId = jobIdEl.value.trim();
    const equipmentId = equipmentIdEl.value.trim();

    if (!parsed) {
      return setStatus("Nothing parsed yet.");
    }

    if (!window.NEXUS_SNAPON_STORE || typeof window.NEXUS_SNAPON_STORE.upsertSession !== "function") {
      return setStatus("Snap-on storage module is unavailable.");
    }

    const session = {
      id: (parsed && parsed.id) || (typeof window.NEXUS_SNAPON_STORE.uuid === "function"
        ? window.NEXUS_SNAPON_STORE.uuid()
        : `snapon_${Date.now()}`),
      jobId,
      equipmentId,
      source: "SNAPON_CONNECTORQ",
      sourceFileName: parsed.fileName,
      capturedAt: parsed.capturedAt,
      toolSerial: parsed.toolSerial,
      toolModel: parsed.toolModel,
      units: parsed.units,
      eventCount: parsed.eventCount,
      passCount: parsed.passCount,
      failCount: parsed.failCount,
      createdAt: parsed.createdAt || new Date().toISOString(),
      headers: parsed.headers,
      events: parsed.events
    };

    const saved = window.NEXUS_SNAPON_STORE.upsertSession(session);
    populateFromSession(saved);
    renderSavedList(jobId, equipmentId);
    saveBtn.disabled = true;
    setStatus("Saved to NEXUS (localStorage).");
  });

  (function init() {
    const jobId = jobIdEl.value.trim();
    const equipmentId = equipmentIdEl.value.trim();

    if (jobId && equipmentId) {
      renderSavedList(jobId, equipmentId);

      if (window.NEXUS_SNAPON_STORE && typeof window.NEXUS_SNAPON_STORE.getLatestSession === "function") {
        const latest = window.NEXUS_SNAPON_STORE.getLatestSession(jobId, equipmentId);
        if (latest) {
          populateFromSession(latest);
        }
      }
    }
  })();
})();
