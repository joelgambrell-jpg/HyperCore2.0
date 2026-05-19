/* =========================================================
   NEXUS VANGUARD REGISTRY
   AI / Rule / Validation Foundation
   ========================================================= */

window.NEXUS_VANGUARD = (function () {
  const VERSION = "1.0.0";

  function nowISO() {
    return new Date().toISOString();
  }

  function cleanEq(eq) {
    return String(eq || "NO_EQ")
      .trim()
      .replace(/[.#$/[\]]/g, "_") || "NO_EQ";
  }

  function readJSON(key, fallback) {
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
    } catch (e) {
      console.warn("NEXUS Vanguard local save failed:", key, e);
    }
  }

  function key(eq, name) {
    return "nexus_" + cleanEq(eq) + "_vanguard_" + name;
  }

  function getRequirements(eq) {
    return readJSON(key(eq, "requirements"), {
      version: VERSION,
      equipmentId: cleanEq(eq),
      updatedAt: "",
      torque: [],
      meg: {},
      ccs: [],
      l2: [],
      prefod: [],
      sources: []
    });
  }

  function saveRequirements(eq, requirements) {
    const payload = {
      version: VERSION,
      equipmentId: cleanEq(eq),
      ...(requirements || {}),
      updatedAt: nowISO()
    };

    writeJSON(key(eq, "requirements"), payload);
    saveFirebase(eq, "vanguardRequirements", payload);

    return payload;
  }

  function getValidationLog(eq) {
    return readJSON(key(eq, "validation_log"), []);
  }

  function addValidationLog(eq, entry) {
    const log = getValidationLog(eq);

    const payload = {
      id: "VG-" + Date.now(),
      equipmentId: cleanEq(eq),
      timestamp: nowISO(),
      ...(entry || {})
    };

    log.unshift(payload);
    writeJSON(key(eq, "validation_log"), log);
    saveFirebase(eq, "vanguardValidationLog", log);

    return payload;
  }

  function saveFirebase(eq, section, data) {
    if (window.NexusLiveSync && typeof window.NexusLiveSync.save === "function") {
      window.NexusLiveSync.save(cleanEq(eq), section, data);
    }
  }

  function normalizeNumber(value) {
    const n = Number(String(value || "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  function status(result) {
    if (!result) return "REVIEW";
    return String(result).toUpperCase();
  }

  function findTorqueRequirement(eq, row) {
    const req = getRequirements(eq);
    const torque = Array.isArray(req.torque) ? req.torque : [];

    const rowConnection = String(row.connection || row.location || row.description || "").trim().toLowerCase();
    const rowBolt = String(row.bolt || row.boltSize || "").trim().toLowerCase();

    return torque.find(function (item) {
      const itemConnection = String(item.connection || item.location || item.description || "").trim().toLowerCase();
      const itemBolt = String(item.bolt || item.boltSize || "").trim().toLowerCase();

      if (rowConnection && itemConnection && rowConnection === itemConnection) return true;
      if (rowBolt && itemBolt && rowBolt === itemBolt) return true;

      return false;
    }) || null;
  }

  function validateTorque(eq, rows) {
    const inputRows = Array.isArray(rows) ? rows : [];
    const issues = [];
    const outputRows = [];

    inputRows.forEach(function (row, index) {
      const requirement = findTorqueRequirement(eq, row);
      const actual = normalizeNumber(row.value || row.actualTorque || row.torque);
      const expected = requirement ? normalizeNumber(requirement.torque || requirement.value || requirement.specTorque) : null;

      let rowStatus = "PASS";
      let reason = "";

      if (!requirement) {
        rowStatus = "REVIEW";
        reason = "No approved Vanguard torque requirement found.";
      } else if (actual === null) {
        rowStatus = "FAIL";
        reason = "Actual torque value is missing.";
      } else if (expected === null) {
        rowStatus = "REVIEW";
        reason = "Requirement exists but does not contain a readable torque value.";
      } else if (actual !== expected) {
        rowStatus = "FAIL";
        reason = "Actual torque does not match approved requirement.";
      }

      const resultRow = {
        row: index + 1,
        connection: row.connection || row.location || "",
        bolt: row.bolt || row.boltSize || "",
        boltType: row.boltType || "",
        actualTorque: actual,
        requiredTorque: expected,
        unit: row.unit || row.units || (requirement && requirement.unit) || "",
        status: rowStatus,
        reason,
        source: requirement ? requirement.source || requirement.document || "" : "",
        sourceRef: requirement ? requirement.sourceRef || requirement.reference || "" : ""
      };

      if (rowStatus !== "PASS") issues.push(resultRow);
      outputRows.push(resultRow);
    });

    const result = {
      section: "torque",
      status: issues.length ? "FAIL" : "PASS",
      issues,
      rows: outputRows,
      overrideAllowed: true,
      updatedAt: nowISO()
    };

    addValidationLog(eq, result);
    saveFirebase(eq, "torqueVanguardValidation", result);

    return result;
  }

  function validateMeg(eq, data) {
    const req = getRequirements(eq);
    const megReq = req.meg || {};

    const threshold = normalizeNumber(megReq.threshold || megReq.minimum || 11);
    const unit = megReq.unit || "MΩ";

    const rows = []
      .concat(Array.isArray(data && data.lineRows) ? data.lineRows : [])
      .concat(Array.isArray(data && data.loadRows) ? data.loadRows : []);

    const issues = [];
    const outputRows = [];

    rows.forEach(function (row, index) {
      const reading = normalizeNumber(row.reading || row.value || row.resistance);

      let rowStatus = "PASS";
      let reason = "";

      if (reading === null) {
        rowStatus = "FAIL";
        reason = "Megohmmeter reading is missing.";
      } else if (reading < threshold) {
        rowStatus = "FAIL";
        reason = "Reading is below approved threshold.";
      }

      const resultRow = {
        row: index + 1,
        conductor: row.conductor || "",
        phase: row.phase || "",
        reading,
        threshold,
        unit,
        status: rowStatus,
        reason,
        source: megReq.source || "",
        sourceRef: megReq.sourceRef || ""
      };

      if (rowStatus !== "PASS") issues.push(resultRow);
      outputRows.push(resultRow);
    });

    const result = {
      section: "meg",
      status: issues.length ? "FAIL" : "PASS",
      threshold,
      unit,
      issues,
      rows: outputRows,
      overrideAllowed: true,
      updatedAt: nowISO()
    };

    addValidationLog(eq, result);
    saveFirebase(eq, "megVanguardValidation", result);

    return result;
  }

  function validateCCS(eq, rows) {
    const inputRows = Array.isArray(rows) ? rows : [];
    const issues = [];
    const outputRows = [];

    inputRows.forEach(function (row, index) {
      const passFail = status(row.passFail || row.status || row.result);
      const signed = String(row.signedOffBy || row.signoff || "").trim();

      let rowStatus = "PASS";
      let reason = "";

      if (!passFail || passFail === "FAIL") {
        rowStatus = "FAIL";
        reason = "Checklist item is failed or missing pass status.";
      } else if (!signed) {
        rowStatus = "REVIEW";
        reason = "Checklist item is not signed off.";
      }

      const resultRow = {
        row: index + 1,
        stepNumber: row.stepNumber || row.step || "",
        stepDescription: row.stepDescription || row.description || "",
        passFail,
        signedOffBy: signed,
        status: rowStatus,
        reason
      };

      if (rowStatus !== "PASS") issues.push(resultRow);
      outputRows.push(resultRow);
    });

    const result = {
      section: "ccs",
      status: issues.length ? "REVIEW" : "PASS",
      issues,
      rows: outputRows,
      overrideAllowed: true,
      updatedAt: nowISO()
    };

    addValidationLog(eq, result);
    saveFirebase(eq, "ccsVanguardValidation", result);

    return result;
  }

  function approveOverride(eq, section, issue, approvedBy, reason) {
    const payload = {
      section,
      issue,
      approvedBy,
      reason,
      timestamp: nowISO(),
      status: "OVERRIDDEN"
    };

    addValidationLog(eq, payload);
    saveFirebase(eq, "vanguardOverride", payload);

    return payload;
  }

  function validate(eq, section, data) {
    const cleanSection = String(section || "").toLowerCase();

    if (cleanSection === "torque") {
      return validateTorque(eq, data && data.rows ? data.rows : data);
    }

    if (cleanSection === "meg") {
      return validateMeg(eq, data);
    }

    if (cleanSection === "ccs") {
      return validateCCS(eq, data && data.rows ? data.rows : data);
    }

    const result = {
      section: cleanSection,
      status: "REVIEW",
      issues: [{
        reason: "No Vanguard validator exists for this section yet."
      }],
      overrideAllowed: true,
      updatedAt: nowISO()
    };

    addValidationLog(eq, result);
    return result;
  }

  return {
    VERSION,
    getRequirements,
    saveRequirements,
    getValidationLog,
    addValidationLog,
    validate,
    validateTorque,
    validateMeg,
    validateCCS,
    approveOverride
  };
})();
