/**
 * Buck Rogers: Countdown to Doomsday container census — Round 33 R4.
 *
 * The ledger calls Buck's `geoN.dax`/`walldefN.dax`/`mon0*.dax`/`item0.dax`/`eclN.dax` containers
 * un-reverse-engineered; in
 * fact they are Gen1-shaped (the SAME loaders already proven on Champions/Death Knights of Krynn)
 * and the C64 disk set is byte-grounded proof of it for GEO — see `tools/buck_container_census.py`
 * and `docs/engine/research/buck-containers.md` for the full identity tables, the shuffled-pairing
 * null, and the monster-layout plausibility measurement (mon0cha.dax's 263-byte record matches NO
 * existing `MonsterLayoutProfile`). This file pins the TS-side decode (`decodeGeoBlock`,
 * `listPairedGen1Areas`) against the real retail bytes so a future change to either loader is
 * caught here, not just in the Python census.
 *
 * Every plane hash below was computed from the real retail bytes by hashing the untransformed
 * plane slices (`decodeGeoBlock`'s `buildGeoResult` returns `wallPlane0`/`wallPlane1`/
 * `backdropPlane`/`doorPlane` exactly as sliced — see geo.ts; no per-cell transform is applied to
 * the plane arrays themselves), so a Python `hashlib.sha256` over `raw[2:258]` / `raw[258:514]` /
 * `raw[514:770]` / `raw[770:1026]` reproduces them exactly — that is how they were derived
 * (`tools/buck_container_census.py`'s `load_dax_file` + a one-off hash script, not re-typed by
 * hand from a decoder run).
 *
 * All cases `runIf`/`skipIf` on the external, never-vendored `D:/` install — they skip cleanly
 * (not fail) when that source is absent, the convention every other `D:/`-reading engine test uses
 * (see `buckEclDialect.test.ts`).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  decodeGeoBlock,
  readDaxDataBlocks,
  listPairedGen1Areas,
  GEO_BLOCK_SIZE,
} from '../src/index.js';

const BUCK = 'D:/Games/Emulator/DOS/GoldBox/BuckRogers1-CountdownToDoomsday';
const HAVE_BUCK = existsSync(`${BUCK}/geo1.dax`);

function geoFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => /^geo\d+\.dax$/i.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)![0], 10) - parseInt(b.match(/\d+/)![0], 10));
}

/** Plane sha256 (hex) for every one of the 17 Buck GEO blocks, keyed by DAX block id. */
const EXPECTED_PLANE_HASHES: Record<number, [wall0: string, wall1: string, backdrop: string, door: string]> = {
  16: ['6a2ef73cf7d49fbb0a0aad8d9df575bbaa787aa2deb2de926c7b2e4753362005', '32993323d7bfb3e0d0ea205f111344f331a4a5de7b1ce031f084a1ead3b89d32', '14c8e391f373341ce137468c2f8688bdf5c33b1b954b2a8dd397495617b8acce', 'e4190e2281ad080242d18cfa8b5bb2c26d843567817c753c5abc3c2642b3bcf0'],
  32: ['61072962cea1f2af293b85553080f09e89b4122dfdfbdb032218ddb2b6b74f3f', 'aa568ad0f65bacf58d8625279efba9aea0e596e42093296b035a2f885e74054e', '00760f8c30bdc4bc8614b5f7f9d79ab54a3e6e534cb523cbd3033cbd5b5eccfa', '7f6b67e1d76194d95bc1872a644330fd3a11f6d94ed29783a503ade2741ea188'],
  35: ['e5fa1b56151a9f9fea2d78ed374de8f7b8c081ae81f42f07a8f01a8c3f05790d', '95b4dfcf7e28d4b9aa0c7ac45a9078f61720985ef4cc6381e761c2a9716a3cdf', '3d79d162251100a017159b543c99f575da8de96d438a4d9c68823f84b0c65397', '78eba4e3af7c0d8506097680eb90b975428e421187e7c71d99b518283cf565fc'],
  48: ['66ca117a06037cfea321147d238108b9ae5c7e913230fbb00a6e4100fd77d15d', 'daf6ff90789615da1646ed22b281d066481ae5f75da766e99c0b5bb41c0cac56', 'd0b7089a3ddbbc232a852b1ca52e37dc58720e70f32f3cfe1626f9af112829a6', 'ad65377f77be3d3543e62738040b4bfc8d6c4cc839e75357850ca532c44c79aa'],
  49: ['d757415cde8e76d3a53d7409208f0885492238e304ebd1173c4c24c04b6424ed', 'b348d879b3bc5f84a3d12577440ad69571a5bbfc6297085445319d8f6398fe34', 'eb98120d5530d47300eac318905d20a776b28e623858ad37544e683e617b941d', 'a5b80314150c6f2662f684700e957a260d6c4fed1e67981890c810ab29e4a1c7'],
  50: ['c2c73e9147ddc46a206ef7fba1ae5a340265075e20a291d552838c1ca8cb9a50', '8a1c5fc12a3b19a3b95ba98c06277ca225a95de6cf2679dc157bc3ceda64eee0', '96b87fe13e2e4798fd724b2a9d96b58a5353ec63593ef397747c872bbe503991', 'a800444c0c370eaab27e8094d72b7f50724bc8cd94b17c950436a70f819a4f9b'],
  51: ['ff9aa5180721aa4f6da0c196f7b9475dbbc676bbcb587d8e0acda1bdbea8b037', '477b146b9c40e56cd15b0411101c6579c76bdb02b975411497b59069fc14ce0c', '3d01461fa2ccebdf74755ebcb75c611c770dcb3362b42ac6cd795cfa1b41cae3', 'd31ace6bbc93f34386a3a5a0fde70d387539226e3ddf29552822c3aa5fb54902'],
  52: ['65ba41d3e8ad2ec8eb813926073389e596efb8bb051cf7bbd54c714b30429482', '4b83c741e7e671b42549637e6229827878a190f99d3fb13f9f520605fbee28db', 'fc4194524e2cabccdbbd72aa0cc39a532a7b732ef3c5056e101f0a85e9da8abd', '526f82020ee889f483d5b4c2abda131a72ba534b3feceaf75890a7f22f00fecb'],
  65: ['30501e4a4268582678e236133423bae52ab6133b1672cbc4fcbd4085934bb2a1', '9bdb72f91f09dbf2d5f7041348e70e6ed6373050a314779d90c37810ee15369a', 'e69998d5d7c5dfd7baa0a4bcea07232abd90e2ceba35dfd198a490b7d9578948', 'b4b28da5c6d822af467adc1dcf6adb35375e294bd1e11cd7b2114e1cc489c1e2'],
  66: ['8fd2d00d5ac702ae976175ca4cc213f97c960cf04e4c55b6f276a41095167529', 'bdf8e346475471467a544a924371c6a7a6612666bfd8d5bc67d47589ab5fbcf8', '4fcf305ec0f773430d7bfd7d250551e93394fe8340c252a075222807be3502c2', '2024ba6bfebc12ebe4080d38050a91a18210944c931759e0f6cd907630888c89'],
  67: ['b814c801fb4e9511fa7f0df008289ac6151bb107a0871a077d2e0d12382ecf77', '10577aff66c0e5fd244ed3378aee9468660e842b22352d5b473de703f5ae243f', 'c1720bce1cd4b58b3dd294e676de5ffe85531d08c8710c70a69626b76078ba69', 'b0efd7f2ee806f31c73e8276d8f48a6ecc2632c64cfe1ae5182571335ccb447f'],
  81: ['5f9d757f980b0b0449340e51551f4fc62a5b02eff960fdf99a8d00de68581fdc', '4f33373f7f1ca158a4213ea9e935d6c25a8b25fe6d33b145471d5ebcb1cd6081', 'c0a39cf613d4f74f07afa5f38712d3cddb75e2ede66d03675373531a3cd411d8', '63c99b06101aa1b84a01ad54e375d76ccca11300cb3f0bbac4775834136c4d92'],
  82: ['e76d6ca324a91ec7742977b6d9c67a32c5c0e2e5bce899c037fc8306a56f0f8c', '6dbc8bb342bb41b40fe866bd536ebda8dca50e04e4e11e89622928219617a0e7', '2dc90d0c1dd6855d1c33234ae582cd21d7d27f6a4bd12259e380415279e7b1bd', '0a9b8577e7379d23af1f6d73ed98863557e3cfa88386d4d02e4ee6517c3e0564'],
  96: ['e01611f3a2dfabfcfa0b94142b38a24974d6f639e92899b7c56f6973ac0ece73', '97fd2fe771f3d5a6c3089e9bbd0e5f5b4ef2c2284c35624d7785ff0132d1024c', '655dfa2834aa563c280014609cd8c8818cea39873e932874a879bb883ba76aeb', 'f87d8829d8505bbe2004b9b12addfa8a20fe0756d3b340e32a310d5a0f152274'],
  97: ['afd19383bd5c2b01613dc9534272abeb6099a83ec070d695ebdc9ea264b511ae', '261efa38c8ca58669e835b3d87f444e05a1451ebc5ddbf13fa80eb3f62cc31a6', 'a90e7b9276534ed473834b1bb297bd7e929c66ab22f9de278171a9f9668accf6', 'fc2aee31d2530adc0730e40fe5a5aac2c9437086e036a67545cd22aae6e1be86'],
  98: ['32e164598761cc831502b63f299d36de2d9ddd2b2dfb1379e894c0a51716aec6', '31805343a0a614b7412c726118f3ab0f2a2244cbb51283f9cb95b19b5bebda90', '5c95ecb11e1612156b233fbbf6ec70dc91d135cb8fac9321679b8e2b476a132e', '3dba92950910e9efeddbf696c9d4c6c599bcb4f168b6fd4e7bc80d38a04be19f'],
  99: ['577e1758574c8ffcbb5093a85620123f0f2af45b99777a39499c77565c7d03a1', 'c92445501617d39d8a110b10391ada8f4943e518aa544ccc32978b12e45f2f8a', '273f910a78b16999547683fafb4b91af0fd220852d14a008d0fd34b511771374', '5341e6b2646979a70e57653007a1f310169421ec9bdd9f1a5648f75ade005af1'],
};

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe.skipIf(!HAVE_BUCK)('Buck Rogers GEO decode (Gen1 decodeGeoBlock, the same loader as CoK/DoK)', () => {
  it('decodes every geoN.dax block at the fixed 1026-byte Gen1 size — 17 blocks across the 6 disks', () => {
    let total = 0;
    for (const file of geoFiles(BUCK)) {
      const bytes = new Uint8Array(readFileSync(`${BUCK}/${file}`));
      const blocks = readDaxDataBlocks(bytes);
      for (const b of blocks) {
        expect(b.raw.length, `${file}#${b.blockId}`).toBe(GEO_BLOCK_SIZE);
        expect(() => decodeGeoBlock(b.raw, `${file}#${b.blockId}`)).not.toThrow();
        total++;
      }
    }
    expect(total).toBe(17);
  });

  it('pins the four plane hashes of all 17 Buck GEO blocks', async () => {
    const byId = new Map<number, Uint8Array>();
    for (const file of geoFiles(BUCK)) {
      const bytes = new Uint8Array(readFileSync(`${BUCK}/${file}`));
      for (const b of readDaxDataBlocks(bytes)) byId.set(b.blockId, b.raw);
    }
    expect(byId.size).toBe(17);
    for (const [id, expected] of Object.entries(EXPECTED_PLANE_HASHES)) {
      const raw = byId.get(Number(id))!;
      expect(raw, `geo block ${id} present`).toBeDefined();
      const { wallPlane0, wallPlane1, backdropPlane, doorPlane } = decodeGeoBlock(raw, `geo#${id}`);
      const [w0, w1, bd, dp] = await Promise.all([
        sha256Hex(wallPlane0),
        sha256Hex(wallPlane1),
        sha256Hex(backdropPlane),
        sha256Hex(doorPlane),
      ]);
      expect([w0, w1, bd, dp], `geo block ${id} plane hashes`).toEqual(expected);
    }
  });
});

describe.skipIf(!HAVE_BUCK)('Buck Rogers listPairedGen1Areas — per-disk GEO/ECL pairing counts', () => {
  // Pinned per-disk paired-area counts (id present in BOTH geoN.dax and eclN.dax): computed from
  // `listPairedGen1Areas` itself against the real retail bytes, one disk at a time.
  const EXPECTED_PAIRED_COUNTS: Record<number, number> = { 1: 1, 2: 2, 3: 4, 4: 3, 5: 2, 6: 4 };

  it('pairs every disk\'s geoN.dax against its eclN.dax and matches the pinned per-disk counts', () => {
    let grandTotal = 0;
    for (let n = 1; n <= 6; n++) {
      const geo = new Uint8Array(readFileSync(`${BUCK}/geo${n}.dax`));
      const ecl = new Uint8Array(readFileSync(`${BUCK}/ecl${n}.dax`));
      const areas = listPairedGen1Areas(geo, ecl);
      expect(areas.length, `disk ${n} paired areas`).toBe(EXPECTED_PAIRED_COUNTS[n]);
      for (const a of areas) {
        expect(a.width).toBe(16);
        expect(a.height).toBe(16);
      }
      grandTotal += areas.length;
    }
    // The alternative hypothesis ("Buck's ECL/GEO ids are not paired the CoK way") predicts 0
    // pairs on every disk; the real bytes pair on all 6.
    expect(grandTotal).toBe(16);
  });
});
