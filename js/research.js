// this is the research tab — dig into the area around a stay: what's nearby, and
// what's on around the travel dates (events / weather / seasonal)

(function () {
  "use strict";

  if (!window.App || !App.registerTab) return;

  var refs = {};
  var selectedPlaceId = "";
  var current = null;
  var previewUrl = "";
  var zoom = 1;
  // present a normal desktop-chrome user agent so sites do not deny an "electron" client
  var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function placeName(p) { return String(p.name || p.hotel || p.title || p.destination || "Saved place"); }
  function placeArea(p) { return String(p.city || p.destination || p.region || p.location || p.country || ""); }
  function placeLabel(p) { var a = placeArea(p); return a ? placeName(p) + " · " + a : placeName(p); }

  function q(s) { return encodeURIComponent(String(s || "").trim()); }

  function openLink(url) {
    if (window.api && window.api.openExternal) window.api.openExternal(url);
    else window.open(url, "_blank");
  }

  // lucky-search url — lands on the top real result for a query, grounded and
  // specific (so "At the property" hits the resort's own activities page)
  function lucky(query) {
    return "https://duckduckgo.com/?q=" + encodeURIComponent("!ducky " + query);
  }

  // deterministic look-it-up links, built from the place + area + dates. the map
  // ones open the full google maps search (with its results sidebar you can click
  // through), the rest are searches — all shown in the in-app webview
  function buildLinks(place, area, dates) {
    var loc = (place + (area ? " " + area : "")).trim();
    var maps = "https://www.google.com/maps/search/?api=1&query=";
    var bing = "https://www.bing.com/search?q=";
    return [
      // things to do lands on the property's own activities page; if that will not
      // load, it falls back to a plain map search of things to do near the place
      { kind: "site", label: "Things to do", url: lucky(loc + " resort activities experiences things to do"), fallback: maps + q("things to do near " + loc) },
      { kind: "site", label: "Restaurants", url: maps + q("restaurants near " + loc) },
      { kind: "site", label: "Weather", url: bing + q((area || place) + " weather " + (dates || "")) }
    ];
  }

  function pickArr(v) {
    if (!Array.isArray(v)) return [];
    return v.map(function (x) { return String(x == null ? "" : x).trim(); }).filter(Boolean);
  }

  function researchPrompt(place, area, dates) {
    var lines = [];
    lines.push("Place / hotel: " + place + ".");
    if (area) lines.push("Island / area / city: " + area + ".");
    if (dates) {
      lines.push("Travel dates: " + dates + ". For \"timing\", focus on events, festivals, weather and seasonal things happening THEN.");
    } else {
      lines.push("No specific dates given. For \"timing\", give the year-round highlights and the best time to come.");
    }
    lines.push(
      'Return JSON: {"nearby":[..],"food":[..],"dayTrips":[..],"timing":[..],"tips":[..]}. ' +
      '"nearby" = things to do or see close to the stay. "food" = notable places to eat nearby. "dayTrips" = day trips or excursions from the area. ' +
      '"timing" = what is on around the dates (events / festivals / weather / seasonal), or year-round highlights if no dates. ' +
      '"tips" = short practical local tips (getting around, money, safety). ' +
      "3 to 4 short items per list, each a few words. Real, specific places. No preamble."
    );
    return lines.join("\n");
  }

  // ---- rendering --------------------------------------------------------

  function render(container) {
    container.textContent = "";
    refs = {};

    var head = el("div", "rs-header");
    head.appendChild(el("h2", "rs-title", "Research"));
    head.appendChild(el("p", "rs-sub", "Dig into the area around a stay — what's nearby, and what's on around your dates."));
    container.appendChild(head);

    var note = el("div", "rs-note", "Add an API key in Configure to research an area.");
    refs.note = note;
    container.appendChild(note);

    var card = el("div", "rs-card");

    var pickField = el("label", "rs-field");
    pickField.appendChild(el("span", "rs-label", "Saved place"));
    var sel = el("select", "rs-input");
    refs.sel = sel;
    pickField.appendChild(sel);
    card.appendChild(pickField);

    card.appendChild(el("div", "rs-or", "or research anywhere"));

    var grid = el("div", "rs-grid");

    var nameField = el("label", "rs-field");
    nameField.appendChild(el("span", "rs-label", "Place or hotel"));
    var nameIn = el("input", "rs-input");
    nameIn.type = "text";
    nameIn.placeholder = "e.g. The Brando";
    refs.name = nameIn;
    nameField.appendChild(nameIn);
    grid.appendChild(nameField);

    var areaField = el("label", "rs-field");
    areaField.appendChild(el("span", "rs-label", "Island / area"));
    var areaIn = el("input", "rs-input");
    areaIn.type = "text";
    areaIn.placeholder = "e.g. Tetiaroa, French Polynesia";
    refs.area = areaIn;
    areaField.appendChild(areaIn);
    grid.appendChild(areaField);

    card.appendChild(grid);

    var whenField = el("label", "rs-field");
    whenField.appendChild(el("span", "rs-label", "When (optional)"));
    var whenIn = el("input", "rs-input");
    whenIn.type = "text";
    whenIn.placeholder = "e.g. late June, or 6/12–6/20 — leave blank for year-round";
    refs.when = whenIn;
    whenField.appendChild(whenIn);
    card.appendChild(whenField);

    nameIn.addEventListener("input", function () {
      selectedPlaceId = "";
      if (sel.value) sel.value = "";
    });

    sel.addEventListener("change", function () {
      selectedPlaceId = sel.value || "";
      if (selectedPlaceId) {
        var p = TStore.places.get(selectedPlaceId);
        if (p) { nameIn.value = placeName(p); areaIn.value = placeArea(p); }
      }
    });

    var actions = el("div", "rs-actions");
    var goBtn = el("button", "rs-btn rs-btn-primary", "Research");
    goBtn.type = "button";
    goBtn.addEventListener("click", runResearch);
    refs.go = goBtn;
    actions.appendChild(goBtn);
    card.appendChild(actions);

    container.appendChild(card);

    var result = el("div", "rs-result");
    refs.result = result;
    container.appendChild(result);

    fillPlaces();
    updateReadyNote();
  }

  function fillPlaces() {
    var sel = refs.sel;
    if (!sel) return;
    sel.textContent = "";
    var none = el("option", null, "— none —");
    none.value = "";
    sel.appendChild(none);
    var places = [];
    try { places = (TStore.places && TStore.places.list()) || []; } catch (e) { places = []; }
    places.forEach(function (p) {
      var o = el("option", null, placeLabel(p));
      o.value = p.id;
      sel.appendChild(o);
    });
    if (selectedPlaceId) sel.value = selectedPlaceId;
  }

  function updateReadyNote() {
    if (!refs.note) return;
    var ready = window.AI && AI.ready && AI.ready();
    refs.note.style.display = ready ? "none" : "block";
  }

  // ---- run --------------------------------------------------------------

  function runResearch() {
    var place = (refs.name.value || "").trim();
    var area = (refs.area.value || "").trim();
    var dates = (refs.when.value || "").trim();
    if (!place && !area) {
      UI.toast("Name a place or pick a saved one");
      refs.name.focus();
      return;
    }
    if (!window.AI || !AI.ready || !AI.ready()) {
      UI.toast("Add an API key in Configure first");
      return;
    }

    var host = refs.result;
    host.textContent = "";
    var stop = UI.spinner(host);
    refs.go.disabled = true;

    AI.ask({
      json: true,
      system: "You are a sharp local travel researcher. Be concrete and concise. Real places only. No preamble.",
      prompt: researchPrompt(place || area, area, dates)
    }).then(function (res) {
      stop();
      refs.go.disabled = false;
      if (!res || !res.ok) { showError(res && res.error); return; }
      var d = res.data || {};
      current = {
        place: place || area,
        area: area,
        dates: dates,
        nearby: pickArr(d.nearby),
        food: pickArr(d.food),
        dayTrips: pickArr(d.dayTrips),
        timing: pickArr(d.timing),
        tips: pickArr(d.tips)
      };
      renderResult(host);
    }).catch(function () {
      stop();
      refs.go.disabled = false;
      showError("Something went wrong reaching the model.");
    });
  }

  function showError(msg) {
    var box = el("div", "rs-inline-err", msg ? String(msg) : "Something went wrong. Try again.");
    refs.result.appendChild(box);
  }

  function renderResult(host) {
    host.textContent = "";

    var title = el("div", "rs-result-head");
    title.appendChild(el("h3", "rs-h3", current.place));
    if (current.area && current.area !== current.place) title.appendChild(el("span", "rs-result-area", current.area));
    host.appendChild(title);

    var timingLabel = current.dates ? "Around " + current.dates : "When to go";
    var lists = el("div", "rs-lists");
    lists.appendChild(listBlock("Near the stay", "rs-nearby", current.nearby));
    lists.appendChild(listBlock("Food nearby", "rs-food", current.food));
    lists.appendChild(listBlock("Day trips", "rs-daytrips", current.dayTrips));
    lists.appendChild(listBlock(timingLabel, "rs-timing", current.timing));
    lists.appendChild(listBlock("Local tips", "rs-tips", current.tips));
    refs.lists = lists;
    host.appendChild(lists);

    var moreRow = el("div", "rs-more-row");
    var moreBtn = el("button", "rs-btn rs-btn-ghost", "Ask more");
    moreBtn.type = "button";
    moreBtn.addEventListener("click", function () { askMore(moreBtn); });
    refs.more = moreBtn;
    moreRow.appendChild(moreBtn);
    host.appendChild(moreRow);

    renderLinks(host);
  }

  function listBlock(title, cls, items) {
    var block = el("div", "rs-block " + cls);
    block.appendChild(el("h4", "rs-block-title", title));
    var ul = el("ul", "rs-list");
    block._ul = ul;
    if (!items.length) ul.appendChild(el("li", "rs-list-empty", "—"));
    else items.forEach(function (t) { ul.appendChild(el("li", null, t)); });
    block.appendChild(ul);
    return block;
  }

  function renderLinks(host) {
    var wrap = el("div", "rs-links");
    wrap.appendChild(el("h4", "rs-block-title", "Look it up"));

    var chips = el("div", "rs-chips");
    buildLinks(current.place, current.area, current.dates).forEach(function (r) {
      var chip = el("button", "rs-chip", r.label);
      chip.type = "button";
      chip.addEventListener("click", function () {
        setActiveChip(chips, chip);
        openPreview(r.url, r.fallback);
      });
      chips.appendChild(chip);
    });
    wrap.appendChild(chips);

    // in-app preview pane, same idea as Explore
    var pane = el("div", "rs-preview");
    var bar = el("div", "rs-preview-bar");
    var urlLabel = el("span", "rs-preview-url", "Pick one above to preview it here.");
    refs.previewUrlLabel = urlLabel;
    bar.appendChild(urlLabel);
    var zoomGroup = el("div", "rs-zoom");
    var zoomOut = el("button", "rs-btn rs-btn-ghost rs-btn-sm rs-zoom-btn", "−");
    zoomOut.type = "button";
    zoomOut.title = "Zoom out";
    zoomOut.addEventListener("click", function () { setZoom(-0.15); });
    var zoomLabel = el("span", "rs-zoom-label", "100%");
    refs.zoomLabel = zoomLabel;
    var zoomIn = el("button", "rs-btn rs-btn-ghost rs-btn-sm rs-zoom-btn", "+");
    zoomIn.type = "button";
    zoomIn.title = "Zoom in";
    zoomIn.addEventListener("click", function () { setZoom(0.15); });
    zoomGroup.appendChild(zoomOut);
    zoomGroup.appendChild(zoomLabel);
    zoomGroup.appendChild(zoomIn);
    bar.appendChild(zoomGroup);

    var openBtn = el("button", "rs-btn rs-btn-ghost rs-btn-sm", "Open externally");
    openBtn.type = "button";
    openBtn.disabled = true;
    openBtn.addEventListener("click", function () { if (previewUrl) openLink(previewUrl); });
    refs.openBtn = openBtn;
    bar.appendChild(openBtn);
    pane.appendChild(bar);

    var stage = el("div", "rs-stage");
    refs.stage = stage;
    stage.appendChild(el("div", "rs-stage-empty", "No preview loaded yet."));
    pane.appendChild(stage);

    var blocked = el("div", "rs-preview-note");
    blocked.style.display = "none";
    refs.blockedNote = blocked;
    pane.appendChild(blocked);

    wrap.appendChild(pane);
    host.appendChild(wrap);
  }

  function setActiveChip(chips, active) {
    chips.querySelectorAll(".rs-chip").forEach(function (c) { c.classList.remove("is-active"); });
    active.classList.add("is-active");
  }

  function showBlocked(msg) {
    if (!refs.blockedNote) return;
    refs.blockedNote.textContent = msg;
    refs.blockedNote.style.display = "block";
  }

  // everything loads in a webview (a real browser view). maps use the full google
  // maps page, so scrolling zooms the map rather than the whole tab. if the primary
  // url fails to load, fall back to a plain search so there is always something.
  function openPreview(url, fallback) {
    previewUrl = url;
    if (refs.previewUrlLabel) refs.previewUrlLabel.textContent = url;
    if (refs.openBtn) refs.openBtn.disabled = false;
    if (refs.blockedNote) refs.blockedNote.style.display = "none";

    var stage = refs.stage;
    if (!stage) return;
    stage.textContent = "";
    refs.wv = null;

    if (!window.api) {
      showBlocked("Preview needs the desktop app. Use Open externally.");
      return;
    }

    var wv = document.createElement("webview");
    wv.className = "rs-embed";
    wv.setAttribute("allowpopups", "");
    wv.setAttribute("useragent", UA);
    refs.wv = wv;
    var loading = el("div", "rs-stage-empty", "Loading…");
    stage.appendChild(loading);
    var triedFallback = false;
    wv.addEventListener("dom-ready", applyZoom);
    wv.addEventListener("did-stop-loading", function () {
      if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
    });
    wv.addEventListener("did-fail-load", function (e) {
      if (e && e.errorCode === -3) return;
      if (fallback && !triedFallback) {
        triedFallback = true;
        previewUrl = fallback;
        if (refs.previewUrlLabel) refs.previewUrlLabel.textContent = fallback;
        wv.setAttribute("src", fallback);
        return;
      }
      showBlocked("This site declined to load in the preview. Use Open externally.");
    });
    stage.appendChild(wv);
    wv.setAttribute("src", url);
  }

  // zoom the embedded site (helps get past cookie/newsletter popups that block
  // scrolling); persists across previews
  function applyZoom() {
    if (refs.wv && typeof refs.wv.setZoomFactor === "function") {
      try { refs.wv.setZoomFactor(zoom); } catch (e) {}
    }
    if (refs.zoomLabel) refs.zoomLabel.textContent = Math.round(zoom * 100) + "%";
  }

  function setZoom(delta) {
    zoom = Math.max(0.5, Math.min(2.5, Math.round((zoom + delta) * 100) / 100));
    applyZoom();
  }

  // ---- ask more ---------------------------------------------------------

  function askMore(btn) {
    if (!current || !window.AI || !AI.ready || !AI.ready()) return;
    btn.disabled = true;
    var stop = UI.spinner(btn);
    var prompt =
      "Place: " + current.place + (current.area ? " (" + current.area + ")" : "") + (current.dates ? ", around " + current.dates : "") + ".\n" +
      "Already have nearby: " + (current.nearby.join("; ") || "none") + ".\n" +
      "Already have food: " + (current.food.join("; ") || "none") + ".\n" +
      "Already have day trips: " + (current.dayTrips.join("; ") || "none") + ".\n" +
      'Add 2 to 3 NEW short items to each list. Return JSON {"nearby":[..],"food":[..],"dayTrips":[..],"timing":[..],"tips":[..]} only.';
    AI.ask({
      json: true,
      system: "You extend local travel research. Return only JSON with new short items. No repeats.",
      prompt: prompt
    }).then(function (res) {
      stop();
      btn.disabled = false;
      if (!res || !res.ok) { UI.toast((res && res.error) || "Could not load more"); return; }
      var d = res.data || {};
      mergeInto("nearby", pickArr(d.nearby));
      mergeInto("food", pickArr(d.food));
      mergeInto("dayTrips", pickArr(d.dayTrips));
      mergeInto("timing", pickArr(d.timing));
      mergeInto("tips", pickArr(d.tips));
      redrawLists();
    }).catch(function () {
      stop();
      btn.disabled = false;
      UI.toast("Something went wrong");
    });
  }

  function mergeInto(key, extra) {
    var have = current[key].map(function (x) { return x.toLowerCase(); });
    extra.forEach(function (t) {
      if (have.indexOf(t.toLowerCase()) === -1) { current[key].push(t); have.push(t.toLowerCase()); }
    });
  }

  function redrawLists() {
    if (!refs.lists) return;
    var pairs = [
      [".rs-nearby", current.nearby],
      [".rs-food", current.food],
      [".rs-daytrips", current.dayTrips],
      [".rs-timing", current.timing],
      [".rs-tips", current.tips]
    ];
    pairs.forEach(function (pair) {
      var block = refs.lists.querySelector(pair[0]);
      if (!block || !block._ul) return;
      var ul = block._ul;
      ul.textContent = "";
      if (!pair[1].length) ul.appendChild(el("li", "rs-list-empty", "—"));
      else pair[1].forEach(function (t) { ul.appendChild(el("li", null, t)); });
    });
  }

  // ---- tab wiring -------------------------------------------------------

  function onShow() {
    fillPlaces();
    updateReadyNote();
  }

  App.registerTab("research", {
    label: "Research",
    icon: window.Icons && Icons.search ? Icons.search() : "",
    render: render,
    onShow: onShow
  });
})();
