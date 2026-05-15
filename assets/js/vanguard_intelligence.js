/*
  assets/js/vanguard_intelligence.js
  NEXUS Vanguard Intelligence Layer

  Additive layer only.
  Requires: assets/js/vanguard_core.js

  Purpose:
  - Predict next required field action.
  - Score evidence confidence.
  - Detect missing workflow proof.
  - Create QA-facing intelligence signals.
  - Feed the existing Vanguard core state without breaking page logic.
*/

(function () {
  "use strict";

  if (typeof window === "undefined") return;
  if (window.NEXUS_VANGUARD_INTELLIGENCE && window.NEXUS_VANGUARD_INTELLIGENCE.__installed) return;

  const VERSION = "0.3.1-vanguard-intelligence";

  const WORKFLOW = [
    { id: "rif", label: "Receipt Inspection Form", action: "Complete receipt inspection before construction workflow continues." },
    { id: "phenolic", label: "Phenolic Display", action: "Verify phenolic labeling and equipment identification." },
    { id: "torque", label: "Torque Application", action: "Complete torque application and required validation." },
    { id: "l2", label: "L2 Installation Verification", action: "Complete L2 installation verification." },
    { id: "meg", label: "Megohmmeter Testing", action: "Complete line/load megohmmeter testing." },
    { id: "prefod", label: "Pre-FOD Inspection", action: "Complete foreign object and debris inspection." },
    { id: "fpv", label: "Finished Product Verification", action: "Capture finished product verification photo." },
    { id: "ccs", label: "Final Construction Check Sheet", action: "Complete final CCS sign-off." }
  ];

  function nowISO() {
    return new Date().toISOString();
  }

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function readText(key) {
    try {
      return localStorage.getItem(key) || "";
    } catch (err) {
      return "";
    }
  }

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  function getEq() {
    if (window.NEXUS_VANGUARD && typeof window.NEXUS_VANGUARD.getEq === "function") {
      return clean(window.NEXUS_VANGUARD.getEq());
    }

    const qs = new URLSearchParams(location.search || "");

    return clean(
      qs.get("eq") ||
      readText("nexus_active_eq") ||
      readText("nexus_active_equipment") ||
      readText("nexus_current_eq")
    );
  }

  function stepDone(eq, stepId) {
    if (window.NEXUS_VANGUARD && typeof window.NEXUS_VANGUARD.isStepComplete === "function") {
      try {
        if (window.NEXUS_VANGUARD.isStepComplete(stepId, eq)) return true;
      } catch (err) {}
    }

    return readText(`nexus_${eq}_step_${stepId}`) === "1";
  }

  function getSystemState(eq) {
    if (window.NEXUS_VANGUARD && typeof window.NEXUS_VANGUARD.getState === "function") {
      try {
        return window.NEXUS_VANGUARD.getState(eq);
      } catch (err) {}
    }

    return readJSON(`nexus_${eq}_vanguard_system`, {}) || {};
  }

  function hasAnyEvidence(eq, names) {
    return names.some(function (name) {
      if (readText(`nexus_${eq}_${name}`)) return true;
      if (readJSON(`nexus_${eq}_${name}`, null)) return true;
      return false;
    });
  }

  function collectEvidence(eq) {
    return {
      rif: hasAnyEvidence(eq, ["step_rif", "rif_export", "rif_vanguard_export"]),
      phenolic: hasAnyEvidence(eq, ["step_phenolic", "phenolic_export", "phenolic_photo"]),
      torque: hasAnyEvidence(eq, ["step_torque", "torque_vanguard_export", "torque_foreman_state_v1", "torque_tilt_v2"]),
      l2: hasAnyEvidence(eq, ["step_l2", "l2_export", "l2_vanguard_export"]),
      meg: hasAnyEvidence(eq, ["step_meg", "meg_log_v2", "meg_vanguard_export", "meg_equip_v1"]),
      prefod: hasAnyEvidence(eq, ["step_prefod", "prefod_checklist_v1", "prefod_vanguard_export"]),
      fpv: hasAnyEvidence(eq, ["step_fpv", "fpv_photo", "finished_photo"]),
      ccs: hasAnyEvidence(eq, ["step_ccs", "ccs_signed_off", "ccs_vanguard_export", "ccs_two_tab_v1"])
    };
  }

  function detectNextAction(eq, state, evidence) {
    for (const step of WORKFLOW) {
      const complete = stepDone(eq, step.id);
      const proof = !!evidence[step.id];

      if (!complete) {
        return {
          stepId: step.id,
          label: step.label,
          action: step.action,
          reason: "Workflow step is not complete.",
          severity: "active"
        };
      }

      if (complete && !proof) {
        return {
          stepId: step.id,
          label: step.label,
          action: "Review missing evidence for " + step.label + ".",
          reason: "Completion exists but supporting evidence was not detected.",
          severity: "review"
        };
      }
    }

    if (state && state.readiness && state.readiness.readyForEnergization) {
      return {
        stepId: "energization",
        label: "Energization Review",
        action: "Package appears ready for energization review.",
        reason: "All major gates are satisfied.",
        severity: "ready"
      };
    }

    return {
      stepId: "package",
      label: "Package Review",
      action: "Review turnover package and resolve remaining Vanguard locks.",
      reason: "Workflow is complete but final readiness still needs review.",
      severity: "review"
    };
  }

  function scoreEvidence(eq, evidence) {
    const keys = Object.keys(evidence);
    const total = keys.length || 1;
    const present = keys.filter(function (k) { return evidence[k]; }).length;
    const missing = keys.filter(function (k) { return !evidence[k]; });

    let score = Math.round((present / total) * 100);

    if (!stepDone(eq, "torque")) score -= 10;
    if (!stepDone(eq, "meg")) score -= 10;
    if (!stepDone(eq, "ccs")) score -= 8;

    return {
      score: Math.max(0, Math.min(100, score)),
      present,
      total,
      missing
    };
  }

  function detectRisk(eq, state, evidenceScore, nextAction) {
    const risks = [];

    if (evidenceScore.missing.length) {
      risks.push({
        code: "MISSING_EVIDENCE",
        label: "Missing evidence detected",
        severity: evidenceScore.missing.length > 2 ? "high" : "medium",
        count: evidenceScore.missing.length
      });
    }

    if (state && Array.isArray(state.locks) && state.locks.length) {
      risks.push({
        code: "ACTIVE_LOCKS",
        label: "Active Vanguard locks exist",
        severity: "high",
        count: state.locks.length
      });
    }

    if (state && Array.isArray(state.overrides) && state.overrides.length) {
      risks.push({
        code: "OVERRIDE_PATTERN",
        label: "Override history exists",
        severity: state.overrides.length > 2 ? "high" : "medium",
        count: state.overrides.length
      });
    }

    if (nextAction && nextAction.severity === "review") {
      risks.push({
        code: "REVIEW_REQUIRED",
        label: "Human review required",
        severity: "medium",
        count: 1
      });
    }

    return risks;
  }

  function detectContradictionPlaceholders(eq) {
    const flags = [];

    const torque = readJSON(`nexus_${eq}_torque_vanguard_export`, null);
    if (torque && Array.isArray(torque.issues) && torque.issues.length) {
      flags.push({
        code: "TORQUE_VALIDATION_ISSUES",
        label: "Torque validation issues exist",
        severity: "high",
        count: torque.issues.length
      });
    }

    const ccs = readJSON(`nexus_${eq}_ccs_vanguard_export`, null);
    const ccsIssues = ccs && ccs.validation && Array.isArray(ccs.validation.issues)
      ? ccs.validation.issues
      : [];

    if (ccsIssues.length) {
      flags.push({
        code: "CCS_REVIEW_ITEMS",
        label: "CCS review items exist",
        severity: "medium",
        count: ccsIssues.length
      });
    }

    return flags;
  }

  function buildIntelligence(eq) {
    const state = getSystemState(eq);
    const evidence = collectEvidence(eq);
    const evidenceScore = scoreEvidence(eq, evidence);
    const nextAction = detectNextAction(eq, state, evidence);
    const risks = detectRisk(eq, state, evidenceScore, nextAction);
    const contradictionFlags = detectContradictionPlaceholders(eq);

    const packageReviewRisk =
      risks.some(function (r) { return r.severity === "high"; })
        ? "HIGH"
        : risks.length
          ? "MEDIUM"
          : "LOW";

    const likelyDelayCause =
      evidenceScore.missing.length
        ? "Missing evidence: " + evidenceScore.missing.join(", ")
        : "";

    const qaNarrative =
      "Vanguard reviewed the current equipment workflow, completion records, evidence signals, and active risk indicators. " +
      "Package review risk is " + packageReviewRisk + ". " +
      "Evidence confidence is " + evidenceScore.score + "%, with " +
      evidenceScore.present + " of " + evidenceScore.total +
      " expected evidence groups detected. " +
      (
        evidenceScore.missing.length
          ? "Missing evidence was detected for: " + evidenceScore.missing.join(", ") + ". "
          : "No major evidence gaps were detected. "
      ) +
      "Recommended next action: " + nextAction.action;

    return {
      version: VERSION,
      equipmentId: eq,
      updatedAt: nowISO(),
      qaNarrative: qaNarrative,

      fieldMode: {
        headline: nextAction.label,
        instruction: nextAction.action,
        reason: nextAction.reason,
        severity: nextAction.severity,
        stepId: nextAction.stepId
      },

      officeMode: {
        evidenceScore: evidenceScore.score,
        evidencePresent: evidenceScore.present,
        evidenceTotal: evidenceScore.total,
        missingEvidence: evidenceScore.missing,
        riskFlags: risks,
        contradictionFlags: contradictionFlags
      },

      predictions: {
        packageReviewRisk: packageReviewRisk,
        likelyDelayCause: likelyDelayCause,
        nextBestAction: nextAction.action
      }
    };
  }

  function publish(eq, intelligence) {
    if (!eq || !intelligence) return;

    writeJSON(`nexus_${eq}_vanguard_intelligence`, intelligence);

    if (window.NEXUS_VANGUARD && typeof window.NEXUS_VANGUARD.updateState === "function") {
      try {
        window.NEXUS_VANGUARD.updateState({
          intelligence: intelligence,
          evidence: {
            intelligence: {
              exists: true,
              updatedAt: intelligence.updatedAt
            }
          },
          aiFlags: [
            ...(intelligence.officeMode.riskFlags || []),
            ...(intelligence.officeMode.contradictionFlags || [])
          ]
        }, "vanguard:intelligence:update");
      } catch (err) {
        console.warn("Vanguard intelligence publish failed", err);
      }
    }
  }

  function renderFieldPanel(eq, intelligence) {
    if (!document.body || !intelligence) return;

    let panel = document.getElementById("vxBrainPanel");

    if (!panel) {
      panel = document.createElement("section");
      panel.id = "vxBrainPanel";
      panel.className = "vx-orch-panel";

      const target = document.getElementById("vxOrchPanel");

      if (target && target.parentNode) {
        target.parentNode.insertBefore(panel, target.nextSibling);
      } else {
        document.body.insertBefore(panel, document.body.firstChild);
      }
    }

    const mode = intelligence.fieldMode;
    const office = intelligence.officeMode;
    const pred = intelligence.predictions;

    const tone =
      mode.severity === "ready"
        ? "pass"
        : mode.severity === "review"
          ? "review"
          : "info";

    panel.innerHTML = `
      <div class="vx-orch-top">
        <div>
          <div class="vx-orch-title">VANGUARD NEXT ACTION</div>
          <div class="vx-orch-sub">${escapeHTML(mode.reason || "")}</div>
        </div>
        <div class="vx-orch-badge ${tone}">
          ${escapeHTML(mode.headline || "NEXT ACTION")}
        </div>
      </div>

      <div style="margin-top:14px;padding:16px;border-radius:18px;background:rgba(0,0,0,.24);border:1px solid rgba(255,255,255,.18);">
        <div style="font-size:26px;font-weight:1000;line-height:1.15;">
          ${escapeHTML(mode.instruction || "Review current workflow.")}
        </div>
      </div>

      <div class="vx-orch-grid">
        <div class="vx-orch-card">
          <b>Evidence Confidence</b>
          <span>${escapeHTML(office.evidenceScore)}%</span>
        </div>

        <div class="vx-orch-card">
          <b>Missing Evidence</b>
          <span>${escapeHTML(office.missingEvidence.length)}</span>
        </div>

        <div class="vx-orch-card">
          <b>Package Review Risk</b>
          <span>${escapeHTML(pred.packageReviewRisk)}</span>
        </div>

        <div class="vx-orch-card">
          <b>Delay Cause</b>
          <span>${escapeHTML(pred.likelyDelayCause || "None")}</span>
        </div>
      </div>
    `;
  }

  function applyAdaptiveWorkflowUI(intelligence) {
    if (!intelligence || !intelligence.fieldMode) return;

    const activeStep = intelligence.fieldMode.stepId;

    const buttonMap = {
      rif: "rifBtn",
      phenolic: "phenolicBtn",
      torque: "torqueBtn",
      l2: "l2Btn",
      meg: "lvtBtn",
      prefod: "prefodBtn",
      fpv: "finishedPhotoBtn",
      ccs: "constructionBtn",
      energization: "energizationBtn"
    };

    Object.keys(buttonMap).forEach(function (stepId) {
      const btn = document.getElementById(buttonMap[stepId]);
      if (!btn) return;

      btn.classList.remove("vx-next-action-glow");
      btn.removeAttribute("data-vx-next");

      btn.style.opacity = "0.55";
      btn.style.transform = "";
      btn.style.filter = "";

      if (stepId === activeStep) {
        btn.classList.add("vx-next-action-glow");
        btn.setAttribute("data-vx-next", "true");
        btn.style.opacity = "1";
        btn.style.transform = "scale(1.03)";
        btn.style.filter = "drop-shadow(0 0 16px rgba(0,194,255,.45))";
      }

      if (stepDone(getEq(), stepId)) {
        btn.style.opacity = "0.78";
      }
    });
  }

  function renderWorkflowLocks(eq, intelligence) {
    if (!intelligence) return;

    let panel = document.getElementById("vxWorkflowLocks");

    if (!panel) {
      panel = document.createElement("section");
      panel.id = "vxWorkflowLocks";
      panel.className = "vx-orch-panel";

      const target = document.getElementById("vxBrainPanel");

      if (target && target.parentNode) {
        target.parentNode.insertBefore(panel, target.nextSibling);
      }
    }

    if (!panel) return;

    const locks = [];
    const evidence = (intelligence.officeMode && intelligence.officeMode.missingEvidence) || [];

    if (evidence.includes("torque")) {
      locks.push({
        title: "Torque Validation Missing",
        impact: "Megohmmeter testing and energization readiness may be unreliable.",
        unlock: "Complete torque workflow and validation."
      });
    }

    if (evidence.includes("meg")) {
      locks.push({
        title: "Megohmmeter Evidence Missing",
        impact: "Electrical installation quality cannot be verified.",
        unlock: "Complete Line and Load meg testing."
      });
    }

    if (evidence.includes("ccs")) {
      locks.push({
        title: "Construction Check Sheet Incomplete",
        impact: "Final turnover package confidence is reduced.",
        unlock: "Complete CCS signoff workflow."
      });
    }

    const aiFlags = (intelligence.officeMode && intelligence.officeMode.riskFlags) || [];

    aiFlags.forEach(function (flag) {
      if (flag.code === "ACTIVE_LOCKS") {
        locks.push({
          title: "Active Vanguard Locks",
          impact: "AI detected unresolved workflow restrictions.",
          unlock: "Resolve blocked workflow conditions."
        });
      }

      if (flag.code === "OVERRIDE_PATTERN") {
        locks.push({
          title: "High Override Activity",
          impact: "Frequent overrides reduce QA confidence.",
          unlock: "Review override decisions and evidence."
        });
      }
    });

    if (!locks.length) {
      panel.innerHTML = `
        <div class="vx-orch-top">
          <div>
            <div class="vx-orch-title">VANGUARD WORKFLOW ANALYSIS</div>
            <div class="vx-orch-sub">No workflow locks detected.</div>
          </div>
          <div class="vx-orch-badge pass">CLEAR</div>
        </div>

        <div style="margin-top:16px;padding:18px;border-radius:18px;background:rgba(0,255,120,.08);border:1px solid rgba(0,255,120,.22);font-size:20px;font-weight:1000;">
          Workflow path appears clear.
        </div>
      `;
      return;
    }

    panel.innerHTML = `
      <div class="vx-orch-top">
        <div>
          <div class="vx-orch-title">VANGUARD WORKFLOW ANALYSIS</div>
          <div class="vx-orch-sub">AI detected workflow restrictions and downstream impacts.</div>
        </div>
        <div class="vx-orch-badge review">REVIEW</div>
      </div>

      <div class="vx-orch-grid">
        ${locks.map(function (lock) {
          return `
            <div class="vx-orch-card">
              <b>${escapeHTML(lock.title)}</b>

              <span style="font-size:15px;line-height:1.45;font-weight:700;">
                ${escapeHTML(lock.impact)}
              </span>

              <div style="margin-top:10px;padding:10px;border-radius:12px;background:rgba(0,180,255,.12);border:1px solid rgba(0,180,255,.20);font-size:13px;font-weight:900;">
                UNLOCK: ${escapeHTML(lock.unlock)}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function escapeHTML(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function refresh() {
    const eq = getEq();
    if (!eq) return null;

    const intelligence = buildIntelligence(eq);

    publish(eq, intelligence);
    renderFieldPanel(eq, intelligence);
    applyAdaptiveWorkflowUI(intelligence);
    renderWorkflowLocks(eq, intelligence);

    return intelligence;
  }

  const api = {
    __installed: true,
    version: VERSION,
    refresh,
    buildIntelligence,
    collectEvidence,
    detectNextAction,
    scoreEvidence,
    renderWorkflowLocks
  };

  window.NEXUS_VANGUARD_INTELLIGENCE = api;
  window.VanguardIntelligence = api;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refresh);
  } else {
    refresh();
  }

  window.addEventListener("focus", function () {
    setTimeout(refresh, 75);
  });

  window.addEventListener("storage", function () {
    setTimeout(refresh, 75);
  });

  window.addEventListener("vanguard:update", function () {
    setTimeout(refresh, 75);
  });

})();
