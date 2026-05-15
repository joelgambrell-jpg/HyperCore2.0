/*
  assets/js/vanguard_registry.js
  NEXUS Vanguard Registry

  Purpose:
  - Central source of truth for equipment-type workflow rules.
  - Defines required sections, validation gates, CCS behavior, and document mapping targets.
*/

(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_REGISTRY && window.NEXUS_VANGUARD_REGISTRY.__installed) return;

  var VERSION = '0.1.0-registry';

  var COMMON_SECTIONS = [
    'RIF',
    'PHENOLIC',
    'TORQUE',
    'L2',
    'MEG',
    'PREFOD',
    'FPV',
    'FINAL_CCS'
  ];

  var REGISTRY = {

    SWITCHGEAR: {
      label: 'Switchgear',
      requiredSections: COMMON_SECTIONS.slice(),
      validationRules: {
        TORQUE: {
          required: true,
          requiresForemanVerification: true,
          failIfAnyFailed: true,
          blocksNextStep: true
        },
        MEG: {
          required: true,
          minimumResistanceMohms: 11,
          requiresLineComplete: true,
          requiresLoadComplete: true,
          blocksNextStep: true
        },
        FPV: {
          required: true,
          requiresPhoto: true
        }
      },
      documentTargets: [
        'TORQUE',
        'MEG',
        'L2',
        'PREFOD',
        'FPV'
      ]
    },

    PANELBOARD: {
      label: 'Panelboard',
      requiredSections: COMMON_SECTIONS.slice(),
      validationRules: {
        TORQUE: {
          required: true,
          requiresForemanVerification: true,
          failIfAnyFailed: true,
          blocksNextStep: true
        },
        MEG: {
          required: true,
          minimumResistanceMohms: 11,
          requiresLineComplete: true,
          requiresLoadComplete: true,
          blocksNextStep: true
        },
        FPV: {
          required: true,
          requiresPhoto: true
        }
      },
      documentTargets: [
        'TORQUE',
        'MEG',
        'L2',
        'PREFOD',
        'FPV'
      ]
    },

    TRANSFORMER: {
      label: 'Transformer',
      requiredSections: COMMON_SECTIONS.slice(),
      validationRules: {
        TORQUE: {
          required: true,
          requiresForemanVerification: true,
          failIfAnyFailed: true,
          blocksNextStep: true
        },
        MEG: {
          required: true,
          minimumResistanceMohms: 11,
          requiresLineComplete: true,
          requiresLoadComplete: true,
          blocksNextStep: true
        },
        FPV: {
          required: true,
          requiresPhoto: true
        }
      },
      documentTargets: [
        'TORQUE',
        'MEG',
        'L2',
        'PREFOD',
        'FPV'
      ]
    },

    UPS: {
      label: 'UPS',
      requiredSections: COMMON_SECTIONS.slice(),
      validationRules: {
        TORQUE: {
          required: true,
          requiresForemanVerification: true,
          failIfAnyFailed: true,
          blocksNextStep: true
        },
        MEG: {
          required: true,
          minimumResistanceMohms: 11,
          requiresLineComplete: true,
          requiresLoadComplete: true,
          blocksNextStep: true
        },
        FPV: {
          required: true,
          requiresPhoto: true
        }
      },
      documentTargets: [
        'TORQUE',
        'MEG',
        'L2',
        'PREFOD',
        'FPV'
      ]
    },

    BUSWAY: {
      label: 'Busway',
      requiredSections: COMMON_SECTIONS.slice(),
      validationRules: {
        TORQUE: {
          required: true,
          requiresForemanVerification: true,
          failIfAnyFailed: true,
          blocksNextStep: true
        },
        MEG: {
          required: true,
          minimumResistanceMohms: 11,
          requiresLineComplete: true,
          requiresLoadComplete: true,
          blocksNextStep: true
        },
        FPV: {
          required: true,
          requiresPhoto: true
        }
      },
      documentTargets: [
        'TORQUE',
        'MEG',
        'L2',
        'PREFOD',
        'FPV'
      ]
    },

    GENERATOR: {
      label: 'Generator',
      requiredSections: COMMON_SECTIONS.slice(),
      validationRules: {
        TORQUE: {
          required: true,
          requiresForemanVerification: true,
          failIfAnyFailed: true,
          blocksNextStep: true
        },
        MEG: {
          required: true,
          minimumResistanceMohms: 11,
          requiresLineComplete: true,
          requiresLoadComplete: true,
          blocksNextStep: true
        },
        FPV: {
          required: true,
          requiresPhoto: true
        }
      },
      documentTargets: [
        'TORQUE',
        'MEG',
        'L2',
        'PREFOD',
        'FPV'
      ]
    },

    DEFAULT: {
      label: 'Generic Equipment',
      requiredSections: COMMON_SECTIONS.slice(),
      validationRules: {
        TORQUE: {
          required: true,
          requiresForemanVerification: true,
          failIfAnyFailed: true,
          blocksNextStep: true
        },
        MEG: {
          required: true,
          minimumResistanceMohms: 11,
          requiresLineComplete: true,
          requiresLoadComplete: true,
          blocksNextStep: true
        },
        FPV: {
          required: true,
          requiresPhoto: true
        }
      },
      documentTargets: COMMON_SECTIONS.slice()
    }

  };

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function upper(value) {
    return clean(value).toUpperCase();
  }

  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (err) {
      return value;
    }
  }

  function normalizeType(type) {
    var t = upper(type);

    if (!t) return 'DEFAULT';

    if (t.indexOf('SWITCHGEAR') !== -1) return 'SWITCHGEAR';
    if (t.indexOf('PANEL') !== -1) return 'PANELBOARD';
    if (t.indexOf('TRANSFORMER') !== -1 || t.indexOf('XFMR') !== -1) return 'TRANSFORMER';
    if (t.indexOf('UPS') !== -1) return 'UPS';
    if (t.indexOf('BUS') !== -1) return 'BUSWAY';
    if (t.indexOf('GEN') !== -1) return 'GENERATOR';

    return REGISTRY[t] ? t : 'DEFAULT';
  }

  function getTemplate(type) {
    return clone(REGISTRY[normalizeType(type)] || REGISTRY.DEFAULT);
  }

  function getRules(type) {
    var template = getTemplate(type);
    return clone(template.validationRules || {});
  }

  function getRequiredSections(type) {
    var template = getTemplate(type);
    return clone(template.requiredSections || []);
  }

  function getDocumentTargets(type) {
    var template = getTemplate(type);
    return clone(template.documentTargets || []);
  }

  function applyToVanguard(type) {
    var vg = window.NEXUS_VANGUARD || window.Vanguard || null;
    if (!vg || typeof vg.updateState !== 'function') return null;

    var normalized = normalizeType(type);
    var template = getTemplate(normalized);

    return vg.updateState({
      equipment: {
        type: normalized
      },
      registry: {
        activeTemplate: normalized,
        rules: template.validationRules || {}
      },
      ccs: {
        template: normalized,
        equipmentType: normalized
      }
    }, 'registry:apply');
  }

  var api = {
    __installed: true,
    version: VERSION,

    REGISTRY: REGISTRY,

    normalizeType: normalizeType,
    getTemplate: getTemplate,
    getRules: getRules,
    getRequiredSections: getRequiredSections,
    getDocumentTargets: getDocumentTargets,
    applyToVanguard: applyToVanguard
  };

  window.NEXUS_VANGUARD_REGISTRY = api;
  window.VanguardRegistry = api;

  window.NEXUS = window.NEXUS || {};
  window.NEXUS.VanguardRegistry = api;
})();
