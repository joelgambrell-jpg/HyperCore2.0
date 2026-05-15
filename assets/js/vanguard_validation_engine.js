/*
  assets/js/vanguard_validation_engine.js
  NEXUS Vanguard Validation Engine

  Purpose:
  - Additive validation layer for NEXUS Vanguard.
  - Uses window.NEXUS_VANGUARD core state.
  - Validates CCS, workflow gates, document conflicts, evidence, and downstream release.
  - Does not replace existing page logic.
*/

(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_VALIDATION && window.NEXUS_VANGUARD_VALIDATION.__installed) return;

  var VERSION = '0.1.0-validation-engine';

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

  function status(value, fallback) {
    var s = upper(value || fallback || 'PENDING');

    if (
      s === 'PASS' ||
      s === 'FAIL' ||
      s === 'REVIEW' ||
      s === 'BLOCKED' ||
      s === 'OVERRIDDEN' ||
      s === 'PENDING' ||
      s === 'COMPLETE' ||
      s === 'IN_PROGRESS' ||
      s === 'NOT_STARTED'
    ) {
      return s;
    }

    return fallback || 'PENDING';
  }

  function stepComplete(state, stepId) {
    return !!(
      state &&
      state.steps &&
      state.steps[stepId] &&
      state.steps[stepId].complete
    );
  }

  function validationFailed(state, group) {
    return !!(
      state &&
      state.validations &&
      state.validations[group] &&
      state.validations[group].failed
    );
  }

  function validationTrue(state, group, prop) {
    return !!(
      state &&
      state.validations &&
      state.validations[group] &&
      state.validations[group][prop]
    );
  }

  function result(pass, message, extra) {
    return Object.assign({
      status: pass ? 'PASS' : 'BLOCKED',
      blocking: !pass,
      message: clean(message || ''),
      confidence: pass ? 100 : 0,
      issues: [],
      references: [],
      evidence: {},
      timestamp: nowISO()
    }, extra || {});
  }

  function validateTorque(state) {
    if (!stepComplete(state, 'torque')) {
      return result(false, 'Torque is not complete.', {
        status: 'BLOCKED',
        issues: ['Torque completion key is missing.']
      });
    }

    if (validationFailed(state, 'torque')) {
      return result(false, 'Torque validation failed.', {
        status: 'FAIL',
        issues: ['Torque page reported a failed or non-compliant condition.']
      });
    }

    if (!validationTrue(state, 'torque', 'foremanVerified')) {
      return result(false, 'Torque requires foreman verification.', {
        status: 'REVIEW',
        blocking: false,
        confidence: 75,
        issues: ['Foreman verification is not confirmed.']
      });
    }

    return result(true, 'Torque validation passed.', {
      evidence: state.evidence && state.evidence.torque ? state.evidence.torque : {}
    });
  }

  function validateMeg(state) {
    if (!stepComplete(state, 'meg')) {
      return result(false, 'Megohmmeter testing is not complete.', {
        status: 'BLOCKED',
        issues: ['Meg completion key is missing.']
      });
    }

    if (validationFailed(state, 'meg')) {
      return result(false, 'Megohmmeter validation failed.', {
        status: 'FAIL',
        issues: ['Meg page reported a failed or non-compliant condition.']
      });
    }

    if (!validationTrue(state, 'meg', 'lineComplete')) {
      return result(false, 'Meg line-side validation is not confirmed.', {
        status: 'REVIEW',
        blocking: false,
        confidence: 80,
        issues: ['Line-side meg validation is missing.']
      });
    }

    if (!validationTrue(state, 'meg', 'loadComplete')) {
      return result(false, 'Meg load-side validation is not confirmed.', {
        status: 'REVIEW',
        blocking: false,
        confidence: 80,
        issues: ['Load-side meg validation is missing.']
      });
    }

    return result(true, 'Meg validation passed.', {
      evidence: state.evidence && state.evidence.meg ? state.evidence.meg : {}
    });
  }

  function validateFpv(state) {
    if (!stepComplete(state, 'fpv')) {
      return result(false, 'Finished Product Verification is not complete.', {
        status: 'BLOCKED',
        issues: ['FPV completion key is missing.']
      });
    }

    if (!validationTrue(state, 'fpv', 'photoPresent')) {
      return result(false, 'FPV photo evidence is missing.', {
        status: 'REVIEW',
        blocking: false,
        confidence: 80,
        issues: ['Final product photo is not confirmed.']
      });
    }

    return result(true, 'FPV validation passed.', {
      evidence: state.evidence && state.evidence.fpv ? state.evidence.fpv : {}
    });
  }

  function validateGenericStep(state, stepId, label) {
    if (!stepComplete(state, stepId)) {
      return result(false, clean(label || stepId) + ' is not complete.', {
        status: 'BLOCKED',
        issues: [clean(label || stepId) + ' completion key is missing.']
      });
    }

    return result(true, clean(label || stepId) + ' validation passed.');
  }

  function validateDocuments(state) {
    var documents = state && state.documents ? state.documents : {};
    var conflicts = Array.isArray(documents.conflicts) ? documents.conflicts : [];
    var unresolved = conflicts.filter(function (conflict) {
      return status(conflict.status, 'REVIEW') !== 'PASS';
    });

    if (unresolved.length) {
      return result(false, 'Unresolved document conflicts exist.', {
        status: 'REVIEW',
        blocking: false,
        confidence: 70,
        issues: unresolved.map(function (conflict) {
          return clean(conflict.message || conflict.type || conflict.id || 'Document conflict');
        }),
        references: unresolved
      });
    }

    return result(true, 'Document validation passed.', {
      confidence: documents.confidenceScore || 100
    });
  }

  function validateCCS(state) {
    var ccs = state && state.ccs ? state.ccs : {};
    var ccsStatus = status(ccs.status, 'PENDING');

    if (ccsStatus === 'BLOCKED') {
      return result(false, 'CCS has blocking issues.', {
        status: 'BLOCKED',
        issues: (ccs.blockingIssues || []).map(function (issue) {
          return clean(issue.message || issue.label || issue.id || 'CCS blocking issue');
        }),
        references: ccs.blockingIssues || []
      });
    }

    if (ccsStatus === 'REVIEW') {
      return result(false, 'CCS requires review.', {
        status: 'REVIEW',
        blocking: false,
        confidence: 80,
        issues: (ccs.reviewItems || []).map(function (issue) {
          return clean(issue.message || issue.label || issue.id || 'CCS review item');
        }),
        references: ccs.reviewItems || []
      });
    }

    if (ccsStatus === 'PASS' || ccsStatus === 'COMPLETE') {
      return result(true, 'CCS validation passed.', {
        evidence: ccs.validationSummary || {}
      });
    }

    return result(false, 'CCS is not fully validated.', {
      status: 'PENDING',
      blocking: true,
      issues: ['CCS status is ' + ccsStatus + '.']
    });
  }

  function validateStep(stepId, equipmentId) {
    var vg = core();

    if (!vg || typeof vg.getState !== 'function') {
      return result(false, 'Vanguard core is not loaded.', {
        status: 'FAIL',
        issues: ['window.NEXUS_VANGUARD is unavailable.']
      });
    }

    var state = vg.getState(equipmentId);
    var id = clean(stepId).toLowerCase();

    if (id === 'torque') return validateTorque(state);
    if (id === 'meg') return validateMeg(state);
    if (id === 'fpv') return validateFpv(state);
    if (id === 'ccs') return validateCCS(state);
    if (id === 'documents') return validateDocuments(state);

    if (id === 'rif') return validateGenericStep(state, 'rif', 'RIF');
    if (id === 'phenolic') return validateGenericStep(state, 'phenolic', 'Phenolic');
    if (id === 'l2') return validateGenericStep(state, 'l2', 'L2');
    if (id === 'prefod') return validateGenericStep(state, 'prefod', 'Pre-FOD');
    if (id === 'energization') return validateReleaseForEnergization(equipmentId);

    return result(false, 'Unknown validation step.', {
      status: 'REVIEW',
      blocking: false,
      issues: ['No validator exists for step: ' + stepId]
    });
  }

  function validateReleaseForEnergization(equipmentId) {
    var vg = core();

    if (!vg || typeof vg.getState !== 'function') {
      return result(false, 'Vanguard core is not loaded.', {
        status: 'FAIL'
      });
    }

    var state = vg.getState(equipmentId);
    var checks = [
      validateGenericStep(state, 'rif', 'RIF'),
      validateGenericStep(state, 'phenolic', 'Phenolic'),
      validateTorque(state),
      validateGenericStep(state, 'l2', 'L2'),
      validateMeg(state),
      validateGenericStep(state, 'prefod', 'Pre-FOD'),
      validateFpv(state),
      validateCCS(state),
      validateDocuments(state)
    ];

    var blockers = checks.filter(function (check) {
      return check.blocking;
    });

    var reviews = checks.filter(function (check) {
      return !check.blocking && check.status === 'REVIEW';
    });

    if (blockers.length) {
      return result(false, 'Not ready for energization.', {
        status: 'BLOCKED',
        blocking: true,
        confidence: 0,
        issues: blockers.reduce(function (list, check) {
          return list.concat(check.issues && check.issues.length ? check.issues : [check.message]);
        }, []),
        references: blockers
      });
    }

    if (reviews.length) {
      return result(false, 'Review required before energization.', {
        status: 'REVIEW',
        blocking: false,
        confidence: 85,
        issues: reviews.reduce(function (list, check) {
          return list.concat(check.issues && check.issues.length ? check.issues : [check.message]);
        }, []),
        references: reviews
      });
    }

    return result(true, 'Ready for energization review.', {
      status: 'PASS',
      confidence: 100,
      references: checks
    });
  }

  function writeValidationToCore(stepId, validationResult) {
    var vg = core();
    if (!vg || typeof vg.setValidation !== 'function') return validationResult;

    vg.setValidation(clean(stepId || 'general'), {
      status: validationResult.status,
      blocking: validationResult.blocking,
      message: validationResult.message,
      confidence: validationResult.confidence,
      issues: validationResult.issues || [],
      references: validationResult.references || [],
      updatedAt: nowISO()
    });

    return validationResult;
  }

  function runAll(equipmentId) {
    var steps = [
      'rif',
      'phenolic',
      'torque',
      'l2',
      'meg',
      'prefod',
      'fpv',
      'ccs',
      'documents',
      'energization'
    ];

    var output = {};

    steps.forEach(function (step) {
      output[step] = validateStep(step, equipmentId);
    });

    return output;
  }

  function runAndStore(stepId, equipmentId) {
    var validationResult = validateStep(stepId, equipmentId);
    return writeValidationToCore(stepId, validationResult);
  }

  function runAllAndStore(equipmentId) {
    var output = runAll(equipmentId);
    var vg = core();

    if (vg && typeof vg.setValidation === 'function') {
      Object.keys(output).forEach(function (step) {
        vg.setValidation(step, {
          status: output[step].status,
          blocking: output[step].blocking,
          message: output[step].message,
          confidence: output[step].confidence,
          issues: output[step].issues || [],
          references: output[step].references || [],
          updatedAt: nowISO()
        });
      });
    }

    return output;
  }

  var api = {
    __installed: true,
    version: VERSION,

    validateStep: validateStep,
    validateTorque: validateTorque,
    validateMeg: validateMeg,
    validateFpv: validateFpv,
    validateCCS: validateCCS,
    validateDocuments: validateDocuments,
    validateReleaseForEnergization: validateReleaseForEnergization,

    runAll: runAll,
    runAndStore: runAndStore,
    runAllAndStore: runAllAndStore
  };

  window.NEXUS_VANGUARD_VALIDATION = api;
  window.VanguardValidation = api;

  window.NEXUS = window.NEXUS || {};
  window.NEXUS.VanguardValidation = api;

  window.addEventListener('vanguard:update', function () {
    try {
      runAll();
    } catch (err) {}
  });
})();
