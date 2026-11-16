#!/usr/bin/env python3
"""Build a self-contained progress + asset-gallery HTML page for the Krynn project.

Scans renders/ for decoded PNGs (from tools/dax_decode.py and tools/daa_decode.py),
groups them by format / game / source asset, reads each PNG's dimensions, and writes
a single `progress.html` at the repo root that references the images by relative path
(works when opened via file://). Re-run after generating new renders.

Usage:  python tools/build_gallery.py
"""
from __future__ import annotations

import json
import re
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RENDERS = ROOT / "renders"
OUT = ROOT / "progress.html"

# ---- progress data (kept in sync with docs/findings.md + CLAUDE.md roadmap) ----
ROADMAP = [
    ("done", "Catalog DOS data (DAX for CoK/DoK; HLIB for DQK)", "docs/dos-inventory.md"),
    ("done", "Extract Amiga CoK/DoK disk assets (unadf)", "docs/amiga-inventory.md"),
    ("done", "Reverse + decode DOS .DAX graphics (verified byte-identical to DaxDump.exe)", "docs/dax-format.md"),
    ("done", "Reverse + decode Amiga .DAA graphics (planar, 32-color, cross-validated vs DOS)", "docs/daa-format.md"),
    ("done", "Decode DQK HLIB graphics (Chain-4 8bpp, in-file 256-color palette; title+credits verified)", "docs/hlib-format.md"),
    ("partial", "Solve remaining frame variants: DAX/DAA sub-frame index (SPRIT*/PIC*/HEAD*), 8X8 tile palette, HLIB method 25", ""),
    ("todo", "Build HLIB repacker; convert Amiga 32-color art -> DQK VGA 256-color HLIB", ""),
    ("todo", "Port CoK/DoK content (GEO/MON/ITEM/ECL) onto the DQK engine; handle ECL drift", ""),
    ("todo", "Build & verify two DOS executables (CoK & DoK on the DQK engine) under DOSBox", ""),
    ("future", "Secondary goal: browser Gold Box engine (shared format library) — see docs/web-engine-plan.md", "docs/web-engine-plan.md"),
]

FORMAT_FACTS = [
    ("DOS .DAX (CoK/DoK)", "little-endian; word0 = entries*9; 9-byte TOC {id,u32 off,u16 raw,u16 comp}; signed-byte RLE; chunky 4bpp; fixed EGA-16 palette"),
    ("Amiga .DAA (CoK/DoK)", "big-endian; same TOC/RLE; 5 contiguous bitplanes (planar), word-aligned stride; embedded per-frame 32-color 0x0RGB palette (x17)"),
    ("DOS HLIB (DQK .TLB/.GLB)", "'HLIB' container, typed chunks TILE/DIG4/DATA; VGA 256-color, palette embedded (6-bit DAC). Decoder = next milestone"),
]

VERDICTS = [
    ("Champions of Krynn", "Amiga", "DOS is EGA 16-color only; Amiga = 32 colors, richer art"),
    ("Death Knights of Krynn", "Amiga", "DOS is EGA 16-color only; Amiga = 32 colors"),
    ("The Dark Queen of Krynn", "DOS VGA", "256-color VGA; Amiga DQK is only 32-color"),
]

HERO = "renders/daa/_compare_BIGPIC1_114_DOS_top_AMIGA_bottom.png"

ASSET_KIND = {
    "BIGPIC": "Story / box-art scenes", "PIC": "Scene pictures", "CPIC": "Combat portraits",
    "BACK": "Combat backdrops", "SPRIT": "Sprites", "COMSPR": "Combat sprites",
    "8X8D": "8x8 dungeon tiles", "8X8": "8x8 tiles", "CHEAD": "Character heads",
    "HEAD": "Heads", "BODY": "Bodies", "CBODY": "Combat bodies", "TITLE": "Title screen",
    "WALLDEF": "Wall textures", "SKY": "Sky", "BORDER": "UI border", "DUNGCOM": "Dungeon UI",
    "WILDCOM": "Wilderness UI", "RANDCOM": "Random-combat UI", "scrn": "Title/intro screen",
    "Title": "Title screen", "text": "Text screen", "gothic": "Font", "char": "Charset",
}


def png_size(p: Path):
    try:
        with open(p, "rb") as f:
            head = f.read(24)
        if head[:8] == b"\x89PNG\r\n\x1a\n" and head[12:16] == b"IHDR":
            w, h = struct.unpack(">II", head[16:24])
            return w, h
    except Exception:
        pass
    return None, None


def game_of(rel: str, fmt: str = "") -> str:
    s = rel.lower()
    if fmt == "hlib" or "/hlib/" in s or "dqk" in s or "dark queen" in s:
        return "DQK"
    if "deathknight" in s or "dok" in s:
        return "DoK"
    if "champion" in s or "cok" in s:
        return "CoK"
    if "/lbm/" in s:
        return "Title"
    return "?"


def asset_base(fname: str) -> str:
    stem = re.sub(r"\.(png)$", "", fname, flags=re.I)
    stem = re.sub(r"[_-]?\d+$", "", stem)  # strip trailing frame number
    return stem or fname


def kind_of(base: str) -> str:
    for k, v in ASSET_KIND.items():
        if base.upper().startswith(k.upper()):
            return v
    return "Other"


def main() -> None:
    if not RENDERS.exists():
        raise SystemExit("no renders/ folder — run the decoders first")

    items = []
    for p in sorted(RENDERS.rglob("*.png")):
        rel = p.relative_to(ROOT).as_posix()
        if p.name.startswith("_"):  # skip _compare_, _gallery_preview, scratch
            continue
        parts = rel.split("/")
        fmt = parts[1] if len(parts) > 1 else "?"  # dax / daa / hlib
        g = game_of(rel, fmt)
        base = asset_base(p.name)
        w, h = png_size(p)
        items.append({"path": rel, "fmt": fmt, "game": g, "asset": base,
                      "kind": kind_of(base), "w": w, "h": h, "name": p.name})

    # group by (fmt, game, asset); dedupe frames by filename, keep first path
    groups = {}
    for it in items:
        key = (it["fmt"], it["game"], it["asset"])
        g = groups.setdefault(key, {"fmt": it["fmt"], "game": it["game"], "asset": it["asset"],
                                    "kind": it["kind"], "frames": {}})
        g["frames"].setdefault(it["name"], it)
    group_list = []
    for (fmt, game, asset), g in groups.items():
        frames = sorted(g["frames"].values(), key=lambda x: x["name"])
        dims = sorted({f"{f['w']}x{f['h']}" for f in frames if f["w"]})
        group_list.append({"fmt": fmt, "game": game, "asset": asset, "kind": g["kind"],
                           "count": len(frames), "dims": dims,
                           "frames": [{"path": f["path"], "name": f["name"], "w": f["w"], "h": f["h"]} for f in frames]})
    group_list.sort(key=lambda x: (x["fmt"], x["game"], x["asset"]))

    stats = {
        "groups": len(group_list),
        "images": sum(g["count"] for g in group_list),
        "dax": sum(g["count"] for g in group_list if g["fmt"] == "dax"),
        "daa": sum(g["count"] for g in group_list if g["fmt"] == "daa"),
        "hlib": sum(g["count"] for g in group_list if g["fmt"] == "hlib"),
    }

    manifest = {"groups": group_list, "stats": stats, "roadmap": ROADMAP,
                "facts": FORMAT_FACTS, "verdicts": VERDICTS, "hero": HERO}
    html = TEMPLATE.replace("/*__DATA__*/", json.dumps(manifest))
    OUT.write_text(html, encoding="utf-8")
    print(f"wrote {OUT}  ({stats['images']} images in {stats['groups']} groups; "
          f"dax={stats['dax']} daa={stats['daa']})")


TEMPLATE = r"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gold Box — Krynn Trilogy: Progress & Asset Browser</title>
<style>
:root{--bg:#0d1117;--panel:#161b22;--border:#30363d;--fg:#e6edf3;--mut:#8b949e;
  --accent:#d29922;--green:#3fb950;--blue:#58a6ff;--purple:#bc8cff;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
a{color:var(--blue);text-decoration:none}a:hover{text-decoration:underline}
header{padding:24px 20px;border-bottom:1px solid var(--border);background:linear-gradient(180deg,#1b2330,#0d1117)}
h1{margin:0 0 4px;font-size:22px}h2{font-size:16px;margin:0 0 10px;color:var(--accent)}
.sub{color:var(--mut)}
.wrap{max-width:1280px;margin:0 auto;padding:20px}
.cards{display:flex;gap:12px;flex-wrap:wrap;margin:14px 0}
.card{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:12px 16px;min-width:120px}
.card .n{font-size:24px;font-weight:700}.card .l{color:var(--mut);font-size:12px}
.panel{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:16px;margin:16px 0}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:880px){.grid2{grid-template-columns:1fr}}
ul.road{list-style:none;padding:0;margin:0}
ul.road li{padding:6px 0;border-bottom:1px solid #21262d;display:flex;gap:10px;align-items:baseline}
.badge{font-size:11px;padding:2px 8px;border-radius:10px;white-space:nowrap;font-weight:600}
.b-done{background:#11331d;color:var(--green);border:1px solid #1f5132}
.b-partial{background:#3a2d10;color:var(--accent);border:1px solid #6b5118}
.b-todo{background:#21262d;color:var(--mut);border:1px solid #30363d}
.b-future{background:#241a36;color:var(--purple);border:1px solid #3f2d63}
table{width:100%;border-collapse:collapse;font-size:13px}
td,th{text-align:left;padding:6px 8px;border-bottom:1px solid #21262d;vertical-align:top}
th{color:var(--mut);font-weight:600}
code{background:#0b0f14;border:1px solid var(--border);border-radius:4px;padding:1px 5px;font-size:12px}
.controls{display:flex;gap:10px;flex-wrap:wrap;align-items:center;position:sticky;top:0;
  background:var(--bg);padding:12px 0;z-index:5;border-bottom:1px solid var(--border)}
.controls input,.controls select{background:var(--panel);border:1px solid var(--border);color:var(--fg);
  border-radius:6px;padding:7px 10px;font-size:13px}
.controls input[type=range]{padding:0}
button.tab{background:var(--panel);border:1px solid var(--border);color:var(--fg);border-radius:6px;
  padding:7px 12px;cursor:pointer}
button.tab.on{background:var(--accent);color:#000;border-color:var(--accent);font-weight:600}
.group{margin:22px 0}
.group h3{margin:0 0 4px;font-size:15px;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
.tag{font-size:11px;padding:2px 7px;border-radius:4px;border:1px solid var(--border);color:var(--mut)}
.tag.dax{color:#ffd479;border-color:#6b5118}.tag.daa{color:#7ee787;border-color:#1f5132}
.tag.hlib{color:#79c0ff;border-color:#1f4068}
.gtools{margin:0 0 8px;color:var(--mut);font-size:12px}
.thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--cell,120px),1fr));gap:10px}
.thumb{background:#06090d;border:1px solid var(--border);border-radius:6px;padding:6px;cursor:pointer;text-align:center}
.thumb:hover{border-color:var(--blue)}
.thumb img{width:100%;height:auto;image-rendering:pixelated;display:block;border-radius:3px;background:#000}
.thumb .cap{font-size:11px;color:var(--mut);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hero img{max-width:100%;image-rendering:pixelated;border:1px solid var(--border);border-radius:6px}
#lb{position:fixed;inset:0;background:rgba(0,0,0,.92);display:none;align-items:center;justify-content:center;
  flex-direction:column;z-index:50;padding:20px}
#lb img{max-width:92vw;max-height:80vh;image-rendering:pixelated;border:1px solid var(--border)}
#lb .meta{color:var(--fg);margin-top:12px;font-size:13px;text-align:center}
#lb .hint{color:var(--mut);font-size:12px;margin-top:6px}
.hidden{display:none!important}
</style></head>
<body>
<header><div class="wrap" style="padding:0">
  <h1>Gold Box — Krynn Trilogy <span class="sub">· decompile &amp; rebuild progress</span></h1>
  <div class="sub">Champions of Krynn · Death Knights of Krynn · The Dark Queen of Krynn —
    extracted &amp; decoded assets and project status. Generated by <code>tools/build_gallery.py</code>.</div>
  <div class="cards" id="cards"></div>
</div></header>
<div class="wrap">

  <div class="grid2">
    <div class="panel"><h2>Roadmap</h2><ul class="road" id="road"></ul></div>
    <div>
      <div class="panel"><h2>"Best graphics" verdict</h2>
        <table id="verdicts"><thead><tr><th>Game</th><th>Best source</th><th>Why</th></tr></thead><tbody></tbody></table>
      </div>
      <div class="panel"><h2>Decoded formats</h2>
        <table id="facts"><tbody></tbody></table>
      </div>
    </div>
  </div>

  <div class="panel hero"><h2>Proof: same scene, two formats</h2>
    <div class="sub" style="margin-bottom:8px">Champions of Krynn <code>BIGPIC1</code> block&nbsp;114, decoded independently —
      DOS <b>EGA&nbsp;16-color</b> (top) vs Amiga <b>32-color</b> (bottom). Same art, richer palette.</div>
    <img id="hero" alt="DOS vs Amiga comparison">
  </div>

  <h2 style="margin-top:28px">Asset browser</h2>
  <div class="controls">
    <div id="fmtTabs"></div>
    <select id="game"></select>
    <select id="kind"></select>
    <input id="q" type="text" placeholder="search asset… (BIGPIC, CPIC, 8X8…)" size="22">
    <label class="sub">size <input id="zoom" type="range" min="64" max="320" value="120"></label>
    <span class="sub" id="shown"></span>
  </div>
  <div id="gallery"></div>
</div>

<div id="lb" onclick="this.style.display='none'">
  <img id="lbimg"><div class="meta" id="lbmeta"></div><div class="hint">click anywhere to close</div></div>

<script>
const DATA = /*__DATA__*/;
const $=s=>document.querySelector(s), el=(t,c,h)=>{const e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e;};

// cards
const C=$('#cards'); const cards=[['groups','asset sets'],['images','decoded images'],['dax','DOS .DAX'],['daa','Amiga .DAA'],['hlib','DOS HLIB (DQK)']];
cards.forEach(([k,l])=>{const d=el('div','card');d.append(el('div','n',DATA.stats[k]));d.append(el('div','l',l));C.append(d);});

// roadmap
const R=$('#road');
DATA.roadmap.forEach(([st,txt,doc])=>{const li=el('li');li.append(el('span','badge b-'+st,st));
  const t=el('span',null,txt+(doc?` &nbsp;<a href="${doc}">${doc}</a>`:''));li.append(t);R.append(li);});

// verdicts + facts
DATA.verdicts.forEach(([g,b,w])=>{const tr=el('tr');tr.innerHTML=`<td>${g}</td><td><b>${b}</b></td><td class="sub">${w}</td>`;$('#verdicts tbody').append(tr);});
DATA.facts.forEach(([n,d])=>{const tr=el('tr');tr.innerHTML=`<td style="white-space:nowrap"><b>${n}</b></td><td class="sub">${d}</td>`;$('#facts tbody').append(tr);});
$('#hero').src=DATA.hero;

// filters
let fmt='all';
const games=[...new Set(DATA.groups.map(g=>g.game))].sort();
const kinds=[...new Set(DATA.groups.map(g=>g.kind))].sort();
const gameSel=$('#game'); gameSel.append(new Option('all games','all')); games.forEach(g=>gameSel.append(new Option(g,g)));
const kindSel=$('#kind'); kindSel.append(new Option('all kinds','all')); kinds.forEach(k=>kindSel.append(new Option(k,k)));
const FMTLBL={dax:'DOS .DAX',daa:'Amiga .DAA',hlib:'DOS HLIB (DQK)'};
const ft=$('#fmtTabs'); [['all','All'],['dax','DOS .DAX'],['daa','Amiga .DAA'],['hlib','DOS HLIB (DQK)']].forEach(([v,l])=>{
  const b=el('button','tab'+(v==='all'?' on':''),l);b.onclick=()=>{fmt=v;[...ft.children].forEach(x=>x.classList.remove('on'));b.classList.add('on');render();};ft.append(b);});

$('#zoom').oninput=e=>document.documentElement.style.setProperty('--cell',e.target.value+'px');
['game','kind','q'].forEach(id=>$('#'+id).oninput=render);

function lb(src,meta){$('#lbimg').src=src;$('#lbmeta').innerHTML=meta;$('#lb').style.display='flex';}

function render(){
  const G=$('#gallery'); G.innerHTML='';
  const q=$('#q').value.trim().toLowerCase(), game=gameSel.value, kind=kindSel.value;
  let shownG=0, shownI=0;
  DATA.groups.forEach(grp=>{
    if(fmt!=='all'&&grp.fmt!==fmt)return;
    if(game!=='all'&&grp.game!==game)return;
    if(kind!=='all'&&grp.kind!==kind)return;
    if(q&&!(grp.asset.toLowerCase().includes(q)||grp.kind.toLowerCase().includes(q)))return;
    shownG++; shownI+=grp.count;
    const sec=el('div','group');
    const h=el('h3'); h.append(el('span',null,grp.asset));
    h.append(el('span','tag '+grp.fmt, FMTLBL[grp.fmt]||grp.fmt.toUpperCase()));
    h.append(el('span','tag', grp.game));
    h.append(el('span','tag', grp.kind));
    sec.append(h);
    sec.append(el('div','gtools',`${grp.count} frame(s) · ${grp.dims.join(', ')||'?'}`));
    const t=el('div','thumbs');
    grp.frames.forEach(fr=>{
      const c=el('div','thumb');
      const im=el('img'); im.loading='lazy'; im.src=fr.path; im.alt=fr.name;
      const meta=`${grp.asset} — ${fr.name}<br><span class="hint">${grp.game} · ${grp.fmt.toUpperCase()} · ${fr.w}x${fr.h} · ${fr.path}</span>`;
      c.onclick=()=>lb(fr.path,meta);
      c.append(im); c.append(el('div','cap',fr.name.replace(/\.png$/i,'')));
      t.append(c);
    });
    sec.append(t); G.append(sec);
  });
  $('#shown').textContent=`${shownI} images in ${shownG} sets`;
  if(!shownG)G.append(el('div','sub','No assets match the filter.'));
}
render();
</script>
</body></html>
"""

if __name__ == "__main__":
    main()
