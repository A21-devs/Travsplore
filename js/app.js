// this is the shell — it owns the tabs, the theme, and the first paint.
// registerTab is available the moment this file parses so the tab files can
// register themselves as they load.

(function () {
  "use strict";

  // fixed left-to-right order of the nav, regardless of load order
  var ORDER = ["travel", "explore", "research", "plan", "compare", "configure"];

  var tabs = {}; // id -> { label, icon, render, onShow }
  var rendered = {}; // id -> true once its panel has been built
  var current = null;
  var navBuilt = false;

  function panelOf(id) {
    return document.getElementById("tab-" + id);
  }

  function cfg() {
    if (window.TStore && TStore.getConfig) return TStore.getConfig();
    return { theme: "light" };
  }

  // ----- theme -----

  function applyTheme(theme) {
    var t = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);
    var btn = document.getElementById("theme-toggle");
    if (btn) {
      var next = t === "dark" ? "sun" : "moon";
      btn.innerHTML = (window.Icons && Icons[next]) ? Icons[next]() : "";
      btn.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme");
      btn.setAttribute("title", t === "dark" ? "Light theme" : "Dark theme");
    }
  }

  function toggleTheme() {
    var now = cfg().theme === "dark" ? "dark" : "light";
    var next = now === "dark" ? "light" : "dark";
    if (window.TStore && TStore.setConfig) TStore.setConfig({ theme: next });
    applyTheme(next);
  }

  // ----- tabs -----

  function registerTab(id, def) {
    if (!id || !def || typeof def.render !== "function") return;
    tabs[id] = {
      label: def.label || id,
      icon: def.icon || "",
      render: def.render,
      onShow: typeof def.onShow === "function" ? def.onShow : null
    };
    // if the nav is already on screen (a late registration), rebuild it
    if (navBuilt) buildNav();
  }

  function buildNav() {
    var nav = document.getElementById("tab-nav");
    if (!nav) return;
    nav.innerHTML = "";
    ORDER.forEach(function (id) {
      var t = tabs[id];
      if (!t) return; // a tab that never registered is simply skipped
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tab-btn" + (id === current ? " active" : "");
      btn.setAttribute("data-tab", id);
      btn.innerHTML =
        '<span class="tab-ico">' + (t.icon || "") + "</span>" +
        '<span class="tab-label"></span>';
      btn.querySelector(".tab-label").textContent = t.label;
      btn.addEventListener("click", function () {
        go(id);
      });
      nav.appendChild(btn);
    });
    navBuilt = true;
  }

  function markActiveNav() {
    var nav = document.getElementById("tab-nav");
    if (!nav) return;
    var btns = nav.querySelectorAll(".tab-btn");
    for (var i = 0; i < btns.length; i++) {
      var id = btns[i].getAttribute("data-tab");
      btns[i].classList.toggle("active", id === current);
    }
  }

  function showPanel(id) {
    ORDER.forEach(function (pid) {
      var p = panelOf(pid);
      if (p) p.classList.toggle("active", pid === id);
    });
  }

  // switch to a tab: lazy-build its panel the first time, then run onShow
  function go(id) {
    if (!tabs[id]) return;
    current = id;
    showPanel(id);
    markActiveNav();

    var panel = panelOf(id);
    if (!panel) return;
    if (!rendered[id]) {
      try {
        tabs[id].render(panel);
      } catch (e) {
        panel.innerHTML = '<div class="ui-empty"><div class="ui-empty-text">This tab hit an error.</div></div>';
      }
      rendered[id] = true;
    }
    if (tabs[id].onShow) {
      try {
        tabs[id].onShow(panel);
      } catch (e) {}
    }
  }

  // force a fresh render of a tab's panel (used after data imports etc.)
  function refresh(id) {
    if (!tabs[id]) return;
    var panel = panelOf(id);
    if (!panel) return;
    try {
      tabs[id].render(panel);
    } catch (e) {}
    rendered[id] = true;
    if (id === current && tabs[id].onShow) {
      try {
        tabs[id].onShow(panel);
      } catch (e) {}
    }
  }

  function firstTab() {
    for (var i = 0; i < ORDER.length; i++) {
      if (tabs[ORDER[i]]) return ORDER[i];
    }
    return null;
  }

  // ----- boot -----

  function boot() {
    // give the mac traffic-light buttons room in the sidebar
    if (window.api && window.api.platform === "darwin") {
      document.body.classList.add("is-mac");
    }
    applyTheme(cfg().theme);

    var toggle = document.getElementById("theme-toggle");
    if (toggle) toggle.addEventListener("click", toggleTheme);

    buildNav();

    var start = firstTab();
    if (start) go(start);

    // keep the theme in sync if it is changed from the Configure tab
    if (window.TStore && TStore.on) {
      TStore.on(function (state) {
        var t = state && state.config && state.config.theme;
        if (t && document.documentElement.getAttribute("data-theme") !== t) {
          applyTheme(t);
        }
      });
    }

    if (window.Onboarding && typeof Onboarding.maybeShow === "function") {
      Onboarding.maybeShow();
    }
  }

  window.App = {
    registerTab: registerTab,
    go: go,
    refresh: refresh,
    toast: function (msg, ms) {
      if (window.UI && UI.toast) UI.toast(msg, ms);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
