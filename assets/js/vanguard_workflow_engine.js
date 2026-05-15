/*
  assets/js/vanguard_workflow_engine.js
  NEXUS Vanguard Workflow Engine

  Purpose:
  - Central workflow sequencing engine.
  - Determines active step.
  - Locks downstream actions.
  - Predicts next required action.
  - Keeps field UX simple:
      ONE ACTIVE TASK AT A TIME.
*/

(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_WORKFLOW && window.NEXUS_VANGUARD_WORKFLOW.__installed) return;

  var VERSION = '0.1.0-workflow-engine';

  var FLOW = [
    'rif',
    'phenolic',
    'torque',
    'l2',
    'meg',
    'prefod',
    'fpv',
    'ccs',
    'energization'
  ];

  function core() {
    return window.NEXUS_VANGUARD || window.Vanguard || null;
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

  function stepComplete(state, stepId) {
    return !!(
      state &&
      state.steps &&
      state.steps[stepId] &&
      state.steps[stepId].complete
    );
  }

  function validationBlocked(result) {
    if (!result) return true;

    return result.blocking === true ||
      result.status === 'BLOCKED' ||
      result.status === 'FAIL';
  }

  function validationReview(result) {
    if (!result) return false;

    return result.status === 'REVIEW';
  }

  function validateStep(stepId) {
    var ve = validation();

    if (!ve || typeof ve.validateStep !== 'function') {
      return {
        status: 'BLOCKED',
        blocking: true,
        message: 'Validation engine unavailable.'
      };
    }

    return ve.validateStep(stepId);
  }

  function determineActiveStep(state) {
    for (var i = 0; i < FLOW.length; i += 1) {
      var step = FLOW[i];

      if (!stepComplete(state, step)) {
        return step;
      }
    }

    return 'complete';
  }

  function determineNextStep(activeStep) {
    var index = FLOW.indexOf(activeStep);

    if (index === -1) return null;
    if (index >= FLOW.length - 1) return null;

    return FLOW[index + 1];
  }

  function determineLockedSteps(activeStep) {
    var index = FLOW.indexOf(activeStep);

    if (index === -1) return [];

    return FLOW.slice(index + 1);
  }

  function determineUnlockedSteps(activeStep) {
    var index = FLOW.indexOf(activeStep);

    if (index === -1) return [];

    return FLOW.slice(0, index + 1);
  }

  function pretty(step) {
    switch (step) {
      case 'rif': return 'Receipt Inspection';
      case 'phenolic': return 'Phenolic';
      case 'torque': return 'Torque';
      case 'l2': return 'L2 Verification';
      case 'meg': return 'Megohmmeter';
      case 'prefod': return 'Pre-FOD';
      case 'fpv': return 'Finished Product Verification';
      case 'ccs': return 'Final CCS';
      case 'energization': return 'Energization';
      default: return upper(step);
    }
  }

  function computeWorkflow() {
    var vg = core();

    if (!vg || typeof vg.updateState !== 'function') return null;

    var state = vg.getState();

    var activeStep = determineActiveStep(state);
    var nextStep = determineNextStep(activeStep);

    var locked = determineLockedSteps(activeStep);
    var unlocked = determineUnlockedSteps(activeStep);

    var activeValidation = activeStep !== 'complete'
      ? validateStep(activeStep)
      : {
          status: 'PASS',
          blocking: false,
          message: 'Workflow complete.'
        };

    var workflowState = {
      currentStep: activeStep,
      nextStep: nextStep,
      lockedSteps: locked,
      unlockedSteps: unlocked,

      activeValidation: activeValidation,

      workflowStatus: activeValidation.status,

      workflowMessage:
        activeStep === 'complete'
          ? 'All workflow gates satisfied.'
          : activeValidation.message || ('Complete ' + pretty(activeStep) + '.'),

      updatedAt: nowISO()
    };

    var guidance = [];

    if (activeStep !== 'complete') {
      guidance.push('Current active step: ' + pretty(activeStep));

      if (nextStep) {
        guidance.push('Next downstream step: ' + pretty(nextStep));
      }

      if (validationBlocked(activeValidation)) {
        guidance.push('Current step has blocking issues.');
      }

      if (validationReview(activeValidation)) {
        guidance.push('Current step requires review.');
      }
    } else {
      guidance.push('Workflow complete.');
    }

    return vg.updateState({
      workflow: workflowState,
      requiredActions: guidance
    }, 'workflow:compute');
  }

  function applyLocksToButtons() {
    var state = getState();

    if (!state || !state.workflow) return;

    var locked = Array.isArray(state.workflow.lockedSteps)
      ? state.workflow.lockedSteps
      : [];

    var unlocked = Array.isArray(state.workflow.unlockedSteps)
      ? state.workflow.unlockedSteps
      : [];

    FLOW.forEach(function (step) {
      var selectors = [
        '[data-step="' + step + '"]',
        '[data-vanguard-step="' + step + '"]',
        '#' + step,
        '.' + step + '-button'
      ];

      selectors.forEach(function (selector) {
        var elements = document.querySelectorAll(selector);

        Array.prototype.forEach.call(elements, function (el) {
          if (locked.indexOf(step) !== -1) {
            el.disabled = true;
            el.classList.add('vanguard-workflow-locked');
            el.setAttribute('data-vanguard-locked', 'true');
          } else {
            el.disabled = false;
            el.classList.remove('vanguard-workflow-locked');
            el.removeAttribute('data-vanguard-locked');
          }

          if (unlocked.indexOf(step) !== -1) {
            el.classList.add('vanguard-workflow-unlocked');
          } else {
            el.classList.remove('vanguard-workflow-unlocked');
          }

          if (state.workflow.currentStep === step) {
            el.classList.add('vanguard-active-step');
          } else {
            el.classList.remove('vanguard-active-step');
          }
        });
      });
    });
  }

  function injectStyles() {
    if (document.getElementById('vanguard-workflow-style')) return;

    var style = document.createElement('style');
    style.id = 'vanguard-workflow-style';

    style.textContent = ''
      + '.vanguard-workflow-locked{opacity:.45!important;filter:grayscale(.45)!important;cursor:not-allowed!important}'
      + '.vanguard-workflow-unlocked{box-shadow:0 0 0 2px rgba(59,130,246,.45)!important}'
      + '.vanguard-active-step{outline:3px solid #22c55e!important;outline-offset:2px!important;animation:vanguardPulse 1.6s infinite}'
      + '@keyframes vanguardPulse{0%{transform:scale(1)}50%{transform:scale(1.02)}100%{transform:scale(1)}}';

    document.head.appendChild(style);
  }

  function renderWorkflowBanner() {
    var state = getState();

    if (!state || !state.workflow) return;

    var existing = document.getElementById('vanguard-workflow-banner');

    if (!existing) {
      existing = document.createElement('div');
      existing.id = 'vanguard-workflow-banner';

      existing.style.cssText =
        'max-width:1180px;margin:12px auto;padding:14px 16px;border-radius:18px;' +
        'background:rgba(15,23,42,.95);color:#fff;font-family:Arial,Helvetica,sans-serif;' +
        'border:1px solid rgba(255,255,255,.18);box-shadow:0 10px 24px rgba(0,0,0,.26);';

      var target =
        document.querySelector('[data-vanguard-workflow-mount]') ||
        document.querySelector('main') ||
        document.body;

      if (target === document.body) {
        document.body.insertBefore(existing, document.body.firstChild);
      } else {
        target.insertBefore(existing, target.firstChild);
      }
    }

    var active = state.workflow.currentStep || 'unknown';

    existing.innerHTML =
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">' +
        '<div>' +
          '<div style="font-size:18px;font-weight:900;letter-spacing:.04em;text-transform:uppercase;">' +
            'VANGUARD ACTIVE WORKFLOW' +
          '</div>' +
          '<div style="margin-top:4px;font-size:13px;font-weight:700;opacity:.86;">' +
            escapeHTML(state.workflow.workflowMessage || '') +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          pill('ACTIVE', pretty(active)) +
          pill('STATUS', state.workflow.workflowStatus || 'PENDING') +
          pill('NEXT', pretty(state.workflow.nextStep || 'NONE')) +
        '</div>' +
      '</div>';
  }

  function pill(label, value) {
    return ''
      + '<span style="display:inline-flex;align-items:center;gap:6px;padding:8px 10px;border-radius:999px;'
      + 'background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16);'
      + 'font-size:11px;font-weight:900;">'
      + '<span style="opacity:.7;">' + escapeHTML(label) + '</span>'
      + '<span>' + escapeHTML(value) + '</span>'
      + '</span>';
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
    computeWorkflow();
    applyLocksToButtons();
    renderWorkflowBanner();
  }

  function init() {
    injectStyles();
    refresh();
  }

  var api = {
    __installed: true,
    version: VERSION,

    FLOW: FLOW,

    determineActiveStep: determineActiveStep,
    determineNextStep: determineNextStep,
    determineLockedSteps: determineLockedSteps,
    determineUnlockedSteps: determineUnlockedSteps,

    computeWorkflow: computeWorkflow,
    applyLocksToButtons: applyLocksToButtons,

    refresh: refresh
  };

  window.NEXUS_VANGUARD_WORKFLOW = api;
  window.VanguardWorkflow = api;

  window.NEXUS = window.NEXUS || {};
  window.NEXUS.VanguardWorkflow = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('vanguard:update', function () {
    setTimeout(refresh, 50);
  });

})();
