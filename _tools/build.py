#!/usr/bin/env python3
"""
Rome Dream Home — Welcome Book builder (Python 3 standard library only).

For every apartment folder in the site root that contains a data.json
(e.g. babuino/data.json) it writes <apartment>/index.html from
_template/index.html, inlining the data so the page works without any fetch.
It also regenerates the landing page (index.html) listing all apartments.

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
import html, json, os, sys, time

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

def build_apartment(folder, cfg, version):
    data = json.load(open(os.path.join(ROOT, folder, "data.json"), encoding="utf-8"))
    problems = check(data, folder)
    tpl = open(os.path.join(ROOT, "_template", "index.html"), encoding="utf-8").read()
    addr = data["address"]["line1"] + ", " + data["address"]["line2"]["en"]
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
    return data, problems

def build_landing(apts, cfg, version):
    tpl = open(os.path.join(ROOT, "_template", "landing.html"), encoding="utf-8").read()
    cards = []
    if cfg.get("listOnLanding", True):
        for d in apts:
            cover = (d.get("photos") or [{}])[0].get("src")
            img = f'<img src="{d["slug"]}/{cover}-sm.webp" alt="" loading="lazy" width="96" height="108" />' if cover else ""
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
