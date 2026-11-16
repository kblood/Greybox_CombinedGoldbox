#!/usr/bin/env python3
"""Manual ChatGPT-web-UI restyle package for Gold Box art (no API, no network).

  python tools/imggen_webpack.py make   [--manifest M.json] [--batch batch01]
  python tools/imggen_webpack.py import [--batch batch01] [--batch-dir DIR] [--out-dir DIR] [--require-complete]

By default everything is written under renders/imggen/webpack/ (git-ignored; art stays local).
Reuses the alpha / nearest-kron conventions of renders/imggen/esrgan.py.
"""
import argparse, hashlib, io, json, os, re
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, 'renders', 'imggen', 'webpack')
CANVAS = (1536, 1024)
GREY = (128, 128, 128)
FLAG = dict(edge_corr_min=0.30, hist_dist_max=0.55, aspect_dev_max=0.04)

STYLE = ("Realistic painted / photographic fantasy illustration, Dragonlance setting, the world of Krynn. "
         "Cinematic lighting, rich natural textures, high detail.")
CONSTRAINT = ("Keep the exact composition, colours, perspective and placement of the attached image. "
              "Do not add any text, logo, border or frame. Do not crop or move anything. "
              "Output a 3:2 landscape image (1536x1024); the neutral grey padding, if any, should be filled "
              "by continuing the picture naturally or left as plain grey.")


# ---------------------------------------------------------------- manifest
LAYER_CONSTRAINT = ("Keep the exact composition, silhouette, perspective and placement of the attached image. "
                    "Do not crop or move anything. Output a 3:2 landscape image (1536x1024). The flat key colour "
                    "everywhere outside the artwork, including the padding, must stay perfectly flat and unchanged.")


def key_name(key):
    return {(0, 255, 0): 'pure green', (255, 0, 255): 'pure magenta', (0, 255, 255): 'pure cyan', (255, 128, 0): 'orange',
            (0, 128, 255): 'azure blue', (255, 0, 0): 'pure red', (255, 255, 0): 'pure yellow', (0, 0, 255): 'pure blue'}.get(tuple(key), 'flat')


def layer_prompt(e):
    L = e['layer']
    key = L.get('key') or [0, 255, 0]
    hexk = '#%02X%02X%02X' % tuple(key)
    t = ["", "[LAYER]",
         "This image is an OVERLAY LAYER that the game draws on top of another picture (%s). Everything that is the flat "
         "%s background (%s) is empty space and will be made transparent afterwards. Keep that background perfectly flat, "
         "uniform and exactly %s: no gradient, texture, shadow, glow, vignette or border, and do not paint the scene behind "
         "the artwork. Restyle only the artwork itself (materials, lighting, detail) and keep its outer silhouette "
         "sharp and in the same place and size." % (L.get('parent') or 'the background picture', key_name(key), hexk, hexk)]
    if L.get('context'):
        t.append("A second attached file (%s) only shows where this layer sits on its background: use it as a colour/style "
                 "reference, do not output it and do not paint any of it." % L['context'])
    return chr(10).join(t)


def pilot_manifest():
    R = 'renders/'

    def it(id, kind, path, div, desc, **kw):
        d = dict(id=id, kind=kind, src=R + path, native_div=div, description=desc)
        d.update(kw)
        return d
    bible_a = ("CHARACTER BIBLE (keep identical across all images of her): a young woman, tan skin, thick dark-brown "
               "curly hair, purple headband, small silver hoop earring, brown eyes, confident slight smile.")
    bible_b = ("CHARACTER BIBLE (keep identical across all images of her): a young woman, fair skin, long wavy "
               "copper-red hair with fringe, green eyes, calm expression, scholar's study (skull, books, green potion).")
    return [
        it('logo_dok_dragonlance', 'logo', 'dax/DoK_TITLE/TITLE_003.png', 4,
           "A wide title banner reading 'A DRAGONLANCE Fantasy Role-Playing Epic Vol. II': ornate gold-and-silver "
           "lettering with a sword running through the title on the left, on a dark speckled purple-blue starry background.",
           logo_text="A DRAGONLANCE Fantasy Role-Playing Epic Vol. II"),
        it('scene_cok_cottage', 'scene', 'daa/BIGPIC1_ChampionsOfKrynn/BIGPIC1_112.png', 4,
           "A thatched, steep-roofed timber cottage nestled beneath a huge gnarled spreading tree, green hillside, teal sky."),
        it('scene_cok_draconian', 'scene', 'daa/BIGPIC1_ChampionsOfKrynn/BIGPIC1_114.png', 4,
           "A large armoured draconian with wings holds a blonde woman captive on the right; a warrior with a horned helmet "
           "stands at the left with a raised sword; grassland, cloudy sky, smoke and burning fires in the right background."),
        it('scene_dok_skeleton_dragon', 'scene', 'dax/DoK_BIGPIC1/BIGPIC1_113.png', 1,
           "A skeletal rider on a skeletal undead dragon flying across a dark night sky, a pale moon and a red moon at the "
           "upper left, wolves or hounds on the ground at the right. Dominant colours: deep blue, purple, bone white. "
           "IMPORTANT: also keep the faint, dark, shadowy hooded Death Knight figures standing in the background; they are "
           "very dark in the original but must stay visible as dim silhouettes, do not drop them."),
        it('scene_dqk_riders', 'scene', 'hlib/BIGPIC/BIGPIC_set03_img001.png', 2,
           "A group of armoured mounted knights and skeletal riders on horses, swords and lances raised, grey-purple stormy sky behind them."),
        it('face_cok_amiga_068', 'face', 'daa/cok_head1/HEAD1_068.png', 6,
           "Bust portrait of a woman with dark curly brown hair and a purple headband, a small hoop earring, bare shoulders; "
           "behind her a stone wall with two swords at the left and a large axe blade at the upper right.", bible=bible_a),
        it('face_cok_amiga_069', 'face', 'daa/cok_head1/HEAD1_069.png', 6,
           "Bust portrait of a young woman with long wavy copper-red hair and green eyes; behind her a shelf with a skull, "
           "books, a green potion flask and a blue scroll.", bible=bible_b),
        it('face_cok_dos_068', 'face', 'dax/cok_head2/HEAD2_068.png', 6,
           "Same woman as the Amiga HEAD 068 in a 16-colour DOS rendition: dark red-brown curly hair, purple headband, sword "
           "hilts at left, axe blade at upper right, stone wall.", bible=bible_a),
        it('face_cok_dos_069', 'face', 'dax/cok_head2/HEAD2_069.png', 6,
           "Same woman as the Amiga HEAD 069 in a 16-colour DOS rendition: long wavy orange-red hair, green eyes, skull on a "
           "shelf at upper right, books and a green potion flask below.", bible=bible_b),
        it('band_cok_title_art', 'band', 'dax/CoK_TITLE/TITLE_002.png', 4,
           "Champions of Krynn title illustration: a night sky with a large pale-cyan moon and a small red moon, a dark castle "
           "silhouette, a huge ornate sword at the right, a golden crown and red roses at the lower right, blue-purple starfield."),
        it('band_dok_ssi_presents', 'band', 'dax/DoK_TITLE/TITLE_001.png', 4,
           "A blue screen with the red-and-white SSI logo at top, then the centered text 'STRATEGIC SIMULATIONS, INC. PRESENTS "
           "AN Official Advanced Dungeons & Dragons COMPUTER PRODUCT' and copyright lines at the bottom.",
           logo_text="STRATEGIC SIMULATIONS, INC. PRESENTS AN Official Advanced Dungeons & Dragons COMPUTER PRODUCT"),
        it('band_dqk_world_map', 'band', 'hlib/BIGPIC/BIGPIC_set01_img001.png', 2,
           "A fantasy overworld map seen from above: blue sea and coast at left, green forests and valleys, brown/orange "
           "mountain ranges, rivers, tiny town icons.", map=True),
    ]


# ---------------------------------------------------------------- helpers
def load_native(path, div):
    im = Image.open(path).convert('RGBA')
    if div > 1:
        a = np.array(im)[div // 2::div, div // 2::div]
        im = Image.fromarray(np.ascontiguousarray(a))
    return im


def fit_box(w, h, canvas=CANVAS):
    s = int(min(canvas[0] // w, canvas[1] // h))
    if s >= 1:
        tw, th = w * s, h * s
    else:  # source larger than canvas: shrink to fit
        s = min(canvas[0] / w, canvas[1] / h)
        tw, th = max(1, int(w * s)), max(1, int(h * s))
    return s, [(canvas[0] - tw) // 2, (canvas[1] - th) // 2, tw, th]


def make_input(im, canvas=CANVAS, pad=GREY):
    w, h = im.size
    s, box = fit_box(w, h, canvas)
    a = np.array(im)
    rgb = a[..., :3].copy()
    rgb[a[..., 3] == 0] = pad  # transparent -> neutral grey (or the layer key colour) in the input
    big = Image.fromarray(rgb).resize((box[2], box[3]), Image.NEAREST)
    can = Image.new('RGB', canvas, tuple(int(v) for v in pad))
    can.paste(big, (box[0], box[1]))
    return can, s, box


GAME_CONTEXT_RULE = ("Use this game text only as background for what is happening in the scene. The attached picture is the "
                     "authority for the composition and for every visible detail; if the text and the picture disagree, follow the "
                     "picture. Do NOT draw any of this text, or any other lettering, into the image.")


def game_context_lines(e):
    """'[GAME CONTEXT]' block for a manifest item carrying `game_context` ({text, kind, speech_removed, ...} from
    tools/imggen_candidates.py), or []. Quoted speech never reaches here (it is removed upstream and labelled)."""
    g = e.get('game_context')
    if not g or not g.get('text'):
        return []
    what = ('narration shown with this picture' if g.get('kind') == 'narration' and not g.get('speech_removed')
            else 'narration shown with this picture (quoted character speech omitted: it is not a description of the scene)')
    txt = g['text'].strip().replace('"', "'")
    return ["", "[GAME CONTEXT]", 'In the original game, the %s reads: "%s"' % (what, txt), GAME_CONTEXT_RULE]


def build_prompt(e, bgonly=False):
    k = e['kind']
    L = ["[STYLE]", STYLE, "", "[CONTENT]"]
    L.append({'scene': "Fantasy scene illustration.", 'face': "Character portrait.", 'logo': "Title logo banner.",
              'band': "Title / intro screen.", 'sprite': "Creature sprite."}.get(k, "Illustration.")
             + " Original description: " + e['description'])
    if e.get('map'):
        L.append("Treat it as a hand-painted fantasy map; keep every coastline, river, mountain and town icon where it is.")
    if k == 'face':
        L.append(e.get('bible', "CHARACTER BIBLE: keep this person's identity identical across images."))
    lay = e.get('layer')
    if lay:
        L.append(layer_prompt(e))
    has_text = k in ('logo', 'band') and e.get('logo_text')
    if has_text:
        if bgonly:
            L.append("BACKGROUND ONLY VARIANT: remove all lettering and logos; paint only the background and decorative art "
                     "(the text will be re-added by hand). Leave the area where the text was as clean background.")
        else:
            L.append("Keep every letter EXACTLY as in the attached image, same wording, same spelling, same positions: '%s'. "
                     "Only restyle the materials (metal, gold, stone) and the background; do not rewrite or add lettering."
                     % e['logo_text'])
    L += game_context_lines(e)
    L += ["", "[CONSTRAINTS]", LAYER_CONSTRAINT if lay else CONSTRAINT, "", "[SAVE AS]"]
    if bgonly:
        L.append("done/%s_bgonly_out.png" % e['stem'])
    else:
        L.append("done/%s_out.png" % e['stem'])
    return "\n".join(L) + "\n"


INSTR_DA = """# Gold Box restyle-pakke - {batch}

Manuel arbejdsgang med ChatGPT i browseren (ingen API). Alt forbliver lokalt og skal IKKE i git.

## For hvert billede (se manifest.json for listen)
1. Aabn en NY chat i ChatGPT (billedgenerering aktiveret). En ny chat per billede giver bedre stilkonsistens.
2. Traek `NNN_<id>_input.png` ind i chatten.
3. Aabn `NNN_<id>_prompt.txt`, kopier hele teksten og indsaet den. Send.
4. Hent resultatet og gem det som `NNN_<id>_out.png` i mappen `done/` (filnavnet staar nederst i prompt-filen
   under [SAVE AS]). Formatet skal vaere 3:2 (typisk 1536x1024).
5. Ansigter (`face_*`): brug "character bible"-linjen uaendret. Generer foerst det ene ansigt og vedhaeft det
   som reference naar det samme menneske vises i flere billeder.
6. Logo/titel: hvis bogstaverne bliver forkerte, brug `NNN_<id>_prompt_bgonly.txt` (kun baggrund), gem som
   `NNN_<id>_bgonly_out.png` og laeg teksten paa bagefter. Import bruger kun `_out.png`; bgonly-filer ignoreres.

## Naar du er faerdig
    python tools/imggen_webpack.py import --batch {batch}

Det fjerner padding/beskaering, skalerer til noejagtig k x originalstoerrelse (k >= 3), genpaasaetter original alpha,
skriver `renders/imggen/webpack/out/` samt `fidelity.json` og `contact_sheet.png` (original | resultat).
Billeder markeret FLAG har aendret komposition/farver/format og boer laves om (stram prompten).

## Taerskler
kantkorrelation >= {e}, histogramafstand <= {h}, billedformat-afvigelse <= {a}.
"""


def pick_k(w, h, min_k=3, target=1600, max_k=16):
    return int(min(max_k, max(min_k, -(-target // max(w, h)))))


# ---------------------------------------------------------------- make
def resolve_layer(e, im):
    """Layer spec of a manifest item -> dict(rgba native RGBA with matte alpha, parent_rgb|None, x, y, role, parent, parent_source).
    `layer` is either 'auto' (derive from the game bytes via imggen_layers) or an explicit dict
    {rgba_src, [parent_src], x, y, [role, parent, parent_source]} with ROOT-relative or absolute paths."""
    L = e.get('layer')
    if not L:
        return None
    import imggen_layers as LY
    if L == 'auto':
        rec = LY.classify_source(e['src'], e['id'], native_size=im.size)
        b = LY.build_layer(rec, e['src'], im.size)
        if not b:
            raise ValueError('layer=auto but no derivable overlay for %s (role %s)' % (e['id'], rec.get('role')))
        return dict(rgba=b['rgba'], parent_rgb=b['parent_rgb'], x=int(b['x']), y=int(b['y']), role=b['role'],
                    parent=rec.get('parent'), parent_source=b.get('parent_source'))
    def path(p):
        return p if os.path.isabs(p) else os.path.join(ROOT, p)
    rgba = np.array(Image.open(path(L['rgba_src'])).convert('RGBA'))
    par = np.array(Image.open(path(L['parent_src'])).convert('RGB')) if L.get('parent_src') else None
    return dict(rgba=rgba, parent_rgb=par, x=int(L['x']), y=int(L['y']), role=L.get('role', 'overlay'),
                parent=L.get('parent'), parent_source=L.get('parent_source') or L.get('parent_src'))


def load_manifest(path):
    """A manifest is a list of items, or {'sequence': {...}, 'items': [...]} as written by sequence-manifest."""
    m = json.load(open(path))
    if isinstance(m, dict):
        return m.get('items', []), m.get('sequence')
    return m, None


def cmd_make(a):
    seq = None
    if a.manifest:
        man, seq = load_manifest(a.manifest)
    else:
        man = pilot_manifest()
    # steps already restyled in an earlier batch are listed in sequence.json but not generated again
    skipped = [e for e in man if e.get('skip')]
    man = [e for e in man if not e.get('skip')]
    bdir = os.path.join(WEB, a.batch)
    os.makedirs(os.path.join(bdir, 'done'), exist_ok=True)
    os.makedirs(os.path.join(bdir, 'native'), exist_ok=True)
    out = []
    for i, e in enumerate(man, 1):
        e = dict(e)
        e['stem'] = '%03d_%s' % (i, e['id'])
        src = e['src'] if os.path.isabs(e['src']) else os.path.join(ROOT, e['src'])
        im = load_native(src, e.get('native_div', 1))
        lay = resolve_layer(e, im)
        if lay:
            import imggen_layers as LY
            rgba = lay['rgba']
            key, kd = LY.choose_key(rgba[..., :3], rgba[..., 3])
            keyed = Image.fromarray(np.dstack([LY.layer_on_key(rgba, key), np.full(rgba.shape[:2], 255, np.uint8)]))
            can, s, box = make_input(keyed, pad=key)
            im = Image.fromarray(rgba)  # native layer with matte alpha
            ctx = None
            if lay['parent_rgb'] is not None:
                comp = LY.composite(lay['parent_rgb'], rgba, lay['x'], lay['y'])
                cctx, _, _ = make_input(Image.fromarray(np.dstack([comp, np.full(comp.shape[:2], 255, np.uint8)])))
                ctx = e['stem'] + '_context.png'
                cctx.save(os.path.join(bdir, ctx))
                Image.fromarray(lay['parent_rgb']).save(os.path.join(bdir, 'native', e['stem'] + '_parent.png'))
            e['layer'] = dict(role=lay['role'], parent=lay['parent'], parent_source=lay['parent_source'], x=lay['x'], y=lay['y'],
                              key=list(key), key_min_distance=round(kd, 1), matte_fraction=round(float((rgba[..., 3] > 0).mean()), 4),
                              context=ctx, rule='alpha = foreground matte; input = layer on flat key colour')
        else:
            can, s, box = make_input(im)
        can.save(os.path.join(bdir, e['stem'] + '_input.png'))
        im.save(os.path.join(bdir, 'native', e['stem'] + '.png'))  # exact native copy (with alpha)
        open(os.path.join(bdir, e['stem'] + '_prompt.txt'), 'w', encoding='utf-8').write(build_prompt(e))
        if e['kind'] in ('logo', 'band') and e.get('logo_text') and not lay:
            open(os.path.join(bdir, e['stem'] + '_prompt_bgonly.txt'), 'w', encoding='utf-8').write(build_prompt(e, True))
        w, h = im.size
        e.update(native_w=w, native_h=h, canvas=list(CANVAS), scale=s, box=box, k=pick_k(w, h),
                 transparent=bool((np.array(im)[..., 3] == 0).any()),
                 input=e['stem'] + '_input.png', prompt=e['stem'] + '_prompt.txt',
                 expected_output='done/%s_out.png' % e['stem'])
        out.append(e)
        print('%s %dx%d scale=%s box=%s k=%d%s' % (e['stem'], w, h, s, box, e['k'], ' LAYER over %s at (%d,%d)' % (e['layer']['parent'], e['layer']['x'], e['layer']['y']) if lay else ''))
    json.dump(dict(batch=a.batch, canvas=list(CANVAS), items=out), open(os.path.join(bdir, 'manifest.json'), 'w'), indent=1)
    if seq:
        stem_of = {e['id']: e['stem'] for e in out}
        steps = []
        for st in seq['steps']:
            steps.append(dict(st, stem=stem_of.get(st['id']), generate=st['id'] in stem_of,
                              skip_reason=next((x.get('skip') for x in skipped if x['id'] == st['id']), None)))
        json.dump(dict(seq, steps=steps), open(os.path.join(bdir, 'sequence.json'), 'w'), indent=1)
        open(os.path.join(bdir, 'SEQUENCE.md'), 'w', encoding='utf-8').write(sequence_md(seq, steps))
    open(os.path.join(bdir, 'INSTRUCTIONS.md'), 'w', encoding='utf-8').write(
        INSTR_DA.format(batch=a.batch, e=FLAG['edge_corr_min'], h=FLAG['hist_dist_max'], a=FLAG['aspect_dev_max'])
        + (INSTR_LAYER_DA if any(x.get('layer') for x in out) else '')
        + instr_animation(out))
    print('wrote', bdir)


INSTR_LAYER_DA = """
## Lag-billeder (overlay)
Poster med `layer` i manifest.json er LAG, som spillet tegner oven paa et andet billede (se `layer.parent`, `x`, `y`).
`NNN_<id>_input.png` viser kun laget paa en ensfarvet noeglefarve (`layer.key`); `NNN_<id>_context.png` (hvis den findes)
viser laget paa baggrunden og er KUN reference - den skal ikke genereres. Import goer noeglefarven gennemsigtig
(RGBA), og `out/layers.json` gemmer parent/x/y/skala saa laget kan placeres: `python tools/imggen_webpack.py compose`.
"""


def instr_animation(out):
    anim = [x for x in out if x.get('animation')]
    ctx = [x for x in out if x.get('game_context')]
    t = ''
    if ctx:
        t += ("\n## Spillets tekst\n%d prompts har en `[GAME CONTEXT]`-linje med den fortaelling spillet viser til billedet. Den er kun "
              "baggrund: billedet er autoriteten, og ingen tekst maa tegnes ind i resultatet.\n" % len(ctx))
    if anim:
        t += ("\n## Animerede originaler\nPoster med `animation` i manifest.json har flere frames i originalen. Generer KUN frame 0 "
              "(det billede der ligger i `_input.png`). `animation.plan` er `small-loop` (ekstra frames kan senere laves som "
              "maskerede redigeringer af det restylede billede; `extra_frames` navngiver dem, men der er ikke genereret input til "
              "dem) eller `static-first` (billedet er for aktivt; spillet bliver ved med at vise frame 0).\n"
              + "".join("- %s: %s, %d frames, %s\n" % (x['stem'], x['animation']['plan'], x['animation']['frames'], x['animation']['kind'])
                        for x in anim))
    return t


# ---------------------------------------------------------------- fidelity
def _gray(im):
    return np.asarray(im.convert('L'), np.float32) / 255


def _sobel(g):
    p = np.pad(g, 1, mode='edge')
    gx = (p[:-2, 2:] + 2 * p[1:-1, 2:] + p[2:, 2:]) - (p[:-2, :-2] + 2 * p[1:-1, :-2] + p[2:, :-2])
    gy = (p[2:, :-2] + 2 * p[2:, 1:-1] + p[2:, 2:]) - (p[:-2, :-2] + 2 * p[:-2, 1:-1] + p[:-2, 2:])
    return np.hypot(gx, gy)


def fidelity(orig_rgb, res_rgb, aspect_dev, width=96):
    """Coarse-scale compare so legit restyle (texture/detail) is tolerated but layout and colour distribution are not."""
    h = max(8, int(round(width * orig_rgb.height / orig_rgb.width)))
    o = orig_rgb.resize((width, h), Image.BOX).filter(ImageFilter.GaussianBlur(1.0))
    r = res_rgb.resize((width, h), Image.BOX).filter(ImageFilter.GaussianBlur(1.0))
    eo, er = _sobel(_gray(o)).ravel(), _sobel(_gray(r)).ravel()
    edge = 0.0 if eo.std() < 1e-6 or er.std() < 1e-6 else float(np.corrcoef(eo, er)[0, 1])

    def hist(im):
        q = (np.asarray(im, np.int32) // 64).reshape(-1, 3)
        return np.bincount(q[:, 0] * 16 + q[:, 1] * 4 + q[:, 2], minlength=64) / len(q)
    hd = float(0.5 * np.abs(hist(o) - hist(r)).sum())
    return dict(edge_corr=round(edge, 4), hist_dist=round(hd, 4), aspect_dev=round(aspect_dev, 4))


def verdict(f, th=FLAG):
    why = []
    if f['edge_corr'] < th['edge_corr_min']:
        why.append('edges')
    if f['hist_dist'] > th['hist_dist_max']:
        why.append('colour')
    if f['aspect_dev'] > th['aspect_dev_max']:
        why.append('aspect')
    return ('FLAG' if why else 'ok'), why


# ---------------------------------------------------------------- import
def undo_pad(res, box, canvas=CANVAS):
    aspect_dev = abs((res.width / res.height) / (canvas[0] / canvas[1]) - 1)
    sx, sy = res.width / canvas[0], res.height / canvas[1]
    x, y, w, h = box
    return res.crop((int(round(x * sx)), int(round(y * sy)), int(round((x + w) * sx)), int(round((y + h) * sy)))), aspect_dev


def process_one(e, res, native):
    crop, adev = undo_pad(res.convert('RGB'), e['box'])
    w, h = native.size
    k = e['k']
    big = crop.resize((w * k, h * k), Image.LANCZOS)
    a = np.array(native)[..., 3]
    if (a == 0).any():
        out = np.dstack([np.asarray(big), np.kron(a, np.ones((k, k), np.uint8))])
    else:
        out = np.asarray(big)
    ref = np.array(native)[..., :3].copy()
    ref[a == 0] = GREY
    f = fidelity(Image.fromarray(ref), crop.resize((w, h), Image.BOX), adev)
    return Image.fromarray(np.ascontiguousarray(out)), f


def process_layer(e, res, native):
    """Layer import: undo pad, scale to k x native, key out the flat background -> RGBA (see imggen_layers.extract_layer)."""
    import imggen_layers as LY
    L = e['layer']
    crop, adev = undo_pad(res.convert('RGB'), e['box'])
    w, h = native.size
    k = e['k']
    big = np.asarray(crop.resize((w * k, h * k), Image.LANCZOS))
    matte = np.array(native)[..., 3] > 0
    rgba, mode, cover = LY.extract_layer(big, tuple(L['key']), matte, k)
    ref = LY.layer_on_key(np.array(native), tuple(L['key']))
    f = fidelity(Image.fromarray(ref), crop.resize((w, h), Image.BOX), adev)
    return Image.fromarray(rgba), f, dict(alpha_mode=mode, key_cover=None if cover is None else round(cover, 4))


def _import_no_links(path):
    """Reject linked files AND linked parent directories, including Windows junctions."""
    p = os.path.abspath(path)
    while True:
        if os.path.islink(p) or getattr(os.path, 'isjunction', lambda _: False)(p):
            raise ValueError('symlink/junction import path: %s' % path)
        parent = os.path.dirname(p)
        if parent == p:
            return
        p = parent


def _import_file(path):
    _import_no_links(path)
    if not os.path.isfile(path):
        raise ValueError('expected regular input file: %s' % path)


def _import_int(n, lo, hi):
    return type(n) is int and lo <= n <= hi


def _import_output_dir(bdir, odir, explicit):
    if not explicit:
        raise ValueError('--require-complete needs an explicit isolated --out-dir')
    _import_no_links(odir)
    dest = os.path.normcase(os.path.realpath(odir))
    for protected in (os.path.join(WEB, 'out'), bdir):
        protected = os.path.normcase(os.path.realpath(protected))
        try:
            common = os.path.commonpath([dest, protected])
        except ValueError:  # different Windows drives
            continue
        if common in (dest, protected):
            raise ValueError('output directory overlaps batch or shared output: %s' % odir)
    if os.path.lexists(odir) and (not os.path.isdir(odir) or os.listdir(odir)):
        raise ValueError('output directory must be absent or empty: %s' % odir)


def _import_record(path, size, data=None):
    if data is None:
        with open(path, 'rb') as f:
            data = f.read()
    return dict(size=list(size), bytes=len(data), sha256=hashlib.sha256(data).hexdigest())


def _import_decode(path, size):
    _import_file(path)
    with open(path, 'rb') as f:
        data = f.read()
    with Image.open(io.BytesIO(data)) as im:
        if im.format != 'PNG' or im.size != tuple(size) or getattr(im, 'n_frames', 1) != 1:
            raise ValueError('wrong PNG dimensions/format: %s (expected %s)' % (path, size))
        im.verify()
    with Image.open(io.BytesIO(data)) as im:
        im.load()  # verify alone does not decode pixels
        decoded = im.copy()
    return decoded, _import_record(path, decoded.size, data)


def _import_preflight(bdir, man):
    """Validate the whole manifest and decode every input before creating any output.

    Bounds allow native images up to 4096 per axis, k=3..16, and at most
    8192 per output axis / 16 megapixels per output. Only make's 1536x1024
    canvas is supported. Keep decoded snapshots so processing and hashes use
    exactly the preflighted bytes, not a later reopening of the inputs.
    """
    def canvas(value):
        return (isinstance(value, list) and len(value) == 2
                and all(type(n) is int for n in value) and value == list(CANVAS))

    if (not isinstance(man, dict) or not canvas(man.get('canvas'))
            or not isinstance(man.get('items'), list) or not man['items']):
        raise ValueError('expected nonempty items and supported 1536x1024 canvas')
    ids, stems = set(), set()
    for i, e in enumerate(man['items'], 1):
        if not isinstance(e, dict):
            raise ValueError('manifest item must be an object')
        for field, seen, limit in (('id', ids, 160), ('stem', stems, 200)):
            value = e.get(field)
            if (not isinstance(value, str) or len(value) > limit
                    or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]*', value)
                    or value.casefold() in seen):
                raise ValueError('unsafe or duplicate %s: %r' % (field, value))
            seen.add(value.casefold())
        stem = e['stem']
        if (stem != '%03d_%s' % (i, e['id'])
                or e.get('expected_output') != 'done/%s_out.png' % stem
                or any(field in e and e[field] != stem + suffix
                       for field, suffix in (('input', '_input.png'), ('prompt', '_prompt.txt')))):
            raise ValueError('unexpected filename identity: %s' % stem)
        w, h, k = e.get('native_w'), e.get('native_h'), e.get('k')
        if (not all(_import_int(n, 1, 4096) for n in (w, h)) or not _import_int(k, 3, 16)
                or max(w * k, h * k) > 8192 or w * h * k * k > 16 * 1024 * 1024):
            raise ValueError('invalid native dimensions/k: %s' % stem)
        box = e.get('box')
        if (not canvas(e.get('canvas')) or not isinstance(box, list) or len(box) != 4
                or not all(_import_int(n, 0, 1536) for n in box)
                or box[2] < 1 or box[3] < 1
                or box[0] + box[2] > CANVAS[0] or box[1] + box[3] > CANVAS[1]):
            raise ValueError('invalid canvas/crop box: %s' % stem)
        if not isinstance(e.get('src'), str) or not e['src']:
            raise ValueError('missing source identity: %s' % stem)
        L = e.get('layer')
        if L and (not isinstance(L, dict) or not isinstance(L.get('role'), str)
                  or not all(_import_int(L.get(n), -4096, 4096) for n in ('x', 'y'))
                  or not isinstance(L.get('key'), list) or len(L['key']) != 3
                  or not all(_import_int(n, 0, 255) for n in L['key'])
                  or L.get('parent_source') is not None and not isinstance(L['parent_source'], str)):
            raise ValueError('invalid layer metadata: %s' % stem)
    prepared = {}
    for e in man['items']:
        stem = e['stem']
        native, nr = _import_decode(os.path.join(bdir, 'native', stem + '.png'), [e['native_w'], e['native_h']])
        raw, rr = _import_decode(os.path.join(bdir, 'done', stem + '_out.png'), CANVAS)
        prepared[stem] = (native.convert('RGBA'), raw, dict(id=e['id'], stem=stem, native=nr, raw=rr))
    return prepared


def cmd_import(a):
    bdir = getattr(a, 'batch_dir', None) or os.path.join(WEB, a.batch)
    odir = getattr(a, 'out_dir', None) or os.path.join(WEB, 'out')
    complete = getattr(a, 'require_complete', False)
    provenance = complete or bool(getattr(a, 'batch_dir', None) or getattr(a, 'out_dir', None))
    manifest = os.path.join(bdir, 'manifest.json')
    if complete:
        _import_output_dir(bdir, odir, getattr(a, 'out_dir', None))
        _import_file(manifest)
    man = json.load(open(manifest))
    prepared = _import_preflight(bdir, man) if complete else {}
    if complete:
        _import_output_dir(bdir, odir, getattr(a, 'out_dir', None))  # still empty after preflight
    os.makedirs(odir, exist_ok=True)
    rep, missing, sheet, layers = [], [], [], []
    records = []
    src_stem = {x['src']: x['stem'] for x in man['items']}
    for e in man['items']:
        p = os.path.join(bdir, 'done', e['stem'] + '_out.png')
        if not complete and not os.path.exists(p):
            missing.append(e['stem'])
            continue
        if complete:
            native, raw, record = prepared[e['stem']]
        else:
            native_path = os.path.join(bdir, 'native', e['stem'] + '.png')
            native = Image.open(native_path).convert('RGBA')
            raw = Image.open(p)
            if provenance:
                record = dict(id=e['id'], stem=e['stem'], native=_import_record(native_path, native.size),
                              raw=_import_record(p, raw.size))
        if e.get('layer'):
            outim, f, info = process_layer(e, raw, native)
            L = e['layer']
            layers.append(dict(stem=e['stem'], id=e['id'], role=L['role'], parent=L.get('parent'),
                               parent_stem=src_stem.get(L.get('parent_source')), parent_source=L.get('parent_source'),
                               x=L['x'], y=L['y'], native_w=e['native_w'], native_h=e['native_h'], k=e['k'],
                               key=L['key'], file=e['stem'] + '.png', **info))
        else:
            outim, f = process_one(e, raw, native)
            info = {}
        output_path = os.path.join(odir, e['stem'] + '.png')
        outim.save(output_path)
        if provenance:
            records.append(dict(record, output=_import_record(output_path, outim.size)))
        v, why = verdict(f)
        if info.get('alpha_mode') == 'matte_fallback':
            why = why + ['key-not-kept']
            v = 'FLAG'
        rep.append(dict(id=e['id'], stem=e['stem'], size=list(outim.size), k=e['k'], verdict=v, reasons=why, **f, **info))
        sheet.append((e['stem'], native, outim, v))
        print('%-36s %-4s edge=%.2f hist=%.2f aspect=%.3f %s' % (e['stem'], v, f['edge_corr'], f['hist_dist'], f['aspect_dev'], ','.join(why)))
    json.dump(dict(thresholds=FLAG, missing=missing, results=rep), open(os.path.join(odir, 'fidelity.json'), 'w'), indent=1)
    if provenance:
        json.dump(dict(results=records), open(os.path.join(odir, 'provenance.json'), 'w'), indent=1)
    if layers:
        json.dump(dict(canvas_native=[320, 200], layers=layers), open(os.path.join(odir, 'layers.json'), 'w'), indent=1)
    if sheet:
        contact_sheet(sheet).save(os.path.join(odir, 'contact_sheet.png'))
    print('imported %d, flagged %d, missing %d' % (len(rep), sum(r['verdict'] == 'FLAG' for r in rep), len(missing)))
    return rep


def cmd_compose(a):
    """Place each imported layer on its parent: the restyled parent if it is in out/, else the native parent upscaled."""
    import imggen_layers as LY
    odir = os.path.join(WEB, 'out')
    meta = json.load(open(os.path.join(odir, 'layers.json')))
    cdir = os.path.join(odir, 'composites')
    os.makedirs(cdir, exist_ok=True)
    made = []
    for L in meta['layers']:
        lay = np.array(Image.open(os.path.join(odir, L['file'])).convert('RGBA'))
        par, used = None, 'restyled parent'
        if L.get('parent_stem') and os.path.exists(os.path.join(odir, L['parent_stem'] + '.png')):
            par = np.array(Image.open(os.path.join(odir, L['parent_stem'] + '.png')).convert('RGB'))
        else:
            nat = os.path.join(WEB, a.batch, 'native', L['stem'] + '_parent.png')
            if os.path.exists(nat):
                n = Image.open(nat).convert('RGB')
                par = np.array(n.resize((n.width * L['k'], n.height * L['k']), Image.NEAREST))
                used = 'native parent (placeholder, parent not restyled in this batch)'
        if par is None:
            continue
        comp = LY.compose_restyled(par, lay, L['x'], L['y'], meta['canvas_native'][0])
        name = L['stem'] + '_composite.png'
        Image.fromarray(comp).save(os.path.join(cdir, name))
        made.append(name)
        print(name, 'on', used)
    return made


def contact_sheet(rows, cell=(420, 260)):
    H = cell[1] + 18
    s = Image.new('RGB', (cell[0] * 2 + 12, H * len(rows)), (40, 40, 40))
    d = ImageDraw.Draw(s)
    for i, (name, o, r, v) in enumerate(rows):
        for j, im in enumerate((o, r)):
            t = Image.new('RGB', im.size, GREY)
            t.paste(im.convert('RGB'), mask=im.getchannel('A') if im.mode == 'RGBA' else None)
            t.thumbnail(cell, Image.NEAREST if j == 0 else Image.LANCZOS)
            s.paste(t, (j * (cell[0] + 12), i * H + 16))
        d.text((2, i * H + 2), '%s [%s]' % (name, v), fill=(255, 80, 80) if v == 'FLAG' else (255, 255, 255))
    return s


def cmd_layer_manifest(a):
    """Manifest from renders/imggen/candidates/layers.json + candidates.json: each overlay id becomes a `layer: auto` item,
    and its parent (if not already listed) is added BEFORE it as an ordinary item."""
    cdir = os.path.join(ROOT, 'renders', 'imggen', 'candidates')
    lay = {i['id']: i for i in json.load(open(os.path.join(cdir, 'layers.json')))['items']}
    cand = {c['id']: c for c in json.load(open(os.path.join(cdir, 'candidates.json')))['candidates']}
    items = []

    def entry(i, as_layer):
        c = cand.get(i, {})
        li = lay.get(i, {})
        src = li.get('source') or c.get('source')
        rw, _ = Image.open(os.path.join(ROOT, src)).size
        nw = (li.get('native_size') or c.get('native_size'))[0]
        e = dict(id=i, kind='logo' if as_layer else 'band', src=src, native_div=max(1, rw // nw),
                 description=c.get('description') or ('Title artwork, overlay layer.' if as_layer else 'Title background picture.'))
        if as_layer:
            e['layer'] = 'auto'
        return e
    for i in a.ids:
        li = lay[i]
        if li['role'] not in ('overlay_opaque_rect', 'overlay_transparent'):
            raise SystemExit('%s is not an overlay layer (role %s)' % (i, li['role']))
        par = li.get('parent')
        if par and par not in a.ids and par not in [x['id'] for x in items] and (par in lay or par in cand):
            items.append(entry(par, False))
        items.append(entry(i, True))
    json.dump(items, open(a.out, 'w'), indent=1)
    print('wrote', a.out, len(items), 'items')
    return items


# ---------------------------------------------------------------- animation plan (docs/engine/research/imggen-animated-pictures.md, section 5)
SMALL_LOOP_FRACTION = 0.12     # changed fraction of the picture
SMALL_LOOP_BBOX = 0.50         # union bbox fraction


def animation_block(anim):
    """Manifest 'animation' block for an animated candidate (frames > 1), else None.
    Policy: restyle frame 0 only. A region-loop (or the small end of large-region: changed <= 12% and bbox <= 50%) may later get
    extra frames as masked edits of the restyled base (research 5.3); everything else ships static first (5.4). The extra-frame
    list only NAMES the original frames; no extra-frame inputs are generated."""
    if not anim or (anim.get('frames') or 1) <= 1:
        return None
    kind = anim.get('kind')
    frac = anim.get('changed_fraction') or 0.0
    bf = anim.get('bbox_fraction')
    small = kind == 'region-loop' or (kind == 'large-region' and frac <= SMALL_LOOP_FRACTION and (bf is None or bf <= SMALL_LOOP_BBOX))
    n = int(anim['frames'])
    pf = anim.get('preview_frames') or []
    blk = dict(frames=n, kind=kind, changed_fraction=frac, bbox=anim.get('bbox'),
               restyle='frame 0 only', plan='small-loop' if small else 'static-first')
    if anim.get('dos_twin'):
        blk['dos_twin'] = anim['dos_twin']
    if small:
        blk['extra_frames'] = [dict(index=k, original=(pf[k] if k < len(pf) else None), status='not generated',
                                    method='edit of the restyled frame 0 inside the dilated change mask, feathered composite')
                               for k in range(1, n)]
        blk['note'] = ("Animated original (%d frames, %.1f%% of the picture changes inside bbox %s). Restyle frame 0 only now; the "
                       "extra frames can later be made as masked edits of the restyled base (small loop, research section 5.3). "
                       "Do not restyle the frames as separate pictures." % (n, 100 * frac, anim.get('bbox')))
    else:
        blk['extra_frames'] = []
        blk['note'] = ("Animated original (%d frames, %.1f%% changes, kind %s). Restyle frame 0 only; the picture is too active for "
                       "a mask patch, so it ships static first and the engine keeps showing frame 0 (research section 5.4)."
                       % (n, 100 * frac, kind))
    return blk


def cmd_proposal_manifest(a):
    """Manifest from candidates.json proposal items (ids, `--selection selection.json` from the viewer, or `--all-proposed`),
    carrying the game text context and the animation plan. Overlay items become `layer: auto`; title-sequence members are
    skipped (use sequence-manifest)."""
    cdir = a.candidates_dir or os.path.join(ROOT, 'renders', 'imggen', 'candidates')
    cand = {c['id']: c for c in json.load(open(os.path.join(cdir, 'candidates.json'), encoding='utf-8'))['candidates']}
    if a.selection:
        ids = [x['id'] for x in json.load(open(a.selection))['selected']]
    elif a.all_proposed:
        ids = [i for i, c in sorted(cand.items(), key=lambda kv: kv[1].get('rank', 1e9)) if c.get('proposed_batch02')]
    else:
        ids = list(a.ids)
    items = []
    for i in ids:
        c = cand.get(i)
        if c is None:
            raise SystemExit('unknown candidate id %s' % i)
        if c.get('sequence'):
            print('skip %s: title-sequence member (use sequence-manifest)' % i)
            continue
        rw, _ = Image.open(os.path.join(ROOT, c['source'])).size
        is_layer = str((c.get('layer') or {}).get('role', '')).startswith('overlay')
        kind = {'scene': 'scene', 'portrait': 'face', 'face': 'face', 'logo': 'logo', 'title': 'band', 'map': 'scene'}.get(c['kind'], 'scene')
        desc = c.get('description') or 'Original picture.'
        if c.get('prompt_notes'):
            desc += ' ' + c['prompt_notes']
        e = dict(id=i, kind=kind, src=c['source'], native_div=max(1, rw // c['native_size'][0]), description=desc)
        if c['kind'] == 'map':
            e['map'] = True
        if is_layer:
            e['layer'] = 'auto'
        gt = c.get('game_text')
        if gt:
            e['game_text'] = dict(block_id=gt['block_id'], ambiguous=gt['ambiguous'], records=gt['records'])
            if gt.get('context'):
                e['game_context'] = gt['context']
        ab = animation_block(c.get('animation'))
        if ab:
            e['animation'] = ab
        items.append(e)
    json.dump(items, open(a.out, 'w', encoding='utf-8'), indent=1)
    print('wrote', a.out, len(items), 'items,', sum('game_context' in e for e in items), 'with game context,',
          sum('animation' in e for e in items), 'animated')
    return items


def sequence_md(seq, steps):
    L = ['# %s (%s)' % (seq['title'], seq['id']), '',
         'Screens in the order the game shows them. Overlay steps are drawn on their parent step at (x,y) on the 320x200 screen;',
         'an overlay with the same parent REPLACES the previous overlay (the earlier overlay is not shown with it).', '',
         '| step | role | file | parent | x,y | generate | note |', '| ---: | --- | --- | ---: | --- | --- | --- |']
    for st in steps:
        L.append('| %d | %s | %s | %s | %d,%d | %s | %s |' % (
            st['order'], st['role'], st['stem'] or st['id'], st['parent'] or '-', st['x'], st['y'],
            'yes' if st['generate'] else 'no (%s)' % (st['skip_reason'] or 'skipped'), st['note']))
    return '\n'.join(L) + '\n'


SEQUENCE_TEXT = {   # exact lettering of the title steps (id suffix -> text the model must keep)
    'lbm_cok_scrn1b': 'STRATEGIC SIMULATIONS, INC. PRESENTS AN Official Advanced Dungeons & Dragons COMPUTER PRODUCT (c) 1990 TSR, Inc. (c) 1990 Strategic Simulations, Inc. All rights reserved.',
    'lbm_cok_text1': 'Champions of Krynn',
    'lbm_cok_text2': 'A DRAGONLANCE Fantasy Role-Playing Epic Vol. I',
    'lbm_dok_title1a': 'A DRAGONLANCE Fantasy Role-Playing Epic Vol. II',
    'lbm_dok_title1b': 'DEATH KNIGHTS OF KRYNN',
}


def cmd_sequence_manifest(a):
    """Manifest for a whole title sequence (candidates.json `sequence` fields), ordered by step. Overlay steps become
    `layer: auto` items; a step whose group was already done in batch01 stays in the sequence but is marked skip."""
    cdir = os.path.join(ROOT, 'renders', 'imggen', 'candidates')
    cand = json.load(open(os.path.join(cdir, 'candidates.json')))['candidates']
    members = sorted((c for c in cand if (c.get('sequence') or {}).get('id') == a.sequence), key=lambda c: c['sequence']['order'])
    if not members:
        raise SystemExit('no candidates carry sequence %r' % a.sequence)
    items, steps = [], []
    for c in members:
        sq = c['sequence']
        rw, _ = Image.open(os.path.join(ROOT, c['source'])).size
        is_layer = sq['role'] == 'overlay'
        done = 'excluded' in c and 'batch01' in c['excluded']
        e = dict(id=c['id'], kind='logo' if is_layer else 'band', src=c['source'],
                 native_div=max(1, rw // c['native_size'][0]),
                 description=c.get('description') or sq['note'], sequence=dict(id=sq['id'], order=sq['order']))
        if c.get('prompt_notes'):
            e['description'] += ' ' + c['prompt_notes']
        txt = next((t for k, t in SEQUENCE_TEXT.items() if c['id'].endswith(k)), None)
        if txt:
            e['logo_text'] = txt
        if is_layer:
            e['layer'] = 'auto'
        if done and not a.include_done:
            e['skip'] = 'already restyled in batch01'
        items.append(e)
        steps.append(dict(order=sq['order'], id=c['id'], role=sq['role'], parent=sq['parent'], x=sq['x'], y=sq['y'], note=sq['note'],
                          done_in_batch01=done))
    # parents first: a step's parent always has a lower order, so the order sort already guarantees it
    out = dict(sequence=dict(id=a.sequence, title=members[0]['sequence']['title'], steps=steps), items=items)
    json.dump(out, open(a.out, 'w'), indent=1)
    print('wrote', a.out, len(items), 'items,', sum(1 for e in items if e.get('skip')), 'skipped (done)')
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    sp = ap.add_subparsers(dest='cmd', required=True)
    m = sp.add_parser('make')
    m.add_argument('--manifest')
    m.add_argument('--batch', default='batch01')
    m.set_defaults(f=cmd_make)
    i = sp.add_parser('import')
    i.add_argument('--batch', default='batch01')
    i.add_argument('--batch-dir', help='read the package from this directory instead of WEB/batch')
    i.add_argument('--out-dir', help='write normalized images and reports here instead of WEB/out')
    i.add_argument('--require-complete', action='store_true', help='preflight every input; requires an empty isolated --out-dir')
    i.set_defaults(f=cmd_import)
    c = sp.add_parser('compose')
    c.add_argument('--batch', default='batch01')
    c.set_defaults(f=cmd_compose)
    lm = sp.add_parser('layer-manifest', help='write a manifest for overlay ids (+ their parents) from layers.json')
    lm.add_argument('ids', nargs='+')
    lm.add_argument('--out', required=True)
    lm.set_defaults(f=cmd_layer_manifest)
    pm = sp.add_parser('proposal-manifest', help='write a manifest for proposal ids (game text context + animation plan) from candidates.json')
    pm.add_argument('ids', nargs='*')
    pm.add_argument('--selection', help='selection.json exported by the ?restyle=proposal viewer')
    pm.add_argument('--all-proposed', action='store_true')
    pm.add_argument('--candidates-dir')
    pm.add_argument('--out', required=True)
    pm.set_defaults(f=cmd_proposal_manifest)
    sm = sp.add_parser('sequence-manifest', help='write a manifest for a whole title sequence (dok_title, cok_title) from candidates.json')
    sm.add_argument('sequence')
    sm.add_argument('--out', required=True)
    sm.add_argument('--include-done', action='store_true', help='also regenerate steps already done in batch01')
    sm.set_defaults(f=cmd_sequence_manifest)
    a = ap.parse_args(argv)
    return a.f(a)


if __name__ == '__main__':
    main()
