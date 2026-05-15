/*
  assets/js/vanguard_control_panel.js
  NEXUS Vanguard Control Panel

  Purpose:
  - Adds a simple project/document intake panel.
  - Lets users paste extracted document text for now.
  - Sends requirements into Vanguard Document Mapper.
  - Shows conflicts, selected requirements, and validation state.
*/

(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_CONTROL_PANEL && window.NEXUS_VANGUARD_CONTROL_PANEL.__installed) return;

  var VERSION = '0.1.0-control-panel';

  function core() {
    return window.NEXUS_VANGUARD || window.Vanguard || null;
  }

  function mapper() {
    return window.NEXUS_VANGUARD_DOCUMENT_MAPPER || window.VanguardDocumentMapper || null;
  }

  function conflicts() {
    return window.NEXUS_VANGUARD_CONFLICT_ENGINE || window.VanguardConflictEngine || null;
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

  function injectStyles() {
    if (document.getElementById('vanguard-control-panel-style')) return;

    var style = document.createElement('style');
    style.id = 'vanguard-control-panel-style';
    style.textContent = ''
      + '.vg-control-panel{max-width:1180px;margin:16px auto;padding:18px;border-radius:20px;background:rgba(15,23,42,.94);color:#fff;border:1px solid rgba(255,255,255,.18);font-family:Arial,Helvetica,sans-serif;box-shadow:0 14px 30px rgba(0,0,0,.3)}'
      + '.vg-control-panel *{box-sizing:border-box}'
      + '.vg-control-title{font-size:20px;font-weight:900;letter-spacing:.04em;text-transform:uppercase}'
      + '.vg-control-sub{margin-top:4px;font-size:13px;font-weight:700;opacity:.82}'
      + '.vg-control-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px}'
      + '.vg-control-card{padding:14px;border-radius:16px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14)}'
      + '.vg-control-label{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;opacity:.75;margin-bottom:6px}'
      + '.vg-control-input,.vg-control-textarea{width:100%;border-radius:12px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.1);color:#fff;padding:10px;font-weight:700}'
      + '.vg-control-textarea{min-height:170px;resize:vertical}'
      + '.vg-control-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}'
      + '.vg-control-btn{border:0;border-radius:999px;padding:10px 14px;background:#2563eb;color:#fff;font-weight:900;cursor:pointer}'
      + '.vg-control-btn.secondary{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.2)}'
      + '.vg-control-list{display:grid;gap:8px;margin-top:10px}'
      + '.vg-control-row{padding:10px;border-radius:12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);font-size:12px;font-weight:700}'
      + '.vg-control-row strong{display:block;font-size:13px;margin-bottom:3px}'
      + '.vg-control-pill{display:inline-flex;border-radius:999px;padding:5px 8px;background:rgba(255,255,255,.14);font-size:11px;font-weight:900;margin:3px 4px 0 0}'
      + '@media(max-width:850px){.vg-control-grid{grid-template-columns:1fr}}';

    document.head.appendChild(style);
  }

  function findMount() {
    var existing = document.getElementById('vanguard-control-panel');
    if (existing) return existing;

    var mount = document.createElement('section');
    mount.id = 'vanguard-control-panel';
    mount.className = 'vg-control-panel';

    var preferred =
      document.querySelector('[data-vanguard-control-mount]') ||
      document.querySelector('main') ||
      document.body;

    if (preferred === document.body) {
      document.body.appendChild(mount);
    } else {
      preferred.appendChild(mount);
    }

    return mount;
  }

  function renderRequirements(state) {
    var docs = state.documents || {};
    var requirements = Array.isArray(docs.requirements) ? docs.requirements : [];

    if (!requirements.length) {
      return '<div class="vg-control-row">No mapped requirements yet.</div>';
    }

    return requirements.slice(-8).reverse().map(function (req) {
      return ''
        + '<div class="vg-control-row">'
        +   '<strong>' + escapeHTML(req.requirementType || 'Requirement') + '</strong>'
        +   escapeHTML(req.value || req.exactText || '')
        +   '<div>'
        +     '<span class="vg-control-pill">' + escapeHTML(req.sourceDocument || 'No source') + '</span>'
        +     '<span class="vg-control-pill">' + escapeHTML((req.confidence || 0) + '% confidence') + '</span>'
        +   '</div>'
        + '</div>';
    }).join('');
  }

  function renderConflicts(state) {
    var docs = state.documents || {};
    var list = Array.isArray(docs.conflicts) ? docs.conflicts : [];

    if (!list.length) {
      return '<div class="vg-control-row">No document conflicts detected.</div>';
    }

    return list.map(function (conflict) {
      return ''
        + '<div class="vg-control-row">'
        +   '<strong>' + escapeHTML(conflict.type || 'Conflict') + '</strong>'
        +   escapeHTML(conflict.message || '')
        +   '<div>'
        +     '<span class="vg-control-pill">' + escapeHTML(conflict.status || 'REVIEW') + '</span>'
        +     '<span class="vg-control-pill">' + escapeHTML(conflict.rule || '') + '</span>'
        +   '</div>'
        + '</div>';
    }).join('');
  }

  function render() {
    injectStyles();

    var vg = core();
    var state = vg && typeof vg.getState === 'function' ? vg.getState() : null;
    var mount = findMount();

    if (!state) {
      mount.innerHTML = '<div class="vg-control-title">VANGUARD CONTROL PANEL</div><div class="vg-control-sub">Vanguard core is not loaded.</div>';
      return;
    }

    mount.innerHTML = ''
      + '<div class="vg-control-title">VANGUARD DOCUMENT CONTROL</div>'
      + '<div class="vg-control-sub">Paste document text now. File upload / OCR can be added after the rule engine is stable.</div>'
      + '<div class="vg-control-grid">'
      +   '<div class="vg-control-card">'
      +     '<div class="vg-control-label">Source Document Name</div>'
      +     '<input id="vgDocName" class="vg-control-input" placeholder="Example: AWS Spec 26-05 or SquareD Submittal" />'
      +     '<div class="vg-control-label" style="margin-top:10px;">Source Type</div>'
      +     '<input id="vgDocType" class="vg-control-input" placeholder="SPEC, OEM, SUBMITTAL, DRAWING, SOP" />'
      +     '<div class="vg-control-label" style="margin-top:10px;">Document Text / Extracted Notes</div>'
      +     '<textarea id="vgDocText" class="vg-control-textarea" placeholder="Paste torque specs, meg requirements, FOD requirements, inspection requirements, etc."></textarea>'
      +     '<div class="vg-control-actions">'
      +       '<button type="button" class="vg-control-btn" data-vg-control="map-text">Map Requirements</button>'
      +       '<button type="button" class="vg-control-btn secondary" data-vg-control="remap-conflicts">Remap Conflicts</button>'
      +     '</div>'
      +   '</div>'
      +   '<div class="vg-control-card">'
      +     '<div class="vg-control-label">Current Vanguard Status</div>'
      +     '<div class="vg-control-row">'
      +       '<strong>' + escapeHTML(state.status.label || 'IN PROGRESS') + '</strong>'
      +       escapeHTML(state.status.message || '')
      +       '<div>'
      +         '<span class="vg-control-pill">CCS: ' + escapeHTML(state.ccs.status || 'PENDING') + '</span>'
      +         '<span class="vg-control-pill">Doc Confidence: ' + escapeHTML((state.documents.confidenceScore || 0) + '%') + '</span>'
      +         '<span class="vg-control-pill">Risk: ' + escapeHTML((state.riskScore || 0) + '%') + '</span>'
      +       '</div>'
      +     '</div>'
      +     '<div class="vg-control-label" style="margin-top:12px;">Recent Requirements</div>'
      +     '<div class="vg-control-list">' + renderRequirements(state) + '</div>'
      +     '<div class="vg-control-label" style="margin-top:12px;">Conflicts</div>'
      +     '<div class="vg-control-list">' + renderConflicts(state) + '</div>'
      +   '</div>'
      + '</div>';
  }

  function bind() {
    document.addEventListener('click', function (event) {
      var btn = event.target && event.target.closest ? event.target.closest('[data-vg-control]') : null;
      if (!btn) return;

      var action = btn.getAttribute('data-vg-control');

      if (action === 'map-text') {
        var m = mapper();
        if (!m || typeof m.mapText !== 'function') return;

        var name = clean(document.getElementById('vgDocName') && document.getElementById('vgDocName').value);
        var type = clean(document.getElementById('vgDocType') && document.getElementById('vgDocType').value);
        var text = clean(document.getElementById('vgDocText') && document.getElementById('vgDocText').value);

        if (!text) return;

        m.mapText(text, {
          name: name || 'Manual Document Input',
          type: type || 'MANUAL'
        });

        var ce = conflicts();
        if (ce && typeof ce.remapConflicts === 'function') ce.remapConflicts();

        render();
      }

      if (action === 'remap-conflicts') {
        var c = conflicts();
        if (c && typeof c.remapConflicts === 'function') c.remapConflicts();
        render();
      }
    });
  }

  function init() {
    render();
    bind();
  }

  var api = {
    __installed: true,
    version: VERSION,
    render: render
  };

  window.NEXUS_VANGUARD_CONTROL_PANEL = api;
  window.VanguardControlPanel = api;

  window.NEXUS = window.NEXUS || {};
  window.NEXUS.VanguardControlPanel = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('vanguard:update', function () {
    setTimeout(render, 50);
  });
})();
