/*
  assets/js/vanguard_dashboard_engine.js
  NEXUS Vanguard Dashboard Engine

  Purpose:
  - Project-level visibility layer.
  - Tracks equipment workflow states.
  - Displays bottlenecks, blockers, and AI risk.
  - Superintendent-friendly command center.
*/

(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_DASHBOARD && window.NEXUS_VANGUARD_DASHBOARD.__installed) return;

  var VERSION = '0.1.0-dashboard-engine';

  var STORAGE_KEY = 'nexus_vanguard_dashboard';

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function upper(value) {
    return clean(value).toUpperCase();
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function safeParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch (err) {
      return fallback;
    }
  }

  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (err) {
      return value;
    }
  }

  function core() {
    return window.NEXUS_VANGUARD || window.Vanguard || null;
  }

  function getState() {
    var vg = core();

    if (!vg || typeof vg.getState !== 'function') {
      return null;
    }

    return vg.getState();
  }

  function loadDashboard() {
    return safeParse(
      localStorage.getItem(STORAGE_KEY),
      {
        equipment: []
      }
    );
  }

  function saveDashboard(data) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(data || {})
      );
    } catch (err) {}
  }

  function currentEquipmentSnapshot() {
    var state = getState();

    if (!state) return null;

    return {
      equipmentId:
        clean(state.equipmentId || 'UNKNOWN'),

      equipmentType:
        clean(
          state.equipment &&
          state.equipment.type
            ? state.equipment.type
            : 'UNKNOWN'
        ),

      workflowStep:
        clean(
          state.workflow &&
          state.workflow.currentStep
            ? state.workflow.currentStep
            : 'UNKNOWN'
        ),

      workflowStatus:
        clean(
          state.workflow &&
          state.workflow.workflowStatus
            ? state.workflow.workflowStatus
            : 'PENDING'
        ),

      ccsStatus:
        clean(
          state.ccs &&
          state.ccs.status
            ? state.ccs.status
            : 'PENDING'
        ),

      confidence:
        Number(state.confidenceScore || 0),

      risk:
        Number(state.riskScore || 0),

      conflicts:
        state.documents &&
        Array.isArray(state.documents.conflicts)
          ? state.documents.conflicts.length
          : 0,

      updatedAt:
        nowISO()
    };
  }

  function syncCurrentEquipment() {

    var snapshot =
      currentEquipmentSnapshot();

    if (!snapshot) return null;

    var dashboard =
      loadDashboard();

    var existingIndex =
      dashboard.equipment.findIndex(function (item) {
        return item.equipmentId === snapshot.equipmentId;
      });

    if (existingIndex === -1) {
      dashboard.equipment.push(snapshot);
    } else {
      dashboard.equipment[existingIndex] = snapshot;
    }

    dashboard.updatedAt = nowISO();

    saveDashboard(dashboard);

    return dashboard;
  }

  function overallProgress(equipment) {

    if (!equipment.length) return 0;

    var completed =
      equipment.filter(function (item) {

        return (
          upper(item.workflowStep) === 'COMPLETE' ||
          upper(item.workflowStatus) === 'PASS'
        );

      }).length;

    return Math.round(
      (completed / equipment.length) * 100
    );
  }

  function blockers(equipment) {

    return equipment.filter(function (item) {

      return (
        upper(item.workflowStatus) === 'BLOCKED' ||
        upper(item.workflowStatus) === 'FAIL'
      );

    });
  }

  function reviewItems(equipment) {

    return equipment.filter(function (item) {

      return (
        upper(item.workflowStatus) === 'REVIEW'
      );

    });
  }

  function highRisk(equipment) {

    return equipment.filter(function (item) {

      return item.risk >= 60;

    });
  }

  function injectStyles() {

    if (
      document.getElementById(
        'vanguard-dashboard-style'
      )
    ) return;

    var style =
      document.createElement('style');

    style.id =
      'vanguard-dashboard-style';

    style.textContent = ''

      + '.vg-dashboard{max-width:1280px;margin:14px auto;padding:18px;border-radius:20px;'
      + 'background:rgba(15,23,42,.95);color:#fff;font-family:Arial,Helvetica,sans-serif;'
      + 'border:1px solid rgba(255,255,255,.16);box-shadow:0 14px 32px rgba(0,0,0,.28)}'

      + '.vg-dashboard-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:14px}'

      + '.vg-dashboard-card{padding:12px;border-radius:14px;background:rgba(255,255,255,.08);'
      + 'border:1px solid rgba(255,255,255,.14)}'

      + '.vg-dashboard-table{width:100%;border-collapse:collapse;margin-top:14px;font-size:12px}'

      + '.vg-dashboard-table th,.vg-dashboard-table td{padding:8px;border-bottom:1px solid rgba(255,255,255,.1);text-align:left}'

      + '.vg-dashboard-table th{text-transform:uppercase;font-size:10px;opacity:.7}'

      + '.vg-status-pass{color:#22c55e;font-weight:900}'
      + '.vg-status-review{color:#f59e0b;font-weight:900}'
      + '.vg-status-blocked,.vg-status-fail{color:#ef4444;font-weight:900}'

      + '@media(max-width:980px){.vg-dashboard-grid{grid-template-columns:repeat(2,1fr)}}';
    
    document.head.appendChild(style);
  }

  function metric(label, value) {

    return ''
      + '<div class="vg-dashboard-card">'

      + '<div style="font-size:10px;font-weight:900;text-transform:uppercase;opacity:.7;">'
      + escapeHTML(label)
      + '</div>'

      + '<div style="margin-top:4px;font-size:22px;font-weight:900;">'
      + escapeHTML(value)
      + '</div>'

      + '</div>';
  }

  function statusClass(status) {

    var s = clean(status).toLowerCase();

    if (s === 'pass' || s === 'complete') {
      return 'vg-status-pass';
    }

    if (s === 'review') {
      return 'vg-status-review';
    }

    if (s === 'blocked' || s === 'fail') {
      return 'vg-status-blocked';
    }

    return '';
  }

  function renderTable(equipment) {

    if (!equipment.length) {
      return '<p style="margin-top:14px;">No equipment tracked yet.</p>';
    }

    return ''

      + '<table class="vg-dashboard-table">'

      + '<thead>'
      + '<tr>'
      + '<th>Equipment</th>'
      + '<th>Type</th>'
      + '<th>Workflow</th>'
      + '<th>Status</th>'
      + '<th>CCS</th>'
      + '<th>Confidence</th>'
      + '<th>Risk</th>'
      + '<th>Conflicts</th>'
      + '</tr>'
      + '</thead>'

      + '<tbody>'

      + equipment.map(function (item) {

        return ''

          + '<tr>'

          + '<td>'
          + escapeHTML(item.equipmentId)
          + '</td>'

          + '<td>'
          + escapeHTML(item.equipmentType)
          + '</td>'

          + '<td>'
          + escapeHTML(item.workflowStep)
          + '</td>'

          + '<td class="' + statusClass(item.workflowStatus) + '">'
          + escapeHTML(item.workflowStatus)
          + '</td>'

          + '<td>'
          + escapeHTML(item.ccsStatus)
          + '</td>'

          + '<td>'
          + escapeHTML(item.confidence + '%')
          + '</td>'

          + '<td>'
          + escapeHTML(item.risk + '%')
          + '</td>'

          + '<td>'
          + escapeHTML(String(item.conflicts))
          + '</td>'

          + '</tr>';

      }).join('')

      + '</tbody>'
      + '</table>';
  }

  function renderDashboard() {

    injectStyles();

    var dashboard =
      syncCurrentEquipment() ||
      loadDashboard();

    var equipment =
      Array.isArray(dashboard.equipment)
        ? dashboard.equipment
        : [];

    var blocked =
      blockers(equipment);

    var review =
      reviewItems(equipment);

    var risk =
      highRisk(equipment);

    var existing =
      document.getElementById(
        'vanguard-dashboard'
      );

    if (!existing) {

      existing =
        document.createElement('section');

      existing.id =
        'vanguard-dashboard';

      existing.className =
        'vg-dashboard';

      var target =
        document.querySelector(
          '[data-vanguard-dashboard-mount]'
        ) ||
        document.querySelector('main') ||
        document.body;

      target.appendChild(existing);
    }

    existing.innerHTML = ''

      + '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">'

      + '<div>'

      + '<div style="font-size:20px;font-weight:900;text-transform:uppercase;letter-spacing:.04em;">'
      + 'VANGUARD COMMAND CENTER'
      + '</div>'

      + '<div style="margin-top:4px;font-size:13px;font-weight:700;opacity:.84;">'
      + 'Live workflow orchestration active.'
      + '</div>'

      + '</div>'

      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'

      + pill(
        'EQUIPMENT',
        String(equipment.length)
      )

      + pill(
        'BLOCKED',
        String(blocked.length)
      )

      + pill(
        'REVIEW',
        String(review.length)
      )

      + pill(
        'HIGH RISK',
        String(risk.length)
      )

      + '</div>'

      + '</div>'

      + '<div class="vg-dashboard-grid">'

      + metric(
        'Overall Progress',
        overallProgress(equipment) + '%'
      )

      + metric(
        'Blocked Equipment',
        blocked.length
      )

      + metric(
        'Review Required',
        review.length
      )

      + metric(
        'High Risk',
        risk.length
      )

      + metric(
        'Last Update',
        dashboard.updatedAt || '--'
      )

      + '</div>'

      + renderTable(equipment);
  }

  function pill(label, value) {

    return ''

      + '<span style="display:inline-flex;align-items:center;gap:6px;'
      + 'padding:8px 10px;border-radius:999px;'
      + 'background:rgba(255,255,255,.12);'
      + 'border:1px solid rgba(255,255,255,.16);'
      + 'font-size:11px;font-weight:900;">'

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
    renderDashboard();
  }

  function init() {
    refresh();
  }

  var api = {
    __installed: true,
    version: VERSION,

    syncCurrentEquipment: syncCurrentEquipment,
    renderDashboard: renderDashboard,

    blockers: blockers,
    reviewItems: reviewItems,
    highRisk: highRisk,

    refresh: refresh
  };

  window.NEXUS_VANGUARD_DASHBOARD = api;
  window.VanguardDashboard = api;

  window.NEXUS = window.NEXUS || {};
  window.NEXUS.VanguardDashboard = api;

  if (document.readyState === 'loading') {

    document.addEventListener(
      'DOMContentLoaded',
      init
    );

  } else {
    init();
  }

  window.addEventListener('vanguard:update', function () {
    setTimeout(refresh, 120);
  });

})();
