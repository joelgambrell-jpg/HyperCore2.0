/*
  assets/js/vanguard_export_bridge.js
  NEXUS Vanguard Export Bridge

  Purpose:
  - Adds Vanguard validation summary to package export.
  - Displays CCS intelligence, document conflicts, overrides, risk, and audit trail.
  - Additive only; does not replace existing package_export logic.
*/

(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_EXPORT_BRIDGE && window.NEXUS_VANGUARD_EXPORT_BRIDGE.__installed) return;

  var VERSION = '0.1.0-export-bridge';

  function core() {
    return window.NEXUS_VANGUARD || window.Vanguard || null;
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

  function getState() {
    var vg = core();
    if (!vg || typeof vg.getState !== 'function') return null;
    return vg.getState();
  }

  function injectStyles() {
    if (document.getElementById('vanguard-export-style')) return;

    var style = document.createElement('style');
    style.id = 'vanguard-export-style';

    style.textContent = ''
      + '.vg-export{margin:18px 0;padding:18px;border:2px solid #111827;border-radius:14px;background:#fff;color:#111827;font-family:Arial,Helvetica,sans-serif;break-inside:avoid}'
      + '.vg-export h2{margin:0 0 8px;font-size:20px;text-transform:uppercase;letter-spacing:.04em}'
      + '.vg-export h3{margin:16px 0 8px;font-size:15px;text-transform:uppercase}'
      + '.vg-export-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:12px 0}'
      + '.vg-export-metric{border:1px solid #cbd5e1;border-radius:10px;padding:10px;background:#f8fafc}'
      + '.vg-export-label{font-size:10px;font-weight:900;text-transform:uppercase;color:#475569}'
      + '.vg-export-value{font-size:18px;font-weight:900;margin-top:3px}'
      + '.vg-export-table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12px}'
      + '.vg-export-table th,.vg-export-table td{border:1px solid #cbd5e1;padding:7px;text-align:left;vertical-align:top}'
      + '.vg-export-table th{background:#e5e7eb;text-transform:uppercase;font-size:10px}'
      + '.vg-pass{color:#166534;font-weight:900}'
      + '.vg-review{color:#92400e;font-weight:900}'
      + '.vg-blocked,.vg-fail{color:#991b1b;font-weight:900}'
      + '.vg-override{color:#6b21a8;font-weight:900}'
      + '@media print{.vg-export{box-shadow:none;border-radius:0}.vg-export-grid{grid-template-columns:repeat(4,1fr)}}';

    document.head.appendChild(style);
  }

  function statusClass(status) {
    var s = clean(status).toLowerCase();
    if (s === 'pass' || s === 'complete') return 'vg-pass';
    if (s === 'review') return 'vg-review';
    if (s === 'blocked') return 'vg-blocked';
    if (s === 'fail') return 'vg-fail';
    if (s === 'overridden') return 'vg-override';
    return '';
  }

  function metric(label, value) {
    return ''
      + '<div class="vg-export-metric">'
      + '<div class="vg-export-label">' + escapeHTML(label) + '</div>'
      + '<div class="vg-export-value">' + escapeHTML(value) + '</div>'
      + '</div>';
  }

  function renderCCSItems(state) {
    var items = state.ccs && Array.isArray(state.ccs.items) ? state.ccs.items : [];

    if (!items.length) return '<p>No CCS intelligence items recorded.</p>';

    return ''
      + '<table class="vg-export-table">'
      + '<thead><tr><th>Status</th><th>Section</th><th>Item</th><th>Validation Message</th></tr></thead>'
      + '<tbody>'
      + items.map(function (item) {
        var msg = item.validation && item.validation.message ? item.validation.message : '';
        return ''
          + '<tr>'
          + '<td class="' + statusClass(item.status) + '">' + escapeHTML(item.status) + '</td>'
          + '<td>' + escapeHTML(item.section) + '</td>'
          + '<td>' + escapeHTML(item.title) + '</td>'
          + '<td>' + escapeHTML(msg) + '</td>'
          + '</tr>';
      }).join('')
      + '</tbody></table>';
  }

  function renderConflicts(state) {
    var conflicts = state.documents && Array.isArray(state.documents.conflicts)
      ? state.documents.conflicts
      : [];

    if (!conflicts.length) return '<p>No document conflicts recorded.</p>';

    return ''
      + '<table class="vg-export-table">'
      + '<thead><tr><th>Status</th><th>Type</th><th>Conflict</th><th>Rule</th><th>Selected Requirement</th></tr></thead>'
      + '<tbody>'
      + conflicts.map(function (conflict) {
        var selected = conflict.selected || {};
        return ''
          + '<tr>'
          + '<td class="' + statusClass(conflict.status) + '">' + escapeHTML(conflict.status || 'REVIEW') + '</td>'
          + '<td>' + escapeHTML(conflict.type || '') + '</td>'
          + '<td>' + escapeHTML(conflict.message || '') + '</td>'
          + '<td>' + escapeHTML(conflict.rule || '') + '</td>'
          + '<td>' + escapeHTML(selected.value || selected.exactText || '') + '</td>'
          + '</tr>';
      }).join('')
      + '</tbody></table>';
  }

  function renderOverrides(state) {
    var overrides = Array.isArray(state.overrides) ? state.overrides : [];

    if (!overrides.length) return '<p>No overrides recorded.</p>';

    return ''
      + '<table class="vg-export-table">'
      + '<thead><tr><th>Time</th><th>Role</th><th>Type</th><th>Reason</th></tr></thead>'
      + '<tbody>'
      + overrides.map(function (item) {
        return ''
          + '<tr>'
          + '<td>' + escapeHTML(item.at || '') + '</td>'
          + '<td>' + escapeHTML(item.role || '') + '</td>'
          + '<td>' + escapeHTML(item.type || '') + '</td>'
          + '<td>' + escapeHTML(item.reason || item.overrideReason || '') + '</td>'
          + '</tr>';
      }).join('')
      + '</tbody></table>';
  }

  function renderAudit(state) {
    var audit = Array.isArray(state.auditTrail) ? state.auditTrail.slice(-20) : [];

    if (!audit.length) return '<p>No Vanguard audit entries recorded.</p>';

    return ''
      + '<table class="vg-export-table">'
      + '<thead><tr><th>Time</th><th>Role</th><th>Page</th><th>Action</th></tr></thead>'
      + '<tbody>'
      + audit.map(function (item) {
        return ''
          + '<tr>'
          + '<td>' + escapeHTML(item.at || '') + '</td>'
          + '<td>' + escapeHTML(item.role || '') + '</td>'
          + '<td>' + escapeHTML(item.page || '') + '</td>'
          + '<td>' + escapeHTML(item.action || '') + '</td>'
          + '</tr>';
      }).join('')
      + '</tbody></table>';
  }

  function render() {
    injectStyles();

    var state = getState();
    if (!state) return;

    var existing = document.getElementById('vanguard-export-section');

    if (!existing) {
      existing = document.createElement('section');
      existing.id = 'vanguard-export-section';
      existing.className = 'vg-export';

      var target =
        document.querySelector('[data-vanguard-export-mount]') ||
        document.querySelector('#exportContent') ||
        document.querySelector('.package-export') ||
        document.querySelector('main') ||
        document.body;

      target.appendChild(existing);
    }

    var summary = state.ccs && state.ccs.validationSummary ? state.ccs.validationSummary : {};
    var docs = state.documents || {};

    existing.innerHTML = ''
      + '<h2>NEXUS Vanguard Validation Summary</h2>'
      + '<p><strong>Status:</strong> ' + escapeHTML(state.status.label || '') + ' — ' + escapeHTML(state.status.message || '') + '</p>'
      + '<div class="vg-export-grid">'
      + metric('Equipment', state.equipmentId || '')
      + metric('CCS Status', state.ccs ? state.ccs.status : '')
      + metric('Confidence', (state.confidenceScore || 0) + '%')
      + metric('Risk', (state.riskScore || 0) + '%')
      + metric('CCS Pass', summary.pass || 0)
      + metric('CCS Review', summary.review || 0)
      + metric('CCS Blocked', (summary.blocked || 0) + (summary.fail || 0))
      + metric('Doc Conflicts', docs.conflicts ? docs.conflicts.length : 0)
      + '</div>'
      + '<h3>CCS Intelligence Gates</h3>'
      + renderCCSItems(state)
      + '<h3>Document Conflict Review</h3>'
      + renderConflicts(state)
      + '<h3>Manager / Superintendent Overrides</h3>'
      + renderOverrides(state)
      + '<h3>Vanguard Audit Trail</h3>'
      + renderAudit(state);
  }

  function init() {
    render();
  }

  var api = {
    __installed: true,
    version: VERSION,
    render: render
  };

  window.NEXUS_VANGUARD_EXPORT_BRIDGE = api;
  window.VanguardExportBridge = api;

  window.NEXUS = window.NEXUS || {};
  window.NEXUS.VanguardExportBridge = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('vanguard:update', function () {
    setTimeout(render, 80);
  });
})();
