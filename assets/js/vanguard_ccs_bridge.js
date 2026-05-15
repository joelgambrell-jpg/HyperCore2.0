/*
  assets/js/vanguard_ccs_bridge.js
  NEXUS Vanguard CCS Bridge

  Purpose:
  - Additive bridge between active CCS pages and Vanguard intelligence.
  - Does not replace existing CCS logic.
  - Adds live status panel, missing-items summary, validation cards,
    document/conflict indicators, and override hooks.
*/

(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_CCS_BRIDGE && window.NEXUS_VANGUARD_CCS_BRIDGE.__installed) return;

  var VERSION = '0.1.0-ccs-bridge';

  function core() {
    return window.NEXUS_VANGUARD || window.Vanguard || null;
  }

  function validation() {
    return window.NEXUS_VANGUARD_VALIDATION || window.VanguardValidation || null;
  }

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function statusClass(status) {
    switch (clean(status).toUpperCase()) {
      case 'PASS':
      case 'COMPLETE':
        return 'vg-ccs-pass';
      case 'REVIEW':
        return 'vg-ccs-review';
      case 'FAIL':
        return 'vg-ccs-fail';
      case 'BLOCKED':
        return 'vg-ccs-blocked';
      case 'OVERRIDDEN':
        return 'vg-ccs-override';
      default:
        return 'vg-ccs-pending';
    }
  }

  function injectStyles() {
    if (document.getElementById('vanguard-ccs-bridge-style')) return;

    var style = document.createElement('style');
    style.id = 'vanguard-ccs-bridge-style';
    style.textContent = ''
      + '.vg-ccs-panel{max-width:1180px;margin:14px auto;padding:16px;border-radius:18px;border:1px solid rgba(255,255,255,.18);background:rgba(15,23,42,.92);color:#fff;font-family:Arial,Helvetica,sans-serif;box-shadow:0 12px 28px rgba(0,0,0,.28)}'
      + '.vg-ccs-panel *{box-sizing:border-box}'
      + '.vg-ccs-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}'
      + '.vg-ccs-title{font-size:18px;font-weight:900;letter-spacing:.04em;text-transform:uppercase}'
      + '.vg-ccs-sub{margin-top:4px;font-size:13px;font-weight:700;opacity:.86}'
      + '.vg-ccs-grid{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:10px;margin-top:14px}'
      + '.vg-ccs-metric{border:1px solid rgba(255,255,255,.16);border-radius:14px;padding:10px;background:rgba(255,255,255,.08)}'
      + '.vg-ccs-label{font-size:10px;text-transform:uppercase;letter-spacing:.06em;opacity:.72;font-weight:900}'
      + '.vg-ccs-value{font-size:18px;font-weight:900;margin-top:4px}'
      + '.vg-ccs-actions{margin-top:14px;display:flex;gap:8px;flex-wrap:wrap}'
      + '.vg-ccs-btn{border:0;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer;background:#2563eb;color:#fff}'
      + '.vg-ccs-btn.secondary{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22)}'
      + '.vg-ccs-list{margin-top:14px;display:grid;gap:8px}'
      + '.vg-ccs-item{border-radius:14px;border:1px solid rgba(255,255,255,.16);padding:10px;background:rgba(255,255,255,.08);display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:flex-start}'
      + '.vg-ccs-pill{display:inline-flex;align-items:center;justify-content:center;min-width:88px;border-radius:999px;padding:6px 9px;font-size:11px;font-weight:900;border:1px solid rgba(255,255,255,.25)}'
      + '.vg-ccs-pass{background:rgba(22,163,74,.9)}'
      + '.vg-ccs-review{background:rgba(245,158,11,.92)}'
      + '.vg-ccs-fail{background:rgba(220,38,38,.95)}'
      + '.vg-ccs-blocked{background:rgba(127,29,29,.98)}'
      + '.vg-ccs-override{background:rgba(147,51,234,.92)}'
      + '.vg-ccs-pending{background:rgba(100,116,139,.86)}'
      + '.vg-ccs-item-title{font-weight:900;font-size:13px}'
      + '.vg-ccs-item-msg{font-size:12px;opacity:.86;margin-top:3px;font-weight:700}'
      + '.vg-ccs-empty{margin-top:12px;padding:12px;border-radius:12px;background:rgba(22,163,74,.16);border:1px solid rgba(22,163,74,.35);font-weight:900}'
      + '@media(max-width:800px){.vg-ccs-grid{grid-template-columns:repeat(2,minmax(120px,1fr))}.vg-ccs-item{grid-template-columns:1fr}.vg-ccs-pill{width:max-content}}';

    document.head.appendChild(style);
  }

  function findMount() {
    var existing = document.getElementById('vanguard-ccs-panel');
    if (existing) return existing;

    var mount = document.createElement('section');
    mount.id = 'vanguard-ccs-panel';
    mount.className = 'vg-ccs-panel';

    var preferred =
      document.querySelector('[data-vanguard-ccs-mount]') ||
      document.querySelector('.sheet') ||
      document.querySelector('main') ||
      document.body;

    if (preferred === document.body) {
      document.body.insertBefore(mount, document.body.firstChild);
    } else {
      preferred.insertBefore(mount, preferred.firstChild);
    }

    return mount;
  }

  function getState() {
    var vg = core();
    if (!vg || typeof vg.getState !== 'function') return null;
    return vg.getState();
  }

  function runValidation() {
    var ve = validation();
    if (ve && typeof ve.runAllAndStore === 'function') {
      return ve.runAllAndStore();
    }
    return null;
  }

  function metric(label, value) {
    return ''
      + '<div class="vg-ccs-metric">'
      +   '<div class="vg-ccs-label">' + escapeHTML(label) + '</div>'
      +   '<div class="vg-ccs-value">' + escapeHTML(value) + '</div>'
      + '</div>';
  }

  function renderIssueList(state) {
    var ccs = state.ccs || {};
    var issues = []
      .concat(ccs.blockingIssues || [])
      .concat(ccs.reviewItems || []);

    if (!issues.length) {
      return '<div class="vg-ccs-empty">No Vanguard CCS blockers detected.</div>';
    }

    return '<div class="vg-ccs-list">' + issues.map(function (issue) {
      var status = issue.severity === 'blocker' ? 'BLOCKED' : 'REVIEW';

      return ''
        + '<div class="vg-ccs-item">'
        +   '<span class="vg-ccs-pill ' + statusClass(status) + '">' + escapeHTML(status) + '</span>'
        +   '<div>'
        +     '<div class="vg-ccs-item-title">' + escapeHTML(issue.label || issue.id || 'CCS Issue') + '</div>'
        +     '<div class="vg-ccs-item-msg">' + escapeHTML(issue.message || 'Review required.') + '</div>'
        +   '</div>'
        + '</div>';
    }).join('') + '</div>';
  }

  function renderItems(state) {
    var items = state.ccs && Array.isArray(state.ccs.items) ? state.ccs.items : [];

    if (!items.length) return '';

    return '<div class="vg-ccs-list">' + items.map(function (item) {
      var message = item.validation && item.validation.message ? item.validation.message : '';

      return ''
        + '<div class="vg-ccs-item" data-vanguard-ccs-item="' + escapeHTML(item.id) + '">'
        +   '<span class="vg-ccs-pill ' + statusClass(item.status) + '">' + escapeHTML(item.status) + '</span>'
        +   '<div>'
        +     '<div class="vg-ccs-item-title">' + escapeHTML(item.title) + '</div>'
        +     '<div class="vg-ccs-item-msg">' + escapeHTML(message || item.section || '') + '</div>'
        +   '</div>'
        + '</div>';
    }).join('') + '</div>';
  }

  function render() {
    injectStyles();

    var state = getState();
    var mount = findMount();

    if (!state) {
      mount.innerHTML = ''
        + '<div class="vg-ccs-title">VANGUARD CCS</div>'
        + '<div class="vg-ccs-sub">Vanguard core is not loaded.</div>';
      return;
    }

    var summary = state.ccs && state.ccs.validationSummary ? state.ccs.validationSummary : {};
    var docs = state.documents || {};

    mount.innerHTML = ''
      + '<div class="vg-ccs-top">'
      +   '<div>'
      +     '<div class="vg-ccs-title">VANGUARD CCS INTELLIGENCE</div>'
      +     '<div class="vg-ccs-sub">' + escapeHTML(state.status.message || 'Live validation active.') + '</div>'
      +   '</div>'
      +   '<span class="vg-ccs-pill ' + statusClass(state.ccs.status) + '">' + escapeHTML(state.ccs.status || 'PENDING') + '</span>'
      + '</div>'
      + '<div class="vg-ccs-grid">'
      +   metric('CCS Status', state.ccs.status || 'PENDING')
      +   metric('Pass', summary.pass || 0)
      +   metric('Review', summary.review || 0)
      +   metric('Blocked', (summary.blocked || 0) + (summary.fail || 0))
      +   metric('Doc Confidence', (docs.confidenceScore || 0) + '%')
      + '</div>'
      + '<div class="vg-ccs-actions">'
      +   '<button type="button" class="vg-ccs-btn" data-vg-action="validate">Run Validation</button>'
      +   '<button type="button" class="vg-ccs-btn secondary" data-vg-action="refresh">Refresh</button>'
      + '</div>'
      + renderIssueList(state)
      + renderItems(state);
  }

  function collectVisibleChecklistItems() {
    var rows = Array.prototype.slice.call(document.querySelectorAll('[data-ccs-item], tr, .ccs-row, .check-row, .checklist-row'));
    var items = [];

    rows.forEach(function (row, index) {
      var text = clean(row.innerText || row.textContent || '');
      if (!text || text.length < 4) return;
      if (row.closest && row.closest('#vanguard-ccs-panel')) return;

      var section = 'GENERAL';
      var lower = text.toLowerCase();

      if (lower.indexOf('torque') !== -1) section = 'TORQUE';
      else if (lower.indexOf('meg') !== -1 || lower.indexOf('megohm') !== -1) section = 'MEG';
      else if (lower.indexOf('l2') !== -1 || lower.indexOf('level 2') !== -1) section = 'L2';
      else if (lower.indexOf('pre-fod') !== -1 || lower.indexOf('foreign object') !== -1 || lower.indexOf('debris') !== -1) section = 'PREFOD';
      else if (lower.indexOf('fpv') !== -1 || lower.indexOf('finished product') !== -1) section = 'FPV';
      else if (lower.indexOf('phenolic') !== -1) section = 'PHENOLIC';
      else if (lower.indexOf('rif') !== -1 || lower.indexOf('receipt') !== -1) section = 'RIF';

      items.push({
        id: row.getAttribute('data-ccs-item') || ('CCS-DOM-' + String(index + 1).padStart(3, '0')),
        title: text.slice(0, 140),
        section: section,
        required: true,
        status: 'PENDING',
        evidence: {
          source: 'DOM_SCAN'
        }
      });
    });

    return items;
  }

  function importVisibleChecklist() {
    var vg = core();
    if (!vg || typeof vg.setCCSItems !== 'function') return null;

    var items = collectVisibleChecklistItems();

    if (!items.length) return null;

    return vg.setCCSItems(items, {
      template: clean(document.title || 'CCS'),
      equipmentType: ''
    });
  }

  function bindActions() {
    document.addEventListener('click', function (event) {
      var button = event.target && event.target.closest ? event.target.closest('[data-vg-action]') : null;
      if (!button) return;

      var action = button.getAttribute('data-vg-action');

      if (action === 'validate') {
        runValidation();
        render();
      }

      if (action === 'refresh') {
        var vg = core();
        if (vg && typeof vg.refresh === 'function') vg.refresh();
        render();
      }
    });
  }

  function init() {
    injectStyles();

    var vg = core();

    if (vg && typeof vg.getState === 'function') {
      importVisibleChecklist();
      runValidation();
    }

    render();
    bindActions();
  }

  var api = {
    __installed: true,
    version: VERSION,
    render: render,
    collectVisibleChecklistItems: collectVisibleChecklistItems,
    importVisibleChecklist: importVisibleChecklist,
    runValidation: runValidation
  };

  window.NEXUS_VANGUARD_CCS_BRIDGE = api;
  window.VanguardCCSBridge = api;

  window.NEXUS = window.NEXUS || {};
  window.NEXUS.VanguardCCSBridge = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('vanguard:update', function () {
    setTimeout(render, 50);
  });

  window.addEventListener('focus', function () {
    setTimeout(render, 50);
  });
})();
