/* Rome Dream Home — Welcome Book engine (shared by every apartment).
 * Renders the page from window.RDH_DATA (inlined by tools/build.py) or ./data.json. */
(function () {
  "use strict";
  var UI = window.RDH_UI || {};
  var LANGS = window.RDH_LANGS || [{ code: "en", name: "English", short: "EN" }];
  var ICONS = window.RDH_ICONS || {};
  var STORE = "rdh-lang";
  var ROMAN = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII","XIII","XIV","XV","XVI","XVII","XVIII","XIX","XX"];
  var D = null;
  var state = { lang: "en", open: null };
  var root = document.documentElement;
  var ASSETS = (document.querySelector('meta[name="rdh-assets"]') || {}).content || "../assets/";
  var VERSION = (document.querySelector('meta[name="rdh-version"]') || {}).content || "";
  /* Install prompt (Android/Chrome): keep the event for our own "Save to phone" button. */
  var installEvt = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); installEvt = e; });

  /* ---------- helpers ---------- */
  function isLang(c) { return LANGS.some(function (l) { return l.code === c; }); }
  function langInfo(c) { return LANGS.filter(function (l) { return l.code === c; })[0] || LANGS[0]; }
  function tx(v) { if (v == null) return ""; if (typeof v === "string") return v; return v[state.lang] || v.en || ""; }
  function t(key, vars) {
    var s = tx(UI[key]) || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split("{" + k + "}").join(vars[k]); });
    return s;
  }
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "class") el.className = v;
      else if (k === "text") { if (String(v).indexOf("**") > -1) el.appendChild(rich(v)); else el.textContent = v; }
      else if (k === "html") el.innerHTML = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    });
    (Array.isArray(kids) ? kids : kids != null ? [kids] : []).forEach(function (c) {
      if (c == null || c === false) return;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return el;
  }
  /* Inline emphasis: **bold** in content strings -> <strong>. Text nodes only, so content stays escaped. */
  function rich(str) {
    var frag = document.createDocumentFragment();
    String(str).split(/\*\*(.+?)\*\*/).forEach(function (part, i) {
      if (!part) return;
      if (i % 2) { var b = document.createElement("strong"); b.textContent = part; frag.appendChild(b); }
      else frag.appendChild(document.createTextNode(part));
    });
    return frag;
  }
  function plain(str) { return String(str || "").replace(/\*\*/g, ""); }
  function icon(name, cls) {
    var s = h("span", { class: "ico " + (cls || ""), "aria-hidden": "true" });
    s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || ICONS.info || "") + "</svg>";
    return s;
  }
  function ltr(str) { return h("bdi", { class: "ltr", dir: "ltr" }, str); }
  function mapsUrl(q) { return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q); }
  function dirUrl(dest, origin, mode) {
    return "https://www.google.com/maps/dir/?api=1" + (origin ? "&origin=" + encodeURIComponent(origin) : "") +
      "&destination=" + encodeURIComponent(dest) + "&travelmode=" + (mode || "transit");
  }
  function waUrl(msg) { return "https://wa.me/" + D.host.whatsapp + (msg ? "?text=" + encodeURIComponent(msg) : ""); }
  function telUrl(n) { return "tel:" + String(n).replace(/[^\d+]/g, ""); }
  function webUrl(w) { return /^https?:/.test(w) ? w : "https://" + w; }
  function fullAddress() { return D.address.line1 + (state.lang === "ar" ? "، " : ", ") + tx(D.address.line2); }
  function addrNode(prefix) { return h("span", null, [prefix || null, h("bdi", { text: D.address.line1 }), state.lang === "ar" ? "، " : ", ", h("bdi", { text: tx(D.address.line2) })]); }
  function ext(a) { a.target = "_blank"; a.rel = "noopener noreferrer"; return a; }
  function btn(label, iconName, href, opts) {
    opts = opts || {};
    var el = h(href ? "a" : "button", { class: "btn " + (opts.cls || ""), href: href || null, type: href ? null : "button", "aria-label": opts.aria || null, onclick: opts.onclick || null },
      [icon(iconName), h("span", { text: label })]);
    if (href && /^https?:/.test(href)) ext(el);
    return el;
  }
  function srcset(base) { return base + "-sm.webp 640w, " + base + ".webp 1400w"; }

  /* ---------- toast + clipboard ---------- */
  var toastTimer;
  function toast(msg, cls) {
    var el = document.getElementById("toast");
    el.textContent = msg; el.className = "toast show" + (cls ? " " + cls : "");
    document.getElementById("live").textContent = msg;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.classList.remove("show"); }, 1900);
  }
  function copy(value, what, el) {
    function done() {
      toast(what ? t("copiedWhat", { what: what }) : t("copied"));
      if (el) { el.classList.add("is-copied"); setTimeout(function () { el.classList.remove("is-copied"); }, 1600); }
      if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) {}
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(value).then(done, fallback); else fallback();
    function fallback() {
      var ta = h("textarea", { readonly: true, style: "position:fixed;opacity:0;top:0" }); ta.value = value;
      document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove(); done();
    }
  }
  function copyBtn(value, what, label) {
    var b = h("button", { type: "button", class: "copy", "aria-label": t("copy") + " " + what },
      [icon("copy", "i-copy"), icon("check", "i-check"), h("span", { text: label || t("copy") })]);
    b.addEventListener("click", function () { copy(value, what, b); });
    return b;
  }

  /* ---------- language switch ---------- */
  function closeMenus(except) {
    document.querySelectorAll(".lang-menu").forEach(function (m) {
      if (m === except) return; m.hidden = true;
      var tg = m.parentNode.querySelector(".lang-toggle"); if (tg) tg.setAttribute("aria-expanded", "false");
    });
  }
  function buildLang(container) {
    container.innerHTML = "";
    var id = container.id + "-menu";
    var cur = langInfo(state.lang);
    var tog = h("button", { type: "button", class: "lang-toggle", "aria-haspopup": "listbox", "aria-expanded": "false", "aria-controls": id, "aria-label": t("language") + ": " + cur.name },
      [icon("globe"), h("span", { class: "lang-code", text: cur.short }), h("span", { class: "lang-name", text: cur.name }), icon("chevD", "caret")]);
    var menu = h("ul", { class: "lang-menu", id: id, role: "listbox", "aria-label": t("language") });
    menu.hidden = true;
    LANGS.forEach(function (l) {
      var o = h("button", { type: "button", class: "lang-opt", role: "option", lang: l.code, dir: l.dir || "ltr", "aria-selected": l.code === state.lang ? "true" : "false" },
        [h("span", { class: "lang-code", text: l.short }), h("span", { text: l.name }), l.code === state.lang ? icon("check", "tick") : null]);
      o.addEventListener("click", function () { setLang(l.code); closeMenus(); var nt = document.querySelector("#" + container.id + " .lang-toggle"); if (nt) nt.focus(); });
      o.addEventListener("keydown", function (e) {
        var all = [].slice.call(menu.querySelectorAll(".lang-opt")), i = all.indexOf(o);
        if (e.key === "ArrowDown") { e.preventDefault(); all[(i + 1) % all.length].focus(); }
        if (e.key === "ArrowUp") { e.preventDefault(); all[(i - 1 + all.length) % all.length].focus(); }
      });
      menu.appendChild(h("li", null, o));
    });
    tog.addEventListener("click", function (e) {
      e.stopPropagation();
      var opening = menu.hidden; closeMenus(); menu.hidden = !opening; tog.setAttribute("aria-expanded", opening ? "true" : "false");
      if (opening) (menu.querySelector('[aria-selected="true"]') || menu.querySelector("button")).focus();
    });
    container.appendChild(tog); container.appendChild(menu);
  }
  function loadArabicFont() {
    if (document.getElementById("font-ar")) return;
    document.head.appendChild(h("link", { id: "font-ar", rel: "stylesheet", href: ASSETS + "fonts/fonts-ar.css" + (VERSION ? "?v=" + VERSION : "") }));
  }
  function applyLang() {
    var info = langInfo(state.lang);
    root.lang = state.lang; root.dir = info.dir || "ltr"; root.dataset.lang = state.lang;
    if (state.lang === "ar") loadArabicFont();
  }
  function setLang(code) {
    if (!isLang(code)) return;
    state.lang = code;
    try { localStorage.setItem(STORE, code); } catch (e) {}
    applyLang(); renderAll(); if (state.open) renderSheet();
    if (document.getElementById("offline-badge")) offlineBadge();
    document.getElementById("live").textContent = langInfo(code).name;
  }
  function detectLang() {
    try { var s = localStorage.getItem(STORE); if (isLang(s)) return s; } catch (e) {}
    var list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "en"];
    for (var i = 0; i < list.length; i++) { var b = String(list[i]).toLowerCase().split("-")[0]; if (isLang(b)) return b; }
    return "en";
  }

  /* ---------- block renderers ---------- */
  var R = {};
  R.lead = function (b) { return h("p", { class: "lead", text: tx(b.text) }); };
  R.text = function (b) { return h("p", { class: "para", text: tx(b.text) }); };
  R.heading = function (b) {
    return h("div", { class: "block-head" }, [h("span", { class: "orn", "aria-hidden": "true" }), h("h3", { text: tx(b.text) }), b.sub ? h("p", { class: "sub", text: tx(b.sub) }) : null]);
  };
  R.signature = function (b) { return h("p", { class: "signature" }, [h("span", { class: "dash", "aria-hidden": "true" }), b.text]); };
  R.closing = function (b) { return h("p", { class: "closing" }, [icon("laurel", "laurel"), h("span", { text: tx(b.text) })]); };
  R.photo = function (b) {
    var idx = (D.photos || []).map(function (p) { return p.src; }).indexOf(b.src);
    var fig = h("figure", { class: "photo" }, [
      h("img", { src: b.src + "-sm.webp", srcset: srcset(b.src), sizes: "(min-width: 760px) 680px, 100vw", alt: tx(b.alt), loading: "lazy", decoding: "async" })
    ]);
    if (idx > -1) { fig.classList.add("zoomable"); fig.tabIndex = 0; fig.setAttribute("role", "button"); fig.setAttribute("aria-label", t("openPhoto"));
      fig.addEventListener("click", function () { openLightbox(idx); });
      fig.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openLightbox(idx); } });
    }
    return fig;
  };
  R.time = function (b) {
    return h("div", { class: "time-card" }, [h("span", { class: "time-label", text: tx(b.label) }), h("span", { class: "time-value" }, ltr(b.value)), h("span", { class: "time-rule", "aria-hidden": "true" })]);
  };
  R.steps = function (b) {
    return h("ol", { class: "steps" }, b.items.map(function (s, i) { return h("li", null, [h("span", { class: "step-n", "aria-hidden": "true", text: String(i + 1) }), h("p", { text: tx(s) })]); }));
  };
  R.arrival = function () {
    return h("div", { class: "actions center" }, [
      btn(t("arrived"), "whatsapp", waUrl(t("arrivedMsg", { address: D.address.line1 })), { cls: "btn-primary btn-wide" }),
      btn(t("callHost", { name: D.host.name }), "phone", telUrl(D.host.tel), { cls: "btn-ghost" })
    ]);
  };
  R.code = function (b) {
    var val = h("button", { type: "button", class: "code-value", "aria-label": t("copy") + " " + tx(b.label) + " " + b.value }, ltr(b.value.split("").join(" ")));
    val.addEventListener("click", function () { copy(b.value, tx(b.label), card); });
    var card = h("div", { class: "code-card" }, [
      h("div", { class: "code-top" }, [icon(b.icon || "lock"), h("span", { text: tx(b.label) })]), val,
      h("span", { class: "code-hint" }, [icon("copy", "i-copy"), icon("check", "i-check"), h("span", { text: t("tapToCopy") })])
    ]);
    return card;
  };
  R.notice = function (b) {
    return h("aside", { class: "notice tone-" + (b.tone || "info") }, [icon(b.icon || "info", "notice-ico"),
      h("div", null, [b.title ? h("strong", { text: tx(b.title) }) : null, h("p", { text: tx(b.text) })])]);
  };
  R.tax = function (b) {
    var rate = D.touristTax || 0, g = 2, n = 3;
    var out = h("output", { class: "tax-total" });
    function upd() { out.textContent = ""; out.appendChild(ltr("€ " + (g * n * rate).toFixed(2).replace(/\.00$/, ""))); gv.textContent = g; nv.textContent = n; }
    function stepper(label, get, set, min, max) {
      var v = h("span", { class: "stp-v", "aria-live": "polite" });
      var minus = h("button", { type: "button", class: "stp-b", "aria-label": t("decrease") + " " + label }, icon("minus"));
      var plus = h("button", { type: "button", class: "stp-b", "aria-label": t("increase") + " " + label }, icon("plus"));
      minus.onclick = function () { set(Math.max(min, get() - 1)); upd(); };
      plus.onclick = function () { set(Math.min(max, get() + 1)); upd(); };
      return { el: h("div", { class: "stp" }, [h("span", { class: "stp-l", text: label }), h("div", { class: "stp-c" }, [minus, v, plus])]), v: v };
    }
    var sg = stepper(t("guests"), function () { return g; }, function (x) { g = x; }, 1, 12), gv = sg.v;
    var sn = stepper(t("nights"), function () { return n; }, function (x) { n = x; }, 1, 30), nv = sn.v;
    var el = h("section", { class: "tax-card" }, [
      h("div", { class: "tax-head" }, [icon("euro"), h("p", { text: tx(b.text) })]),
      h("div", { class: "tax-calc" }, [h("h4", { text: t("taxTitle") }), h("p", { class: "tax-rate", text: t("perNight", { n: rate }) }),
        h("div", { class: "stp-row" }, [sg.el, sn.el]), h("div", { class: "tax-res" }, [h("span", { text: t("total") }), out])])
    ]);
    upd(); return el;
  };
  R.address = function () {
    var q = D.address.maps || fullAddress();
    return h("div", { class: "addr-card" }, [
      icon("pin", "addr-ico"),
      h("p", { class: "addr-lines" }, [h("strong", { text: D.address.line1 }), h("span", { text: tx(D.address.line2) })]),
      h("div", { class: "actions" }, [btn(t("openMaps"), "map", mapsUrl(q), { cls: "btn-primary" }), btn(t("directions"), "nav", dirUrl(q)), (function () { var c = copyBtn(fullAddress(), t("address"), t("copyAddress")); c.classList.add("btn"); return c; })()])
    ]);
  };
  R.tabs = function (b, sid) {
    var wrap = h("div", { class: "tabs" });
    var list = h("div", { class: "tablist", role: "tablist", "aria-label": tx(b.label) });
    var panels = [];
    b.tabs.forEach(function (tab, i) {
      var tid = sid + "-tab-" + i, pid = sid + "-panel-" + i;
      var tb = h("button", { type: "button", role: "tab", id: tid, "aria-controls": pid, "aria-selected": i === 0 ? "true" : "false", tabindex: i === 0 ? "0" : "-1", class: "tab" }, [icon("plane"), h("span", { text: tx(tab.label) })]);
      var panel = h("div", { role: "tabpanel", id: pid, "aria-labelledby": tid, class: "tabpanel", tabindex: "0" });
      if (i) panel.hidden = true;
      panel.appendChild(h("ul", { class: "routes" }, tab.routes.map(function (r) { return renderRoute(r, tab.origin); })));
      tb.addEventListener("click", function () { select(i); });
      tb.addEventListener("keydown", function (e) {
        var k = e.key, dir = root.dir === "rtl" ? -1 : 1;
        if (k === "ArrowRight" || k === "ArrowLeft") { e.preventDefault(); var j = (i + (k === "ArrowRight" ? dir : -dir) + b.tabs.length) % b.tabs.length; select(j); list.children[j].focus(); }
      });
      list.appendChild(tb); panels.push(panel);
    });
    function select(i) {
      [].forEach.call(list.children, function (c, j) { c.setAttribute("aria-selected", i === j ? "true" : "false"); c.tabIndex = i === j ? 0 : -1; });
      panels.forEach(function (p, j) { p.hidden = i !== j; });
      list.style.setProperty("--ix", i);
    }
    list.appendChild(h("span", { class: "tab-ink", "aria-hidden": "true" }));
    wrap.appendChild(list); panels.forEach(function (p) { wrap.appendChild(p); });
    return wrap;
  };
  function renderRoute(r, origin) {
    var dest = D.address.maps || fullAddress();
    var act = r.transfer
      ? btn(t("transferBtn"), "whatsapp", waUrl(t("transferMsg", { airport: r.transfer, address: fullAddress() })), { cls: "btn-primary" })
      : r.icon === "taxi" ? null : btn(t("directions"), "nav", dirUrl(dest, origin, "transit"));
    return h("li", { class: "route" + (r.transfer ? " route-premium" : "") }, [
      icon(r.icon, "route-ico"),
      h("div", { class: "route-body" }, [
        h("h4", { text: tx(r.title) }), h("p", { text: tx(r.text) }),
        r.price ? h("p", { class: "price" }, [icon("ticket"), h("span", { text: tx(r.price) })]) : null,
        r.warn ? h("p", { class: "warn" }, [icon("alert"), h("span", { text: tx(r.warn) })]) : null,
        act ? h("div", { class: "actions" }, act) : null
      ])
    ]);
  }
  R.wifi = function (b) {
    var w = D.wifi;
    function row(label, value, ico, big) {
      var v = h("button", { type: "button", class: "wifi-val" + (big ? " big" : ""), "aria-label": t("copy") + " " + label + ": " + value }, ltr(value));
      var r = h("div", { class: "wifi-row" }, [h("span", { class: "wifi-lbl" }, [icon(ico), label]), v,
        h("span", { class: "code-hint" }, [icon("copy", "i-copy"), icon("check", "i-check"), h("span", { text: t("tapToCopy") })])]);
      v.addEventListener("click", function () { copy(value, label, r); });
      return r;
    }
    var qr = null;
    if (b.qr) { qr = h("figure", { class: "wifi-qr" }); qr.innerHTML = b.qr; qr.appendChild(h("figcaption", { text: t("scanToConnect") })); }
    return h("div", { class: "wifi-card" }, [
      h("div", { class: "wifi-rows" }, [row(t("network"), w.ssid, "router"), row(t("password"), w.password, "lock", true)]),
      qr, h("p", { class: "hint", text: t("wifiHint") })
    ]);
  };
  /* ---------- share: always the clean guide URL (no #section) ---------- */
  function guideUrl() {
    var c = document.querySelector('link[rel="canonical"]');
    return (c && c.href) || (location.origin + location.pathname);
  }
  function shareGuide(el) {
    var url = guideUrl(), title = t("pageTitle", { name: D.name });
    if (navigator.share) { navigator.share({ title: title, url: url }).catch(function () {}); return; }
    copy(url, t("shareLink"), el);
  }
  function shareBtn(cls, withLabel) {
    var b = h("button", { type: "button", class: cls, "aria-label": t("shareGuide"), title: t("shareGuide") }, [icon("share"), withLabel ? h("span", { text: t("shareGuide") }) : null]);
    b.addEventListener("click", function () { shareGuide(b); });
    return b;
  }
  /* ---------- Rome photos (freely licensed, credited) ---------- */
  function photoArch(ph, name, cls) {
    if (!ph) return null;
    var base = ph.own ? ph.src : ASSETS + ph.src, c = ph.credit || {};
    var alt = ph.own ? name : ph.area ? t("areaAlt", { place: ph.place, name: name }) : (ph.place || name);
    var kids = [h("img", { src: base + "-sm.webp", srcset: base + "-sm.webp 640w, " + base + ".webp 1200w",
      sizes: "(min-width: 820px) 560px, 92vw", width: "640", height: "427", loading: "lazy", decoding: "async", alt: alt,
      style: ph.pos && /^[\d.% a-z]+$/.test(ph.pos) ? "object-position:" + ph.pos : null })];
    if (ph.area) kids.push(h("span", { class: "ph-tag" }, [icon("pin"), h("span", { text: t("areaPhoto") + " · " }), h("bdi", { text: ph.place })]));
    if (!ph.own && c.source) kids.push(h("figcaption", { class: "ph-cr" }, ext(h("a", { href: c.source, title: c.title, dir: "ltr" },
      "© " + c.author + " · " + c.license))));
    return h("figure", { class: "ph-arch " + (cls || "") + (ph.area ? " is-area" : "") }, kids);
  }
  function collectPhotos() {
    var seen = {}, out = [];
    (D.sections || []).forEach(function (s) { (s.blocks || []).forEach(function (b) { (b.items || []).forEach(function (it) {
      var p = it.photo; if (p && p.credit && !seen[p.src]) { seen[p.src] = 1; out.push(p); }
    }); }); });
    return out;
  }
  R.list = function (b) {
    return h("ul", { class: "ilist" + (b.grid ? " grid2" : "") }, b.items.map(function (it) {
      return h("li", { class: it.photo ? "has-ph" : null }, [it.photo ? photoArch(it.photo, tx(it.title), "ph-sm") : null, icon(it.icon, "il-ico"), h("div", null, [
        h("h4", { text: tx(it.title) }), it.text ? h("p", { text: tx(it.text) }) : null,
        it.maps ? h("a", { class: "link", href: mapsUrl(it.maps), target: "_blank", rel: "noopener noreferrer" }, [icon("map"), h("span", { text: t("openMaps") })]) : null
      ])]);
    }));
  };
  R.rules = function (b) {
    return h("ol", { class: "rules" }, b.items.map(function (it, i) {
      return h("li", null, [h("span", { class: "rn", "aria-hidden": "true", text: ROMAN[i] }), icon(it.icon, "r-ico"), h("p", { text: tx(it.text) })]);
    }));
  };
  R.amenities = function (b) {
    return h("ul", { class: "amen" }, b.items.map(function (it) {
      return h("li", null, [icon(it.icon), h("span", { text: tx(it.label) }), it.note ? h("small", { text: it.note }) : null]);
    }));
  };
  R.features = function (b) {
    return h("div", { class: "features" }, b.items.map(function (it) {
      var dest = it.maps;
      return h("article", { class: "feature" + (it.photo ? " has-ph" : "") }, [it.photo ? photoArch(it.photo, tx(it.title), "ph-lg") : null, h("div", { class: "f-arch" }, icon(it.icon)), h("h4", { text: tx(it.title) }), h("p", { text: tx(it.text) }),
        h("div", { class: "actions center" }, [btn(t("openMaps"), "map", mapsUrl(dest)), btn(t("walkThere"), "walk", dirUrl(dest, D.address.maps, "walking"))])]);
    }));
  };
  R.places = function (b) {
    return h("ul", { class: "places" }, b.items.map(function (p) {
      var name = tx(p.name), q = p.maps || (name + ", " + p.address);
      var actions = [btn(t("mapShort"), "map", mapsUrl(q), { aria: t("openMaps") + ": " + name })];
      if (p.phone) actions.push(btn(t("call"), "phone", telUrl(p.phone), { aria: t("call") + " " + name }));
      if (p.web) actions.push(btn(t("website"), "globe", webUrl(p.web), { aria: t("website") + ": " + name }));
      return h("li", { class: "place" + (p.photo ? " has-ph" : "") }, [
        photoArch(p.photo, name, "ph-pl"),
        h("div", { class: "pl-head" }, [icon(p.icon || "pin", "pl-ico"), h("div", null, [h("h4", { text: name }), p.area ? h("p", { class: "area", text: tx(p.area) }) : null])]),
        p.text ? h("p", { class: "pl-text", text: tx(p.text) }) : null,
        h("ul", { class: "meta" }, [
          h("li", null, [icon("pin"), h("span", { text: p.address })]),
          p.walk ? h("li", null, [icon("walk"), h("span", { text: tx(p.walk) })]) : null,
          p.hours ? h("li", null, [icon("clock"), h("span", { text: tx(p.hours) })]) : null,
          p.phone ? h("li", null, [icon("phone"), ltr(p.phone)]) : null,
          p.web ? h("li", null, [icon("globe"), h("span", { text: p.web })]) : null
        ]),
        h("div", { class: "actions" }, actions)
      ]);
    }));
  };
  R.dial = function (b) {
    return h("div", { class: "dial" }, b.items.map(function (d) {
      return h("a", { class: "dial-btn", href: "tel:" + d.number, "aria-label": t("emergencyCall", { n: d.number }) + " – " + tx(d.label) },
        [icon(d.icon), h("span", { class: "dial-n", text: d.number }), h("span", { class: "dial-l", text: tx(d.label) })]);
    }));
  };
  R.hostActions = function () {
    return h("div", { class: "actions center" }, [btn(t("call"), "phone", telUrl(D.host.tel), { cls: "btn-primary" }), btn(t("whatsapp"), "whatsapp", waUrl()), btn(t("email"), "mail", "mailto:" + D.host.email)]);
  };
  R.checklist = function (b, sid) {
    var key = "rdh-" + D.slug + "-checkout";
    var saved = {}; try { saved = JSON.parse(localStorage.getItem(key) || "{}"); } catch (e) {}
    var prog = h("p", { class: "cl-prog", "aria-live": "polite" });
    var bar = h("span", { class: "cl-bar" }, h("span"));
    var done = h("p", { class: "cl-done" }, [icon("sparkles"), h("span", { text: t("checklistDone") })]);
    var items = b.items.map(function (it, i) {
      var id = sid + "-c" + i;
      var cb = h("input", { type: "checkbox", id: id });
      cb.checked = !!saved[i];
      cb.addEventListener("change", function () { saved[i] = cb.checked; try { localStorage.setItem(key, JSON.stringify(saved)); } catch (e) {} upd(); });
      return h("li", null, h("label", { for: id, class: "cl-item" }, [cb, h("span", { class: "cl-box", "aria-hidden": "true" }, icon("check")), icon(it.icon, "cl-ico"),
        h("span", { class: "cl-txt" }, [h("strong", { text: tx(it.title) }), h("span", { text: tx(it.text) })])]));
    });
    var reset = h("button", { type: "button", class: "link", text: t("reset") });
    reset.onclick = function () { saved = {}; try { localStorage.removeItem(key); } catch (e) {} list.querySelectorAll("input").forEach(function (c) { c.checked = false; }); upd(); };
    var list = h("ul", { class: "cl-list" }, items);
    function upd() {
      var n = b.items.length, d = list.querySelectorAll("input:checked").length;
      prog.textContent = t("checklistProgress", { d: d, n: n });
      bar.firstChild.style.width = (d / n * 100) + "%";
      wrap.classList.toggle("all-done", d === n);
    }
    var wrap = h("section", { class: "checklist" }, [h("div", { class: "cl-head" }, [h("h4", { text: tx(b.title) }), reset]), bar, prog, list, done]);
    upd(); return wrap;
  };
  R.host = function (b) {
    var H = D.host;
    function link(ico, label, value, href, copyVal) {
      var a = h("a", { class: "c-link", href: href }, [icon(ico), h("span", { class: "c-txt" }, [h("small", { text: label }), ltr(value)])]);
      if (/^https?:/.test(href)) ext(a);
      var row = h("li", null, [a]);
      if (copyVal) row.appendChild(copyBtn(copyVal, label));
      return row;
    }
    return h("section", { class: "host-card" }, [
      h("div", { class: "host-top" }, [
        H.photo ? h("img", { class: "host-photo", src: H.photo, alt: H.name, width: "120", height: "120", loading: "lazy" }) : icon("users", "host-photo"),
        h("div", null, [h("p", { class: "eyebrow", text: t("hostTitle") }), h("h4", { class: "host-name", text: H.name })])
      ]),
      h("p", { class: "host-text", text: tx(b.text) }),
      h("ul", { class: "c-links" }, [
        link("phone", t("call"), H.phone, telUrl(H.tel), H.tel),
        link("whatsapp", t("whatsapp"), H.whatsappLabel || H.phone, waUrl()),
        link("mail", t("email"), H.email, "mailto:" + H.email, H.email),
        link("globe", t("website"), H.websiteLabel, H.website),
        link("instagram", t("instagram"), "@" + H.instagram, "https://www.instagram.com/" + H.instagram + "/")
      ])
    ]);
  };
  R.review = function (b) {
    var stars = h("div", { class: "stars", "aria-hidden": "true" });
    for (var i = 0; i < 5; i++) stars.appendChild(icon("star"));
    return h("section", { class: "review" }, [stars, h("h4", { text: t("reviewTitle") }), h("p", { text: tx(b.text) })]);
  };

  /* ---------- home ---------- */
  function renderHero() {
    document.getElementById("hero-eyebrow").textContent = t("welcomeBook");
    document.getElementById("hero-name").textContent = D.name;
    var a = document.getElementById("hero-address");
    a.href = mapsUrl(D.address.maps || fullAddress()); ext(a);
    a.innerHTML = ""; a.appendChild(icon("pin")); a.appendChild(addrNode());
    var times = document.getElementById("hero-times");
    times.innerHTML = "";
    times.appendChild(h("div", { class: "ht" }, [h("span", { text: t("checkin") }), h("strong", null, ltr(D.checkin))]));
    times.appendChild(h("span", { class: "ht-sep", "aria-hidden": "true" }));
    times.appendChild(h("div", { class: "ht" }, [h("span", { text: t("checkout") }), h("strong", null, ltr(D.checkout))]));
    var old = document.getElementById("save-app"); if (old) old.remove();
    var sb = saveBtn("save-app"); sb.id = "save-app"; times.parentNode.insertBefore(sb, times.nextSibling);
  }
  function renderQuick() {
    var q = document.getElementById("quick");
    q.innerHTML = "";
    q.appendChild(h("h2", { class: "sr", text: t("quickAccess") }));
    var wifi = h("button", { type: "button", class: "q q-copy" }, [icon("wifi", "q-ico"), h("span", { class: "q-l", text: t("quickWifi") }), h("span", { class: "q-v" }, ltr(D.wifi.password)), h("span", { class: "q-h" }, [icon("copy", "i-copy"), icon("check", "i-check"), h("span", { text: t("tapToCopy") })])]);
    wifi.onclick = function () { copy(D.wifi.password, t("quickWifi"), wifi); };
    var codeShown = false;
    var codeV = h("span", { class: "q-v masked" }, ltr("• • • •"));
    var code = h("button", { type: "button", class: "q q-copy" }, [icon("lock", "q-ico"), h("span", { class: "q-l", text: t("quickCode") }), codeV, h("span", { class: "q-h" }, [icon("copy", "i-copy"), icon("check", "i-check"), h("span", { class: "q-hint", text: t("tapToReveal") })])]);
    code.onclick = function () {
      if (!codeShown) { codeShown = true; codeV.innerHTML = ""; codeV.appendChild(ltr(D.lockboxCode)); codeV.classList.remove("masked"); code.querySelector(".q-hint").textContent = t("tapToCopy"); return; }
      copy(D.lockboxCode, t("quickCode"), code);
    };
    var call = h("a", { class: "q", href: telUrl(D.host.tel) }, [icon("phone", "q-ico"), h("span", { class: "q-l", text: t("callHost", { name: D.host.name }) }), h("span", { class: "q-v small" }, ltr(D.host.phone))]);
    var wa = h("a", { class: "q", href: waUrl() }, [icon("whatsapp", "q-ico"), h("span", { class: "q-l", text: t("chatHost") }), h("span", { class: "q-v small", text: "WhatsApp" })]);
    ext(wa);
    [wifi, code, call, wa].forEach(function (x) { q.appendChild(x); });
  }
  function renderGallery() {
    var g = document.getElementById("gallery");
    if (!D.photos || !D.photos.length) { g.hidden = true; return; }
    g.innerHTML = "";
    g.appendChild(h("div", { class: "sec-head" }, [h("span", { class: "orn", "aria-hidden": "true" }), h("h2", { text: t("photos") })]));
    var track = h("div", { class: "g-track" });
    D.photos.forEach(function (p, i) {
      var b = h("button", { type: "button", class: "g-item", "aria-label": t("openPhoto") + " – " + tx(p.alt) }, h("img", { src: p.src + "-sm.webp", alt: tx(p.alt), loading: i < 2 ? "eager" : "lazy", decoding: "async", width: "640", height: "426" }));
      b.onclick = function () { openLightbox(i); };
      track.appendChild(b);
    });
    g.appendChild(track);
  }
  function renderGrid() {
    var wrap = document.getElementById("sections");
    wrap.innerHTML = "";
    wrap.appendChild(h("div", { class: "sec-head" }, [h("span", { class: "orn", "aria-hidden": "true" }), h("h2", { text: t("guide") }), h("p", { text: t("tapHint") })]));
    var ul = h("ul", { class: "grid" });
    D.sections.forEach(function (s, i) {
      var b = h("button", { type: "button", class: "tile", "data-section": s.id, "aria-haspopup": "dialog", "aria-controls": "sheet", style: "--d:" + (i * 35) + "ms" }, [
        h("span", { class: "tile-arch" }, icon(s.icon, "tile-ico")),
        h("span", { class: "tile-label", text: tx(s.title) }),
        h("span", { class: "tile-num", "aria-hidden": "true", text: ROMAN[i] })
      ]);
      b.onclick = function () { openSection(s.id); };
      ul.appendChild(h("li", null, b));
    });
    wrap.appendChild(ul);
  }
  function renderFooter() {
    var f = document.getElementById("footer-body");
    f.innerHTML = "";
    var H = D.host;
    f.appendChild(h("p", { class: "f-tag", text: t("footerTag") }));
    f.appendChild(h("div", { class: "f-links" }, [
      h("a", { href: telUrl(H.tel), "aria-label": t("call") }, icon("phone")),
      ext(h("a", { href: waUrl(), "aria-label": "WhatsApp" }, icon("whatsapp"))),
      h("a", { href: "mailto:" + H.email, "aria-label": t("email") }, icon("mail")),
      ext(h("a", { href: H.website, "aria-label": t("website") }, icon("globe"))),
      ext(h("a", { href: "https://www.instagram.com/" + H.instagram + "/", "aria-label": "Instagram" }, icon("instagram")))
    ]));
    var fs = h("div", { class: "f-acts" }, [shareBtn("f-share", true)]);
    fs.appendChild(saveBtn("f-share f-save", true)); f.appendChild(fs);
    f.appendChild(ext(h("a", { class: "f-addr", href: mapsUrl(D.address.maps || fullAddress()) }, [icon("pin"), addrNode(D.name + " · ")])));
    if (D.music) {
      var parts = t("musicCredit").split("{license}");
      f.appendChild(h("p", { class: "f-credit" }, [parts[0], ext(h("a", { href: "https://creativecommons.org/licenses/by/4.0/", text: "CC BY 4.0" })), parts[1] || ""]));
    }
    var phs = collectPhotos();
    if (phs.length) {
      f.appendChild(h("details", { class: "f-photos" }, [
        h("summary", null, [icon("camera"), h("span", { text: t("photoCredits") + " (" + phs.length + ")" })]),
        h("p", { class: "fp-intro", text: t("photoCreditsIntro") }),
        h("ul", null, phs.map(function (p) {
          var c = p.credit;
          return h("li", { dir: "ltr" }, [h("strong", { text: p.place }), " — ", ext(h("a", { href: c.source, text: c.title.replace(/^File:/, "") })),
            " · " + c.author + " · ", ext(h("a", { href: c.licenseUrl, text: c.license })), " · Wikimedia Commons"]);
        }))
      ]));
    }
    f.appendChild(h("p", { class: "f-copy", text: "© " + new Date().getFullYear() + " Rome Dream Home · " + t("rights") }));
  }
  function renderChrome() {
    document.title = t("pageTitle", { name: D.name });
    var md = document.querySelector('meta[name="description"]'); if (md) md.content = t("metaDescription", { name: D.name, address: fullAddress() });
    document.getElementById("skip").textContent = t("skip");
    document.getElementById("to-top").setAttribute("aria-label", t("toTop"));
    var hb = document.querySelector(".hero-bar"), old = document.getElementById("share-top");
    if (old) old.remove();
    if (hb) { var sb = shareBtn("music share-top", false); sb.id = "share-top"; var right = document.getElementById("hb-right");
      if (!right) { right = h("div", { id: "hb-right", class: "hb-right" }); hb.appendChild(right); var mu = document.getElementById("music"); if (mu) right.appendChild(mu); }
      right.insertBefore(sb, right.firstChild); }
    var m = document.getElementById("music"); if (m) { m.setAttribute("aria-label", t("music")); m.title = t("music"); m.hidden = !D.music; }
    document.getElementById("sheet-back-label").textContent = t("back");
    document.getElementById("lb-close").setAttribute("aria-label", t("close"));
    document.getElementById("lb-prev").setAttribute("aria-label", t("prev"));
    document.getElementById("lb-next").setAttribute("aria-label", t("next"));
    buildLang(document.getElementById("lang-home"));
    buildLang(document.getElementById("lang-sheet"));
  }
  function renderAll() {
    renderChrome(); renderHero(); renderQuick(); renderGallery(); renderGrid(); renderFooter(); observeReveal();
  }

  /* ---------- sheet (section dialog) ---------- */
  function sectionIndex(id) { for (var i = 0; i < D.sections.length; i++) if (D.sections[i].id === id) return i; return -1; }
  function renderSheet() {
    var i = sectionIndex(state.open); if (i < 0) return;
    var s = D.sections[i];
    document.getElementById("sheet-title").textContent = tx(s.title);
    var body = document.getElementById("sheet-body");
    body.innerHTML = "";
    body.appendChild(h("header", { class: "s-hero" }, [h("span", { class: "s-num", text: ROMAN[i] }), h("span", { class: "s-arch" }, icon(s.icon)), h("h2", { id: "sheet-h", text: tx(s.title) }), h("span", { class: "s-orn", "aria-hidden": "true" })]));
    var content = h("div", { class: "s-content" });
    (s.blocks || []).forEach(function (b) { var fn = R[b.type]; if (fn) { var el = fn(b, s.id); if (el) content.appendChild(el); } });
    body.appendChild(content);
    var prev = D.sections[i - 1], next = D.sections[i + 1];
    var nav = h("nav", { class: "s-nav", "aria-label": t("guide") }, [
      prev ? h("button", { type: "button", class: "s-prev", onclick: function () { switchSection(prev.id); } }, [icon("chevL", "flip"), h("span", null, [h("small", { text: t("prev") }), tx(prev.title)])]) : h("span"),
      next ? h("button", { type: "button", class: "s-next", onclick: function () { switchSection(next.id); } }, [h("span", null, [h("small", { text: t("next") }), tx(next.title)]), icon("chevR", "flip")]) : h("span")
    ]);
    body.appendChild(nav);
    body.appendChild(h("div", { class: "s-sky", "aria-hidden": "true" }));
  }
  function switchSection(id) {
    state.open = id; renderSheet();
    var sb = document.querySelector(".sheet-scroll"); if (sb) sb.scrollTop = 0;
    try { history.replaceState({ sheet: id }, "", "#" + id); } catch (e) {}
    document.getElementById("sheet-back").focus({ preventScroll: true });
  }
  var lastTrigger = null;
  function openSection(id, fromHistory) {
    if (sectionIndex(id) < 0) return;
    lastTrigger = document.querySelector('[data-section="' + id + '"]');
    state.open = id; renderSheet();
    var d = document.getElementById("sheet");
    var sb = d.querySelector(".sheet-scroll"); if (sb) sb.scrollTop = 0;
    if (!d.open) { d.showModal(); document.body.classList.add("locked"); }
    if (!fromHistory) try { history.pushState({ sheet: id }, "", "#" + id); } catch (e) {}
    document.getElementById("sheet-back").focus({ preventScroll: true });
  }
  function closeSheet() {
    if (history.state && history.state.sheet) { history.back(); return; }
    hideSheet();
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  }
  function hideSheet() {
    var d = document.getElementById("sheet");
    if (!d.open) return;
    d.classList.add("closing");
    setTimeout(function () { d.classList.remove("closing"); if (d.open) d.close(); }, 220);
  }
  function onSheetClosed() {
    document.body.classList.remove("locked");
    var trig = document.querySelector('[data-section="' + state.open + '"]') || lastTrigger;
    state.open = null;
    if (trig) trig.focus({ preventScroll: false });
  }

  /* ---------- lightbox ---------- */
  var lbIndex = 0;
  function openLightbox(i) {
    lbIndex = i; showLb();
    var d = document.getElementById("lightbox"); if (!d.open) d.showModal();
  }
  function showLb() {
    var p = D.photos[lbIndex];
    var img = document.getElementById("lb-img");
    img.classList.remove("in"); img.src = p.src + ".webp"; img.alt = tx(p.alt);
    img.onload = function () { img.classList.add("in"); };
    document.getElementById("lb-cap").textContent = tx(p.alt) + " · " + t("photoOf", { i: lbIndex + 1, n: D.photos.length });
  }
  function lbStep(dx) { lbIndex = (lbIndex + dx + D.photos.length) % D.photos.length; showLb(); }

  /* ---------- music ---------- */
  function bindMusic() {
    var b = document.getElementById("music"), a = document.getElementById("audio");
    if (!b || !a) return;
    var tracks = [ASSETS + "audio/night-in-venice.mp3", ASSETS + "audio/lobby-time.mp3"], k = 0, want = false, primed = false, tok = 0;
    function fade(to, cb) { var my = ++tok, from = a.volume, st = performance.now();
      (function step(n) { if (my !== tok) return; var p = Math.min(1, (n - st) / 900); a.volume = from + (to - from) * p; if (p < 1) requestAnimationFrame(step); else if (cb) cb(); })(st); }
    function set(on) { b.setAttribute("aria-pressed", on ? "true" : "false"); b.classList.toggle("on", on); }
    a.addEventListener("ended", function () { k = (k + 1) % tracks.length; a.src = tracks[k]; if (want) a.play().catch(function () {}); });
    b.addEventListener("click", function () {
      if (want) { want = false; set(false); fade(0, function () { if (!want) a.pause(); }); return; }
      want = true; set(true);
      if (!primed) { primed = true; a.src = tracks[0]; a.volume = 0; }
      var p = a.play(); if (p && p.then) p.then(function () { fade(0.35); }).catch(function () { want = false; set(false); }); else fade(0.35);
    });
  }

  /* ---------- reveal on scroll ---------- */
  var io = null;
  function observeReveal() {
    var els = document.querySelectorAll(".tile, .q, .g-item, .sec-head");
    if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) { els.forEach(function (e) { e.classList.add("in"); }); return; }
    if (!io) io = new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } }); }, { rootMargin: "0px 0px -6% 0px", threshold: 0.05 });
    els.forEach(function (e) { if (!e.classList.contains("in")) io.observe(e); });
  }

  /* ---------- intro ---------- */
  function playIntro() {
    var ov = document.getElementById("intro");
    if (!ov) return;
    var title = document.getElementById("intro-title"); title.textContent = t("welcomeBook");
    var sub = document.getElementById("intro-name"); sub.textContent = D.name;
    if (root.classList.contains("intro-seen") || location.hash) { ov.remove(); root.classList.add("intro-seen"); return; }
    try { sessionStorage.setItem("rdh-intro", "1"); } catch (e) {}
    var logo = document.getElementById("intro-logo"), target = document.querySelector(".hero-logo");
    var finished = false;
    function finish() { if (finished) return; finished = true; root.classList.add("intro-seen"); ov.classList.add("gone"); setTimeout(function () { ov.remove(); }, 600); }
    ov.addEventListener("pointerdown", finish);
    ov.classList.add("play");
    setTimeout(function () {
      if (finished) return;
      var a = logo.getBoundingClientRect(), b = target.getBoundingClientRect();
      if (a.width < 2 || b.width < 2) return finish();
      var s = b.width / a.width, dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
      ov.classList.add("fly");
      logo.style.transform = "translate(" + dx + "px," + dy + "px) scale(" + s + ")";
      setTimeout(finish, 750);
    }, 1900);
    setTimeout(finish, 3600);
  }

  /* ---------- bind ---------- */
  function bind() {
    var d = document.getElementById("sheet");
    document.getElementById("sheet-back").addEventListener("click", closeSheet);
    d.addEventListener("cancel", function (e) { e.preventDefault(); closeSheet(); });
    d.addEventListener("click", function (e) { if (e.target === d) closeSheet(); });
    d.addEventListener("close", onSheetClosed);
    window.addEventListener("popstate", function () {
      var id = location.hash.slice(1);
      if (id && sectionIndex(id) > -1) openSection(id, true); else hideSheet();
    });
    document.addEventListener("click", function (e) { if (!e.target.closest(".lang")) closeMenus(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { var m = document.querySelector(".lang-menu:not([hidden])"); if (m) { e.preventDefault(); e.stopPropagation(); closeMenus(); var tg = m.parentNode.querySelector(".lang-toggle"); if (tg) tg.focus(); } }
    }, true);
    var lb = document.getElementById("lightbox");
    document.getElementById("lb-close").onclick = function () { lb.close(); };
    document.getElementById("lb-prev").onclick = function () { lbStep(root.dir === "rtl" ? 1 : -1); };
    document.getElementById("lb-next").onclick = function () { lbStep(root.dir === "rtl" ? -1 : 1); };
    lb.addEventListener("click", function (e) { if (e.target === lb || e.target.classList.contains("lb-stage")) lb.close(); });
    lb.addEventListener("keydown", function (e) { if (e.key === "ArrowLeft") lbStep(-1); if (e.key === "ArrowRight") lbStep(1); });
    var sx = null;
    lb.addEventListener("touchstart", function (e) { sx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener("touchend", function (e) { if (sx == null) return; var dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 45) lbStep(dx < 0 ? 1 : -1); sx = null; });
    var top = document.getElementById("to-top");
    top.onclick = function () { window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); };
    var ticking = false;
    window.addEventListener("scroll", function () {
      if (ticking) return; ticking = true;
      requestAnimationFrame(function () { var y = window.scrollY; top.classList.toggle("show", y > 600); root.classList.toggle("scrolled", y > 40); ticking = false; });
    }, { passive: true });
    var sc = document.querySelector(".sheet-scroll");
    sc.addEventListener("scroll", function () { d.classList.toggle("scrolled", sc.scrollTop > 150); }, { passive: true });
    bindMusic();
  }


  /* ---------- offline + "Save to phone" (PWA) ---------- */
  function isStandalone() {
    try { return navigator.standalone === true || matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches; } catch (e) { return false; }
  }
  function isIOS() {
    var ua = navigator.userAgent || "";
    return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }
  function saveBtn(cls, compact) {
    var label = t("saveApp") + " – " + t("saveAppSub");
    var b = h("button", { type: "button", class: cls + " js-save", "aria-label": label },
      compact ? [icon("save-phone"), h("span", { text: t("saveApp") })]
              : [icon("save-phone", "sa-ico"), h("span", { class: "sa-txt" }, [h("strong", { text: t("saveApp") }), h("small", { text: t("saveAppSub") })])]);
    if (isStandalone()) b.hidden = true;
    b.addEventListener("click", saveToPhone);
    return b;
  }
  function hideSaveButtons() { document.querySelectorAll(".js-save").forEach(function (b) { b.hidden = true; }); }
  function saveToPhone() {
    if (installEvt) {
      var ev = installEvt; installEvt = null;
      ev.prompt();
      (ev.userChoice || Promise.resolve({})).then(function (c) { if (c && c.outcome === "accepted") hideSaveButtons(); });
      return;
    }
    showSaveHelp();
  }
  function stepLine(n, key, ic) {
    var parts = t(key).split("{icon}");
    var p = h("p", null, [parts[0]]);
    if (ic) { var i = icon(ic, "sh-ico"); p.appendChild(i); }
    if (parts[1]) p.appendChild(document.createTextNode(parts[1]));
    return h("li", null, [h("span", { class: "step-n", "aria-hidden": "true", text: String(n) }), p]);
  }
  function showSaveHelp() {
    var dlg = document.getElementById("save-help");
    if (dlg) dlg.remove();
    var ios = isIOS();
    var steps = ios ? [stepLine(1, "iosStep1", "ios-share"), stepLine(2, "iosStep2", "plus-square"), stepLine(3, "iosStep3")]
                    : [stepLine(1, "genStep1", "dots"), stepLine(2, "genStep2")];
    var close = h("button", { type: "button", class: "btn btn-primary sh-ok", text: t("gotIt") });
    dlg = h("dialog", { id: "save-help", class: "save-help", "aria-labelledby": "sh-title" }, [
      h("div", { class: "sh-panel" }, [
        icon("save-phone", "sh-top"),
        h("h3", { id: "sh-title", text: t("saveApp") }),
        h("p", { class: "sh-sub", text: t("saveAppSub") }),
        h("ol", { class: "steps sh-steps" }, steps),
        offlineCached ? h("p", { class: "sh-note", text: t("savedNote") }) : null,
        close
      ])
    ]);
    close.addEventListener("click", function () { dlg.close(); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener("close", function () { dlg.remove(); });
    document.body.appendChild(dlg);
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  }
  var offlineCached = false;
  function markCached(announce) {
    var key = "rdh-offline-" + D.slug, seen = null;
    offlineCached = true; root.classList.add("is-cached");
    try { seen = localStorage.getItem(key); localStorage.setItem(key, "1"); } catch (e) {}
    if (announce && !seen) setTimeout(function () { toast(t("offlineReady"), "no-tick"); }, 1200);
  }
  function offlineBadge() {
    /* one badge on the page, one inside the section dialog (which sits in the top layer) */
    [["offline-badge", document.body, ""], ["offline-badge-sheet", document.querySelector("#sheet .sheet-panel"), " in-sheet"]].forEach(function (x) {
      if (!x[1]) return;
      var b = document.getElementById(x[0]);
      if (!b) { b = h("div", { id: x[0], class: "offline-badge" + x[2], role: x[2] ? null : "status" }); x[1].appendChild(b); }
      b.innerHTML = ""; b.appendChild(icon("offline")); b.appendChild(h("span", { text: t("offlineBadge") }));
      b.classList.toggle("show", navigator.onLine === false);
    });
    root.classList.toggle("is-offline", navigator.onLine === false);
  }
  function initOffline() {
    offlineBadge();
    window.addEventListener("online", offlineBadge);
    window.addEventListener("offline", offlineBadge);
    window.addEventListener("appinstalled", function () { hideSaveButtons(); });
    if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker.addEventListener("message", function (e) {
      if (e.data && e.data.type === "rdh-cached") markCached(true);
    });
    navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(function () {});
    navigator.serviceWorker.ready.then(function (reg) {
      var sw = navigator.serviceWorker.controller || reg.active;
      if (sw) sw.postMessage("rdh-status");
    });
  }

  function start(data) {
    D = data;
    state.lang = isLang(root.dataset.lang) ? root.dataset.lang : detectLang();
    applyLang(); bind(); renderAll(); playIntro();
    try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch (e) {}
    var id = location.hash.slice(1);
    if (id && sectionIndex(id) > -1) { try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} openSection(id); }
    else {
      /* No explicit #section: always start on the home page, at the top. */
      try { if (history.state || location.hash) history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
      window.scrollTo(0, 0);
    }
    initOffline();
    window.addEventListener("pageshow", function (e) {
      if (e.persisted && !location.hash.slice(1)) { var d = document.getElementById("sheet"); if (d.open) d.close(); window.scrollTo(0, 0); }
    });
  }
  if (window.RDH_DATA) start(window.RDH_DATA);
  else fetch("data.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(start).catch(function () {
    document.getElementById("sections").appendChild(h("p", { class: "err", role: "alert", text: t("loadError") }));
  });
})();
