#!/usr/bin/env python3
"""Сборка Video Glow для Chrome (и Opera) и Firefox (ПК и Android) из одной папки исходников.

    python3 tools/build.py <папка-исходников> <версия> <папка-вывода>

Исходники — распакованная Chrome-версия (её manifest.json считается главным).
Firefox-манифест получается из него автоматически, поэтому content.js и всё
остальное в обеих сборках гарантированно одинаковое.

Перед упаковкой проверяется: версия, наличие файлов из манифеста, одинаковые
ключи во всех _locales, синтаксис JS (если установлен node).
"""
import json, os, re, shutil, subprocess, sys, zipfile

GECKO = {
    "id": "{d1eb6dd3-3db2-47b2-8461-7f409fc75cf8}",
    "strict_min_version": "128.0",
    "data_collection_permissions": {"required": ["none"]},
}
# Firefox для Android: первая версия с полноценным MV3 и scripting
GECKO_ANDROID = {"strict_min_version": "128.0"}


def fail(msg):
    sys.exit("ОШИБКА: " + msg)


def firefox_manifest(m, src):
    m = json.loads(json.dumps(m))
    m.pop("minimum_chrome_version", None)
    sw = m.get("background", {}).get("service_worker")
    if sw:
        # в Chrome воркер сам подгружает их через importScripts
        extra = [f for f in ("hue.js", "hue-bg.js", "lights.js", "lights-bg.js") if os.path.isfile(os.path.join(src, f))]
        m["background"] = {"scripts": ["defaults.js", "license.js"] + extra + [sw]}
    m["browser_specific_settings"] = {"gecko": GECKO, "gecko_android": GECKO_ANDROID}
    return m


def check(src, m):
    files = []
    for cs in m.get("content_scripts", []):
        files += cs.get("js", []) + cs.get("css", [])
    files += [m.get("background", {}).get("service_worker", "")]
    files += [m.get("action", {}).get("default_popup", ""), m.get("options_ui", {}).get("page", "")]
    files += list(m.get("icons", {}).values())
    for f in filter(None, files):
        if not os.path.isfile(os.path.join(src, f)):
            fail("нет файла из манифеста: " + f)

    loc = os.path.join(src, "_locales")
    keys = {}
    for lang in sorted(os.listdir(loc)):
        with open(os.path.join(loc, lang, "messages.json"), encoding="utf-8") as fh:
            keys[lang] = set(json.load(fh))
    base = keys.get(m.get("default_locale", "en"))
    for lang, k in keys.items():
        if k != base:
            fail("в _locales/%s не совпадают ключи: нет %s, лишние %s" %
                 (lang, sorted(base - k)[:5], sorted(k - base)[:5]))

    if shutil.which("node"):
        for root, _, names in os.walk(src):
            for n in names:
                if n.endswith(".js"):
                    p = os.path.join(root, n)
                    r = subprocess.run(["node", "--check", p], capture_output=True, text=True)
                    if r.returncode:
                        fail("синтаксис %s:\n%s" % (p, r.stderr))
    else:
        print("node не найден — проверка синтаксиса JS пропущена")


# Из PNG убираются служебные блоки метаданных (подписи происхождения, тексты): остаётся только картинка.
PNG_KEEP = {b"IHDR", b"PLTE", b"tRNS", b"IDAT", b"IEND", b"gAMA", b"sRGB", b"cHRM", b"pHYs"}


def png_clean(d):
    if d[:8] != b"\x89PNG\r\n\x1a\n":
        return d
    out, i = [d[:8]], 8
    while i + 8 <= len(d):
        n = int.from_bytes(d[i:i + 4], "big")
        if d[i + 4:i + 8] in PNG_KEEP:
            out.append(d[i:i + 12 + n])
        i += 12 + n
    return b"".join(out)


# В WebP оставляются только блоки с изображением, флаги EXIF/XMP в VP8X сбрасываются.
WEBP_KEEP = {b"VP8 ", b"VP8L", b"VP8X", b"ALPH", b"ANIM", b"ANMF", b"ICCP"}


def webp_clean(d):
    if d[:4] != b"RIFF" or d[8:12] != b"WEBP":
        return d
    out, i = [], 12
    while i + 8 <= len(d):
        n = int.from_bytes(d[i + 4:i + 8], "little")
        c = d[i:i + 8 + n + (n & 1)]
        if d[i:i + 4] == b"VP8X":
            c = c[:8] + bytes([c[8] & ~0x0C]) + c[9:]
        if d[i:i + 4] in WEBP_KEEP:
            out.append(c)
        i += 8 + n + (n & 1)
    body = b"WEBP" + b"".join(out)
    return b"RIFF" + len(body).to_bytes(4, "little") + body


# Из SVG убирается блок <metadata> и лишние объявления пространств имён для него.
def svg_clean(d):
    t = d.decode("utf-8")
    t = re.sub(r"<metadata\b.*?</metadata>", "", t, flags=re.S)
    t = re.sub(r'\s+xmlns:c2pa="[^"]*"', "", t)
    return t.encode("utf-8")


def clean(path, d):
    p = path.lower()
    if p.endswith(".png"):
        return png_clean(d)
    if p.endswith(".webp"):
        return webp_clean(d)
    if p.endswith(".svg"):
        return svg_clean(d)
    return d


def pack(src, manifest, out_zip):
    with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED) as z:
        for root, dirs, names in os.walk(src):
            dirs[:] = sorted(d for d in dirs if not d.startswith("."))
            for n in sorted(names):
                if n.startswith(".") or n == "manifest.json" and root == src:
                    continue
                p = os.path.join(root, n)
                if p.lower().endswith((".png", ".webp", ".svg")):
                    z.writestr(os.path.relpath(p, src), clean(p, open(p, "rb").read()))
                else:
                    z.write(p, os.path.relpath(p, src))
        z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")


def main():
    if len(sys.argv) != 4:
        fail(__doc__)
    src, ver, out = sys.argv[1:]
    if not re.fullmatch(r"\d+(\.\d+){0,3}", ver):
        fail("версия должна быть вида 1.2.0 или 1.1.2.1")
    with open(os.path.join(src, "manifest.json"), encoding="utf-8") as fh:
        m = json.load(fh)
    m["version"] = ver
    check(src, m)
    os.makedirs(out, exist_ok=True)
    for name, man in (("chrome", m), ("firefox", firefox_manifest(m, src))):
        z = os.path.join(out, "video-glow-%s-%s.zip" % (ver, name))
        pack(src, man, z)
        print("готово:", z)


if __name__ == "__main__":
    main()
