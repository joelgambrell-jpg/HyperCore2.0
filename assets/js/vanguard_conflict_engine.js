/*
  assets/js/vanguard_conflict_engine.js
  NEXUS Vanguard Conflict Engine

  Purpose:
  - Central conflict resolution logic.
  - Default rule: stricter / better / higher-rated requirement wins.
  - Keeps human review and override path available.
  - Stores resolved conflict decisions back into Vanguard core.
*/

(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_CONFLICT_ENGINE && window.NEXUS_VANGUARD_CONFLICT_ENGINE.__installed) return;

  var VERSION = '0.1.0-conflict-engine';

  function core() {
    return window.NEXUS_VANGUARD || window.Vanguard || null;
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

  function numeric(value) {
    if (value == null || value === '') return null;

    if (typeof value === 'number' && isFinite(value)) return value;

    var match = clean(value).match(/-?\d+(\.\d+)?/);
    return match ? Number(match[0]) : null;
  }

  function normalizeRequirement(req) {
    req = req && typeof req === 'object' ? req : {};

    return {
      id: clean(req.id || ('REQ-' + Date.now() + '-' + Math.floor(Math.random() * 10000))),
      requirementType: upper(req.requirementType || req.type || req.section || 'GENERAL'),
      value: clean(req.value || req.requirement || req.text || ''),
      numericValue: req.numericValue != null ? numeric(req.numericValue) : numeric(req.value || req.requirement || req.text),
      units: clean(req.units || ''),
      appliesTo: clean(req.appliesTo || req.component || req.equipment || ''),
      sourceDocument: clean(req.sourceDocument || req.document || req.file || ''),
      sourceType: clean(req.sourceType || ''),
      page: clean(req.page || ''),
      section: clean(req.section || ''),
      exactText: clean(req.exactText || req.text || req.value || ''),
      confidence: Math.max(0, Math.min(100, Number(req.confidence == null ? 75 : req.confidence))),
      priority: Number(req.priority == null ? 0 : req.priority)
    };
  }

  function sourceRank(req) {
    var type = upper(req.sourceType || req.sourceDocument || '');

    if (type.indexOf('SPEC') !== -1 || type.indexOf('AWS') !== -1 || type.indexOf('PROJECT') !== -1) return 50;
    if (type.indexOf('OEM') !== -1 || type.indexOf('MANUFACTURER') !== -1 || type.indexOf('SUBMITTAL') !== -1) return 45;
    if (type.indexOf('DRAWING') !== -1 || type.indexOf('PRINT') !== -1) return 40;
    if (type.indexOf('PROCEDURE') !== -1 || type.indexOf('SOP') !== -1 || type.indexOf('MOP') !== -1) return 35;

    return 20;
  }

  function isHigherValueStricter(type) {
    type = upper(type);

    if (type === 'TORQUE') return true;
    if (type === 'MEG') return true;
    if (type === 'INSULATION') return true;
    if (type === 'CLEARANCE') return true;

    return true;
  }

  function compareRequirements(aInput, bInput) {
    var a = normalizeRequirement(aInput);
    var b = normalizeRequirement(bInput);
    var type = upper(a.requirementType || b.requirementType);
    var av = numeric(a.numericValue);
    var bv = numeric(b.numericValue);

    var reason = '';

    if (av != null && bv != null && av !== bv) {
      if (isHigherValueStricter(type)) {
        reason = 'Higher numeric requirement selected as stricter.';
        return {
          selected: bv > av ? b : a,
          rejected: bv > av ? a : b,
          reason: reason,
          rule: 'STRICTER_NUMERIC_VALUE'
        };
      }

      reason = 'Lower numeric requirement selected as stricter.';
      return {
        selected: bv < av ? b : a,
        rejected: bv < av ? a : b,
        reason: reason,
        rule: 'STRICTER_NUMERIC_VALUE'
      };
    }

    var ar = sourceRank(a);
    var br = sourceRank(b);

    if (ar !== br) {
      return {
        selected: br > ar ? b : a,
        rejected: br > ar ? a : b,
        reason: 'Higher authority document source selected.',
        rule: 'HIGHER_SOURCE_AUTHORITY'
      };
    }

    if (a.priority !== b.priority) {
      return {
        selected: b.priority > a.priority ? b : a,
        rejected: b.priority > a.priority ? a : b,
        reason: 'Higher manually assigned priority selected.',
        rule: 'HIGHER_PRIORITY'
      };
    }

    if (a.confidence !== b.confidence) {
      return {
        selected: b.confidence > a.confidence ? b : a,
        rejected: b.confidence > a.confidence ? a : b,
        reason: 'Higher extraction confidence selected.',
        rule: 'HIGHER_CONFIDENCE'
      };
    }

    return {
      selected: a,
      rejected: b,
      reason: 'Requirements appear equal; first requirement retained.',
      rule: 'FIRST_STABLE_RESULT'
    };
  }

  function sameFamily(aInput, bInput) {
    var a = normalizeRequirement(aInput);
    var b = normalizeRequirement(bInput);

    return upper(a.requirementType) === upper(b.requirementType) &&
      clean(a.appliesTo).toLowerCase() === clean(b.appliesTo).toLowerCase() &&
      clean(a.units).toLowerCase() === clean(b.units).toLowerCase();
  }

  function findConflicts(requirements) {
    var list = Array.isArray(requirements) ? requirements.map(normalizeRequirement) : [];
    var conflicts = [];

    for (var i = 0; i < list.length; i += 1) {
      for (var j = i + 1; j < list.length; j += 1) {
        var a = list[i];
        var b = list[j];

        if (!sameFamily(a, b)) continue;
        if (clean(a.value).toLowerCase() === clean(b.value).toLowerCase()) continue;

        var decision = compareRequirements(a, b);

        conflicts.push({
          id: 'CONFLICT-' + a.id + '-' + b.id,
          type: upper(a.requirementType),
          appliesTo: clean(a.appliesTo || b.appliesTo || ''),
          message: 'Conflicting ' + upper(a.requirementType) + ' requirements detected.',
          rule: decision.rule,
          ruleReason: decision.reason,
          status: 'REVIEW',
          options: [a, b],
          selected: decision.selected,
          rejected: decision.rejected,
          createdAt: nowISO()
        });
      }
    }

    return conflicts;
  }

  function autoSelectConflicts(conflicts) {
    return (Array.isArray(conflicts) ? conflicts : []).map(function (conflict) {
      var options = Array.isArray(conflict.options) ? conflict.options : [];

      if (options.length < 2) {
        return Object.assign({}, conflict, {
          status: conflict.selected ? 'PASS' : 'REVIEW',
          reviewedBy: conflict.selected ? 'VANGUARD_RULE_ENGINE' : '',
          reviewedAt: conflict.selected ? nowISO() : ''
        });
      }

      var decision = compareRequirements(options[0], options[1]);

      return Object.assign({}, conflict, {
        selected: decision.selected,
        rejected: decision.rejected,
        rule: decision.rule,
        ruleReason: decision.reason,
        status: 'REVIEW',
        reviewedBy: 'VANGUARD_RULE_ENGINE',
        reviewedAt: nowISO()
      });
    });
  }

  function remapConflicts() {
    var vg = core();
    if (!vg || typeof vg.getState !== 'function' || typeof vg.updateState !== 'function') return null;

    var state = vg.getState();
    var docs = state.documents || {};
    var requirements = Array.isArray(docs.requirements) ? docs.requirements : [];
    var conflicts = autoSelectConflicts(findConflicts(requirements));

    return vg.updateState({
      documents: {
        conflicts: conflicts,
        selectedRequirements: conflicts.map(function (conflict) {
          return conflict.selected;
        }).filter(Boolean),
        lastMappedAt: nowISO()
      }
    }, 'conflicts:remap');
  }

  function approveConflict(conflictId, selectedRequirementId, reason) {
    var vg = core();
    if (!vg || typeof vg.getState !== 'function' || typeof vg.updateState !== 'function') return null;

    var state = vg.getState();
    var id = clean(conflictId);
    var selectedId = clean(selectedRequirementId);

    var conflicts = (state.documents.conflicts || []).map(function (conflict) {
      if (clean(conflict.id) !== id) return conflict;

      var options = Array.isArray(conflict.options) ? conflict.options : [];
      var selected = options.filter(function (option) {
        return clean(option.id) === selectedId;
      })[0] || conflict.selected || options[0] || null;

      return Object.assign({}, conflict, {
        selected: selected,
        status: 'PASS',
        approvedBy: vg.getRole ? vg.getRole() : '',
        approvedAt: nowISO(),
        approvalReason: clean(reason || 'Approved selected Vanguard requirement.')
      });
    });

    return vg.updateState({
      documents: {
        conflicts: conflicts,
        selectedRequirements: conflicts.map(function (conflict) {
          return conflict.selected;
        }).filter(Boolean)
      }
    }, 'conflict:approve');
  }

  function overrideConflict(conflictId, selectedRequirement, reason) {
    var vg = core();
    if (!vg || typeof vg.getState !== 'function' || typeof vg.updateState !== 'function') return null;

    if (vg.roleAtLeast && !vg.roleAtLeast('superintendent')) {
      return vg.updateState({}, 'conflict:override-denied');
    }

    var state = vg.getState();
    var id = clean(conflictId);
    var normalized = normalizeRequirement(selectedRequirement);

    var conflicts = (state.documents.conflicts || []).map(function (conflict) {
      if (clean(conflict.id) !== id) return conflict;

      return Object.assign({}, conflict, {
        selected: normalized,
        status: 'OVERRIDDEN',
        overrideBy: vg.getRole ? vg.getRole() : '',
        overrideAt: nowISO(),
        overrideReason: clean(reason || 'Manager override selected requirement.')
      });
    });

    if (typeof vg.addOverride === 'function') {
      vg.addOverride({
        type: 'DOCUMENT_CONFLICT',
        conflictId: id,
        selected: normalized,
        reason: clean(reason || 'Manager override selected requirement.')
      });
    }

    return vg.updateState({
      documents: {
        conflicts: conflicts,
        selectedRequirements: conflicts.map(function (conflict) {
          return conflict.selected;
        }).filter(Boolean)
      }
    }, 'conflict:override');
  }

  var api = {
    __installed: true,
    version: VERSION,

    normalizeRequirement: normalizeRequirement,
    sourceRank: sourceRank,
    compareRequirements: compareRequirements,
    sameFamily: sameFamily,
    findConflicts: findConflicts,
    autoSelectConflicts: autoSelectConflicts,

    remapConflicts: remapConflicts,
    approveConflict: approveConflict,
    overrideConflict: overrideConflict
  };

  window.NEXUS_VANGUARD_CONFLICT_ENGINE = api;
  window.VanguardConflictEngine = api;

  window.NEXUS = window.NEXUS || {};
  window.NEXUS.VanguardConflictEngine = api;
})();
