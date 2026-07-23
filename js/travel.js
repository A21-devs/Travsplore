// this is the travel tab — find destinations with ai, then stays that fit

(function () {
  "use strict";

  // small inline icons used inside the panel (tab icon comes from Icons.plane)
  function svgPin() {
    return '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';
  }
  function svgArrow() {
    return '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';
  }
  function svgBookmark() {
    return '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12v16l-6-4-6 4z"/></svg>';
  }

  // the interest chips offered in intake
  var INTERESTS = [
    "islands", "beach", "mountains", "city", "countryside",
    "desert", "lakes", "ski", "culture", "food", "nightlife", "nature",
    "adventure", "relaxation", "wellness", "history", "wildlife", "diving",
    "hiking", "road trip", "shopping", "romance", "family", "luxury",
    "budget", "surfing", "safari", "camping", "theme parks"
  ];

  var CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "INR"];

  var DEST_SYSTEM = "You are a sharp travel scout. If the traveler gives dates, judge every place FOR those exact dates — weather, how busy, prices, and any school-break or holiday clash on those dates. If they give no dates, recommend the best time of year to visit each instead. Always weigh how reachable a place is from their origin. Suggest real, well-known destinations only. Be concise.";

  // per-render working state
  var state = null;

  function freshState() {
    return {
      interests: new Set(),
      isEvent: false,
      wiggle: true,
      flexible: false,
      destinations: [],
      chosen: null
    };
  }

  // read the whole intake form into a plain object
  function readIntake(root) {
    function val(sel) {
      var el = root.querySelector(sel);
      return el ? el.value.trim() : "";
    }
    function num(sel) {
      var el = root.querySelector(sel);
      var n = el ? parseInt(el.value, 10) : 0;
      return isNaN(n) ? 0 : n;
    }
    return {
      amount: val("#tv-amount"),
      currency: val("#tv-currency"),
      tier: val("#tv-tier"),
      adults: num("#tv-adults"),
      kids: num("#tv-kids"),
      wiggle: state.wiggle,
      interests: Array.from(state.interests),
      freeText: val("#tv-free"),
      dates: val("#tv-dates"),
      flexible: state.flexible,
      origin: val("#tv-origin"),
      isEvent: state.isEvent,
      eventType: val("#tv-event-type"),
      eventHeadcount: val("#tv-event-head"),
      eventMust: val("#tv-event-must")
    };
  }

  // turn the exclusions record into a short line for the prompt
  function exclusionLine() {
    var ex = (window.TStore && TStore.getExclusions && TStore.getExclusions()) || {};
    var parts = [];
    if (ex.continents && ex.continents.length) parts.push("continents: " + ex.continents.join(", "));
    if (ex.countries && ex.countries.length) parts.push("countries: " + ex.countries.join(", "));
    if (ex.places && ex.places.length) parts.push("places: " + ex.places.join(", "));
    if (ex.notes) parts.push("notes: " + ex.notes);
    if (!parts.length) return "";
    return "Never suggest any of these excluded areas — " + parts.join("; ") + ".";
  }

  // compose the budget phrase from amount/currency/tier
  function budgetPhrase(intake) {
    if (intake.amount) {
      return "about " + intake.amount + " " + (intake.currency || "USD") +
        (intake.tier ? " (" + intake.tier + " tier)" : "");
    }
    if (intake.tier) return intake.tier + " tier";
    return "unspecified";
  }

  // build the destination prompt
  function destinationPrompt(intake) {
    var lines = [];
    lines.push("Budget: " + budgetPhrase(intake) + ".");
    lines.push("Party: " + intake.adults + " adults, " + intake.kids + " kids.");
    if (intake.wiggle) {
      lines.push("Room capacity can be slightly under headcount when the room realistically sleeps everyone.");
    }
    if (intake.interests.length) lines.push("Looking for: " + intake.interests.join(", ") + ".");
    if (intake.freeText) lines.push("Also wants: " + intake.freeText + ".");
    if (intake.dates) lines.push("Travel dates: " + intake.dates + ". Base EVERYTHING on these exact dates — only recommend places worth visiting then, and judge each place for THESE dates.");
    if (intake.flexible) lines.push("Dates are flexible.");
    if (intake.origin) lines.push("Travelling from: " + intake.origin + ".");
    if (intake.isEvent) {
      lines.push("THIS IS AN EVENT — weight the picks toward event suitability.");
      if (intake.eventType) lines.push("Event type: " + intake.eventType + ".");
      if (intake.eventHeadcount) lines.push("Event headcount: " + intake.eventHeadcount + ".");
      if (intake.eventMust) lines.push("Must-haves: " + intake.eventMust + ".");
    }
    var ex = exclusionLine();
    if (ex) lines.push(ex);
    lines.push("Weigh how easy each place is to reach from the origin (direct flights, nearest airport, travel time).");
    if (intake.dates) {
      lines.push('Return JSON: {"destinations":[{"name","country","why","fit","timing","access"}]} — 3 to 5 items, ranked best first. "why" one short line. "fit" a rough note on budget/party fit. "timing" one short line describing what the traveler\'s exact dates are like there — weather, how busy, price level, and any school-break or public-holiday clash on those dates. "access" one short line on reachability from the origin (flights / nearest airport / travel time).');
    } else {
      lines.push('No dates were given, so recommend WHEN to go. Return JSON: {"destinations":[{"name","country","why","fit","timing","access"}]} — 3 to 5 items, ranked best first. "why" one short line. "fit" a rough note on budget/party fit. "timing" one short line naming the best months to visit and why (weather, fewer crowds, better prices). "access" one short line on reachability from the origin (flights / nearest airport / travel time).');
    }
    return lines.join("\n");
  }

  // build the stays prompt for a chosen destination
  function staysPrompt(intake, dest) {
    var lines = [];
    lines.push("Destination: " + dest.name + (dest.country ? ", " + dest.country : "") + ".");
    if (intake.dates) lines.push("Travel dates: " + intake.dates + " — keep pricing and availability realistic for these exact dates.");
    lines.push("Budget: " + budgetPhrase(intake) + ".");
    lines.push("Party: " + intake.adults + " adults, " + intake.kids + " kids.");
    if (intake.wiggle) {
      lines.push("It is fine to include a room rated slightly under headcount when it realistically fits everyone — flag it in the capacity note.");
    }
    if (intake.interests.length) lines.push("Priorities: " + intake.interests.join(", ") + ".");
    if (intake.isEvent) {
      lines.push("This is for an event (" + (intake.eventType || "event") + ", headcount " + (intake.eventHeadcount || "?") + ") — favour places that can host or block-book.");
      if (intake.eventMust) lines.push("Must-haves: " + intake.eventMust + ".");
    }
    lines.push('Return JSON: {"stays":[{"name","type","pitch","price","capacity","why"}]} — 3 to 5 hotels/resorts/villas. "type" one of hotel/resort/villa. "pitch" one short line. "price" a $ tier like $ to $$$$. "capacity" a short room/headcount note. "why" one short line on fit.');
    return lines.join("\n");
  }

  // pull an array out of the model data defensively
  function pickArray(data, keys) {
    if (!data) return [];
    for (var i = 0; i < keys.length; i++) {
      if (Array.isArray(data[keys[i]])) return data[keys[i]];
    }
    if (Array.isArray(data)) return data;
    return [];
  }

  // a short inline note when no api key is configured
  function readyNote() {
    var box = document.createElement("div");
    box.className = "tv-note";
    box.textContent = "Add an API key in Configure to search destinations.";
    return box;
  }

  // render the whole tab
  function render(container) {
    state = freshState();
    container.innerHTML = "";

    var wrap = document.createElement("div");
    wrap.className = "tv-wrap";
    wrap.innerHTML = formHTML();
    container.appendChild(wrap);

    var results = document.createElement("div");
    results.className = "tv-results";
    container.appendChild(results);
    state.resultsEl = results;

    wireForm(wrap);
  }

  // the intake form markup
  function formHTML() {
    var chips = INTERESTS.map(function (i) {
      return '<button type="button" class="tv-chip" data-interest="' + i + '">' + i + "</button>";
    }).join("");

    var currency = CURRENCIES.map(function (c) {
      return '<option value="' + c + '">' + c + "</option>";
    }).join("");

    return '' +
      '<form class="tv-form" novalidate>' +
        '<div class="tv-head">' +
          '<h2>Find your trip</h2>' +
          '<p>Tell us the shape of it — we\'ll narrow the world down to a few good options.</p>' +
        '</div>' +

        '<div class="tv-grid">' +
          '<div class="tv-f">' +
            '<label>Budget</label>' +
            '<div class="tv-row">' +
              '<input id="tv-amount" type="number" min="0" inputmode="numeric" placeholder="amount" />' +
              '<select id="tv-currency">' + currency + '</select>' +
            '</div>' +
            '<select id="tv-tier" class="tv-tier">' +
              '<option value="">or pick a tier…</option>' +
              '<option value="budget">budget</option>' +
              '<option value="mid-range">mid-range</option>' +
              '<option value="luxury">luxury</option>' +
            '</select>' +
          '</div>' +

          '<div class="tv-f">' +
            '<label>Party</label>' +
            '<div class="tv-row">' +
              '<div class="tv-mini"><span>adults</span><input id="tv-adults" type="number" min="1" value="2" /></div>' +
              '<div class="tv-mini"><span>kids</span><input id="tv-kids" type="number" min="0" value="0" /></div>' +
            '</div>' +
            '<label class="tv-check"><input id="tv-wiggle" type="checkbox" checked /> ' +
              '<span>allow rooms rated slightly under our headcount when they realistically fit</span></label>' +
          '</div>' +
        '</div>' +

        '<div class="tv-f">' +
          '<label>What are you after?</label>' +
          '<div class="tv-chips">' + chips + '</div>' +
          '<input id="tv-free" type="text" placeholder="anything else — quiet, walkable, kid-friendly…" />' +
        '</div>' +

        '<div class="tv-grid">' +
          '<div class="tv-f">' +
            '<label>Dates</label>' +
            '<input id="tv-dates" type="text" placeholder="e.g. late June, or 6/12–6/20" />' +
            '<label class="tv-check"><input id="tv-flex" type="checkbox" /> <span>dates are flexible</span></label>' +
          '</div>' +
          '<div class="tv-f">' +
            '<label>Origin <span class="tv-opt">(optional)</span></label>' +
            '<input id="tv-origin" type="text" placeholder="where you\'re travelling from" />' +
          '</div>' +
        '</div>' +

        '<label class="tv-check tv-event-toggle"><input id="tv-event" type="checkbox" /> ' +
          '<span>Is this for an event?</span></label>' +

        '<div class="tv-event" hidden>' +
          '<div class="tv-grid">' +
            '<div class="tv-f">' +
              '<label>Event type</label>' +
              '<select id="tv-event-type">' +
                '<option value="wedding">wedding</option>' +
                '<option value="reunion">reunion</option>' +
                '<option value="conference">conference</option>' +
                '<option value="other">other</option>' +
              '</select>' +
            '</div>' +
            '<div class="tv-f">' +
              '<label>Headcount</label>' +
              '<input id="tv-event-head" type="number" min="1" placeholder="total guests" />' +
            '</div>' +
          '</div>' +
          '<div class="tv-f">' +
            '<label>Must-haves</label>' +
            '<input id="tv-event-must" type="text" placeholder="venue, block booking, ceremony space…" />' +
          '</div>' +
        '</div>' +

        '<div class="tv-actions">' +
          '<button type="submit" class="tv-btn tv-primary">Find destinations ' + svgArrow() + '</button>' +
        '</div>' +
      '</form>';
  }

  // wire up chips, toggles, submit
  function wireForm(wrap) {
    var form = wrap.querySelector(".tv-form");

    wrap.querySelectorAll(".tv-chip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.getAttribute("data-interest");
        if (state.interests.has(key)) {
          state.interests.delete(key);
          btn.classList.remove("on");
        } else {
          state.interests.add(key);
          btn.classList.add("on");
        }
      });
    });

    wrap.querySelector("#tv-wiggle").addEventListener("change", function (e) {
      state.wiggle = e.target.checked;
    });
    wrap.querySelector("#tv-flex").addEventListener("change", function (e) {
      state.flexible = e.target.checked;
    });

    var eventBox = wrap.querySelector(".tv-event");
    wrap.querySelector("#tv-event").addEventListener("change", function (e) {
      state.isEvent = e.target.checked;
      eventBox.hidden = !e.target.checked;
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      searchDestinations(wrap);
    });
  }

  // first ai call — ranked destinations
  function searchDestinations(wrap) {
    var results = state.resultsEl;
    results.innerHTML = "";
    state.chosen = null;

    if (!window.AI || !AI.ready()) {
      results.appendChild(readyNote());
      return;
    }

    var intake = readIntake(wrap);
    state.intake = intake;

    // remember where the traveller departs from so Compare can pre-fill it
    if (intake.origin && window.TStore && TStore.setConfig) {
      try {
        TStore.setConfig({ lastOrigin: intake.origin });
      } catch (e) {}
    }

    var stop = UI.spinner(results);
    AI.ask({
      json: true,
      system: DEST_SYSTEM,
      prompt: destinationPrompt(intake)
    }).then(function (res) {
      stop();
      if (!res || !res.ok) {
        showError(results, res && res.error);
        return;
      }
      var list = pickArray(res.data, ["destinations", "list"]);
      if (!list.length) {
        showError(results, "No destinations came back — try loosening the filters.");
        return;
      }
      state.destinations = list.slice(0, 5);
      renderDestinations(results);
    }).catch(function () {
      stop();
      showError(results, "Something went wrong reaching the model.");
    });
  }

  // fetch more destinations, skipping the ones already shown
  function moreDestinations(btn) {
    if (!window.AI || !AI.ready()) return;
    btn.disabled = true;
    var stop = UI.spinner(btn);
    var have = state.destinations.map(function (d) { return d.name; }).filter(Boolean);
    var prompt = destinationPrompt(state.intake) +
      "\n\nAlready suggested — do NOT repeat any of these: " + (have.join(", ") || "none") + ". Give 3 to 5 DIFFERENT real destinations.";
    AI.ask({ json: true, system: DEST_SYSTEM, prompt: prompt }).then(function (res) {
      stop();
      btn.disabled = false;
      if (!res || !res.ok) { UI.toast((res && res.error) || "Could not load more"); return; }
      var list = pickArray(res.data, ["destinations", "list"]);
      var haveLower = have.map(function (x) { return x.toLowerCase(); });
      var fresh = list.filter(function (d) { return d && d.name && haveLower.indexOf(d.name.toLowerCase()) === -1; });
      if (!fresh.length) { UI.toast("No new destinations came back"); return; }
      var startIdx = state.destinations.length;
      fresh.forEach(function (d, i) {
        state.destinations.push(d);
        if (state.destGrid) state.destGrid.appendChild(destCard(d, startIdx + i));
      });
    }).catch(function () {
      stop();
      btn.disabled = false;
      UI.toast("Something went wrong");
    });
  }

  function showError(container, msg) {
    var box = document.createElement("div");
    box.className = "tv-note tv-err";
    box.textContent = msg ? String(msg) : "Something went wrong.";
    container.appendChild(box);
  }

  // render the ranked destination cards
  function renderDestinations(results) {
    results.innerHTML = "";

    var section = document.createElement("div");
    section.className = "tv-section";
    var h = document.createElement("h3");
    h.className = "tv-section-title";
    h.textContent = "Where to go";
    section.appendChild(h);

    var grid = document.createElement("div");
    grid.className = "tv-cards";
    section.appendChild(grid);

    state.destGrid = grid;
    state.destinations.forEach(function (d, idx) {
      grid.appendChild(destCard(d, idx));
    });

    var moreRow = document.createElement("div");
    moreRow.className = "tv-more-row";
    var moreBtn = document.createElement("button");
    moreBtn.type = "button";
    moreBtn.className = "tv-btn tv-ghost";
    moreBtn.innerHTML = "More destinations " + svgArrow();
    moreBtn.addEventListener("click", function () { moreDestinations(moreBtn); });
    moreRow.appendChild(moreBtn);
    section.appendChild(moreRow);

    results.appendChild(section);

    var stays = document.createElement("div");
    stays.className = "tv-stays";
    results.appendChild(stays);
    state.staysEl = stays;
  }

  function destCard(d, idx) {
    var card = document.createElement("div");
    card.className = "tv-card tv-dest";

    var name = d.name || "Destination " + (idx + 1);
    var sub = d.country ? UI.escape(d.country) : "";
    var why = d.why ? UI.escape(d.why) : "";
    var fit = d.fit ? UI.escape(d.fit) : "";
    var timing = d.timing ? UI.escape(d.timing) : "";
    var access = d.access ? UI.escape(d.access) : "";
    var whenLabel = (state.intake && state.intake.dates) ? "Your dates:" : "Best time:";

    card.innerHTML =
      '<div class="tv-rank">' + (idx + 1) + '</div>' +
      '<div class="tv-card-body">' +
        '<div class="tv-card-title"><span class="tv-loc">' + svgPin() + '</span>' +
          '<strong>' + UI.escape(name) + '</strong>' +
          (sub ? '<span class="tv-muted">' + sub + '</span>' : '') +
        '</div>' +
        (why ? '<p class="tv-why">' + why + '</p>' : '') +
        (fit ? '<p class="tv-fit">' + fit + '</p>' : '') +
        (timing ? '<p class="tv-fit"><strong>' + whenLabel + '</strong> ' + timing + '</p>' : '') +
        (access ? '<p class="tv-fit"><strong>Getting there:</strong> ' + access + '</p>' : '') +
      '</div>';

    var actions = document.createElement("div");
    actions.className = "tv-card-actions";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tv-btn tv-ghost";
    btn.innerHTML = "Find stays " + svgArrow();
    btn.addEventListener("click", function () {
      state.chosen = d;
      searchStays(d, card);
    });
    actions.appendChild(btn);
    card.appendChild(actions);

    return card;
  }

  // second ai call — matching stays for the chosen destination
  function searchStays(dest, fromCard) {
    var stays = state.staysEl;
    stays.innerHTML = "";

    document.querySelectorAll(".tv-dest").forEach(function (c) {
      c.classList.remove("picked");
    });
    fromCard.classList.add("picked");

    if (!AI.ready()) {
      stays.appendChild(readyNote());
      return;
    }

    var head = document.createElement("h3");
    head.className = "tv-section-title";
    head.textContent = "Stays in " + (dest.name || "your pick");
    stays.appendChild(head);

    var holder = document.createElement("div");
    stays.appendChild(holder);
    var stop = UI.spinner(holder);

    AI.ask({
      json: true,
      system: "You are a sharp travel scout. Be concise. Suggest real, well-regarded places to stay.",
      prompt: staysPrompt(state.intake, dest)
    }).then(function (res) {
      stop();
      if (!res || !res.ok) {
        showError(holder, res && res.error);
        return;
      }
      var list = pickArray(res.data, ["stays", "hotels", "list"]);
      if (!list.length) {
        showError(holder, "No stays came back for this one.");
        return;
      }
      renderStays(holder, dest, list.slice(0, 5));
      holder.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }).catch(function () {
      stop();
      showError(holder, "Something went wrong reaching the model.");
    });
  }

  function renderStays(holder, dest, list) {
    holder.innerHTML = "";
    var grid = document.createElement("div");
    grid.className = "tv-cards";
    list.forEach(function (s) {
      grid.appendChild(stayCard(s, dest));
    });
    holder.appendChild(grid);
  }

  function stayCard(s, dest) {
    var card = document.createElement("div");
    card.className = "tv-card tv-stay";

    var name = s.name || "Stay";
    var type = s.type ? UI.escape(String(s.type)) : "";
    var price = s.price ? UI.escape(String(s.price)) : "";
    var pitch = s.pitch ? UI.escape(s.pitch) : "";
    var capacity = s.capacity ? UI.escape(s.capacity) : "";
    var why = s.why ? UI.escape(s.why) : "";

    card.innerHTML =
      '<div class="tv-card-body">' +
        '<div class="tv-stay-top">' +
          '<strong>' + UI.escape(name) + '</strong>' +
          (price ? '<span class="tv-price">' + price + '</span>' : '') +
        '</div>' +
        '<div class="tv-tags">' +
          (type ? '<span class="tv-tag">' + type + '</span>' : '') +
          (capacity ? '<span class="tv-tag tv-cap">' + capacity + '</span>' : '') +
        '</div>' +
        (pitch ? '<p class="tv-why">' + pitch + '</p>' : '') +
        (why ? '<p class="tv-fit">' + why + '</p>' : '') +
      '</div>';

    var body = card.querySelector(".tv-card-body");

    // ask-more expansion — short deeper detail, loaded once
    UI.answer(body, "", function (appendEl) {
      var stop = UI.spinner(appendEl);
      AI.ask({
        system: "You are a concise travel scout.",
        prompt: "Give 3 to 4 very short bullet lines about " + name +
          " in " + (dest.name || "") + " — amenities, vibe, who it suits. No preamble."
      }).then(function (res) {
        stop();
        if (res && res.ok && res.text) {
          var p = document.createElement("div");
          p.className = "tv-more";
          p.textContent = res.text;
          appendEl.appendChild(p);
        } else {
          showError(appendEl, res && res.error);
        }
      }).catch(function () {
        stop();
        showError(appendEl, "Could not load more.");
      });
    });

    var actions = document.createElement("div");
    actions.className = "tv-card-actions";
    var save = document.createElement("button");
    save.type = "button";
    save.className = "tv-btn tv-ghost";
    save.innerHTML = svgBookmark() + " Save";
    save.addEventListener("click", function () {
      saveStay(s, dest, save);
    });
    actions.appendChild(save);
    card.appendChild(actions);

    return card;
  }

  // persist a stay+destination so explore/plan/compare can use it
  function saveStay(s, dest, btn) {
    try {
      TStore.places.add({
        name: s.name || "Stay",
        type: s.type || "",
        pitch: s.pitch || "",
        price: s.price || "",
        capacity: s.capacity || "",
        why: s.why || "",
        destination: dest.name || "",
        country: dest.country || "",
        savedAt: Date.now()
      });
      btn.classList.add("saved");
      btn.innerHTML = svgBookmark() + " Saved";
      btn.disabled = true;
      if (window.UI && UI.toast) UI.toast("Saved to your places");
    } catch (err) {
      if (window.UI && UI.toast) UI.toast("Could not save");
    }
  }

  function onShow() {
    // nothing to refresh — form state lives in the panel
  }

  // register at parse time
  window.App.registerTab("travel", {
    label: "Travel",
    icon: (window.Icons && Icons.plane) ? Icons.plane() : "",
    render: render,
    onShow: onShow
  });
})();
