/* nexus-context-helper.js
   Additive, read-only helpers to standardize context + role checks.

   - Resolves Equipment (eq) and Building/Job from URL params and existing localStorage keys.
   - Provides role ranking utilities (viewer < tech < foreman < superintendent < admin).
   - Provides safe browser-back preference.

   Safe to include anywhere.
*/
(function(){
  'use strict';

  if (typeof window === 'undefined') return;

  var NEXUS = window.NEXUS || (window.NEXUS = {});
  if (NEXUS.__contextHelperInstalled) return;
  NEXUS.__contextHelperInstalled = true;

  var ROLE_RANK = {
    viewer: 0,
    tech: 1,
    foreman: 2,
    superintendent: 3,
    admin: 4
  };

  function safeTrim(v){ return (v == null) ? '' : String(v).trim(); }

  function getSearchParams(){
    try{ return new URL(window.location.href).searchParams; }
    catch(e){ return new URLSearchParams(window.location.search); }
  }

  function readJSON(key){
    try{
      var raw = localStorage.getItem(key) || '';
      if (!raw) return {};
      return JSON.parse(raw);
    }catch(e){ return {}; }
  }

  function readEqMeta(eq){
    if (!eq) return {};
    return readJSON('nexus_meta_' + eq);
  }

  function readEqRecord(eq){
    if (!eq) return {};
    return readJSON('nexus_equipment_' + eq);
  }

  NEXUS.getRoleRank = function(role){
    role = safeTrim(role).toLowerCase();
    if (ROLE_RANK.hasOwnProperty(role)) return ROLE_RANK[role];
    return 0;
  };

  function getRole(){
    try{
      if (window.NEXUS && typeof window.NEXUS.getRole === 'function'){
        return safeTrim(window.NEXUS.getRole()) || 'viewer';
      }
    }catch(e){}

    // Fallback: if role selector is present
    try{
      var sel = document.getElementById('nxRoleSelect');
      if (sel && sel.value) return safeTrim(sel.value) || 'viewer';
    }catch(e){}

    return safeTrim(localStorage.getItem('nexus_role') || '') || 'viewer';
  }

  NEXUS.isRoleAtLeast = function(minRole){
    return NEXUS.getRoleRank(getRole()) >= NEXUS.getRoleRank(minRole);
  };

  NEXUS.getEq = function(){
    var p = getSearchParams();
    var eq = safeTrim(p.get('eq') || p.get('equipmentId') || '');
    if (!eq) eq = safeTrim(localStorage.getItem('nexus_active_eq') || '');
    return eq;
  };

  NEXUS.getBuilding = function(eq){
    var p = getSearchParams();
    var building = safeTrim(p.get('building') || p.get('job') || p.get('jobId') || '');
    if (!building) building = safeTrim(localStorage.getItem('nexus_active_building') || '');

    // Prefer per-eq meta if present
    if (!building && eq){
      var meta = readEqMeta(eq);
      building = safeTrim(meta.building || meta.job || meta.jobId || meta.project || '');
    }

    // Next, per-eq record if present
    if (!building && eq){
      var rec = readEqRecord(eq);
      building = safeTrim(rec.building || rec.job || rec.jobId || rec.project || '');
    }

    return building;
  };

  NEXUS.getContext = function(){
    var eq = NEXUS.getEq();
    var building = NEXUS.getBuilding(eq);
    var role = getRole();
    return { eq: eq, building: building, role: role };
  };

  // Ensure URL params exist for legacy scripts that expect jobId/equipmentId
  NEXUS.ensureContextParams = function(){
    try{
      var u = new URL(window.location.href);
      var p = u.searchParams;
      var ctx = NEXUS.getContext();
      var changed = false;

      if (ctx.eq){
        if (!p.get('eq')){ p.set('eq', ctx.eq); changed = true; }
        if (!p.get('equipmentId')){ p.set('equipmentId', ctx.eq); changed = true; }
      }

      if (ctx.building){
        if (!p.get('jobId')){ p.set('jobId', ctx.building); changed = true; }
        if (!p.get('building') && !p.get('job')){ p.set('building', ctx.building); changed = true; }
      }

      // Back-compat: keep legacy active keys warm
      if (ctx.eq) localStorage.setItem('nexus_active_eq', ctx.eq);
      if (ctx.building) localStorage.setItem('nexus_active_building', ctx.building);

      if (changed){
        history.replaceState({}, '', u.pathname + '?' + p.toString() + u.hash);
      }
    }catch(e){}
  };

  // Prefer previous page when possible, else fallback to equipment.html
  NEXUS.backPreferHistory = function(fallbackEq){
    try{
      if (document.referrer && document.referrer.indexOf(location.host) !== -1){
        history.back();
        return false;
      }
    }catch(e){}
    try{
      var eq = fallbackEq || NEXUS.getEq();
      location.href = eq ? ('equipment.html?eq=' + encodeURIComponent(eq)) : 'equipment.html';
    }catch(e){
      location.href = 'equipment.html';
    }
    return false;
  };

})();
