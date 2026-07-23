// this is the one-time intro. it shows the five tabs in a few short lines and
// lets you drop in a first api key. either button marks onboarded so it only
// ever shows once (Configure has a "replay" that flips the flag back).

(function () {
  "use strict";

  var PROVIDERS = [
    { id: "openai", name: "OpenAI", hint: "sk-..." },
    { id: "anthropic", name: "Anthropic", hint: "sk-ant-..." },
    { id: "gemini", name: "Gemini", hint: "AIza..." }
  ];

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function getConfig() {
    if (window.TStore && TStore.getConfig) return TStore.getConfig();
    return { provider: "openai", keys: {}, onboarded: false };
  }

  function markOnboarded() {
    if (window.TStore && TStore.setConfig) TStore.setConfig({ onboarded: true });
  }

  function build() {
    var c = getConfig();
    var body = el("div", "ob");

    body.appendChild(
      el("p", "ob-lead", "Travsplore helps you go from a vague idea to a booked-ish trip.")
    );

    var list = el("ul", "ob-list");
    [
      ["Travel", "describe the trip and get a short list of destinations and stays"],
      ["Explore", "dig into a saved place — pros, ideas, and links"],
      ["Plan", "build the itinerary and packing list, then save it as a PDF"],
      ["Compare", "put hotels, rooms or airlines side by side"],
      ["Configure", "keys, models, and the places you'd rather avoid"]
    ].forEach(function (row) {
      var li = el("li", "ob-item");
      li.appendChild(el("span", "ob-item-name", row[0]));
      li.appendChild(el("span", "ob-item-desc", row[1]));
      list.appendChild(li);
    });
    body.appendChild(list);

    body.appendChild(
      el("p", "ob-note", "Drop in one API key to start, or skip and add it later in Configure.")
    );

    // provider picker
    var pick = el("div", "ob-field");
    pick.appendChild(el("span", "ob-label", "Provider"));
    var sel = el("select", "ui-input ob-select");
    PROVIDERS.forEach(function (p) {
      var o = el("option", null, p.name);
      o.value = p.id;
      if (p.id === (c.provider || "openai")) o.selected = true;
      sel.appendChild(o);
    });
    pick.appendChild(sel);
    body.appendChild(pick);

    // key field
    var keyWrap = el("div", "ob-field");
    keyWrap.appendChild(el("span", "ob-label", "API key"));
    var key = el("input", "ui-input ob-key");
    key.type = "password";
    key.autocomplete = "off";
    key.spellcheck = false;
    function setHint() {
      var p = PROVIDERS.filter(function (x) { return x.id === sel.value; })[0];
      key.placeholder = p ? p.hint : "";
    }
    setHint();
    sel.addEventListener("change", setHint);
    keyWrap.appendChild(key);
    body.appendChild(keyWrap);

    return { body: body, sel: sel, key: key };
  }

  function maybeShow(force) {
    var c = getConfig();
    if (c.onboarded && !force) return;
    if (!window.UI || !UI.modal) {
      // no ui kit to show it — still mark so we never block boot
      markOnboarded();
      return;
    }

    var ui = build();

    UI.modal({
      title: "Welcome to Travsplore",
      bodyEl: ui.body,
      actions: [
        {
          label: "Skip for now",
          onClick: function () {
            markOnboarded();
            if (UI.toast) UI.toast("You can add API keys anytime in Configure");
          }
        },
        {
          label: "Save & start",
          primary: true,
          onClick: function () {
            var provider = ui.sel.value || "openai";
            var val = (ui.key.value || "").trim();
            var patch = { provider: provider, onboarded: true };
            if (val) {
              var keys = {};
              keys[provider] = val;
              patch.keys = keys;
            }
            if (window.TStore && TStore.setConfig) TStore.setConfig(patch);
            if (UI.toast) UI.toast(val ? "You're set — happy exploring" : "Add a key in Configure when you're ready");
            if (window.App && App.refresh) App.refresh("configure");
          }
        }
      ]
    });
  }

  window.Onboarding = { maybeShow: maybeShow };
})();
