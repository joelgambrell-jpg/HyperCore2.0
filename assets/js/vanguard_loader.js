/*
  assets/js/vanguard_loader.js
  NEXUS Vanguard Loader

  Purpose:
  - Loads Vanguard modules in the correct dependency order.
  - Prevents page-by-page script order mistakes.
  - Add this one file to pages instead of manually loading every module.
*/

(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_LOADER && window.NEXUS_VANGUARD_LOADER.__installed) return;

  var VERSION = '0.1.0-loader';

  var MODULES = [
    'assets/js/vanguard_core.js',
    'assets/js/vanguard_registry.js',
    'assets/js/vanguard_role_engine.js',
    'assets/js/vanguard_validation_engine.js',
    'assets/js/vanguard_document_mapper.js',
    'assets/js/vanguard_conflict_engine.js',
    'assets/js/vanguard_ccs_bridge.js',
    'assets/js/vanguard_workflow_engine.js',
    'assets/js/vanguard_ai_assist_engine.js',
    'assets/js/vanguard_sync_engine.js',
    'assets/js/vanguard_export_bridge.js',
    'assets/js/vanguard_dashboard_engine.js'
  ];

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function alreadyLoaded(src) {
    var scripts = document.querySelectorAll('script[src]');

    for (var i = 0; i < scripts.length; i += 1) {
      if (scripts[i].src.indexOf(src) !== -1) return true;
    }

    return false;
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (alreadyLoaded(src)) {
        resolve(src);
        return;
      }

      var script = document.createElement('script');
      script.src = src;
      script.async = false;

      script.onload = function () {
        resolve(src);
      };

      script.onerror = function () {
        reject(new Error('Failed to load Vanguard module: ' + src));
      };

      document.head.appendChild(script);
    });
  }

  function loadAll() {
    var chain = Promise.resolve();

    MODULES.forEach(function (src) {
      chain = chain.then(function () {
        return loadScript(src);
      });
    });

    return chain.then(function () {
      try {
        window.dispatchEvent(new CustomEvent('vanguard:loader:complete', {
          detail: {
            version: VERSION,
            modules: MODULES.slice()
          }
        }));
      } catch (err) {}

      return true;
    });
  }

  function init() {
    loadAll().catch(function (err) {
      console.error(clean(err && err.message ? err.message : err));
    });
  }

  var api = {
    __installed: true,
    version: VERSION,
    modules: MODULES.slice(),
    loadAll: loadAll
  };

  window.NEXUS_VANGUARD_LOADER = api;
  window.VanguardLoader = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
