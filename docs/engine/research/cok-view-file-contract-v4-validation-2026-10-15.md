# View v4 conditional file-contract diagnostics

2026-10-15. Actual Luna pure diagnostics following Astra's
[source review](cok-view-file-contract-v4-source-review-2026-10-15.md) and Root's
separate two-process release. No Capstone import, original decoding, compiler,
application or View input was authorized by this gate.

Candidate `build/cok-recomp/character-view-file-contract-sol-20261015-v4`.
Raw SOURCE-FREEZE.json SHA256
`7d320cae71dee4abe6ce76b26460dc4ce18f958243cd76ac2ed2df7de1d9558c`;
declared roster identity `3cddcdff0159aeb06b0463150314ba6a0bc3615857b159e8898ecf88d44c76cc`.
Luna verified executable/helper/input identities before launch and retained
selected startup environment. The report output was absent and its ancestors
owned/non-reparse. Both processes used the pinned Python200d0017… and existing
capture helper6d76f4b3… . Full argv/cwd/PID/UTC/raw stream records are under
`build/rea/rea-view-file-v4-luna-20261015-a-receipts`.

| Process | PID | UTC interval | Actual result |
| --- | --- | --- | --- |
| view_file_controls.py |54368|20:15:04.2721962–20:15:04.4693507|exit0, drained;24 rejected mutants |
| view_file_contracts.py |67768|20:15:14.2107316–20:15:14.4300148|exit0, drained; conditional ledger written |

Controls stdout417B SHA256
`bc9ef9140df7418d1e0e9cd1e62b6842d2be89052988336f738e6a119a83beae`.
Mutations cover source/relocations, union/edges/returns/gaps/writes, AX/BL,
forged close preservation, private/public entries, producer/frame semantics,
admission/worklist and budget. Consumer stdout/stderr are empty. Actual report:
`build/rea/rea-view-file-v4-luna-20261015-a-classification.json`, SHA256
`51531bbf2159ab6fe47542cb6c0640b88422821905b6be7a98a72b67b391c701`.

Luna's later summary command had a PowerShell parser error. It did not alter or
rerun either diagnostic. Root subsequently read the retained JSON directly:
183 conditional SCC rows and228 conditional slot rows. Root independently
rehash-checked all980 frozen files afterward: zero size/hash mismatches.

| SCC | Exact remaining obligations | Conditional discharges | Native support |
| --- | --- | --- | --- |
|22 (65:3888)|26|0|false |
|140 (146F)|0|0|false |
|141 (read)|0|2|false |
|154 (close)|0|1|false |
|155 (open, including close dependency)|0|3|false |
|182 (BA:127E)|66|5|false |

These are conditional graph results requiring the exact public-entry runtime
witness; they are not executed native contracts. The original report still has
`runtime_admission_authorized=false`, `supported_slot_count=0`. A8 root
acquisition and other non-file blockers remain. WORLD stays35,740 instructions/
91,590 bytes; no new guest admission. Fourteen authored Rust wrapper tests
remain unexecuted. The native preparation ownership/freeze and generation-only
boundary repairs identified by Astra are the next source task.

After the runs, Root inspected Defender detection/action logs: latest record
remains19801. No protection change or new security rejection was observed on
these named runs. This is not a Microsoft false-positive or clean-machine
verdict; later generation/compiler/application gates remain separate.
