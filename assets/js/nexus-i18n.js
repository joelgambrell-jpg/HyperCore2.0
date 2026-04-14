(function(){
  const DICT = {
    en: {
      "redirect.title": "Redirecting…",
      "session.equipment": "Equipment",
      "session.role": "Role",
      "session.ready": "Ready",
      "session.setRole": "Set Role",
      "role.viewer": "viewer",
      "role.tech": "tech",
      "role.foreman": "foreman",
      "role.superintendent": "superintendent",
      "role.admin": "admin",
      "nav.back": "← Back",
      "torque.sop": "Torque Application SOP",
      "footer.copyright": "© 2026 NEXUS Data Science — Built for ACE Electric — All Rights Reserved"
    },
    es: {
      "redirect.title": "Redirigiendo…",
      "session.equipment": "Equipo",
      "session.role": "Rol",
      "session.ready": "Listo",
      "session.setRole": "Asignar Rol",
      "role.viewer": "visualizador",
      "role.tech": "técnico",
      "role.foreman": "capataz",
      "role.superintendent": "superintendente",
      "role.admin": "administrador",
      "nav.back": "← Regresar",
      "torque.sop": "POE de Aplicación de Torque",
      "footer.copyright": "© 2026 NEXUS Data Science — Desarrollado para ACE Electric — Todos los derechos reservados"
    }
  };

  function getLang(){
    try{
      return localStorage.getItem("nexus_lang") || "en";
    }catch(e){
      return "en";
    }
  }

  function setLang(lang){
    try{
      localStorage.setItem("nexus_lang", lang === "es" ? "es" : "en");
    }catch(e){}
    apply(document);
  }

  function t(key){
    const lang = getLang();
    return (DICT[lang] && DICT[lang][key]) || (DICT.en && DICT.en[key]) || key;
  }

  function apply(root){
    const scope = root || document;

    try{
      const titleEl = document.querySelector("title[data-i18n]");
      if(titleEl){
        titleEl.textContent = t(titleEl.getAttribute("data-i18n"));
      }
    }catch(e){}

    try{
      scope.querySelectorAll("[data-i18n]").forEach(function(el){
        const key = el.getAttribute("data-i18n");
        if(!key) return;

        if(el.tagName === "INPUT" || el.tagName === "TEXTAREA"){
          if(el.hasAttribute("placeholder")){
            el.setAttribute("placeholder", t(key));
          }
        }else{
          el.textContent = t(key);
        }
      });
    }catch(e){}
  }

  window.NX_I18N = {
    t,
    apply,
    getLang,
    setLang
  };

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", function(){
      apply(document);
      document.documentElement.lang = getLang();
    });
  }else{
    apply(document);
    document.documentElement.lang = getLang();
  }
})();
