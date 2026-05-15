/*
  assets/js/vanguard_test_harness.js
  NEXUS Vanguard Test Harness

  Purpose:
  - Local developer testing only.
  - Seeds sample equipment states.
  - Tests workflow locks, CCS gates, document conflicts, and export data.
*/

(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_TEST_HARNESS && window.NEXUS_VANGUARD_TEST_HARNESS.__installed) return;

  var VERSION = '0.1.0-test-harness';

  function core() {
    return window.NEXUS_VANGUARD || window.Vanguard || null;
  }

  function mapper() {
    return window.NEXUS_VANGUARD_DOCUMENT_MAPPER || window.VanguardDocumentMapper || null;
  }

  function conflicts() {
    return window.NEXUS_VANGUARD_CONFLICT_ENGINE || window.VanguardConflictEngine || null;
  }

  function workflow() {
    return window.NEXUS_VANGUARD_WORKFLOW || window.VanguardWorkflow || null;
  }

  function ai() {
    return window.NEXUS_VANGUARD_AI || window.VanguardAI || null;
  }

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function setEq(eq) {
    localStorage.setItem('nexus_active_eq', eq);
    localStorage.setItem('nexus_active_equipment', eq);
    localStorage.setItem('nexus_current_eq', eq);
  }

  function clearTestEquipment(eq) {
    Object.keys(localStorage).forEach(function (key) {
      if (key.indexOf('nexus_' + eq + '_') === 0) {
        localStorage.removeItem(key);
      }
    });
  }

  function setStep(eq, step, complete) {
    var vg = core();

    if (vg && typeof vg.setStepComplete === 'function') {
      vg.setStepComplete(step, !!complete, eq, 'test_harness');
      return;
    }

    if (complete) {
      localStorage.setItem('nexus_' + eq + '_step_' + step, '1');
    } else {
      localStorage.removeItem('nexus_' + eq + '_step_' + step);
    }
  }

  function refreshEngines() {
    var wf = workflow();
    var a = ai();

    if (wf && typeof wf.refresh === 'function') wf.refresh();
    if (a && typeof a.refresh === 'function') a.refresh();

    var vg = core();
    if (vg && typeof vg.refresh === 'function') vg.refresh();
  }

  function seedCleanStart() {
    var eq = 'TEST-SWGR-001';

    clearTestEquipment(eq);
    setEq(eq);

    setStep(eq, 'rif', true);
    setStep(eq, 'phenolic', false);
    setStep(eq, 'torque', false);
    setStep(eq, 'l2', false);
    setStep(eq, 'meg', false);
    setStep(eq, 'prefod', false);
    setStep(eq, 'fpv', false);
    setStep(eq, 'ccs', false);

    var vg = core();

    if (vg && typeof vg.updateState === 'function') {
      vg.updateState({
        equipment: {
          id: eq,
          name: eq,
          type: 'SWITCHGEAR'
        },
        registry: {
          activeTemplate: 'SWITCHGEAR'
        },
        validations: {}
      }, 'test:seed-clean-start');
    }

    refreshEngines();

    return eq;
  }

  function seedTorqueReview() {
    var eq = 'TEST-SWGR-002';

    clearTestEquipment(eq);
    setEq(eq);

    setStep(eq, 'rif', true);
    setStep(eq, 'phenolic', true);
    setStep(eq, 'torque', true);
    setStep(eq, 'l2', false);
    setStep(eq, 'meg', false);
    setStep(eq, 'prefod', false);
    setStep(eq, 'fpv', false);
    setStep(eq, 'ccs', false);

    var vg = core();

    if (vg && typeof vg.updateState === 'function') {
      vg.updateState({
        equipment: {
          id: eq,
          name: eq,
          type: 'SWITCHGEAR'
        },
        validations: {
          torque: {
            foremanVerified: false,
            failed: false
          }
        },
        evidence: {
          torque: {
            rows: 24,
            failedRows: 0
          }
        }
      }, 'test:seed-torque-review');
    }

    refreshEngines();

    return eq;
  }

  function seedFailedMeg() {
    var eq = 'TEST-SWGR-003';

    clearTestEquipment(eq);
    setEq(eq);

    setStep(eq, 'rif', true);
    setStep(eq, 'phenolic', true);
    setStep(eq, 'torque', true);
    setStep(eq, 'l2', true);
    setStep(eq, 'meg', true);
    setStep(eq, 'prefod', false);
    setStep(eq, 'fpv', false);
    setStep(eq, 'ccs', false);

    var vg = core();

    if (vg && typeof vg.updateState === 'function') {
      vg.updateState({
        equipment: {
          id: eq,
          name: eq,
          type: 'SWITCHGEAR'
        },
        validations: {
          torque: {
            foremanVerified: true,
            failed: false
          },
          meg: {
            lineComplete: true,
            loadComplete: false,
            failed: true
          }
        }
      }, 'test:seed-failed-meg');
    }

    refreshEngines();

    return eq;
  }

  function seedDocumentConflict() {
    var eq = 'TEST-SWGR-004';

    clearTestEquipment(eq);
    setEq(eq);

    setStep(eq, 'rif', true);
    setStep(eq, 'phenolic', true);
    setStep(eq, 'torque', false);

    var m = mapper();

    if (m && typeof m.setRequirements === 'function') {
      m.setRequirements([
        {
          id: 'REQ-AWS-TORQUE-001',
          requirementType: 'TORQUE',
          value: '250 in-lb',
          numericValue: 250,
          units: 'in-lb',
          appliesTo: 'Main Lug',
          sourceDocument: 'AWS Spec 26-05',
          sourceType: 'SPEC',
          confidence: 95
        },
        {
          id: 'REQ-OEM-TORQUE-001',
          requirementType: 'TORQUE',
          value: '275 in-lb',
          numericValue: 275,
          units: 'in-lb',
          appliesTo: 'Main Lug',
          sourceDocument: 'SquareD Submittal',
          sourceType: 'OEM',
          confidence: 92
        }
      ]);
    }

    var c = conflicts();
    if (c && typeof c.remapConflicts === 'function') c.remapConflicts();

    refreshEngines();

    return eq;
  }

  function seedReadyForExport() {
    var eq = 'TEST-SWGR-005';

    clearTestEquipment(eq);
    setEq(eq);

    [
      'rif',
      'phenolic',
      'torque',
      'l2',
      'meg',
      'prefod',
      'fpv',
      'ccs'
    ].forEach(function (step) {
      setStep(eq, step, true);
    });

    var vg = core();

    if (vg && typeof vg.updateState === 'function') {
      vg.updateState({
        equipment: {
          id: eq,
          name: eq,
          type: 'SWITCHGEAR'
        },
        validations: {
          torque: {
            foremanVerified: true,
            failed: false
          },
          meg: {
            lineComplete: true,
            loadComplete: true,
            failed: false
          },
          fpv: {
            photoPresent: true
          }
        },
        evidence: {
          torque: {
            rows: 24,
            failedRows: 0,
            foremanVerified: true
          },
          meg: {
            linePass: true,
            loadPass: true
          },
          fpv: {
            photoPresent: true
          }
        }
      }, 'test:seed-ready-for-export');
    }

    refreshEngines();

    return eq;
  }

  function runSmokeTest() {
    var results = [];

    [
      seedCleanStart,
      seedTorqueReview,
      seedFailedMeg,
      seedDocumentConflict,
      seedReadyForExport
    ].forEach(function (fn) {
      try {
        var eq = fn();
        var vg = core();
        var state = vg && typeof vg.getState === 'function' ? vg.getState(eq) : null;

        results.push({
          test: fn.name,
          equipment: eq,
          status: state && state.status ? state.status.label : 'NO_STATE',
          ccs: state && state.ccs ? state.ccs.status : 'NO_CCS',
          confidence: state ? state.confidenceScore : 0,
          risk: state ? state.riskScore : 0
        });
      } catch (err) {
        results.push({
          test: fn.name,
          error: clean(err.message || err)
        });
      }
    });

    console.table(results);
    return results;
  }

  var api = {
    __installed: true,
    version: VERSION,

    seedCleanStart: seedCleanStart,
    seedTorqueReview: seedTorqueReview,
    seedFailedMeg: seedFailedMeg,
    seedDocumentConflict: seedDocumentConflict,
    seedReadyForExport: seedReadyForExport,

    runSmokeTest: runSmokeTest
  };

  window.NEXUS_VANGUARD_TEST_HARNESS = api;
  window.VanguardTestHarness = api;

  window.NEXUS = window.NEXUS || {};
  window.NEXUS.VanguardTestHarness = api;
})();
