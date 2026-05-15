/*
  assets/js/vanguard_ui_engine.js
  NEXUS Vanguard UI Engine

  Purpose:
  - Unified Vanguard field-user UX layer.
  - Standardizes buttons, banners, cards, workflow highlighting, and mobile usability.
  - Keeps UI extremely simple and obvious for field users.
*/

(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_UI && window.NEXUS_VANGUARD_UI.__installed) return;

  var VERSION = '0.1.0-ui-engine';

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function core() {
    return window.NEXUS_VANGUARD || window.Vanguard || null;
  }

  function workflow() {
    return window.NEXUS_VANGUARD_WORKFLOW || window.VanguardWorkflow || null;
  }

  function getState() {
    var vg = core();

    if (!vg || typeof vg.getState !== 'function') {
      return null;
    }

    return vg.getState();
  }

  function injectStyles() {

    if (document.getElementById('vanguard-ui-engine-style')) return;

    var style = document.createElement('style');

    style.id = 'vanguard-ui-engine-style';

    style.textContent = ''

      + ':root{'
      + '--vg-bg:#0f172a;'
      + '--vg-card:#1e293b;'
      + '--vg-border:rgba(255,255,255,.14);'
      + '--vg-text:#ffffff;'
      + '--vg-green:#22c55e;'
      + '--vg-yellow:#f59e0b;'
      + '--vg-red:#ef4444;'
      + '--vg-blue:#3b82f6;'
      + '--vg-purple:#9333ea;'
      + '--vg-radius:18px;'
      + '}'

      + '.vg-card{'
      + 'background:rgba(15,23,42,.95);'
      + 'border:1px solid var(--vg-border);'
      + 'border-radius:var(--vg-radius);'
      + 'padding:16px;'
      + 'color:var(--vg-text);'
      + 'box-shadow:0 12px 28px rgba(0,0,0,.24);'
      + '}'

      + '.vg-big-button{'
      + 'display:flex;align-items:center;justify-content:center;'
      + 'min-height:72px;'
      + 'padding:16px 18px;'
      + 'border-radius:18px;'
      + 'border:2px solid rgba(255,255,255,.12);'
      + 'background:#1e293b;'
      + 'color:#fff;'
      + 'font-size:18px;'
      + 'font-weight:900;'
      + 'letter-spacing:.02em;'
      + 'cursor:pointer;'
      + 'transition:.18s ease;'
      + 'user-select:none;'
      + 'text-align:center;'
      + '}'

      + '.vg-big-button:hover{'
      + 'transform:translateY(-1px);'
      + '}'

      + '.vg-big-button:active{'
      + 'transform:scale(.985);'
      + '}'

      + '.vg-big-button.complete{'
      + 'background:var(--vg-green)!important;'
      + 'border-color:rgba(255,255,255,.18)!important;'
      + 'color:#fff!important;'
      + '}'

      + '.vg-big-button.review{'
      + 'background:var(--vg-yellow)!important;'
      + 'color:#111827!important;'
      + '}'

      + '.vg-big-button.fail{'
      + 'background:var(--vg-red)!important;'
      + 'color:#fff!important;'
      + '}'

      + '.vg-big-button.active-step{'
      + 'outline:4px solid var(--vg-green);'
      + 'outline-offset:2px;'
      + 'animation:vgPulse 1.6s infinite;'
      + '}'

      + '.vg-big-button.locked{'
      + 'opacity:.42;'
      + 'filter:grayscale(.55);'
      + 'cursor:not-allowed;'
      + '}'

      + '.vg-status-banner{'
      + 'padding:16px 18px;'
      + 'border-radius:18px;'
      + 'font-weight:900;'
      + 'font-size:18px;'
      + 'letter-spacing:.02em;'
      + 'display:flex;'
      + 'align-items:center;'
      + 'justify-content:space-between;'
      + 'gap:12px;'
      + 'flex-wrap:wrap;'
      + '}'

      + '.vg-status-pass{background:rgba(22,163,74,.22);border:2px solid rgba(22,163,74,.45)}'
      + '.vg-status-review{background:rgba(245,158,11,.22);border:2px solid rgba(245,158,11,.45)}'
      + '.vg-status-fail{background:rgba(220,38,38,.22);border:2px solid rgba(220,38,38,.45)}'
      + '.vg-status-info{background:rgba(59,130,246,.22);border:2px solid rgba(59,130,246,.45)}'

      + '.vg-grid-2{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}'
      + '.vg-grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}'
      + '.vg-grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}'

      + '.vg-pill{'
      + 'display:inline-flex;'
      + 'align-items:center;'
      + 'gap:6px;'
      + 'padding:8px 10px;'
      + 'border-radius:999px;'
      + 'background:rgba(255,255,255,.12);'
      + 'border:1px solid rgba(255,255,255,.14);'
      + 'font-size:11px;'
      + 'font-weight:900;'
      + '}'

      + '.vg-input,.vg-select,.vg-textarea{'
      + 'width:100%;'
      + 'background:#111827;'
      + 'border:2px solid rgba(255,255,255,.12);'
      + 'border-radius:14px;'
      + 'padding:14px;'
      + 'color:#fff;'
      + 'font-size:16px;'
      + 'font-weight:700;'
      + '}'

      + '.vg-input:focus,.vg-select:focus,.vg-textarea:focus{'
      + 'outline:none;'
      + 'border-color:var(--vg-green);'
      + 'box-shadow:0 0 0 4px rgba(34,197,94,.18);'
      + '}'

      + '.vg-section-title{'
      + 'font-size:20px;'
      + 'font-weight:900;'
      + 'text-transform:uppercase;'
      + 'letter-spacing:.04em;'
      + '}'

      + '.vg-subtitle{'
      + 'margin-top:4px;'
      + 'font-size:13px;'
      + 'font-weight:700;'
      + 'opacity:.82;'
      + '}'

      + '.vg-hidden{display:none!important}'

      + '@keyframes vgPulse{'
      + '0%{transform:scale(1)}'
      + '50%{transform:scale(1.02)}'
      + '100%{transform:scale(1)}'
      + '}'

      + '@media(max-width:980px){'
      + '.vg-grid-4,.vg-grid-3{grid-template-columns:repeat(2,1fr)}'
      + '.vg-big-button{font-size:16px;min-height:66px}'
      + '}'

      + '@media(max-width:680px){'
      + '.vg-grid-4,.vg-grid-3,.vg-grid-2{grid-template-columns:1fr}'
      + '.vg-big-button{font-size:18px;min-height:72px}'
      + '.vg-status-banner{font-size:16px}'
      + '}';
    
    document.head.appendChild(style);
  }

  function applyWorkflowClasses() {

    var state = getState();

    if (
      !state ||
      !state.workflow
    ) return;

    var current =
      clean(state.workflow.currentStep);

    document.querySelectorAll(
      '[data-vanguard-step]'
    ).forEach(function (el) {

      var step =
        clean(
          el.getAttribute(
            'data-vanguard-step'
          )
        );

      el.classList.remove(
        'active-step',
        'locked',
        'complete',
        'review',
        'fail'
      );

      if (
        state.workflow.lockedSteps &&
        state.workflow.lockedSteps.indexOf(step) !== -1
      ) {
        el.classList.add('locked');
      }

      if (step === current) {
        el.classList.add('active-step');
      }

      if (
        state.steps &&
        state.steps[step] &&
        state.steps[step].complete
      ) {
        el.classList.add('complete');
      }

    });
  }

  function autoFocusActiveStep() {

    var active =
      document.querySelector(
        '[data-vanguard-step].active-step'
      );

    if (!active) return;

    try {
      active.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    } catch (err) {}
  }

  function enhanceButtons() {

    document.querySelectorAll(
      'button'
    ).forEach(function (btn) {

      if (
        btn.classList.contains(
          'vg-big-button'
        )
      ) return;

      if (
        btn.offsetWidth > 120 ||
        btn.classList.contains('step-btn')
      ) {
        btn.classList.add(
          'vg-big-button'
        );
      }

    });
  }

  function injectGlobalBanner() {

    var state =
      getState();

    if (!state) return;

    var existing =
      document.getElementById(
        'vanguard-global-banner'
      );

    if (!existing) {

      existing =
        document.createElement('div');

      existing.id =
        'vanguard-global-banner';

      existing.className =
        'vg-status-banner vg-status-info';

      existing.style.maxWidth =
        '1180px';

      existing.style.margin =
        '12px auto';

      var target =
        document.querySelector(
          '[data-vanguard-global-banner]'
        ) ||
        document.querySelector('main') ||
        document.body;

      if (target === document.body) {
        document.body.insertBefore(
          existing,
          document.body.firstChild
        );
      } else {
        target.insertBefore(
          existing,
          target.firstChild
        );
      }
    }

    var workflow =
      state.workflow || {};

    existing.className =
      'vg-status-banner ' +
      (
        workflow.workflowStatus === 'PASS'
          ? 'vg-status-pass'
          : workflow.workflowStatus === 'REVIEW'
            ? 'vg-status-review'
            : workflow.workflowStatus === 'BLOCKED'
              ? 'vg-status-fail'
              : 'vg-status-info'
      );

    existing.innerHTML = ''

      + '<div>'

      + '<div style="font-size:20px;font-weight:900;text-transform:uppercase;">'
      + 'VANGUARD ACTIVE TASK'
      + '</div>'

      + '<div style="margin-top:4px;font-size:14px;">'
      + escapeHTML(
          workflow.workflowMessage ||
          'Workflow active.'
        )
      + '</div>'

      + '</div>'

      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'

      + pill(
          'STEP',
          workflow.currentStep || '--'
        )

      + pill(
          'STATUS',
          workflow.workflowStatus || '--'
        )

      + '</div>';
  }

  function pill(label, value) {

    return ''
      + '<span class="vg-pill">'
      + '<span style="opacity:.7;">'
      + escapeHTML(label)
      + '</span>'
      + '<span>'
      + escapeHTML(value)
      + '</span>'
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

    enhanceButtons();

    applyWorkflowClasses();

    injectGlobalBanner();

    autoFocusActiveStep();
  }

  function init() {

    injectStyles();

    refresh();
  }

  var api = {
    __installed: true,
    version: VERSION,

    refresh: refresh,
    enhanceButtons: enhanceButtons,
    applyWorkflowClasses: applyWorkflowClasses,
    autoFocusActiveStep: autoFocusActiveStep
  };

  window.NEXUS_VANGUARD_UI = api;
  window.VanguardUI = api;

  window.NEXUS = window.NEXUS || {};
  window.NEXUS.VanguardUI = api;

  if (document.readyState === 'loading') {

    document.addEventListener(
      'DOMContentLoaded',
      init
    );

  } else {
    init();
  }

  window.addEventListener(
    'vanguard:update',
    function () {
      setTimeout(refresh, 80);
    }
  );

})();
