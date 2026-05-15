/*
  assets/js/vanguard_document_mapper.js
  NEXUS Vanguard Document Mapper

  Purpose:
  - Additive document intelligence scaffold.
  - Stores uploaded/document-entered requirements into Vanguard state.
  - Detects simple conflicts.
  - Applies default rule: stricter / better / higher-rated requirement wins.
  - Does not require AI service yet.
*/

(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_DOCUMENT_MAPPER && window.NEXUS_VANGUARD_DOCUMENT_MAPPER.__installed) return;

  var VERSION = '0.1.0-document-mapper';

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

  function numberFromText(value) {
    var match = clean(value).match(/-?\d+(\.\d+)?/);
    return match ? Number(match[0]) : null;
  }

  function normalizeType(value) {
    var t = upper(value);

    if (t.indexOf('TORQUE') !== -1) return 'TORQUE';
    if (t.indexOf('MEG') !== -1 || t.indexOf('INSULATION') !== -1) return 'MEG';
    if (t.indexOf('L2') !== -1 || t.indexOf('LEVEL 2') !== -1) return 'L2';
    if (t.indexOf('PREFOD') !== -1 || t.indexOf('PRE-FOD') !== -1 || t.indexOf('FOREIGN OBJECT') !== -1) return 'PREFOD';
    if (t.indexOf('FPV') !== -1 || t.indexOf('FINISHED PRODUCT') !== -1) return 'FPV';
    if (t.indexOf('PHENOLIC') !== -1) return 'PHENOLIC';
    if (t.indexOf('RIF') !== -1 || t.indexOf('RECEIPT') !== -1) return 'RIF';

    return t || 'GENERAL';
  }

  function normalizeRequirement(input) {
    var req = input && typeof input === 'object' ? input : {};

    return {
      id: clean(req.id || ('REQ-' + Date.now() + '-' + Math.floor(Math.random() * 10000))),
      requirementType: normalizeType(req.requirementType || req.type || req.section || ''),
      value: clean(req.value || req.requirement || req.text || ''),
      numericValue: req.numericValue != null ? Number(req.numericValue) : numberFromText(req.value || req.requirement || req.text || ''),
      units: clean(req.units || ''),
      appliesTo: clean(req.appliesTo || req.equipment || req.component || ''),
      sourceDocument: clean(req.sourceDocument || req.document || req.file || ''),
      sourceType: clean(req.sourceType || ''),
      page: clean(req.page || ''),
      section: clean(req.section || ''),
      exactText: clean(req.exactText || req.text || req.value || ''),
      confidence: Math.max(0, Math.min(100, Number(req.confidence == null ? 75 : req.confidence))),
      createdAt: clean(req.createdAt || nowISO())
    };
  }

  function sameRequirementFamily(a, b) {
    return normalizeType(a.requirementType) === normalizeType(b.requirementType) &&
      clean(a.appliesTo).toLowerCase() === clean(b.appliesTo).toLowerCase() &&
      clean(a.units).toLowerCase() === clean(b.units).toLowerCase();
  }

  function pickStricter(a, b) {
    var av = a.numericValue;
    var bv = b.numericValue;

    if (av == null && bv == null) {
      return a.confidence >= b.confidence ? a : b;
    }

    if (av == null) return b;
    if (bv == null) return a;

    return bv > av ? b : a;
  }

  function detectConflicts(requirements) {
    var conflicts = [];
    var list = Array.isArray(requirements) ? requirements : [];

    for (var i = 0; i < list.length; i += 1) {
      for (var j = i + 1; j < list.length; j += 1) {
        var a = list[i];
        var b = list[j];

        if (!sameRequirementFamily(a, b)) continue;
        if (clean(a.value).toLowerCase() === clean(b.value).toLowerCase()) continue;

        var selected = pickStricter(a, b);

        conflicts.push({
          id: 'CONFLICT-' + a.id + '-' + b.id,
          type: a.requirementType,
          message: 'Conflicting ' + a.requirementType + ' requirements detected for ' + (a.appliesTo || 'same component') + '.',
          rule: 'STRICTER_OR_HIGHER_RATED_WINS',
          status: 'REVIEW',
          options: [a, b],
          selected: selected,
          createdAt: nowISO()
        });
      }
    }

    return conflicts;
  }

  function addSource(source) {
    var vg = core();
    if (!vg || typeof vg.addDocumentSource !== 'function') return null;

    return vg.addDocumentSource(Object.assign({
      id: 'DOC-' + Date.now(),
      name: '',
      type: '',
      uploadedAt: nowISO(),
      mapped: false
    }, source || {}));
  }

  function addRequirement(input) {
    var vg = core();
    if (!vg || typeof vg.getState !== 'function') return null;

    var req = normalizeRequirement(input);

    if (typeof vg.addRequirement === 'function') {
      vg.addRequirement(req);
    }

    return remap();
  }

  function setRequirements(requirements) {
    var vg = core();
    if (!vg || typeof vg.updateState !== 'function') return null;

    var normalized = Array.isArray(requirements)
      ? requirements.map(normalizeRequirement)
      : [];

    var confidence = normalized.length
      ? Math.round(normalized.reduce(function (sum, req) {
          return sum + req.confidence;
        }, 0) / normalized.length)
      : 0;

    var conflicts = detectConflicts(normalized);

    return vg.updateState({
      documents: {
        requirements: normalized,
        conflicts: conflicts,
        confidenceScore: confidence,
        lastMappedAt: nowISO()
      }
    }, 'documents:requirements:set');
  }

  function remap() {
    var vg = core();
    if (!vg || typeof vg.getState !== 'function' || typeof vg.updateState !== 'function') return null;

    var state = vg.getState();
    var docs = state.documents || {};
    var requirements = Array.isArray(docs.requirements)
      ? docs.requirements.map(normalizeRequirement)
      : [];

    var confidence = requirements.length
      ? Math.round(requirements.reduce(function (sum, req) {
          return sum + req.confidence;
        }, 0) / requirements.length)
      : 0;

    var conflicts = detectConflicts(requirements);

    return vg.updateState({
      documents: {
        requirements: requirements,
        conflicts: conflicts,
        confidenceScore: confidence,
        lastMappedAt: nowISO()
      }
    }, 'documents:remap');
  }

  function extractRequirementsFromText(text, source) {
    var sourceInfo = source || {};
    var raw = clean(text);
    var lines = raw.split(/\r?\n/).map(clean).filter(Boolean);
    var out = [];

    lines.forEach(function (line) {
      var lower = line.toLowerCase();

      if (lower.indexOf('torque') !== -1 && /\d/.test(line)) {
        out.push(normalizeRequirement({
          requirementType: 'TORQUE',
          value: line,
          units: lower.indexOf('ft') !== -1 ? 'ft-lb' : lower.indexOf('in') !== -1 ? 'in-lb' : '',
          sourceDocument: sourceInfo.name || sourceInfo.sourceDocument || '',
          sourceType: sourceInfo.type || '',
          page: sourceInfo.page || '',
          exactText: line,
          confidence: 70
        }));
      }

      if ((lower.indexOf('meg') !== -1 || lower.indexOf('insulation resistance') !== -1) && /\d/.test(line)) {
        out.push(normalizeRequirement({
          requirementType: 'MEG',
          value: line,
          units: lower.indexOf('mohm') !== -1 || lower.indexOf('mΩ') !== -1 ? 'MΩ' : '',
          sourceDocument: sourceInfo.name || sourceInfo.sourceDocument || '',
          sourceType: sourceInfo.type || '',
          page: sourceInfo.page || '',
          exactText: line,
          confidence: 65
        }));
      }

      if (lower.indexOf('foreign object') !== -1 || lower.indexOf('debris') !== -1 || lower.indexOf('fod') !== -1) {
        out.push(normalizeRequirement({
          requirementType: 'PREFOD',
          value: line,
          sourceDocument: sourceInfo.name || sourceInfo.sourceDocument || '',
          sourceType: sourceInfo.type || '',
          page: sourceInfo.page || '',
          exactText: line,
          confidence: 60
        }));
      }
    });

    return out;
  }

  function mapText(text, source) {
    var sourceRecord = addSource(source || {});
    var requirements = extractRequirementsFromText(text, source || {});

    var vg = core();
    if (!vg || typeof vg.getState !== 'function') return null;

    var state = vg.getState();
    var existing = state.documents && Array.isArray(state.documents.requirements)
      ? state.documents.requirements
      : [];

    var merged = existing.concat(requirements);

    var updated = setRequirements(merged);

    return {
      source: sourceRecord,
      requirements: requirements,
      state: updated
    };
  }

  var api = {
    __installed: true,
    version: VERSION,

    normalizeRequirement: normalizeRequirement,
    extractRequirementsFromText: extractRequirementsFromText,
    detectConflicts: detectConflicts,
    pickStricter: pickStricter,

    addSource: addSource,
    addRequirement: addRequirement,
    setRequirements: setRequirements,
    remap: remap,
    mapText: mapText
  };

  window.NEXUS_VANGUARD_DOCUMENT_MAPPER = api;
  window.VanguardDocumentMapper = api;

  window.NEXUS = window.NEXUS || {};
  window.NEXUS.VanguardDocumentMapper = api;
})();
