/*
  assets/js/vanguard_ai_assist_engine.js
  NEXUS Vanguard AI Assist Engine

  Purpose:
  - Invisible AI assistance layer.
  - Predicts missing workflow actions.
  - Simplifies field UX.
  - Generates guidance/recommendations.
  - Detects workflow anomalies.
  - Provides future AI integration points.
*/

(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_AI && window.NEXUS_VANGUARD_AI.__installed) return;

  var VERSION = '0.1.0-ai-assist-engine';

  function core() {
    return window.NEXUS_VANGUARD || window.Vanguard || null;
  }

  function workflow() {
    return window.NEXUS_VANGUARD_WORKFLOW || window.VanguardWorkflow || null;
  }

  function validation() {
    return window.NEXUS_VANGUARD_VALIDATION || window.VanguardValidation || null;
  }

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function upper(value) {
    return clean(value).toUpperCase();
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function getState() {
    var vg = core();

    if (!vg || typeof vg.getState !== 'function') return null;

    return vg.getState();
  }

  function addFlag(flag) {
    var vg = core();

    if (!vg || typeof vg.addFlag !== 'function') return;

    vg.addFlag(flag);
  }

  function updateState(patch, action) {
    var vg = core();

    if (!vg || typeof vg.updateState !== 'function') return null;

    return vg.updateState(patch || {}, action || 'ai:update');
  }

  function stepComplete(state, stepId) {
    return !!(
      state &&
      state.steps &&
      state.steps[stepId] &&
      state.steps[stepId].complete
    );
  }

  function validationFailed(state, group) {
    return !!(
      state &&
      state.validations &&
      state.validations[group] &&
      state.validations[group].failed
    );
  }

  function validationMissing(state, group, prop) {
    return !(
      state &&
      state.validations &&
      state.validations[group] &&
      state.validations[group][prop]
    );
  }

  function generateGuidance(state) {
    var guidance = [];

    if (!state) return guidance;

    var active =
      state.workflow &&
      state.workflow.currentStep
        ? state.workflow.currentStep
        : 'rif';

    switch (active) {

      case 'rif':
        guidance.push({
          severity: 'info',
          title: 'Receipt inspection required',
          message: 'Verify incoming equipment condition before downstream release.'
        });
      break;

      case 'phenolic':
        guidance.push({
          severity: 'info',
          title: 'Phenolic verification active',
          message: 'Verify labels and equipment identification before torque operations.'
        });
      break;

      case 'torque':

        if (validationMissing(state, 'torque', 'foremanVerified')) {
          guidance.push({
            severity: 'review',
            title: 'Foreman verification pending',
            message: 'Torque requires foreman verification before release.'
          });
        }

        if (validationFailed(state, 'torque')) {
          guidance.push({
            severity: 'danger',
            title: 'Torque failure detected',
            message: 'Resolve failed torque conditions before downstream work.'
          });
        }

      break;

      case 'meg':

        if (validationMissing(state, 'meg', 'lineComplete')) {
          guidance.push({
            severity: 'review',
            title: 'Meg line-side incomplete',
            message: 'Line-side meg validation remains open.'
          });
        }

        if (validationMissing(state, 'meg', 'loadComplete')) {
          guidance.push({
            severity: 'review',
            title: 'Meg load-side incomplete',
            message: 'Load-side meg validation remains open.'
          });
        }

      break;

      case 'prefod':
        guidance.push({
          severity: 'info',
          title: 'Pre-FOD inspection active',
          message: 'Ensure all debris and foreign objects are removed.'
        });
      break;

      case 'fpv':
        guidance.push({
          severity: 'info',
          title: 'Final verification active',
          message: 'Capture final photos and validate complete installation.'
        });
      break;

      case 'ccs':
        guidance.push({
          severity: 'info',
          title: 'Final CCS validation active',
          message: 'Review all validation gates before energization.'
        });
      break;

      case 'energization':
        guidance.push({
          severity: 'success',
          title: 'Ready for energization review',
          message: 'All major workflow gates are satisfied.'
        });
      break;
    }

    return guidance;
  }

  function detectAnomalies(state) {
    var anomalies = [];

    if (!state) return anomalies;

    if (
      stepComplete(state, 'meg') &&
      !stepComplete(state, 'torque')
    ) {
      anomalies.push({
        severity: 'danger',
        code: 'SEQUENCE_VIOLATION',
        message: 'Meg complete before torque completion.'
      });
    }

    if (
      stepComplete(state, 'fpv') &&
      !stepComplete(state, 'prefod')
    ) {
      anomalies.push({
        severity: 'danger',
        code: 'PREFOD_SKIPPED',
        message: 'FPV complete before Pre-FOD completion.'
      });
    }

    if (
      stepComplete(state, 'energization') &&
      state.ccs &&
      state.ccs.status !== 'PASS'
    ) {
      anomalies.push({
        severity: 'danger',
        code: 'ENERGIZATION_WITH_OPEN_CCS',
        message: 'Energization completed with open CCS issues.'
      });
    }

    if (
      state.documents &&
      Array.isArray(state.documents.conflicts) &&
      state.documents.conflicts.length > 0
    ) {
      anomalies.push({
        severity: 'review',
        code: 'DOCUMENT_CONFLICTS_PRESENT',
        message: 'Document conflicts remain unresolved.'
      });
    }

    return anomalies;
  }

  function computeAiConfidence(state) {
    if (!state) return 0;

    var score = 100;

    if (validationFailed(state, 'torque')) score -= 25;
    if (validationFailed(state, 'meg')) score -= 25;

    if (
      state.documents &&
      state.documents.conflicts &&
      state.documents.conflicts.length
    ) {
      score -= Math.min(20, state.documents.conflicts.length * 4);
    }

    if (
      state.ccs &&
      state.ccs.validationSummary &&
      state.ccs.validationSummary.review
    ) {
      score -= Math.min(
        15,
        state.ccs.validationSummary.review * 3
      );
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function computeRiskPrediction(state) {
    if (!state) return 0;

    var risk = 0;

    if (validationFailed(state, 'torque')) risk += 30;
    if (validationFailed(state, 'meg')) risk += 30;

    if (
      state.documents &&
      state.documents.conflicts &&
      state.documents.conflicts.length
    ) {
      risk += state.documents.conflicts.length * 5;
    }

    if (
      state.ccs &&
      state.ccs.validationSummary &&
      state.ccs.validationSummary.blocked
    ) {
      risk += state.ccs.validationSummary.blocked * 6;
    }

    return Math.max(0, Math.min(100, risk));
  }

  function computeAI() {
    var state = getState();

    if (!state) return null;

    var guidance = generateGuidance(state);
    var anomalies = detectAnomalies(state);

    var confidence = computeAiConfidence(state);
    var risk = computeRiskPrediction(state);

    anomalies.forEach(function (anomaly) {
      addFlag({
        code: anomaly.code,
        label: anomaly.message,
        severity: anomaly.severity
      });
    });

    return updateState({
      ai: {
        guidance: guidance,
        anomalies: anomalies,

        prediction: {
          aiConfidence: confidence,
          predictedRisk: risk
        },

        futureHooks: {
          ocrReady: true,
          llmReady: true,
          drawingAnalysisReady: true,
          sequencePredictionReady: true,
          predictiveRiskReady: true
        },

        updatedAt: nowISO()
      },

      confidenceScore: confidence,
      riskScore: risk

    }, 'ai:compute');
  }

  function renderAiPanel() {
    var state = getState();

    if (!state || !state.ai) return;

    var existing = document.getElementById('vanguard-ai-panel');

    if (!existing) {
      existing = document.createElement('div');
      existing.id = 'vanguard-ai-panel';

      existing.style.cssText =
        'max-width:1180px;margin:12px auto;padding:16px;border-radius:18px;' +
        'background:rgba(15,23,42,.95);color:#fff;font-family:Arial,Helvetica,sans-serif;' +
        'border:1px solid rgba(255,255,255,.18);box-shadow:0 12px 28px rgba(0,0,0,.28);';

      var target =
        document.querySelector('[data-vanguard-ai-mount]') ||
        document.querySelector('main') ||
        document.body;

      if (target === document.body) {
        document.body.insertBefore(existing, document.body.firstChild);
      } else {
        target.insertBefore(existing, target.firstChild);
      }
    }

    var guidance =
      Array.isArray(state.ai.guidance)
        ? state.ai.guidance
        : [];

    var anomalies =
      Array.isArray(state.ai.anomalies)
        ? state.ai.anomalies
        : [];

    existing.innerHTML =
      '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">' +

        '<div>' +
          '<div style="font-size:18px;font-weight:900;text-transform:uppercase;letter-spacing:.04em;">' +
            'VANGUARD AI ASSIST' +
          '</div>' +

          '<div style="margin-top:4px;font-size:13px;font-weight:700;opacity:.84;">' +
            'Invisible workflow intelligence active.' +
          '</div>' +
        '</div>' +

        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          pill('AI CONF', (state.ai.prediction.aiConfidence || 0) + '%') +
          pill('RISK', (state.ai.prediction.predictedRisk || 0) + '%') +
          pill('GUIDANCE', guidance.length) +
          pill('FLAGS', anomalies.length) +
        '</div>' +

      '</div>' +

      '<div style="margin-top:14px;display:grid;gap:8px;">' +

        guidance.map(function (item) {
          return card(item.severity, item.title, item.message);
        }).join('') +

        anomalies.map(function (item) {
          return card(item.severity, item.code, item.message);
        }).join('') +

      '</div>';
  }

  function pill(label, value) {
    return ''
      + '<span style="display:inline-flex;align-items:center;gap:6px;padding:8px 10px;'
      + 'border-radius:999px;background:rgba(255,255,255,.12);'
      + 'border:1px solid rgba(255,255,255,.16);font-size:11px;font-weight:900;">'
      + '<span style="opacity:.7;">' + escapeHTML(label) + '</span>'
      + '<span>' + escapeHTML(value) + '</span>'
      + '</span>';
  }

  function card(severity, title, message) {
    var color = '#475569';

    switch (severity) {
      case 'danger': color = '#dc2626'; break;
      case 'review': color = '#f59e0b'; break;
      case 'success': color = '#16a34a'; break;
      case 'info': color = '#2563eb'; break;
    }

    return ''
      + '<div style="padding:12px;border-radius:14px;'
      + 'background:rgba(255,255,255,.08);'
      + 'border-left:5px solid ' + color + ';">'

      + '<div style="font-size:13px;font-weight:900;">'
      + escapeHTML(title)
      + '</div>'

      + '<div style="margin-top:4px;font-size:12px;font-weight:700;opacity:.86;">'
      + escapeHTML(message)
      + '</div>'

      + '</div>';
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function refresh() {
    computeAI();
    renderAiPanel();
  }

  function init() {
    refresh();
  }

  var api = {
    __installed: true,
    version: VERSION,

    generateGuidance: generateGuidance,
    detectAnomalies: detectAnomalies,

    computeAiConfidence: computeAiConfidence,
    computeRiskPrediction: computeRiskPrediction,

    computeAI: computeAI,

    refresh: refresh
  };

  window.NEXUS_VANGUARD_AI = api;
  window.VanguardAI = api;

  window.NEXUS = window.NEXUS || {};
  window.NEXUS.VanguardAI = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('vanguard:update', function () {
    setTimeout(refresh, 50);
  });

})();
