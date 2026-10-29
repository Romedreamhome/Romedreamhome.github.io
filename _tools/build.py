#!/usr/bin/env python3
"""
Rome Dream Home — Welcome Book builder (Python 3 standard library only).

For every apartment folder in the site root that contains a data.json
(e.g. babuino/data.json) it writes <apartment>/index.html from
_template/index.html, inlining the data so the page works without any fetch.
It also regenerates the landing page (index.html) listing all apartments.

Offline / installable: each apartment also gets <apartment>/manifest.webmanifest
and <apartment>/sw.js (from _template/sw.js). The service worker is scoped to the
apartment folder, precaches the page, data, shared CSS/JS/fonts/icons and every
image the apartment uses, and gets a new cache name on every build.

Usage (from anywhere):
    python3 _tools/build.py                  # build everything
    python3 _tools/build.py --check          # validate data files only

Optional site settings in _tools/config.json:
    {"baseUrl": "https://<github-user>.github.io/romedreamhome/",
     "listOnLanding": true}
baseUrl makes Open Graph image URLs absolute (nicer WhatsApp/Telegram previews).
Set "listOnLanding": false to keep the landing page from linking apartments
(guests then only reach a guide through its direct link).
"""
import hashlib, html, json, os, re, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LANGS = ["en", "it", "fr", "es", "de", "ar"]
REQUIRED = ["slug", "name", "address", "host", "wifi", "sections"]

def load_config():
    p = os.path.join(ROOT, "_tools", "config.json")
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}

def find_apartments():
    out = []
    for name in sorted(os.listdir(ROOT)):
        d = os.path.join(ROOT, name)
        if name.startswith((".", "_")) or name == "assets" or not os.path.isdir(d):
            continue
        if os.path.exists(os.path.join(d, "data.json")):
            out.append(name)
    return out

def check(data, folder):
    problems = []
    for k in REQUIRED:
        if k not in data:
            problems.append(f"missing '{k}'")
    if data.get("slug") != folder:
        problems.append(f"slug '{data.get('slug')}' should equal folder name '{folder}'")
    def walk(v, path):
        if isinstance(v, dict):
            if "en" in v and all(isinstance(x, str) for x in v.values()):
                miss = [l for l in LANGS if not v.get(l)]
                if miss:
                    problems.append(f"{path}: missing translation(s) {', '.join(miss)}")
                return
            for k, x in v.items():
                walk(x, f"{path}.{k}")
        elif isinstance(v, list):
            for i, x in enumerate(v):
                walk(x, f"{path}[{i}]")
    walk(data.get("sections", []), "sections")
    for p in data.get("photos", []):
        for suf in ("-sm.webp", ".webp"):
            if not os.path.exists(os.path.join(ROOT, folder, p["src"] + suf)):
                problems.append(f"photo file missing: {folder}/{p['src']}{suf}")
    # Shared Rome photos on venues/activities: files under assets/ and a complete credit
    for sec in data.get("sections", []):
        for b in sec.get("blocks", []):
            for it in b.get("items", []):
                ph = it.get("photo")
                if not ph:
                    continue
                base = os.path.join(ROOT, folder) if ph.get("own") else os.path.join(ROOT, "assets")
                for suf in ("-sm.webp", ".webp"):
                    if not os.path.exists(os.path.join(base, ph["src"] + suf)):
                        problems.append(f"photo missing: {ph['src']}{suf}")
                if ph.get("own"):
                    continue  # user-supplied photo: no credit needed
                miss = [k for k in ("author", "license", "licenseUrl", "source") if not (ph.get("credit") or {}).get(k)]
                if miss:
                    problems.append(f"photo {ph['src']}: credit lacks {', '.join(miss)}")
    return problems

def file_hash(fp):
    return hashlib.sha1(open(fp, "rb").read()).hexdigest()[:10]

def image_versions(folder, data):
    """URL (as written by app.js) -> content hash, for every apartment and shared Rome image."""
    out = {}
    d = os.path.join(ROOT, folder, "img")
    if os.path.isdir(d):
        for f in sorted(os.listdir(d)):
            if not f.startswith("."): out[f"img/{f}"] = file_hash(os.path.join(d, f))
    A = os.path.join(ROOT, "assets")
    for s in sorted(set(re.findall(r'"src":\s*"(rome/[\w.-]+)"', json.dumps(data)))):
        for suf in ("-sm.webp", ".webp"):
            fp = os.path.join(A, s + suf)
            if os.path.exists(fp): out[f"../assets/{s}{suf}"] = file_hash(fp)
    return out

def with_v(u, folder):
    fp = os.path.normpath(os.path.join(ROOT, folder, u))
    return f"{u}?v={file_hash(fp)}" if os.path.isfile(fp) else u

def build_apartment(folder, cfg, version):
    data = json.load(open(os.path.join(ROOT, folder, "data.json"), encoding="utf-8"))
    problems = check(data, folder)
    tpl = open(os.path.join(ROOT, "_template", "index.html"), encoding="utf-8").read()
    addr = data["address"]["line1"] + ", " + data["address"]["line2"]["en"]
    data = dict(data, imgv=image_versions(folder, data))
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    out = (tpl.replace("{{DATA}}", payload)
              .replace("{{NAME}}", html.escape(data["name"]))
              .replace("{{ADDRESS}}", html.escape(addr))
              .replace("{{VERSION}}", version))
    base = cfg.get("baseUrl", "").rstrip("/")
    if base:
        out = out.replace('content="../assets/img/og-image.jpg"', f'content="{base}/assets/img/og-image.jpg"')
        out = out.replace('<meta property="og:type"', f'<meta property="og:url" content="{base}/{folder}/" />\n  <link rel="canonical" href="{base}/{folder}/" />\n  <meta property="og:type"')
    open(os.path.join(ROOT, folder, "index.html"), "w", encoding="utf-8").write(out)
    n = write_pwa(folder, data, version)
    print(f"  offline: {folder}/sw.js precaches {n} files; {folder}/manifest.webmanifest")
    return data, problems

def write_pwa(folder, data, version):
    """Per-apartment manifest + offline service worker (scope = the apartment folder)."""
    name = data["name"]
    manifest = {
        "id": "./", "name": f"Rome Dream Home · {name}", "short_name": name,
        "description": f"Welcome Book · {data['address']['line1']}",
        "start_url": "./", "scope": "./", "display": "standalone", "orientation": "portrait",
        "background_color": "#4C0303", "theme_color": "#4C0303", "lang": "en",
        "icons": [
            {"src": "../assets/img/pwa-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": "../assets/img/pwa-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
            {"src": "../assets/img/pwa-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable"},
            {"src": "../assets/img/pwa-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
    }
    json.dump(manifest, open(os.path.join(ROOT, folder, "manifest.webmanifest"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    A = os.path.join(ROOT, "assets")
    core = ["./", "manifest.webmanifest", "data.json"]
    core += [f"../assets/{p}?v={version}" for p in ("css/style.css", "js/icons.js", "js/i18n.js", "js/app.js", "fonts/fonts.css", "fonts/fonts-ar.css")]
    core += sorted(f"../assets/fonts/{f}" for f in os.listdir(os.path.join(A, "fonts")) if f.endswith(".woff2"))
    media = sorted(f"../assets/img/{f}" for f in os.listdir(os.path.join(A, "img")) if not f.startswith("."))
    media += sorted(f"img/{f}" for f in os.listdir(os.path.join(ROOT, folder, "img")) if not f.startswith("."))
    shared = sorted(set(re.findall(r'"src":\s*"(rome/[\w.-]+)"', json.dumps(data))))
    media += [f"../assets/{s}{suf}" for s in shared for suf in ("-sm.webp", ".webp") if os.path.exists(os.path.join(A, s + suf))]
    media = [with_v(u, folder) for u in media]   # same hashed URLs the page requests
    h = hashlib.sha1()
    for u in core[1:] + media:
        fp = os.path.normpath(os.path.join(ROOT, folder, u.split("?")[0]))
        if os.path.exists(fp): h.update(open(fp, "rb").read())
    h.update(open(os.path.join(ROOT, folder, "index.html"), "rb").read())
    tpl = open(os.path.join(ROOT, "_template", "sw.js"), encoding="utf-8").read()
    out = (tpl.replace("{{SLUG}}", folder).replace("{{CACHE_ID}}", f"{version}-{h.hexdigest()[:10]}")
              .replace("{{CORE}}", json.dumps(core)).replace("{{MEDIA}}", json.dumps(media)))
    open(os.path.join(ROOT, folder, "sw.js"), "w", encoding="utf-8").write(out)
    return len(core) + len(media)

def build_landing(apts, cfg, version):
    tpl = open(os.path.join(ROOT, "_template", "landing.html"), encoding="utf-8").read()
    cards = []
    if cfg.get("listOnLanding", True):
        for d in apts:
            cover = (d.get("photos") or [{}])[0].get("src")
            img = f'<img src="{with_v(d["slug"] + "/" + cover + "-sm.webp", ".")}" alt="" loading="lazy" width="96" height="108" />' if cover else ""
            addr = html.escape(d["address"]["line1"])
            cards.append(
                f'<a class="apt-card" href="{d["slug"]}/">{img}<div><h3>{html.escape(d["name"])}</h3>'
                f'<p>{addr}</p></div><span class="go" aria-hidden="true"><span class="ico flip">'
                f'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></span></span></a>')
    out = tpl.replace("{{CARDS}}", "\n      ".join(cards)).replace("{{VERSION}}", version)
    if not cards:  # private mode: guests reach a guide only through its direct link
        out = out.replace('data-i18n="landingLead">Choose your apartment to open its digital guide.',
                          'data-i18n="landingPrivate">Please open your apartment guide with the link sent by your host.')
    base = cfg.get("baseUrl", "").rstrip("/")
    if base:
        out = out.replace('content="assets/img/og-image.jpg"', f'content="{base}/assets/img/og-image.jpg"')
    open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8").write(out)

def main():
    cfg = load_config()
    version = time.strftime("%Y%m%d%H%M")
    built, bad = [], 0
    for folder in find_apartments():
        data = json.load(open(os.path.join(ROOT, folder, "data.json"), encoding="utf-8"))
        if "--check" in sys.argv:
            problems = check(data, folder)
        else:
            data, problems = build_apartment(folder, cfg, version)
        built.append(data)
        for p in problems:
            print(f"  ! {folder}: {p}")
        bad += len(problems)
        print(f"{'checked' if '--check' in sys.argv else 'built'} {folder}/ ({len(data['sections'])} sections)")
    if "--check" not in sys.argv:
        build_landing(built, cfg, version)
        print("built index.html (landing)")
    print("OK" if not bad else f"{bad} warning(s)")

if __name__ == "__main__":
    main()
