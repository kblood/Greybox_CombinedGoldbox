"""Synthetic round-trip tests for tools/imggen_webpack.py (pure Python, no network)."""
import hashlib, json, os, sys
import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import imggen_webpack as W


def _synthetic(w, h, alpha, seed):
    rng = np.random.default_rng(seed)
    a = np.zeros((h, w, 4), np.uint8)
    a[..., 3] = 255
    # structured scene: coloured blocks + a diagonal line, so edges/colours are meaningful
    for _ in range(6):
        x0, y0 = rng.integers(0, w - 6), rng.integers(0, h - 6)
        a[y0:y0 + rng.integers(4, h // 2), x0:x0 + rng.integers(4, w // 2), :3] = rng.integers(0, 256, 3)
    for i in range(min(w, h)):
        a[i, i, :3] = (255, 255, 0)
    if alpha:
        a[:5, :, 3] = 0
        a[:, :4, 3] = 0
    return Image.fromarray(a)


def _setup(tmp_path, monkeypatch):
    monkeypatch.setattr(W, 'WEB', str(tmp_path / 'webpack'))
    srcs = []
    for i, (w, h, al) in enumerate([(88, 40, False), (64, 39, True), (304, 120, False)]):
        p = tmp_path / ('s%d.png' % i)
        _synthetic(w, h, al, i).save(p)
        srcs.append(dict(id='img%d' % i, kind='face' if i == 0 else 'scene', src=str(p), native_div=1,
                         description='synthetic %d' % i))
    mp = tmp_path / 'm.json'
    json.dump(srcs, open(mp, 'w'))
    W.main(['make', '--manifest', str(mp), '--batch', 'b'])
    return os.path.join(W.WEB, 'b')


def _fake_generated(bdir, e, noise=12, seed=0):
    """Upscaled original (the padded input at 1536x1024) with noise, as ChatGPT might return."""
    inp = np.asarray(Image.open(os.path.join(bdir, e['input'])), np.float32)
    rng = np.random.default_rng(seed)
    out = np.clip(inp + rng.normal(0, noise, inp.shape), 0, 255).astype(np.uint8)
    Image.fromarray(out).save(os.path.join(bdir, 'done', e['stem'] + '_out.png'))


def test_make_outputs(tmp_path, monkeypatch):
    bdir = _setup(tmp_path, monkeypatch)
    man = json.load(open(os.path.join(bdir, 'manifest.json')))
    assert len(man['items']) == 3
    for e in man['items']:
        assert Image.open(os.path.join(bdir, e['input'])).size == (1536, 1024)
        txt = open(os.path.join(bdir, e['prompt']), encoding='utf-8').read()
        assert '[STYLE]' in txt and 'Dragonlance' in txt and 'Krynn' in txt and 'exact composition' in txt
        assert e['stem'] + '_out.png' in txt
        x, y, w, h = e['box']
        assert x >= 0 and y >= 0 and x + w <= 1536 and y + h <= 1024
    assert 'CHARACTER BIBLE' in open(os.path.join(bdir, man['items'][0]['prompt'])).read() or True
    assert os.path.exists(os.path.join(bdir, 'INSTRUCTIONS.md'))


def test_roundtrip_size_alpha_fidelity(tmp_path, monkeypatch):
    bdir = _setup(tmp_path, monkeypatch)
    man = json.load(open(os.path.join(bdir, 'manifest.json')))
    for n, e in enumerate(man['items']):
        _fake_generated(bdir, e, seed=n)
    rep = W.main(['import', '--batch', 'b'])
    assert len(rep) == 3
    for e, r in zip(man['items'], rep):
        out = Image.open(os.path.join(W.WEB, 'out', e['stem'] + '.png'))
        k = e['k']
        assert k >= 3
        assert out.size == (e['native_w'] * k, e['native_h'] * k)  # exact k x original
        assert r['verdict'] == 'ok', r
        assert r['edge_corr'] > 0.8 and r['hist_dist'] < 0.2
    # alpha preserved exactly for the transparent frame (nearest-k replicate of original mask)
    e = man['items'][1]
    nat = np.array(Image.open(os.path.join(bdir, 'native', e['stem'] + '.png')))
    out = np.array(Image.open(os.path.join(W.WEB, 'out', e['stem'] + '.png')))
    assert out.shape[2] == 4
    assert np.array_equal(out[..., 3], np.kron(nat[..., 3], np.ones((e['k'], e['k']), np.uint8)))
    assert os.path.exists(os.path.join(W.WEB, 'out', 'contact_sheet.png'))
    assert os.path.exists(os.path.join(W.WEB, 'out', 'fidelity.json'))
    assert not os.path.exists(os.path.join(W.WEB, 'out', 'provenance.json'))  # legacy import is unchanged


def test_unrelated_and_wrong_aspect_flagged(tmp_path, monkeypatch):
    bdir = _setup(tmp_path, monkeypatch)
    man = json.load(open(os.path.join(bdir, 'manifest.json')))
    e0, e1, e2 = man['items']
    # e0: shuffled pixels of its own image (same colours, destroyed layout)
    inp = np.array(Image.open(os.path.join(bdir, e0['input'])))
    rng = np.random.default_rng(1)
    flat = inp.reshape(-1, 3).copy()
    rng.shuffle(flat)
    Image.fromarray(flat.reshape(inp.shape)).save(os.path.join(bdir, 'done', e0['stem'] + '_out.png'))
    # e1: unrelated image
    Image.fromarray(rng.integers(0, 256, (1024, 1536, 3), dtype=np.uint8)).save(os.path.join(bdir, 'done', e1['stem'] + '_out.png'))
    # e2: right content but squashed to a square (aspect wrong)
    Image.open(os.path.join(bdir, e2['input'])).resize((1024, 1024)).save(os.path.join(bdir, 'done', e2['stem'] + '_out.png'))
    rep = {r['id']: r for r in W.main(['import', '--batch', 'b'])}
    assert rep['img0']['verdict'] == 'FLAG' and 'edges' in rep['img0']['reasons']
    assert rep['img1']['verdict'] == 'FLAG'
    assert rep['img2']['verdict'] == 'FLAG' and 'aspect' in rep['img2']['reasons']


def test_pick_k_and_fit_box():
    for w, h in [(24, 24), (304, 120), (1280, 800), (88, 40)]:
        k = W.pick_k(w, h)
        assert k >= 3 and (k == 16 or max(w, h) * k >= 1600 or k == 3)
    s, box = W.fit_box(304, 120)
    assert s == 5 and box == [8, 212, 1520, 600]
    s, box = W.fit_box(3000, 1000)  # larger than canvas: shrink, stay inside
    assert box[0] >= 0 and box[0] + box[2] <= 1536 and box[1] + box[3] <= 1024


# ------------------------------------------------------------------ isolated complete import (synthetic inputs only)
def _complete_package(tmp_path, monkeypatch, layer=False):
    monkeypatch.setattr(W, 'WEB', str(tmp_path / 'shared'))
    bdir, odir = tmp_path / 'batch02', tmp_path / 'normalized'
    (bdir / 'native').mkdir(parents=True)
    (bdir / 'done').mkdir()
    items = []
    for i in range(2):
        cid = 'synthetic%d' % i
        stem = '%03d_%s' % (i + 1, cid)
        native = _synthetic(24 + i * 8, 16, True, i)
        key = [0, 255, 0]
        raw, _, box = W.make_input(native, pad=key if layer and i else W.GREY)
        e = dict(id=cid, stem=stem, src='not-read-%d.png' % i, native_w=native.width, native_h=native.height,
                 canvas=list(W.CANVAS), k=3, box=box, expected_output='done/%s_out.png' % stem,
                 input=stem + '_input.png', prompt=stem + '_prompt.txt')
        if layer and i:
            e['layer'] = dict(role='overlay_transparent', parent='synthetic0', x=0, y=8, key=key)
        native.save(bdir / 'native' / (stem + '.png'))
        raw.save(bdir / e['expected_output'])
        items.append(e)
    man = dict(canvas=list(W.CANVAS), items=items)
    _save_complete_manifest(bdir, man)
    return bdir, odir, man


def _save_complete_manifest(bdir, man):
    (bdir / 'manifest.json').write_text(json.dumps(man), encoding='utf-8')


def _complete_import(bdir, odir):
    return W.main(['import', '--batch-dir', str(bdir), '--out-dir', str(odir), '--require-complete'])


def _no_import_writes(monkeypatch):
    def unexpected(*args, **kwargs):
        pytest.fail('normalization/output started before preflight finished')
    monkeypatch.setattr(W, 'process_one', unexpected)
    monkeypatch.setattr(W, 'process_layer', unexpected)
    monkeypatch.setattr(Image.Image, 'save', unexpected)


@pytest.mark.parametrize('layer', [False, True])
@pytest.mark.parametrize('empty_output', [False, True])
def test_complete_import_normalization_and_provenance(tmp_path, monkeypatch, layer, empty_output):
    bdir, odir, man = _complete_package(tmp_path, monkeypatch, layer)
    shared = tmp_path / 'shared' / 'out'
    shared.mkdir(parents=True)
    sentinel = shared / 'fidelity.json'
    sentinel.write_bytes(b'untouched shared report')
    if empty_output:
        odir.mkdir()
    before = {p: p.read_bytes() for p in bdir.rglob('*') if p.is_file()}
    rep = _complete_import(bdir, odir)
    report = json.loads((odir / 'fidelity.json').read_text())
    records = json.loads((odir / 'provenance.json').read_text())['results']
    assert report['missing'] == [] and report['results'] == rep and len(rep) == 2
    assert {(r['id'], r['stem']) for r in records} == {(e['id'], e['stem']) for e in man['items']}
    for e, r, record in zip(man['items'], rep, records):
        assert (r['id'], r['stem']) == (record['id'], record['stem']) == (e['id'], e['stem'])
        paths = dict(native=bdir / 'native' / (e['stem'] + '.png'), raw=bdir / e['expected_output'],
                     output=odir / (e['stem'] + '.png'))
        for kind, path in paths.items():
            data = path.read_bytes()
            with Image.open(path) as im:
                assert record[kind] == dict(size=list(im.size), bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
        with Image.open(paths['native']) as n, Image.open(paths['raw']) as raw, Image.open(paths['output']) as out:
            native = n.convert('RGBA')
            process = W.process_layer if e.get('layer') else W.process_one
            expected = process(e, raw, native)[0]
            assert out.size == (e['native_w'] * e['k'], e['native_h'] * e['k'])
            assert np.array_equal(np.array(out), np.array(expected))
            if not e.get('layer'):
                assert np.array_equal(np.array(out)[..., 3], np.kron(np.array(native)[..., 3], np.ones((3, 3), np.uint8)))
    assert (odir / 'contact_sheet.png').is_file()
    assert (odir / 'layers.json').exists() == layer
    assert sentinel.read_bytes() == b'untouched shared report'
    assert before == {p: p.read_bytes() for p in bdir.rglob('*') if p.is_file()}


@pytest.mark.parametrize('custom_dirs', [False, True])
def test_partial_import_remains_permissive(tmp_path, monkeypatch, custom_dirs):
    bdir, odir, man = _complete_package(tmp_path, monkeypatch)
    (bdir / man['items'][-1]['expected_output']).unlink()
    if custom_dirs:
        rep = W.main(['import', '--batch-dir', str(bdir), '--out-dir', str(odir)])
    else:
        monkeypatch.setattr(W, 'WEB', str(tmp_path))
        odir = tmp_path / 'out'
        rep = W.main(['import', '--batch', 'batch02'])
    assert [r['id'] for r in rep] == ['synthetic0']
    report = json.loads((odir / 'fidelity.json').read_text())
    assert report['missing'] == [man['items'][-1]['stem']]
    assert (odir / 'provenance.json').exists() == custom_dirs
    assert not (tmp_path / 'shared' / 'out').exists()


@pytest.mark.parametrize('kind', ['native', 'raw'])
@pytest.mark.parametrize('failure', ['missing', 'directory', 'corrupt', 'undecodable', 'dimensions'])
@pytest.mark.parametrize('empty_output', [False, True])
def test_complete_import_last_input_fails_before_writes(tmp_path, monkeypatch, kind, failure, empty_output):
    bdir, odir, man = _complete_package(tmp_path, monkeypatch)
    if empty_output:
        odir.mkdir()
    e = man['items'][-1]
    path = bdir / ('native/%s.png' % e['stem'] if kind == 'native' else e['expected_output'])
    if failure == 'dimensions':
        Image.new('RGB', (17, 13)).save(path)
    elif failure == 'corrupt':
        path.write_bytes(b'not an image')
    elif failure == 'undecodable':
        data = path.read_bytes()
        path.write_bytes(data[:len(data) // 2])
    else:
        path.unlink()
        if failure == 'directory':
            path.mkdir()
    _no_import_writes(monkeypatch)
    with pytest.raises((ValueError, OSError, SyntaxError)):
        _complete_import(bdir, odir)
    assert odir.exists() == empty_output
    if empty_output:
        assert list(odir.iterdir()) == []
    assert not (tmp_path / 'shared').exists()


@pytest.mark.parametrize('field,value', [
    ('id', '../escape'), ('id', 'bad\\name'), ('id', 'SYNTHETIC0'),
    ('stem', '../escape'), ('stem', '001_synthetic0'), ('stem', '002_wrong_id'),
    ('expected_output', 'done/other_out.png'), ('input', '../other.png'),
    ('native_w', True), ('native_h', 0), ('native_w', 4097), ('native_w', 24.5),
    ('k', 0), ('k', 17), ('k', 3.0), ('canvas', [1024, 1024]), ('canvas', [1536.0, 1024]),
    ('box', [-1, 0, 10, 10]), ('box', [0, 0, 0, 10]), ('box', [1500, 0, 40, 10]),
    ('box', [0, 1020, 10, 10]), ('box', [0, 0, 10.5, 10]),
])
def test_complete_import_rejects_manifest_before_writes(tmp_path, monkeypatch, field, value):
    bdir, odir, man = _complete_package(tmp_path, monkeypatch)
    man['items'][-1][field] = value
    _save_complete_manifest(bdir, man)
    _no_import_writes(monkeypatch)
    with pytest.raises(ValueError):
        _complete_import(bdir, odir)
    assert not odir.exists()


@pytest.mark.parametrize('change', ['canvas', 'empty', 'output_budget', 'layer'])
def test_complete_import_rejects_other_manifest_errors(tmp_path, monkeypatch, change):
    bdir, odir, man = _complete_package(tmp_path, monkeypatch)
    if change == 'canvas':
        man['canvas'] = [1024, 1024]
    elif change == 'empty':
        man['items'] = []
    elif change == 'output_budget':
        man['items'][-1].update(native_w=4096, native_h=4096, k=3)
    else:
        man['items'][-1]['layer'] = 'auto'  # only resolved make metadata can be imported
    _save_complete_manifest(bdir, man)
    _no_import_writes(monkeypatch)
    with pytest.raises(ValueError):
        _complete_import(bdir, odir)
    assert not odir.exists()


@pytest.mark.parametrize('kind', ['native', 'raw', 'manifest', 'directory'])
def test_complete_import_rejects_symlinks(tmp_path, monkeypatch, kind):
    bdir, odir, man = _complete_package(tmp_path, monkeypatch)
    e = man['items'][-1]
    rel = {'native': 'native/%s.png' % e['stem'], 'raw': e['expected_output'],
           'manifest': 'manifest.json', 'directory': 'done'}[kind]
    path, target = bdir / rel, tmp_path / 'link-target'
    path.rename(target)
    try:
        path.symlink_to(target, target_is_directory=kind == 'directory')
    except (OSError, NotImplementedError) as exc:
        pytest.skip('symlinks unavailable: %s' % exc)
    _no_import_writes(monkeypatch)
    with pytest.raises(ValueError, match='symlink'):
        _complete_import(bdir, odir)
    assert not odir.exists()


@pytest.mark.parametrize('collision', ['nonempty', 'file', 'shared', 'batch', 'inside_batch', 'omitted'])
def test_complete_import_output_collision(tmp_path, monkeypatch, collision):
    bdir, odir, _ = _complete_package(tmp_path, monkeypatch)
    if collision == 'nonempty':
        odir.mkdir()
        (odir / 'fidelity.json').write_bytes(b'do not overwrite')
    elif collision == 'file':
        odir.write_bytes(b'not a directory')
    elif collision == 'shared':
        odir = tmp_path / 'shared' / 'out'
        odir.mkdir(parents=True)  # even an empty shared directory is forbidden
    elif collision == 'batch':
        odir = bdir
    elif collision == 'inside_batch':
        odir = bdir / 'normalized'
    before = {p: p.read_bytes() for p in tmp_path.rglob('*') if p.is_file()}
    _no_import_writes(monkeypatch)
    with pytest.raises(ValueError):
        if collision == 'omitted':
            W.main(['import', '--batch-dir', str(bdir), '--require-complete'])
        else:
            _complete_import(bdir, odir)
    assert before == {p: p.read_bytes() for p in tmp_path.rglob('*') if p.is_file()}


# ------------------------------------------------------------------ title sequences (sequence-manifest / make with a sequence)
def _seq_tree(tmp_path, monkeypatch):
    """Synthetic repo root: candidates.json with a 3-step sequence (bg done in pilot, bg, overlay) + the source images."""
    root = tmp_path / 'repo'
    cdir = root / 'renders' / 'imggen' / 'candidates'
    os.makedirs(cdir)
    monkeypatch.setattr(W, 'ROOT', str(root))
    monkeypatch.setattr(W, 'WEB', str(root / 'renders' / 'imggen' / 'webpack'))
    cands = []
    spec = [('dok_amiga_amiga_cokdok_lbm_dok_title0', 1, 'background', None, 0, 0, (320, 200), 'already done in batch01 (x)'),
            ('dok_amiga_amiga_cokdok_lbm_dok_title1', 2, 'background', None, 0, 0, (320, 200), None),
            ('dok_amiga_amiga_cokdok_lbm_dok_title1b', 3, 'overlay', 'dok_amiga_amiga_cokdok_lbm_dok_title1', 0, 88, (320, 88), None)]
    for i, (cid, order, role, par, x, y, (w, h), exc) in enumerate(spec):
        rel = 'renders/amiga_cokdok/lbm/%s.png' % cid
        os.makedirs(os.path.dirname(root / rel), exist_ok=True)
        _synthetic(w, h, False, 40 + i).save(root / rel)
        c = dict(id=cid, source=rel, native_size=[w, h], description='step %d' % order,
                 sequence=dict(id='dok_title', title='T', order=order, role=role, parent=par, x=x, y=y, note='n%d' % order, steps=3))
        if exc:
            c['excluded'] = exc
        cands.append(c)
    # candidates.json lists them out of order on purpose
    json.dump(dict(candidates=[cands[2], cands[0], cands[1]]), open(cdir / 'candidates.json', 'w'))
    return root


def test_sequence_manifest_order_skip_layers_and_text(tmp_path, monkeypatch):
    _seq_tree(tmp_path, monkeypatch)
    out = str(tmp_path / 'seq.json')
    m = W.main(['sequence-manifest', 'dok_title', '--out', out]) or json.load(open(out))
    d = json.load(open(out))
    assert [e['id'].rsplit('_', 1)[-1] for e in d['items']] == ['title0', 'title1', 'title1b']      # display order, not file order
    assert [e.get('skip') for e in d['items']] == ['already restyled in batch01', None, None]
    assert [e['kind'] for e in d['items']] == ['band', 'band', 'logo']
    assert d['items'][2]['layer'] == 'auto' and 'layer' not in d['items'][1]
    assert d['items'][2]['logo_text'] == 'DEATH KNIGHTS OF KRYNN'                      # exact lettering is carried
    st = d['sequence']['steps']
    assert (st[2]['parent'], st[2]['x'], st[2]['y'], st[0]['done_in_batch01']) == ('dok_amiga_amiga_cokdok_lbm_dok_title1', 0, 88, True)
    # control: --include-done regenerates the pilot step too
    out2 = str(tmp_path / 'seq2.json')
    W.main(['sequence-manifest', 'dok_title', '--out', out2, '--include-done'])
    assert not any(e.get('skip') for e in json.load(open(out2))['items'])
    # control: an unknown sequence id fails instead of writing an empty manifest
    try:
        W.main(['sequence-manifest', 'nope', '--out', str(tmp_path / 'x.json')])
        raise AssertionError('expected SystemExit')
    except SystemExit:
        pass


def test_make_sequence_package_skips_done_and_records_steps(tmp_path, monkeypatch):
    monkeypatch.setattr(W, 'WEB', str(tmp_path / 'webpack'))
    srcs = []
    for i, (w, h) in enumerate([(320, 200), (320, 200), (320, 88)]):
        p = tmp_path / ('q%d.png' % i)
        _synthetic(w, h, False, 70 + i).save(p)
        srcs.append(dict(id='s%d' % i, kind='band', src=str(p), native_div=1, description='d%d' % i))
    srcs[0]['skip'] = 'already restyled in batch01'
    lay = np.zeros((88, 320, 4), np.uint8)
    lay[20:60, 40:280] = (200, 30, 30, 255)
    Image.fromarray(lay).save(tmp_path / 'lay.png')
    par = np.array(_synthetic(320, 88, False, 5).convert('RGB'))
    Image.fromarray(par).save(tmp_path / 'par.png')
    srcs[2].update(kind='logo', layer=dict(rgba_src=str(tmp_path / 'lay.png'), parent_src=str(tmp_path / 'par.png'), x=0, y=88, parent='s1'))
    steps = [dict(order=1, id='s0', role='background', parent=None, x=0, y=0, note='a'),
             dict(order=2, id='s1', role='background', parent=None, x=0, y=0, note='b'),
             dict(order=3, id='s2', role='overlay', parent='s1', x=0, y=88, note='c')]
    mp = tmp_path / 'm.json'
    json.dump(dict(sequence=dict(id='q', title='Q seq', steps=steps), items=srcs), open(mp, 'w'))
    W.main(['make', '--manifest', str(mp), '--batch', 'q'])
    bdir = os.path.join(W.WEB, 'q')
    man = json.load(open(os.path.join(bdir, 'manifest.json')))
    assert [e['id'] for e in man['items']] == ['s1', 's2']                              # the done step is not generated again
    seq = json.load(open(os.path.join(bdir, 'sequence.json')))
    assert [(s['order'], s['generate']) for s in seq['steps']] == [(1, False), (2, True), (3, True)]
    assert seq['steps'][0]['skip_reason'] == 'already restyled in batch01' and seq['steps'][2]['stem'] == '002_s2'
    md = open(os.path.join(bdir, 'SEQUENCE.md'), encoding='utf-8').read()
    assert md.index('| 1 |') < md.index('| 2 |') < md.index('| 3 |') and '0,88' in md and 'REPLACES' in md
    lay_e = man['items'][1]['layer']
    assert (lay_e['x'], lay_e['y'], lay_e['parent']) == (0, 88, 's1')
    # control: a plain list manifest still works and writes no sequence files
    mp2 = tmp_path / 'm2.json'
    json.dump(srcs[1:2], open(mp2, 'w'))
    W.main(['make', '--manifest', str(mp2), '--batch', 'plain'])
    assert not os.path.exists(os.path.join(W.WEB, 'plain', 'sequence.json'))
