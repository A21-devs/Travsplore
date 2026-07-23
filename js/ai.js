// this is the provider-agnostic wrapper the tabs call
(function () {
  "use strict";

  // keep answers short by default — long detail lives behind Ask more
  var DEFAULT_SYSTEM =
    "You are Travsplore, a concise travel assistant. Answer in a few short lines, " +
    "no preamble, no filler, no restating the question. Give the direct answer only. " +
    "Expand into detail only when the user explicitly asks for more.";

  function hasApi() {
    return !!(window.api && typeof window.api.generate === "function");
  }

  // this pulls the first balanced {...} block out of loose model text
  function extractJson(text) {
    if (typeof text !== "string") return null;
    var start = text.indexOf("{");
    if (start === -1) return null;
    var depth = 0;
    var inStr = false;
    var esc = false;
    for (var i = start; i < text.length; i++) {
      var ch = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else {
        if (ch === '"') inStr = true;
        else if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) {
            var candidate = text.slice(start, i + 1);
            try {
              return JSON.parse(candidate);
            } catch (_) {
              return null;
            }
          }
        }
      }
    }
    return null;
  }

  var AI = {
    // a key is configured for the active provider and we are inside electron
    ready: function () {
      if (!hasApi()) return false;
      if (!window.TStore || typeof window.TStore.activeProvider !== "function") return false;
      return !!window.TStore.activeProvider();
    },

    ask: function (opts) {
      var o = opts || {};
      if (!hasApi()) {
        return Promise.resolve({ ok: false, error: "not running in the app" });
      }
      if (!window.TStore || typeof window.TStore.activeProvider !== "function") {
        return Promise.resolve({ ok: false, error: "store unavailable" });
      }
      var active = window.TStore.activeProvider();
      if (!active) {
        return Promise.resolve({ ok: false, error: "add an API key in Configure" });
      }

      var json = !!o.json;
      var system = o.system || DEFAULT_SYSTEM;
      var prompt = o.prompt || "";

      // steer every provider to raw json through the prompt. anthropic has no
      // json flag, and openai's json_object mode rejects the request unless the
      // word "json" shows up in the messages, so this keeps all three working.
      if (json) {
        prompt = prompt + "\n\nReply with only a single valid JSON object. No prose, no code fences.";
      }

      var keys = (active.keys && active.keys.length) ? active.keys : [active.apiKey];

      function finish(res) {
        var text = res.text || "";
        if (!json) return { ok: true, text: text };
        var data = null;
        try { data = JSON.parse(text); } catch (_) { data = extractJson(text); }
        if (data == null) return { ok: false, error: "could not parse a JSON answer", text: text };
        return { ok: true, data: data, text: text };
      }

      // try each key in turn — on a rate limit (or a dead key) fall over to the next
      function attempt(i, lastErr, sawLimit) {
        if (i >= keys.length) {
          return {
            ok: false,
            error: sawLimit
              ? "Every key for this provider is rate-limited right now — add another key, or wait a minute."
              : (lastErr || "request failed")
          };
        }
        return window.api.generate({
          provider: active.provider,
          apiKey: keys[i],
          model: active.model,
          system: system,
          prompt: prompt,
          json: json
        }).then(function (res) {
          if (res && res.ok) return finish(res);
          return attempt(i + 1, (res && res.error) || lastErr, sawLimit || !!(res && res.rateLimited));
        });
      }

      return Promise.resolve(attempt(0, "", false)).catch(function (err) {
        return { ok: false, error: (err && err.message) || "unexpected error" };
      });
    }
  };

  window.AI = AI;
})();
