/*
  assets/js/vanguard_role_engine.js
  NEXUS Vanguard Role Engine

  Purpose:
  - Centralized authority + permissions system.
  - Standardizes role checks across Vanguard.
  - Controls overrides, approvals, validation, and workflow authority.
*/

(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_ROLE_ENGINE && window.NEXUS_VANGUARD_ROLE_ENGINE.__installed) return;

  var VERSION = '0.1.0-role-engine';

  var ROLE_ORDER = [
    'viewer',
    'tech',
    'foreman',
    'superintendent',
    'admin'
  ];

  var ROLE_PERMISSIONS = {

    viewer: [
      'view'
    ],

    tech: [
      'view',
      'edit_own',
      'complete_step',
      'upload_photos',
      'run_validation'
    ],

    foreman: [
      'view',
      'edit_own',
      'complete_step',
      'upload_photos',
      'run_validation',
      'foreman_verify',
      'approve_review_items',
      'reopen_step'
    ],

    superintendent: [
      'view',
      'edit_own',
      'complete_step',
      'upload_photos',
      'run_validation',
      'foreman_verify',
      'approve_review_items',
      'reopen_step',

      'manager_override',
      'resolve_conflicts',
      'release_workflow',
      'approve_export',
      'modify_ai_decisions'
    ],

    admin: [
      '*'
    ]
  };

  function core() {
    return window.NEXUS_VANGUARD || window.Vanguard || null;
  }

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function lower(value) {
    return clean(value).toLowerCase();
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function normalizeRole(role) {
    var r = lower(role);

    if (ROLE_ORDER.indexOf(r) === -1) {
      return 'viewer';
    }

    return r;
  }

  function getCurrentRole() {
    var vg = core();

    if (!vg) return 'viewer';

    if (typeof vg.getRole === 'function') {
      return normalizeRole(vg.getRole());
    }

    return normalizeRole(vg.role || 'viewer');
  }

  function roleIndex(role) {
    return ROLE_ORDER.indexOf(normalizeRole(role));
  }

  function roleAtLeast(role) {
    return roleIndex(getCurrentRole()) >= roleIndex(role);
  }

  function permissionsFor(role) {
    role = normalizeRole(role);

    return ROLE_PERMISSIONS[role]
      ? ROLE_PERMISSIONS[role].slice()
      : [];
  }

  function hasPermission(permission, role) {
    var perms = permissionsFor(role || getCurrentRole());

    if (perms.indexOf('*') !== -1) return true;

    return perms.indexOf(clean(permission)) !== -1;
  }

  function requirePermission(permission) {
    var allowed = hasPermission(permission);

    if (!allowed) {
      flagSecurityViolation(permission);
    }

    return allowed;
  }

  function flagSecurityViolation(permission) {
    var vg = core();

    if (!vg || typeof vg.addFlag !== 'function') return;

    vg.addFlag({
      code: 'PERMISSION_DENIED',
      severity: 'danger',
      label: 'Permission denied for: ' + clean(permission),
      at: nowISO()
    });
  }

  function canOverride() {
    return hasPermission('manager_override');
  }

  function canResolveConflicts() {
    return hasPermission('resolve_conflicts');
  }

  function canApproveExport() {
    return hasPermission('approve_export');
  }

  function canReleaseWorkflow() {
    return hasPermission('release_workflow');
  }

  function canModifyAI() {
    return hasPermission('modify_ai_decisions');
  }

  function canValidate() {
    return hasPermission('run_validation');
  }

  function canForemanVerify() {
    return hasPermission('foreman_verify');
  }

  function canReopenStep() {
    return hasPermission('reopen_step');
  }

  function canCompleteStep() {
    return hasPermission('complete_step');
  }

  function enforcePageAccess() {
    var role = getCurrentRole();

    document.querySelectorAll('[data-vanguard-min-role]').forEach(function (el) {

      var required = normalizeRole(
        el.getAttribute('data-vanguard-min-role')
      );

      if (!roleAtLeast(required)) {
        el.style.display = 'none';
        el.setAttribute('data-vanguard-hidden', 'true');
      } else {
        el.style.removeProperty('display');
        el.removeAttribute('data-vanguard-hidden');
      }
    });

    document.querySelectorAll('[data-vanguard-permission]').forEach(function (el) {

      var permission = clean(
        el.getAttribute('data-vanguard-permission')
      );

      if (!hasPermission(permission, role)) {
        el.disabled = true;
        el.classList.add('vanguard-role-disabled');
      } else {
        el.disabled = false;
        el.classList.remove('vanguard-role-disabled');
      }
    });
  }

  function injectStyles() {
    if (document.getElementById('vanguard-role-style')) return;

    var style = document.createElement('style');
    style.id = 'vanguard-role-style';

    style.textContent = ''
      + '.vanguard-role-disabled{opacity:.45!important;cursor:not-allowed!important;filter:grayscale(.5)!important}';

    document.head.appendChild(style);
  }

  function renderRoleBanner() {
    var existing = document.getElementById('vanguard-role-banner');

    if (!existing) {
      existing = document.createElement('div');
      existing.id = 'vanguard-role-banner';

      existing.style.cssText =
        'max-width:1180px;margin:12px auto;padding:10px 14px;border-radius:14px;' +
        'background:rgba(15,23,42,.92);color:#fff;font-family:Arial,Helvetica,sans-serif;' +
        'border:1px solid rgba(255,255,255,.16);';

      var target =
        document.querySelector('[data-vanguard-role-mount]') ||
        document.querySelector('main') ||
        document.body;

      if (target === document.body) {
        document.body.insertBefore(existing, document.body.firstChild);
      } else {
        target.insertBefore(existing, target.firstChild);
      }
    }

    var role = getCurrentRole();

    existing.innerHTML =
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">'

      + '<div>'
      + '<div style="font-size:16px;font-weight:900;text-transform:uppercase;letter-spacing:.04em;">'
      + 'VANGUARD ACCESS CONTROL'
      + '</div>'

      + '<div style="margin-top:4px;font-size:12px;font-weight:700;opacity:.82;">'
      + 'Centralized role authority active.'
      + '</div>'
      + '</div>'

      + '<div style="display:flex;align-items:center;">'
      + pill('ROLE', role.toUpperCase())
      + '</div>'

      + '</div>';
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
    enforcePageAccess();
    renderRoleBanner();
  }

  function init() {
    injectStyles();
    refresh();
  }

  var api = {
    __installed: true,
    version: VERSION,

    ROLE_ORDER: ROLE_ORDER,
    ROLE_PERMISSIONS: ROLE_PERMISSIONS,

    normalizeRole: normalizeRole,
    getCurrentRole: getCurrentRole,

    roleAtLeast: roleAtLeast,
    permissionsFor: permissionsFor,
    hasPermission: hasPermission,
    requirePermission: requirePermission,

    canOverride: canOverride,
    canResolveConflicts: canResolveConflicts,
    canApproveExport: canApproveExport,
    canReleaseWorkflow: canReleaseWorkflow,
    canModifyAI: canModifyAI,
    canValidate: canValidate,
    canForemanVerify: canForemanVerify,
    canReopenStep: canReopenStep,
    canCompleteStep: canCompleteStep,

    refresh: refresh
  };

  window.NEXUS_VANGUARD_ROLE_ENGINE = api;
  window.VanguardRoleEngine = api;

  window.NEXUS = window.NEXUS || {};
  window.NEXUS.VanguardRoleEngine = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('vanguard:update', function () {
    setTimeout(refresh, 50);
  });

})();
