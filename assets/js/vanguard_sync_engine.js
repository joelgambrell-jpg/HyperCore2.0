/*
  assets/js/vanguard_sync_engine.js
  NEXUS Vanguard Sync Engine

  Purpose:
  - Centralized persistence layer.
  - Handles local save/load.
  - Queues offline updates.
  - Prepares Firebase/live sync integration.
  - Tracks sync health/status.
*/

(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_SYNC && window.NEXUS_VANGUARD_SYNC.__installed) return;

  var VERSION = '0.1.0-sync-engine';

  var STORAGE_KEY = 'nexus_vanguard_state';
  var QUEUE_KEY = 'nexus_vanguard_sync_queue';

  function core() {
    return window.NEXUS_VANGUARD || window.Vanguard || null;
  }

  function clean(value) {
    return String(value == null ? '' : value).trim();
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

  function getState() {
    var vg = core();

    if (!vg || typeof vg.getState !== 'function') return null;

    return vg.getState();
  }

  function updateState(patch, action) {
    var vg = core();

    if (!vg || typeof vg.updateState !== 'function') return null;

    return vg.updateState(
      patch || {},
      action || 'sync:update'
    );
  }

  function saveLocal() {
    var state = getState();

    if (!state) return false;

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(state)
      );

      updateSyncStatus({
        lastLocalSave: nowISO(),
        localSaved: true
      });

      return true;

    } catch (err) {

      updateSyncStatus({
        localSaved: false,
        localError: clean(err.message || err)
      });

      return false;
    }
  }

  function loadLocal() {
    try {

      var raw = localStorage.getItem(STORAGE_KEY);

      if (!raw) return null;

      return safeParse(raw, null);

    } catch (err) {

      updateSyncStatus({
        localLoadError: clean(err.message || err)
      });

      return null;
    }
  }

  function restoreLocalState() {
    var vg = core();

    if (!vg || typeof vg.replaceState !== 'function') return null;

    var saved = loadLocal();

    if (!saved) return null;

    return vg.replaceState(saved, 'sync:restore-local');
  }

  function getQueue() {
    return safeParse(
      localStorage.getItem(QUEUE_KEY),
      []
    );
  }

  function setQueue(queue) {
    try {
      localStorage.setItem(
        QUEUE_KEY,
        JSON.stringify(queue || [])
      );
    } catch (err) {}
  }

  function queueAction(action, payload) {
    var queue = getQueue();

    queue.push({
      id: 'QUEUE-' + Date.now(),
      action: clean(action),
      payload: clone(payload),
      createdAt: nowISO(),
      synced: false
    });

    setQueue(queue);

    updateSyncStatus({
      queuedActions: queue.length
    });

    return queue;
  }

  function clearQueue() {
    setQueue([]);

    updateSyncStatus({
      queuedActions: 0
    });
  }

  function markQueueSynced() {
    var queue = getQueue().map(function (item) {
      item.synced = true;
      item.syncedAt = nowISO();
      return item;
    });

    setQueue(queue);

    updateSyncStatus({
      lastSuccessfulSync: nowISO()
    });
  }

  function updateSyncStatus(patch) {
    var state = getState();

    var existing =
      state &&
      state.sync
        ? state.sync
        : {};

    return updateState({
      sync: Object.assign({}, existing, patch || {}, {
        updatedAt: nowISO(),
        online: navigator.onLine
      })
    }, 'sync:status');
  }

  function simulateFirebaseSync() {
    var queue = getQueue();

    updateSyncStatus({
      syncing: true
    });

    setTimeout(function () {

      markQueueSynced();

      updateSyncStatus({
        syncing: false,
        firebaseReady: true,
        synced: true
      });

    }, 800);
  }

  function autoSave() {
    saveLocal();

    queueAction('state_snapshot', {
      savedAt: nowISO()
    });

    if (navigator.onLine) {
      simulateFirebaseSync();
    }
  }

  function bindOnlineOffline() {

    window.addEventListener('online', function () {

      updateSyncStatus({
        online: true
      });

      simulateFirebaseSync();
    });

    window.addEventListener('offline', function () {

      updateSyncStatus({
        online: false
      });
    });
  }

  function injectStyles() {
    if (document.getElementById('vanguard-sync-style')) return;

    var style = document.createElement('style');
    style.id = 'vanguard-sync-style';

    style.textContent = ''
      + '.vanguard-sync-online{color:#16a34a;font-weight:900}'
      + '.vanguard-sync-offline{color:#dc2626;font-weight:900}'
      + '.vanguard-sync-syncing{color:#f59e0b;font-weight:900}';

    document.head.appendChild(style);
  }

  function renderSyncBanner() {

    var state = getState();

    if (!state) return;

    var sync =
      state.sync || {};

    var existing =
      document.getElementById(
        'vanguard-sync-banner'
      );

    if (!existing) {

      existing = document.createElement('div');

      existing.id =
        'vanguard-sync-banner';

      existing.style.cssText =
        'max-width:1180px;margin:12px auto;padding:10px 14px;' +
        'border-radius:14px;background:rgba(15,23,42,.92);' +
        'color:#fff;font-family:Arial,Helvetica,sans-serif;' +
        'border:1px solid rgba(255,255,255,.16);';

      var target =
        document.querySelector(
          '[data-vanguard-sync-mount]'
        ) ||
        document.querySelector('main') ||
        document.body;

      if (target === document.body) {
        document.body.insertBefore(
          existing,
          document.body.firstChild
        );
      } else {
        target.insertBefore(
          existing,
          target.firstChild
        );
      }
    }

    var syncClass =
      sync.syncing
        ? 'vanguard-sync-syncing'
        : sync.online
          ? 'vanguard-sync-online'
          : 'vanguard-sync-offline';

    var syncLabel =
      sync.syncing
        ? 'SYNCING'
        : sync.online
          ? 'ONLINE'
          : 'OFFLINE';

    existing.innerHTML = ''

      + '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">'

      + '<div>'
      + '<div style="font-size:16px;font-weight:900;text-transform:uppercase;letter-spacing:.04em;">'
      + 'VANGUARD SYNC ENGINE'
      + '</div>'

      + '<div style="margin-top:4px;font-size:12px;font-weight:700;opacity:.82;">'
      + 'Offline-safe persistence active.'
      + '</div>'
      + '</div>'

      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'

      + pill(
        'STATUS',
        '<span class="' + syncClass + '">' + syncLabel + '</span>'
      )

      + pill(
        'QUEUE',
        String(sync.queuedActions || 0)
      )

      + pill(
        'LAST SAVE',
        clean(sync.lastLocalSave || '--')
      )

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
      + value
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
    renderSyncBanner();
  }

  function init() {

    injectStyles();

    restoreLocalState();

    bindOnlineOffline();

    updateSyncStatus({
      initialized: true,
      firebaseReady: false,
      online: navigator.onLine
    });

    refresh();

    setInterval(function () {
      autoSave();
      refresh();
    }, 15000);
  }

  var api = {
    __installed: true,
    version: VERSION,

    saveLocal: saveLocal,
    loadLocal: loadLocal,
    restoreLocalState: restoreLocalState,

    queueAction: queueAction,
    clearQueue: clearQueue,
    getQueue: getQueue,

    simulateFirebaseSync: simulateFirebaseSync,

    autoSave: autoSave,
    refresh: refresh
  };

  window.NEXUS_VANGUARD_SYNC = api;
  window.VanguardSync = api;

  window.NEXUS = window.NEXUS || {};
  window.NEXUS.VanguardSync = api;

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      init
    );
  } else {
    init();
  }

  window.addEventListener('vanguard:update', function () {
    setTimeout(refresh, 50);
  });

})();
