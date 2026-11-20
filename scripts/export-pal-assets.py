#!/usr/bin/env python3
"""Export the approved core Gem Pal kit without changing decoded image pixels.

Requires Python 3.10+, Pillow 13.0.0 and libwebp 1.6.0 for byte-reproducible
exports. No npm dependency is added. Other encoder versions may produce different
bytes and are reported; use --require-pinned-encoder for the recorded build.

  python3 scripts/export-pal-assets.py export --kit /path/to/approved/kit \
    --report /outside/public/export-report.json --contact-sheets /outside/public/qa
  node scripts/verify-pal-assets.mjs --source-kit /path/to/approved/kit \
    --report /outside/public/verified.json

The source kit and detailed audit stay outside public/. The public manifest is
an explicit allowlist of runtime identity, URLs and image integrity fields.
Contact sheets are display-only review images; production images are never
resized, cropped, composited, repainted or background-removed.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import io
import json
import os
import sys
from pathlib import Path

import PIL
from PIL import Image, ImageDraw, ImageFont, features

ROOT = Path(__file__).resolve().parent.parent
VERSION = "core-2026-11-20"
PINNED_PILLOW = "13.0.0"
PINNED_WEBP = "1.6.0"
FORM_MAP = {"initial": "base", "growth": "mature"}
STATES = ("neutral", "celebrate", "thinking", "encouraging_retry")
# These are existing character identities, not mappings to the legacy Pal IDs.
IDENTITIES = {
    "luma": ("first-round-2026-11-19/A", None),
    "nook": ("first-round-2026-11-19/B", None),
    "mizzle": ("first-round-2026-11-19/D", None),
    "tumble": ("first-round-2026-11-19/E", None),
    "navi": ("first-round-2026-11-19/F1", None),
    "mote": ("first-round-2026-11-19/F2", None),
    "sivo": ("first-round-2026-11-19/G", None),
    "furl": ("first-round-2026-11-19/H", None),
    "tessit": ("first-round-2026-11-19/I", None),
    "flick": ("first-round-2026-11-19/K", None),
    "clasp": ("first-round-2026-11-19/L", None),
    "skiff": ("first-round-2026-11-19/M", None),
    "peep": ("first-round-2026-11-19/N", None),
    "weft": ("first-round-2026-11-19/O", None),
    "cache": ("first-round-2026-11-19/P", None),
    "brim": ("first-round-2026-11-19/Q", None),
    "wink": ("first-round-2026-11-19/R", None),
    "poff": ("expansion-2026-11-19/S", "GP-S019"),
    "chimi": ("expansion-2026-11-19/T", "GP-S020"),
    "pleeko": ("expansion-2026-11-19/U", "GP-S021"),
    "talli": ("expansion-2026-11-19/V", "GP-S022"),
    "zippa": ("expansion-2026-11-19/W", "GP-S023"),
    "whorl": ("expansion-2026-11-19/X", "GP-S024"),
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def file_digest(path):
    return digest(Path(path).read_bytes())


def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = (json.dumps(data, indent=2, ensure_ascii=False) + "\n").encode()
    atomic_write(path, encoded)


def atomic_write(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    temp.write_bytes(data)
    temp.replace(path)


def child_path(parent, relative):
    require(isinstance(relative, str), "Missing relative asset path")
    path = (parent / relative).resolve()
    require(path.is_relative_to(parent.resolve()), "Asset path escapes its owner")
    return path


def source_records(kit):
    kit = Path(kit).resolve()
    catalog = json.loads((kit / "catalog.json").read_text())
    require(catalog["package_version"] == "2.9", "Expected approved kit package 2.9")
    entries = catalog["characters"]
    require(len(entries) == 23, "Expected exactly 23 original character profiles")
    records, characters, seen, source_paths = [], [], set(), set()
    for entry in entries:
        profile_path = child_path(kit, entry["profile"])
        profile = json.loads(profile_path.read_text())
        identity = profile["identity"]
        slug = profile_path.parent.name
        require(slug in IDENTITIES and slug not in seen, f"Unexpected/duplicate character: {slug}")
        expected = IDENTITIES[slug]
        require((identity["character_key"], identity["species_id"]) == expected, f"Identity mismatch: {slug}")
        require(entry["character_key"] == expected[0] and entry["species_id"] == expected[1], f"Catalog identity mismatch: {slug}")
        require(identity["name"] == slug.capitalize(), f"Unexpected character name: {slug}")
        require(set(profile["forms"]) == set(FORM_MAP), f"Expected exactly two forms: {slug}")
        seen.add(slug)
        characters.append({"characterKey": expected[0], "speciesId": expected[1], "slug": slug, "name": identity["name"]})
        for source_form, form in FORM_MAP.items():
            form_record = profile["forms"][source_form]
            require(form_record["status"] == "approved_art_reference", f"Unapproved neutral: {slug}/{form}")
            emotions = form_record.get("emotions", [])
            require(len(emotions) == 3 and {e["id"] for e in emotions} == set(STATES[1:]), f"Incomplete expression set: {slug}/{form}")
            require(not form_record.get("additional_states"), f"Unexpected additional state: {slug}/{form}")
            by_state = {e["id"]: e for e in emotions}
            neutral_sha = form_record["asset"]["sha256"]
            for state in STATES:
                if state == "neutral":
                    asset = form_record["asset"]
                else:
                    expression = by_state[state]
                    require(expression["approval_status"] == "approved" and expression["approval"]["status"] == "approved", f"Unapproved expression: {slug}/{form}/{state}")
                    require(expression["source_neutral_reference"]["sha256"] == neutral_sha, f"Wrong own-form neutral: {slug}/{form}/{state}")
                    asset = expression["asset"]
                path = child_path(profile_path.parent, asset["path"])
                require(path.suffix == ".png" and path not in source_paths, f"Unexpected/duplicate source: {slug}/{form}/{state}")
                source_paths.add(path)
                records.append({"slug": slug, "form": form, "sourceForm": source_form,
                                "expression": state, "path": path, "metadata": asset,
                                "neutralSourceSHA256": neutral_sha})
    require(seen == set(IDENTITIES), "Original roster is incomplete")
    require(len(records) == 184, "Expected exactly 184 sources")
    require({p.resolve() for p in kit.rglob("*.png")} == source_paths, "Kit contains missing or unregistered PNGs")
    return characters, records


def decode(path_or_bytes):
    handle = io.BytesIO(path_or_bytes) if isinstance(path_or_bytes, bytes) else path_or_bytes
    with Image.open(handle) as opened:
        require(getattr(opened, "n_frames", 1) == 1, "Animated images are outside the approved source scope")
        image = opened.convert("RGBA")
        mode = opened.mode
        image.load()
    return image, mode


def export_one(record, output):
    raw = record["path"].read_bytes()
    metadata = record["metadata"]
    source_hash = digest(raw)
    require(source_hash == metadata["sha256"], f"Source SHA mismatch: {record['path'].name}")
    require(len(raw) == metadata["size_bytes"], f"Source size mismatch: {record['path'].name}")
    source_rgba, source_mode = decode(raw)
    require(source_rgba.size == (metadata["width"], metadata["height"]), f"Source dimension mismatch: {record['path'].name}")
    require(source_mode in ("RGB", "RGBA"), f"Unexpected source pixel mode: {source_mode}")
    # Preserve straight RGB values even beneath fully transparent pixels.
    with Image.open(io.BytesIO(raw)) as source:
        encoded = io.BytesIO()
        source.save(encoded, format="WEBP", lossless=True, quality=100, method=6, exact=True)
    webp = encoded.getvalue()
    exported_rgba, exported_mode = decode(webp)
    source_pixels, exported_pixels = source_rgba.tobytes(), exported_rgba.tobytes()
    require(source_rgba.size == exported_rgba.size and source_pixels == exported_pixels, f"Decoded pixel mismatch: {record['slug']}/{record['form']}/{record['expression']}")
    alpha = source_rgba.getchannel("A").getextrema()[0] < 255
    filename = record["expression"].replace("_", "-") + "-" + source_hash[:12] + ".webp"
    relative = Path(record["slug"]) / record["form"] / filename
    target = output / relative
    atomic_write(target, webp)
    asset = {"form": record["form"], "expression": record["expression"],
             "url": "jems-pals/" + relative.as_posix(),
             "sourceSHA256": source_hash, "exportedSHA256": digest(webp),
             "width": source_rgba.width, "height": source_rgba.height, "alpha": alpha,
             "decodedPixelParity": True, "decodedRGBA8SHA256": digest(source_pixels),
             "sourceBytes": len(raw), "exportedBytes": len(webp)}
    audit = {"slug": record["slug"], **asset, "sourcePath": str(record["path"]),
             "exportedPath": str(target), "sourceMode": source_mode, "exportedMode": exported_mode,
             "sourceDecodedRGBA8SHA256": digest(source_pixels),
             "exportedDecodedRGBA8SHA256": digest(exported_pixels),
             "alphaValuesIdentical": source_rgba.getchannel("A").tobytes() == exported_rgba.getchannel("A").tobytes(),
             "includesRGBUnderTransparentPixels": True}
    return (record["slug"], record["form"], record["expression"]), asset, audit


def ratio_report(manifest):
    rows = []
    for character in manifest["characters"]:
        for form, data in character["forms"].items():
            neutral = data["expressions"]["neutral"]
            neutral_ratio = neutral["width"] / neutral["height"]
            ratios = {state: asset["width"] / asset["height"] for state, asset in data["expressions"].items()}
            max_change = max(abs(value / neutral_ratio - 1) * 100 for value in ratios.values())
            rows.append({"slug": character["slug"], "form": form, "neutralAspectRatio": neutral_ratio,
                         "aspectRatios": ratios, "maxDifferenceFromNeutralPercent": max_change,
                         "maxToMinAspectRatioPercent": (max(ratios.values()) / min(ratios.values()) - 1) * 100})
    return {"forms": rows, "maxDifferenceFromNeutralPercent": max(r["maxDifferenceFromNeutralPercent"] for r in rows),
            "formsOverOnePercent": [r["slug"] + "/" + r["form"] for r in rows if r["maxDifferenceFromNeutralPercent"] > 1],
            "interpretation": "object-fit: contain preserves all frames. Matching aspect ratios do not establish pose/subject registration; use a stable container and do not claim a shared animation rig."}


def contact_sheets(manifest, output, folder):
    folder = Path(folder).resolve()
    require(not folder.is_relative_to(ROOT / "public"), "Review sheets must remain outside public/")
    folder.mkdir(parents=True, exist_ok=True)
    font = ImageFont.load_default(size=16)
    small = ImageFont.load_default(size=12)
    cell_w, cell_h = 270, 190
    sheets = []
    characters = manifest["characters"]
    for offset in range(0, len(characters), 4):
        group = characters[offset:offset + 4]
        sheet = Image.new("RGB", (4 * cell_w + 30, len(group) * 2 * cell_h + 65), "white")
        draw = ImageDraw.Draw(sheet)
        draw.text((15, 10), "Core Gem Pals - actual lossless WebP exports / complete frames", fill="#17213b", font=font)
        for row, character in enumerate(group):
            for form_index, (form, form_data) in enumerate(character["forms"].items()):
                y = 45 + (row * 2 + form_index) * cell_h
                for column, (state, asset) in enumerate(form_data["expressions"].items()):
                    x = 15 + column * cell_w
                    draw.text((x + 5, y), character["name"] + " · " + form + " · " + state, fill="#17213b", font=small)
                    image, _ = decode(output / Path(asset["url"]).relative_to("jems-pals"))
                    # Display scaling is confined to this internal sheet.
                    image.thumbnail((cell_w - 20, cell_h - 30), Image.Resampling.LANCZOS)
                    pad_x, pad_y = x + (cell_w - image.width) // 2, y + 22 + (cell_h - 30 - image.height) // 2
                    bg = Image.new("RGBA", image.size, "#f0f1f4")
                    bg_draw = ImageDraw.Draw(bg)
                    for by in range(0, image.height, 12):
                        for bx in range(0, image.width, 12):
                            if (bx // 12 + by // 12) % 2:
                                bg_draw.rectangle((bx, by, bx + 11, by + 11), fill="#d5d9e1")
                    bg.alpha_composite(image)
                    sheet.paste(bg.convert("RGB"), (pad_x, pad_y))
        path = folder / f"core-pal-exports-{offset // 4 + 1:02d}.png"
        sheet.save(path)
        sheets.append({"path": str(path), "sha256": file_digest(path), "characters": [c["slug"] for c in group]})
    return sheets


def run_export(args):
    require(features.check("webp"), "Pillow was built without WebP support")
    if args.require_pinned_encoder:
        require(PIL.__version__ == PINNED_PILLOW and features.version("webp") == PINNED_WEBP, "Pinned encoder requires Pillow 13.0.0 / libwebp 1.6.0")
    output = Path(args.output).resolve()
    require(output.name == "jems-pals", "Output directory must be named jems-pals")
    characters, records = source_records(args.kit)
    assets, audit_by_key = {}, {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [executor.submit(export_one, record, output) for record in records]
        for index, future in enumerate(concurrent.futures.as_completed(futures), 1):
            key, asset, audit = future.result()
            assets[key], audit_by_key[key] = asset, audit
            if index % 24 == 0 or index == len(records):
                print(f"Verified and exported {index}/{len(records)}", file=sys.stderr, flush=True)
    manifest = {"schemaVersion": 1, "assetVersion": VERSION,
                "scope": {"id": "original-23", "characterCount": 23, "assetCount": 184}, "characters": []}
    audits = []
    for character in characters:
        item = {**character, "forms": {}}
        for form in FORM_MAP.values():
            expressions = {state: assets[(character["slug"], form, state)] for state in STATES}
            item["forms"][form] = {"neutralFallback": expressions["neutral"]["url"],
                                    "neutralSourceSHA256": expressions["neutral"]["sourceSHA256"],
                                    "expressions": expressions}
            audits.extend(audit_by_key[(character["slug"], form, state)] for state in STATES)
        manifest["characters"].append(item)
    expected_files = {output / Path(a["url"]).relative_to("jems-pals") for a in assets.values()}
    actual_files = {p for slug in IDENTITIES for p in (output / slug).rglob("*.webp")}
    require(actual_files == expected_files, "Unregistered prior export exists; inspect it instead of silently deleting files")
    manifest_path = output / "manifest.json"
    write_json(manifest_path, manifest)
    source_bytes = sum(a["sourceBytes"] for a in assets.values())
    exported_bytes = sum(a["exportedBytes"] for a in assets.values())
    report = {"schemaVersion": 1, "status": "Pass", "assetVersion": VERSION,
              "sourceKitPackageVersion": "2.9", "manifestSHA256": file_digest(manifest_path),
              "encoder": {"pillow": PIL.__version__, "libwebp": features.version("webp"),
                          "lossless": True, "quality": 100, "method": 6, "exact": True},
              "counts": {"characters": 23, "forms": 46, "neutral": 46, "emotions": 138,
                         "assets": 184, "assetsWithTransparency": sum(a["alpha"] for a in assets.values())},
              "bytes": {"sourcePNG": source_bytes, "exportedWebP": exported_bytes,
                        "manifest": manifest_path.stat().st_size, "saved": source_bytes - exported_bytes,
                        "reductionPercent": (1 - exported_bytes / source_bytes) * 100},
              "allDecodedPixelsIdentical": True, "allAlphaValuesIdentical": True,
              "rgbUnderTransparentPixelsPreserved": True, "allOriginalFramesPreserved": True,
              "aspectRatios": ratio_report(manifest), "assets": audits,
              "contactSheets": contact_sheets(manifest, output, args.contact_sheets) if args.contact_sheets else []}
    if args.report:
        require(not Path(args.report).resolve().is_relative_to(ROOT / "public"), "Detailed audit must remain outside public/")
        write_json(args.report, report)
    print(json.dumps({k: report[k] for k in ("status", "manifestSHA256", "counts", "bytes")}, indent=2))


def run_verify(args):
    manifest_path = Path(args.manifest).resolve()
    manifest = json.loads(manifest_path.read_text())
    output = manifest_path.parent
    require(manifest["schemaVersion"] == 1 and manifest["assetVersion"] == VERSION, "Unsupported manifest")
    require(manifest["scope"] == {"id": "original-23", "characterCount": 23, "assetCount": 184}, "Unexpected scope")
    sources = {}
    if args.kit:
        _, records = source_records(args.kit)
        sources = {(r["slug"], r["form"], r["expression"]): r for r in records}
    audits = []
    seen_slots = set()
    require(len(manifest["characters"]) == 23, "Expected 23 original characters")
    for character in manifest["characters"]:
        require((character["characterKey"], character["speciesId"]) == IDENTITIES.get(character["slug"]), "Character identity mismatch")
        require(set(character["forms"]) == set(FORM_MAP.values()), "Expected two current forms")
        for form, form_data in character["forms"].items():
            require(set(form_data["expressions"]) == set(STATES), "Expected neutral plus three current emotions")
            for state, asset in form_data["expressions"].items():
                slot = (character["slug"], form, state)
                require(slot not in seen_slots and asset["form"] == form and asset["expression"] == state, "Duplicate or mismatched asset slot")
                seen_slots.add(slot)
                relative = Path(asset["url"])
                require(relative.parts[0] == "jems-pals" and ".." not in relative.parts, "Unsafe public URL")
                path = child_path(output, str(relative.relative_to("jems-pals")))
                raw = path.read_bytes()
                require(digest(raw) == asset["exportedSHA256"], "Exported byte hash mismatch")
                require(len(raw) == asset["exportedBytes"], "Exported byte count mismatch")
                image, _ = decode(raw)
                require(image.size == (asset["width"], asset["height"]), "Exported dimensions mismatch")
                pixels = image.tobytes()
                require(digest(pixels) == asset["decodedRGBA8SHA256"], "Exported decoded pixel digest mismatch")
                require((image.getchannel("A").getextrema()[0] < 255) == asset["alpha"], "Exported alpha mismatch")
                audit = {"slug": character["slug"], "form": form, "expression": state,
                         "sourceSHA256": asset["sourceSHA256"], "exportedSHA256": digest(raw),
                         "decodedRGBA8SHA256": digest(pixels), "width": image.width,
                         "height": image.height, "alpha": asset["alpha"], "decodedPixelsMatchRecordedSource": True}
                if sources:
                    record = sources[(character["slug"], form, state)]
                    source_raw = record["path"].read_bytes()
                    require(digest(source_raw) == asset["sourceSHA256"] == record["metadata"]["sha256"], "Source PNG hash mismatch")
                    require(len(source_raw) == asset["sourceBytes"] == record["metadata"]["size_bytes"], "Source PNG byte count mismatch")
                    source_image, _ = decode(source_raw)
                    require(source_image.size == image.size and source_image.tobytes() == pixels, "Fresh source/export decoded pixels differ")
                    require(form_data["neutralSourceSHA256"] == record["neutralSourceSHA256"], "Wrong own-form neutral binding")
                    audit["freshSourcePixelComparison"] = True
                audits.append(audit)
    require(len(audits) == 184, "Expected 184 audited assets")
    report = {"status": "Pass", "assetVersion": VERSION, "manifestSHA256": file_digest(manifest_path),
              "decodedAssets": len(audits), "freshSourcePNGComparison": bool(sources),
              "allDecodedPixelsMatch": True, "allAlphaValuesMatch": True,
              "rgbUnderTransparentPixelsIncluded": True, "assets": audits}
    print(json.dumps(report))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    export = commands.add_parser("export", help="Create exact lossless runtime derivatives")
    export.add_argument("--kit", required=True)
    export.add_argument("--output", default=str(ROOT / "public" / "jems-pals"))
    export.add_argument("--report")
    export.add_argument("--contact-sheets")
    export.add_argument("--workers", type=int, default=min(6, os.cpu_count() or 1))
    export.add_argument("--require-pinned-encoder", action="store_true")
    verify = commands.add_parser("verify-pixels", help="Freshly decode exports and optionally compare the approved PNG kit")
    verify.add_argument("--manifest", default=str(ROOT / "public" / "jems-pals" / "manifest.json"))
    verify.add_argument("--kit")
    args = parser.parse_args()
    if args.command == "export":
        require(1 <= args.workers <= 16, "Use between 1 and 16 workers")
        run_export(args)
    else:
        run_verify(args)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Pal asset operation failed: {error}", file=sys.stderr)
        sys.exit(1)
