// config.js — FULL REPLACEMENT (canonical paths only)

window.FORMS = {

  rif: {
    title: "Receipt Inspection Form",
    sectionTitle: "Receipt Inspection Form",
    backgroundImage: "transformer.jpg",
    completedKey: "rifCompleted",
    buttons: [
      { text: "RIF – No Procore (Fillable)", href: "rif_no_procore.html" },

      // RIF Procore (per-equipment; resolved in app.js to the Procore Equipment URL from Setup)
      { text: "RIF Link to Procore (Live after updated by customer)", href: "NEXUS_PROCORE_RIF" },

      { text: "Equipment Megohmmeter Test (If Applicable)", href: "meg_log.html?mode=equipment" }
    ]
  },


  lvt: {
    title: "LVT Meg Cover Sheet",
    sectionTitle: "Megohmmeter Testing of Conductors",
    backgroundImage: "transformer.jpg",
    completedKey: "lvtMegCompleted",
    buttons: [
      { text: "Line Side", href: "https://aceelectricnet.sharepoint.com/:x:/s/CMH098QAQC/IQB4zdld_DAmQbY4VOAUXcHmAf7SmDkVDGCEPduYPqKKEXY?e=qZ6OKd" },
      { text: "Load Side", href: "https://aceelectricnet.sharepoint.com/:x:/s/CMH098QAQC/IQBlhLsuvA8USp7ZzFiuyGW1Aa7TZBcVpZ4BvtoWGNR62AM?e=nBgi82" }
    ]
  },


  // =========================
  // MEG — FIXED PATHS
  // =========================
  meg: {
    title: "Megohmmeter Testing",
    sectionTitle: "Megohmmeter Testing of Conductors",
    backgroundImage: "transformer.jpg",
    completedKey: "megCompleted",
    buttons: [
      { text: "Megohmmeter Test Log (Fillable)", href: "meg_log.html" },
      { text: "Megohmmeter SOP", href: "megohmmeter_sop.html" },
      { text: "Fluke Connect Import (Optional)", href: "meg/fluke_import.html" }
    ]
  },


  megger_reporting: {
    title: "Megger Reporting",
    sectionTitle: "Megger Reporting",
    backgroundImage: "transformer.jpg",
    completedKey: "meggerReportingViewed",
    embedUrl: "megger_reporting.pdf"
  },


  fpv_photo: {
    title: "Finished Product Verification",
    sectionTitle: "Finished Product Verification",
    backgroundImage: "transformer.jpg",
    completedKey: "fpvPhotoCompleted",
    buttons: [
      { text: "Finished Product Verification Photo", href: "fpv_photo_capture.html" }
    ]
  },


  // =========================
  // TORQUE — FIXED PATHS
  // =========================
  torque: {
    title: "Torque",
    sectionTitle: "Torque Application Resources",
    backgroundImage: "transformer.jpg",
    completedKey: "torqueCompleted",
    buttons: [
      { text: "Torque Application Log", href: "torque_log.html" },

      // NEW: Snap-on import (correct folder)
      { text: "Snap-on ConnecTorq Import (Optional)", href: "torque/snapon_import.html" },

      { text: "Manufacturer Torque Specifications (Submittal)", href: "https://aceelectricnet.sharepoint.com/:w:/s/CMH098QAQC/Ebq0m0FcOsdAvi8flKZlWA8BXjve29RsOoA2XcVIlGdSrg?e=lfKesG" },
      { text: "Transformer Grounding Specification", href: "https://aceelectricnet.sharepoint.com/:w:/s/CMH098QAQC/Ebq0m0FcOsdAvi8flKZlWA8BXjve29RsOoA2XcVIlGdSrg?e=lfKesG" },
      { text: "ANSI Torque Specification Generalized", href: "https://aceelectricnet.sharepoint.com/:b:/s/CMH098QAQC/EfjsJTafbJtGtGe-K24K9mwB6o3p6ZOohg6BQCvuD6ruAg?e=pf72Ci" },
      { text: "Burndy Torque Specifications for Mechanical Lugs", href: "https://aceelectricnet.sharepoint.com/:b:/s/CMH098QAQC/Efgq4Mh9nB9EgFE02sYoMg8B8yexajLDN__obEG9_QGuOA?e=RXauzp" }
    ]
  },


  l2: {
    title: "LVT L2 Installation Verification Form",
    sectionTitle: "L2 IVF (Use if Procore is not updated)",
    backgroundImage: "transformer.jpg",
    completedKey: "l2Completed",
    buttons: [
      { text: "L2 IVF (Use if Procore is not updated)", href: "l2_no_procore.html" },
      { text: "L2 IVF Link to Procore (Live after updated by customer)", href: "https://login.procore.com/?cookies_enabled=true" }
    ]
  },


  prefod: {
    title: "Pre-FOD Inspection",
    sectionTitle: "Pre-FOD Inspection",
    backgroundImage: "transformer.jpg",
    completedKey: "prefodCompleted",
    buttons: [
      { text: "Pre-FOD Inspection Check List (Use if Procore is not updated)", href: "prefod_checklist.html" },
      { text: "Pre-FOD SOP", href: "prefod_sop.html" },
      { text: "Pre-FOD Inspection Link to Procore (Live after updated by customer)", href: "NEXUS_PROCORE_PREFOD" }
    ]
  },


  phenolic: {
    title: "Phenolic Display",
    sectionTitle: "Phenolic Display",
    backgroundImage: "transformer.jpg",
    completedKey: "phenolicCompleted",
    buttons: [
      { text: "AWS Specification in Procore", href: "https://us02.procore.com/562949954239068/project/specification_sections?show_revision_url=%2F562949954239068%2Fproject%2Fspecification_section_revisions%2F562949961901225%2Fview" },
      { text: "Reference Pictogram", href: "https://aceelectricnet.sharepoint.com/:w:/s/CMH098QAQC/IQAZTk1tl3diQYYHeEzRsh6tAWwAYGeZ3jMsBCEkFK-PFO4?e=lbao5X" }
    ]
  },


  transformer: {
    title: "Diagram Image",
    sectionTitle: "Diagram",
    backgroundImage: "transformer.jpg",
    completedKey: "DiagramViewed",
    magnifier: true,
    zoom: 4,
    buttons: [
      { text: "Supporting Documents", href: "form.html?id=supporting" }
    ]
  },


  supporting: {
    title: "Supporting Documents",
    sectionTitle: "Supporting Documents",
    backgroundImage: "transformer.jpg",
    completedKey: "supportingViewed",
    buttons: [
      { text: "Training PowerPoint Documents", href: "https://aceelectricnet.sharepoint.com/:f:/s/CMH098QAQC/IgDTzSdCCowiQJ0Rza9oIXlUASycInMyNn5KL8kpLPbjxkU?e=9fAnPb" },
      { text: "Supporting Documentation Repository", href: "https://aceelectricnet.sharepoint.com/:f:/s/CMH098QAQC/IgAuRbIpwO8IQog9sZN4umvUAb8FLYz2qqSu8oOUvYa1Yq4?e=QHL9IJ" },
      { text: "SOP General Folder", href: "https://aceelectricnet.sharepoint.com/:f:/s/CMH098QAQC/IgAQM-row4waQbd2QWYR27mvAYSIW3WLiCt2W0EwVWlYsng?e=Brrj7W" },
      { text: "Diagram Image", href: "form.html?id=transformer" }
    ]
  },


  // =========================
  // FIXED: correct filename
  // =========================
  construction: {
    title: "Construction Check Sheet",
    sectionTitle: "Construction Check Sheet",
    backgroundImage: "transformer.jpg",
    completedKey: "constructionViewed",
    embedUrl: "construction_check_sheet.html"
  }

};
