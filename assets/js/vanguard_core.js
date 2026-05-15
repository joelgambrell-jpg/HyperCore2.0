/*
  assets/js/vanguard_core.js
  NEXUS Vanguard Core Intelligence Layer

  Purpose:
  - Additive shared equipment state engine for HyperCore / NEXUS Vanguard.
  - Keeps existing localStorage completion keys working.
  - Creates one canonical Vanguard state object per equipment.
  - Provides universal status banner, confidence scoring, active locks, risk flags,
    required actions, and cross-page event updates.
*/

(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD && window.NEXUS_VANGUARD.__installed) return;

  var VERSION = '0.1.0-field-core';
  var STORAGE_PREFIX = 'nexus_';
  var MAX_AUDIT_ITEMS = 250;

  var STEP_IDS = {
    rif: 'rif',
    ccs: 'ccs',
    phenolic: 'phenolic',
    torque: 'torque',
    l2: 'l2',
    meg: 'meg',
    prefod: 'prefod',
    fpv: 'fpv',
    energization: 'energization'
  };

  var ROLE_RANK = {
    viewer: 0,
    tech: 1,
    qcx: 2,
    foreman: 3,
    superintendent: 4,
    admin: 5
  };

  function nowISO() {
    return new Date().toISOString();
  }

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function lower(value) {
    return clean(value).toLowerCase();
  }

  function clamp(number, min, max) {
    var n = Number(number);
    if (!isFinite(n)) n = min;
    return Math.max(min, Math.min(max, n));
  }

  function safeReadText(key, fallback) {
    try {
      var value = localStorage.getItem(key);
      return value == null ? (fallback || '') : value;
    } catch (err) {
      return fallback || '';
    }
  }

  function safeWriteText(key, value) {
    try {
      localStorage.setItem(key, String(value == null ? '' : value));
      return true;
    } catch (err) {
      return false;
    }
  }

  function safeRemove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (err) {
      return false;
    }
  }

  function safeReadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
  }

  function safeWriteJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  function params() {
    try {
      return new URL(window.location.href).searchParams;
    } catch (err) {
      return new URLSearchParams(window.location.search || '');
    }
  }

  function getEq() {
    var p = params();
    var fromUrl = clean(p.get('eq') || p.get('equipmentId') || p.get('equipment') || '');
    if (fromUrl) return fromUrl;

    if (window.NEXUS && typeof window.NEXUS.getEq === 'function') {
      try {
        var nxEq = clean(window.NEXUS.getEq());
        if (nxEq) return nxEq;
      } catch (err) {}
    }

    var keys = [
      'nexus_active_eq',
      'nexus_active_equipment',
      'nexus_current_eq',
      'nexus_selected_eq',
      'nexus_eq',
      'eq'
    ];

    for (var i = 0; i < keys.length; i += 1) {
      var value = clean(safeReadText(keys[i], ''));
      if (value) return value;
    }

    return '';
  }

  function persistEq(eq) {
    var value = clean(eq || getEq());
    if (!value) return '';
    safeWriteText('nexus_active_eq', value);
    safeWriteText('nexus_active_equipment', value);
    safeWriteText('nexus_current_eq', value);
    return value;
  }

  function getBuilding(eq) {
    var p = params();
    var value = clean(p.get('building') || p.get('job') || p.get('jobId') || p.get('project') || '');
    if (value) return value;

    value = clean(
      safeReadText('nexus_active_building', '') ||
      safeReadText('nexus_active_job', '') ||
      safeReadText('nexus_project_id', '')
    );
    if (value) return value;

    var equipment = clean(eq || getEq());
    if (equipment) {
      var meta = safeReadJSON('nexus_meta_' + equipment, {});
      value = clean(meta.building || meta.job || meta.jobId || meta.project || '');
      if (value) return value;

      var record = safeReadJSON('nexus_equipment_' + equipment, {});
      value = clean(record.building || record.job || record.jobId || record.project || '');
      if (value) return value;
    }

    return '';
  }

  function getRole() {
    if (window.NEXUS && typeof window.NEXUS.getRole === 'function') {
      try {
        var nxRole = lower(window.NEXUS.getRole());
        if (nxRole) return nxRole;
      } catch (err) {}
    }

    try {
      var selector = document.getElementById('nxRoleSelect');
      if (selector && selector.value) return lower(selector.value);
    } catch (err) {}

    return lower(safeReadText('nexus_role', 'viewer')) || 'viewer';
  }

  function roleAtLeast(requiredRole) {
    var current = ROLE_RANK[getRole()] || 0;
    var required = ROLE_RANK[lower(requiredRole)] || 0;
    return current >= required;
  }

  function keyFor(eq, suffix) {
    var equipment = clean(eq || getEq()) || 'NO_EQUIPMENT_SELECTED';
    return STORAGE_PREFIX + equipment + '_' + suffix;
  }

  function systemKey(eq) {
    return keyFor(eq, 'vanguard_system');
  }

  function summaryKey(eq) {
    return keyFor(eq, 'vanguard_summary');
  }

  function stepKey(eq, stepId) {
    var equipment = clean(eq || getEq()) || 'NO_EQUIPMENT_SELECTED';
    return STORAGE_PREFIX + equipment + '_step_' + clean(stepId);
  }

  function completionKeyCandidates(eq, stepId) {
    var equipment = clean(eq || getEq()) || 'NO_EQUIPMENT_SELECTED';
    var step = clean(stepId);

    return [
      STORAGE_PREFIX + equipment + '_step_' + step,
      STORAGE_PREFIX + equipment + '_' + step + '_complete',
      STORAGE_PREFIX + equipment + '_' + step + '_completed',
      STORAGE_PREFIX + equipment + '_' + step + '_done',
      STORAGE_PREFIX + equipment + '_' + step + '_validated'
    ];
  }

  function isTruthyStored(value) {
    var v = lower(value);
    return v === '1' ||
      v === 'true' ||
      v === 'yes' ||
      v === 'complete' ||
      v === 'completed' ||
      v === 'done' ||
      v === 'pass' ||
      v === 'passed' ||
      v === 'validated';
  }

  function isStepComplete(eq, stepId) {
    var keys = completionKeyCandidates(eq, stepId);

    for (var i = 0; i < keys.length; i += 1) {
      if (isTruthyStored(safeReadText(keys[i], ''))) return true;
    }

    if (window.NEXUS && typeof window.NEXUS.isStepComplete === 'function') {
      try {
        if (window.NEXUS.isStepComplete(stepId, eq)) return true;
      } catch (err) {}
    }

    return false;
  }

  function defaultState(eq) {
    var equipment = clean(eq || getEq());

    return {
      version: VERSION,
      equipmentId: equipment,
      projectId: getBuilding(equipment),
      createdAt: nowISO(),
      updatedAt: nowISO(),
      sourcePage: clean(location.pathname.split('/').pop() || 'unknown'),
      status: {
        label: 'VANGUARD INITIALIZED',
        tone: 'neutral',
        message: 'Shared equipment intelligence is active.'
      },
      steps: {},
      validations: {},
      locks: [],
      requiredActions: [],
      aiFlags: [],
      overrides: [],
      evidence: {},
      documentSources: [],
      confidenceScore: 100,
      riskScore: 0,
      readiness: {
        readyForMeg: false,
        readyForL2: false,
        readyForPrefod: false,
        readyForFpv: false,
        readyForEnergization: false
      },
      auditTrail: []
    };
  }

  function normalizeState(raw, eq) {
    var base = defaultState(eq);
    var state = raw && typeof raw === 'object' ? raw : {};
    var merged = Object.assign({}, base, state);

    merged.version = VERSION;
    merged.equipmentId = clean(merged.equipmentId || eq || getEq());
    merged.projectId = clean(merged.projectId || getBuilding(merged.equipmentId));
    merged.updatedAt = clean(merged.updatedAt || nowISO());
    merged.sourcePage = clean(location.pathname.split('/').pop() || merged.sourcePage || 'unknown');
    merged.status = Object.assign({}, base.status, merged.status || {});
    merged.steps = Object.assign({}, base.steps, merged.steps || {});
    merged.validations = Object.assign({}, base.validations, merged.validations || {});
    merged.readiness = Object.assign({}, base.readiness, merged.readiness || {});
    merged.evidence = Object.assign({}, base.evidence, merged.evidence || {});
    merged.locks = Array.isArray(merged.locks) ? merged.locks : [];
    merged.requiredActions = Array.isArray(merged.requiredActions) ? merged.requiredActions : [];
    merged.aiFlags = Array.isArray(merged.aiFlags) ? merged.aiFlags : [];
    merged.overrides = Array.isArray(merged.overrides) ? merged.overrides : [];
    merged.documentSources = Array.isArray(merged.documentSources) ? merged.documentSources : [];
    merged.auditTrail = Array.isArray(merged.auditTrail) ? merged.auditTrail : [];
    merged.confidenceScore = clamp(merged.confidenceScore, 0, 100);
    merged.riskScore = clamp(merged.riskScore, 0, 100);

    return merged;
  }

  function loadState(eq) {
    var equipment = clean(eq || getEq());
    if (!equipment) return normalizeState({}, '');
    return normalizeState(safeReadJSON(systemKey(equipment), {}), equipment);
  }

  function readLegacySignals(eq) {
    var equipment = clean(eq || getEq());

    var signals = {
      rifComplete: isStepComplete(equipment, STEP_IDS.rif),
      ccsComplete: isStepComplete(equipment, STEP_IDS.ccs) || isTruthyStored(safeReadText(keyFor(equipment, 'ccs_signed_off'), '')),
      phenolicComplete: isStepComplete(equipment, STEP_IDS.phenolic),
      torqueComplete: isStepComplete(equipment, STEP_IDS.torque),
      l2Complete: isStepComplete(equipment, STEP_IDS.l2),
      megComplete: isStepComplete(equipment, STEP_IDS.meg),
      prefodComplete: isStepComplete(equipment, STEP_IDS.prefod),
      fpvComplete: isStepComplete(equipment, STEP_IDS.fpv),
      energizationComplete: isStepComplete(equipment, STEP_IDS.energization),
      torqueFailed: false,
      megFailed: false,
      foremanReviewRequired: false
    };

    var torqueState = safeReadJSON(keyFor(equipment, 'torque_state'), null) ||
      safeReadJSON(keyFor(equipment, 'torque_log'), null) ||
      {};

    var megState = safeReadJSON(keyFor(equipment, 'meg_state'), null) ||
      safeReadJSON(keyFor(equipment, 'meg_log'), null) ||
      {};

    signals.torqueFailed = !!(
      torqueState.failed ||
      torqueState.hasFailure ||
      torqueState.nonCompliant ||
      torqueState.blocked ||
      isTruthyStored(safeReadText(keyFor(equipment, 'torque_failed'), ''))
    );

    signals.megFailed = !!(
      megState.failed ||
      megState.hasFailure ||
      megState.nonCompliant ||
      megState.blocked ||
      isTruthyStored(safeReadText(keyFor(equipment, 'meg_failed'), ''))
    );

    signals.foremanReviewRequired = isTruthyStored(safeReadText(keyFor(equipment, 'foreman_review_required'), ''));

    return signals;
  }

  function mergeLegacyIntoState(state) {
    var equipment = clean(state.equipmentId || getEq());
    var signals = readLegacySignals(equipment);

    var map = {
      rif: signals.rifComplete,
      ccs: signals.ccsComplete,
      phenolic: signals.phenolicComplete,
      torque: signals.torqueComplete,
      l2: signals.l2Complete,
      meg: signals.megComplete,
      prefod: signals.prefodComplete,
      fpv: signals.fpvComplete,
      energization: signals.energizationComplete
    };

    Object.keys(map).forEach(function (stepId) {
      state.steps[stepId] = state.steps[stepId] || {};
      if (map[stepId] && !state.steps[stepId].complete) {
        state.steps[stepId].complete = true;
        state.steps[stepId].source = state.steps[stepId].source || 'legacy_key';
        state.steps[stepId].updatedAt = state.steps[stepId].updatedAt || nowISO();
      }
    });

    state.validations.torque = state.validations.torque || {};
    state.validations.meg = state.validations.meg || {};
    state.validations.foreman = state.validations.foreman || {};

    if (signals.torqueFailed) state.validations.torque.failed = true;
    if (signals.megFailed) state.validations.meg.failed = true;
    if (signals.foremanReviewRequired) state.validations.foreman.reviewRequired = true;

    return state;
  }

  function uniquePush(list, item) {
    if (!item) return;

    var text = typeof item === 'string'
      ? item
      : clean(item.label || item.message || item.code || '');

    if (!text) return;

    var found = list.some(function (existing) {
      if (typeof existing === 'string') return existing === text;
      return clean(existing.label || existing.message || existing.code || '') === text;
    });

    if (!found) list.push(item);
  }

  function stepDone(state, stepId) {
    return !!(state.steps && state.steps[stepId] && state.steps[stepId].complete);
  }

  function validationFailed(state, group) {
    return !!(state.validations && state.validations[group] && state.validations[group].failed);
  }

  function validationReviewRequired(state, group) {
    return !!(state.validations && state.validations[group] && state.validations[group].reviewRequired);
  }

  function computeState(inputState) {
    var state = normalizeState(inputState, inputState && inputState.equipmentId);
    state = mergeLegacyIntoState(state);

    var locks = [];
    var required = [];
    var flags = Array.isArray(state.aiFlags) ? state.aiFlags.slice(0) : [];
    var score = 100;

    var torqueDone = stepDone(state, 'torque');
    var megDone = stepDone(state, 'meg');
    var ccsDone = stepDone(state, 'ccs');
    var l2Done = stepDone(state, 'l2');
    var prefodDone = stepDone(state, 'prefod');
    var fpvDone = stepDone(state, 'fpv');

    if (!torqueDone) {
      uniquePush(locks, { code: 'TORQUE_INCOMPLETE', label: 'Torque incomplete', severity: 'blocker' });
      uniquePush(required, 'Complete torque before downstream release.');
      score -= 14;
    }

    if (validationFailed(state, 'torque')) {
      uniquePush(locks, { code: 'TORQUE_FAILED', label: 'Torque validation failed', severity: 'blocker' });
      uniquePush(required, 'Correct failed torque validation.');
      score -= 30;
    }

    if (validationReviewRequired(state, 'foreman') || validationReviewRequired(state, 'torque')) {
      uniquePush(locks, { code: 'FOREMAN_REVIEW', label: 'Foreman review required', severity: 'review' });
      uniquePush(required, 'Foreman or higher review required.');
      score -= 10;
    }

    if (torqueDone && !megDone) {
      uniquePush(required, 'Megohmmeter testing is the next major validation.');
      score -= 7;
    }

    if (validationFailed(state, 'meg')) {
      uniquePush(locks, { code: 'MEG_FAILED', label: 'Megohmmeter validation failed', severity: 'blocker' });
      uniquePush(required, 'Resolve failed megohmmeter validation.');
      score -= 30;
    }

    if (!ccsDone) {
      uniquePush(required, 'Construction Check Sheet sign-off remains open.');
      score -= 6;
    }

    if (state.overrides.length > 0) {
      score -= Math.min(18, state.overrides.length * 4);
      uniquePush(flags, {
        code: 'OVERRIDE_HISTORY',
        label: 'Override history exists',
        severity: state.overrides.length > 2 ? 'high' : 'medium',
        count: state.overrides.length
      });
    }

    var missingEvidenceCount = 0;

    ['torque', 'meg', 'l2', 'prefod', 'fpv'].forEach(function (group) {
      if (stepDone(state, group) && (!state.evidence || !state.evidence[group])) {
        missingEvidenceCount += 1;
      }
    });

    if (missingEvidenceCount > 0) {
      score -= Math.min(15, missingEvidenceCount * 3);
      uniquePush(flags, {
        code: 'EVIDENCE_GAPS',
        label: 'Evidence gaps detected',
        severity: 'medium',
        count: missingEvidenceCount
      });
    }

    state.readiness = {
      readyForMeg: torqueDone && !validationFailed(state, 'torque'),
      readyForL2: torqueDone && megDone && !validationFailed(state, 'torque') && !validationFailed(state, 'meg'),
      readyForPrefod: torqueDone && megDone && l2Done && ccsDone,
      readyForFpv: torqueDone && megDone && l2Done && prefodDone && ccsDone,
      readyForEnergization: torqueDone && megDone && l2Done && prefodDone && fpvDone && ccsDone &&
        locks.filter(function (lock) { return lock.severity === 'blocker'; }).length === 0
    };

    state.locks = locks;
    state.requiredActions = required;
    state.aiFlags = flags;
    state.confidenceScore = clamp(Math.round(score), 0, 100);
    state.riskScore = clamp(100 - state.confidenceScore, 0, 100);

    var blockerCount = locks.filter(function (lock) { return lock.severity === 'blocker'; }).length;
    var reviewCount = locks.filter(function (lock) { return lock.severity === 'review'; }).length;

    if (blockerCount > 0) {
      state.status = {
        label: 'LOCKED',
        tone: 'danger',
        message: locks[0].label || 'Blocked by active Vanguard lock.'
      };
    } else if (reviewCount > 0) {
      state.status = {
        label: 'REVIEW REQUIRED',
        tone: 'warning',
        message: locks[0].label || 'Review required before downstream release.'
      };
    } else if (state.readiness.readyForEnergization) {
      state.status = {
        label: 'READY FOR ENERGIZATION REVIEW',
        tone: 'success',
        message: 'All major Vanguard gates are satisfied.'
      };
    } else if (state.readiness.readyForFpv) {
      state.status = {
        label: 'READY FOR FPV',
        tone: 'success',
        message: 'Pre-FOD and final photo verification can proceed.'
      };
    } else if (state.readiness.readyForPrefod) {
      state.status = {
        label: 'READY FOR PRE-FOD',
        tone: 'success',
        message: 'Pre-FOD validation is available.'
      };
    } else if (state.readiness.readyForL2) {
      state.status = {
        label: 'READY FOR L2',
        tone: 'success',
        message: 'L2 installation verification is available.'
      };
    } else if (state.readiness.readyForMeg) {
      state.status = {
        label: 'READY FOR MEG',
        tone: 'success',
        message: 'Torque gate is satisfied. Megohmmeter testing can proceed.'
      };
    } else {
      state.status = {
        label: 'IN PROGRESS',
        tone: 'neutral',
        message: 'Complete the next required action.'
      };
    }

    state.updatedAt = nowISO();
    return state;
  }

  function pushAudit(state, action, detail) {
    state.auditTrail = Array.isArray(state.auditTrail) ? state.auditTrail : [];

    state.auditTrail.push({
      at: nowISO(),
      action: clean(action || 'update'),
      page: clean(location.pathname.split('/').pop() || 'unknown'),
      role: getRole(),
      detail: detail || {}
    });

    if (state.auditTrail.length > MAX_AUDIT_ITEMS) {
      state.auditTrail = state.auditTrail.slice(state.auditTrail.length - MAX_AUDIT_ITEMS);
    }

    return state;
  }

  function saveState(eq, state, action, detail) {
    var equipment = clean(eq || state.equipmentId || getEq());
    if (!equipment) return false;

    state.equipmentId = equipment;
    state.projectId = clean(state.projectId || getBuilding(equipment));
    state = computeState(state);
    state = pushAudit(state, action || 'save', detail || {});

    safeWriteJSON(systemKey(equipment), state);

    safeWriteJSON(summaryKey(equipment), {
      equipmentId: equipment,
      projectId: state.projectId,
      status: state.status,
      confidenceScore: state.confidenceScore,
      riskScore: state.riskScore,
      locks: state.locks,
      requiredActions: state.requiredActions,
      readiness: state.readiness,
      updatedAt: state.updatedAt,
      version: VERSION
    });

    try {
      window.dispatchEvent(new CustomEvent('vanguard:update', { detail: state }));
      window.dispatchEvent(new CustomEvent('nexus:vanguard:update', { detail: state }));
    } catch (err) {}

    return true;
  }

  function deepMerge(target, source) {
    var output = Array.isArray(target) ? target.slice(0) : Object.assign({}, target || {});
    if (!source || typeof source !== 'object') return output;

    Object.keys(source).forEach(function (key) {
      var value = source[key];

      if (Array.isArray(value)) {
        output[key] = value.slice(0);
      } else if (value && typeof value === 'object') {
        output[key] = deepMerge(output[key] || {}, value);
      } else {
        output[key] = value;
      }
    });

    return output;
  }

  function updateState(patch, action) {
    var equipment = persistEq(getEq());
    if (!equipment) return computeState(defaultState(''));

    var state = loadState(equipment);
    var incoming = patch && typeof patch === 'object' ? patch : {};
    var merged = deepMerge(state, incoming);

    saveState(equipment, merged, action || 'update', { patch: incoming });

    return loadState(equipment);
  }

  function addFlag(flag) {
    var equipment = persistEq(getEq());
    var state = loadState(equipment);

    state.aiFlags = Array.isArray(state.aiFlags) ? state.aiFlags : [];

    uniquePush(
      state.aiFlags,
      typeof flag === 'string'
        ? { code: flag, label: flag, severity: 'medium' }
        : flag
    );

    saveState(equipment, state, 'flag:add', { flag: flag });
    return loadState(equipment);
  }

  function addOverride(override) {
    var equipment = persistEq(getEq());
    var state = loadState(equipment);

    state.overrides = Array.isArray(state.overrides) ? state.overrides : [];

    state.overrides.push(Object.assign({
      at: nowISO(),
      role: getRole(),
      page: clean(location.pathname.split('/').pop() || 'unknown')
    }, override || {}));

    saveState(equipment, state, 'override:add', { override: override || {} });
    return loadState(equipment);
  }

  function setValidation(group, data) {
    var equipment = persistEq(getEq());
    var state = loadState(equipment);
    var id = clean(group || 'general');

    state.validations[id] = Object.assign(
      {},
      state.validations[id] || {},
      data || {},
      { updatedAt: nowISO() }
    );

    saveState(equipment, state, 'validation:' + id, data || {});
    return loadState(equipment);
  }

  function setEvidence(group, data) {
    var equipment = persistEq(getEq());
    var state = loadState(equipment);
    var id = clean(group || 'general');

    state.evidence[id] = Object.assign(
      {},
      state.evidence[id] || {},
      data || {},
      { updatedAt: nowISO() }
    );

    saveState(equipment, state, 'evidence:' + id, data || {});
    return loadState(equipment);
  }

  function setStep(stepId, data) {
    var equipment = persistEq(getEq());
    var state = loadState(equipment);
    var id = clean(stepId);

    state.steps[id] = Object.assign(
      {},
      state.steps[id] || {},
      data || {},
      { updatedAt: nowISO() }
    );

    if (data && Object.prototype.hasOwnProperty.call(data, 'complete')) {
      if (data.complete) safeWriteText(stepKey(equipment, id), '1');
      else safeRemove(stepKey(equipment, id));
    }

    saveState(equipment, state, 'step:' + id, data || {});
    return loadState(equipment);
  }

  function setStepComplete(eq, stepId, done, source) {
    var equipment = clean(eq || getEq());
    if (!equipment) return false;

    if (done) safeWriteText(stepKey(equipment, stepId), '1');
    else safeRemove(stepKey(equipment, stepId));

    if (window.NEXUS && typeof window.NEXUS.setStepComplete === 'function') {
      try {
        window.NEXUS.setStepComplete(stepId, !!done, equipment);
      } catch (err) {}
    }

    var state = loadState(equipment);

    state.steps = state.steps || {};
    state.steps[stepId] = state.steps[stepId] || {};
    state.steps[stepId].complete = !!done;
    state.steps[stepId].updatedAt = nowISO();
    state.steps[stepId].source = source || 'vanguard_core';

    return saveState(equipment, state, 'step:' + stepId + ':' + (!!done ? 'complete' : 'incomplete'));
  }

  function getSummary(eq) {
    var equipment = clean(eq || getEq());
    if (!equipment) return null;
    return safeReadJSON(summaryKey(equipment), null) || computeState(loadState(equipment));
  }

  function getState(eq) {
    var equipment = persistEq(eq || getEq());
    var state = computeState(loadState(equipment));
    if (equipment) saveState(equipment, state, 'refresh', { silent: true });
    return state;
  }

  function emit(name, detail) {
    var eventName = clean(name || 'event');

    try {
      window.dispatchEvent(new CustomEvent('vanguard:' + eventName, { detail: detail || {} }));
      window.dispatchEvent(new CustomEvent('nexus:vanguard:' + eventName, { detail: detail || {} }));
    } catch (err) {}
  }

  function bannerColors(tone) {
    switch (tone) {
      case 'success':
        return { border: '#16a34a', bg: 'rgba(20,83,45,0.96)' };
      case 'warning':
        return { border: '#f59e0b', bg: 'rgba(120,53,15,0.96)' };
      case 'danger':
        return { border: '#dc2626', bg: 'rgba(127,29,29,0.97)' };
      default:
        return { border: '#38bdf8', bg: 'rgba(15,23,42,0.96)' };
    }
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
    if (document.getElementById('vanguard-core-style')) return;

    var style = document.createElement('style');
    style.id = 'vanguard-core-style';

    style.textContent = ''
      + '.vanguard-system-banner{position:sticky;top:0;z-index:9998;margin:0;padding:12px 14px;border-bottom:3px solid #38bdf8;background:rgba(15,23,42,.96);color:#fff;font-family:Arial,Helvetica,sans-serif;box-shadow:0 8px 18px rgba(0,0,0,.28)}'
      + '.vanguard-system-banner *{box-sizing:border-box}'
      + '.vanguard-banner-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;max-width:1180px;margin:0 auto}'
      + '.vanguard-banner-title{display:flex;align-items:center;gap:10px;font-weight:900;letter-spacing:.04em;text-transform:uppercase;font-size:15px}'
      + '.vanguard-pill{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;border:1px solid rgba(255,255,255,.35);padding:6px 10px;font-weight:900;font-size:12px;background:rgba(255,255,255,.12);white-space:nowrap}'
      + '.vanguard-banner-message{font-size:13px;opacity:.96;font-weight:700}'
      + '.vanguard-banner-metrics{display:flex;gap:8px;flex-wrap:wrap;align-items:center}'
      + '.vanguard-mini-label{opacity:.8;font-size:10px;text-transform:uppercase;letter-spacing:.05em;margin-right:4px}'
      + '.vanguard-required-actions{max-width:1180px;margin:8px auto 0;font-size:12px;font-weight:700;opacity:.96}'
      + '.vanguard-required-actions span{display:inline-block;margin:3px 6px 0 0;padding:5px 8px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16)}'
      + '.vanguard-lock-disabled{opacity:.48!important;filter:grayscale(.35);cursor:not-allowed!important}'
      + '@media(max-width:700px){.vanguard-banner-row{align-items:flex-start}.vanguard-banner-title{font-size:13px}.vanguard-banner-message{width:100%;font-size:12px}.vanguard-pill{font-size:11px;padding:5px 8px}}';

    document.head.appendChild(style);
  }

  function renderBanner(options) {
    options = options || {};

    if (options.disabled) return null;
    if (document.body && document.body.getAttribute('data-vanguard-banner') === 'off') return null;

    var state = getState();
    if (!state.equipmentId) return null;

    injectStyles();

    var banner = document.getElementById('vanguard-system-banner');

    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'vanguard-system-banner';
      banner.className = 'vanguard-system-banner';

      if (document.body.firstChild) {
        document.body.insertBefore(banner, document.body.firstChild);
      } else {
        document.body.appendChild(banner);
      }
    }

    var colors = bannerColors(state.status.tone);
    banner.style.borderBottomColor = colors.border;
    banner.style.background = colors.bg;

    var lockText = state.locks.length
      ? state.locks.map(function (lock) { return lock.label || lock.code; }).join(', ')
      : 'NONE';

    var requiredMarkup = '';

    if (state.requiredActions && state.requiredActions.length) {
      requiredMarkup = '<div class="vanguard-required-actions">' +
        state.requiredActions.slice(0, 4).map(function (action) {
          return '<span>' + escapeHTML(action) + '</span>';
        }).join('') +
      '</div>';
    }

    banner.innerHTML = ''
      + '<div class="vanguard-banner-row">'
      +   '<div>'
      +     '<div class="vanguard-banner-title">'
      +       '<span>VANGUARD</span>'
      +       '<span class="vanguard-pill">' + escapeHTML(state.status.label) + '</span>'
      +     '</div>'
      +     '<div class="vanguard-banner-message">' + escapeHTML(state.status.message || '') + '</div>'
      +   '</div>'
      +   '<div class="vanguard-banner-metrics">'
      +     '<span class="vanguard-pill"><span class="vanguard-mini-label">EQ</span>' + escapeHTML(state.equipmentId || 'NONE') + '</span>'
      +     '<span class="vanguard-pill"><span class="vanguard-mini-label">CONF</span>' + escapeHTML(state.confidenceScore) + '%</span>'
      +     '<span class="vanguard-pill"><span class="vanguard-mini-label">RISK</span>' + escapeHTML(state.riskScore) + '%</span>'
      +     '<span class="vanguard-pill"><span class="vanguard-mini-label">LOCKS</span>' + escapeHTML(lockText) + '</span>'
      +   '</div>'
      + '</div>'
      + requiredMarkup;

    return banner;
  }

  function refresh() {
    var equipment = persistEq(getEq());
    if (!equipment) return null;

    var state = getState(equipment);
    renderBanner();

    return state;
  }

  function init() {
    var equipment = persistEq(getEq());
    if (!equipment) return;
    refresh();
  }

  var api = {
    __installed: true,
    version: VERSION,
    STEP_IDS: STEP_IDS,

    getEq: getEq,
    getBuilding: getBuilding,
    getRole: getRole,
    roleAtLeast: roleAtLeast,

    keys: {
      system: systemKey,
      summary: summaryKey,
      step: stepKey
    },

    storage: {
      readText: safeReadText,
      writeText: safeWriteText,
      readJSON: safeReadJSON,
      writeJSON: safeWriteJSON,
      remove: safeRemove
    },

    getState: getState,
    getSummary: getSummary,
    updateState: updateState,

    saveState: function (state, action, detail) {
      var equipment = persistEq((state && state.equipmentId) || getEq());
      return saveState(equipment, state || {}, action || 'manual-save', detail || {});
    },

    refresh: refresh,
    computeState: computeState,
    readLegacySignals: readLegacySignals,

    isStepComplete: function (stepId, eq) {
      return isStepComplete(eq || getEq(), stepId);
    },

    setStepComplete: function (stepId, done, eq, source) {
      return setStepComplete(eq || getEq(), stepId, done, source || 'api');
    },

    setStep: setStep,
    setValidation: setValidation,
    setEvidence: setEvidence,
    addFlag: addFlag,
    addOverride: addOverride,
    emit: emit,
    renderBanner: renderBanner
  };

  window.NEXUS_VANGUARD = api;
  window.Vanguard = api;

  window.NEXUS = window.NEXUS || {};
  window.NEXUS.Vanguard = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('storage', function (event) {
    if (!event || !event.key) return;

    if (
      event.key.indexOf('_vanguard_system') !== -1 ||
      event.key.indexOf('_step_') !== -1 ||
      event.key.indexOf('nexus_role') !== -1
    ) {
      setTimeout(refresh, 40);
    }
  });

  window.addEventListener('focus', function () {
    setTimeout(refresh, 40);
  });
})();
