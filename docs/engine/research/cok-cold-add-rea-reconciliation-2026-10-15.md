# Cold Add REA reconciliation

Astra source/evidence review, 2026-10-15. Read actual REA JSON under `build/rea/rea-add-files-20261015-a/`, selecting normalized function/assembly fields; no REA, guest, build or test executed by this review. Compare against pinned cold inventory `ef9aeb0956ca8d44a26736d243cadf0bbfcce0051d57d7274fa3919728b84de5`.

| Original owner/root | REA image address | Instructions / calls | Body bytes | Return instruction / inclusive body end |
| --- | --- | ---: | ---: | --- |
| A4:37A2 Add | 337A2 |321 /28|872|3B09 /3B09 |
| 9E:0453 list setup |30453|58 /4|132|04D4 RETF8 /04D6 |
| 9E:008B enumeration |3008B|377 /39|962|044A RETF14h /044C |
| 9E:11E5 reader |311E5|374 /46|1034|15EC RETF0Ch /15EE |
| 9E:1989 insertion |31989|98 /3|311|1ABD RETF4 /1ABF |

All instruction/call counts and original return sites match the complete function inventory. The two-byte difference for immediate RETF endpoints is operand length, not extra code or a missing return. A4 and9E share analysis placement30000 only in separate prepared images; their original identities remain distinct. No additional closure dependency or guest admission is justified by these outputs.

## Runtime checks clarified

- List setup reads its existing DS713E-indexed tables at0866/0869/086F and calls enumeration after constructing configured-path plus WHO literal. Enumeration explicitly opens with record size1, checks file length against its original argument, then reads16 name bytes and one classification byte. Preserve table-driven selection and original filtering; do not interpret the REA inferred parameter types as a new save schema.
- Reader open wrapper069C:02A7 contains original successful read-open setup at04A8 `mov ax,1`,04AB `push ax`,04AC far call0A46:13C9, following the file-record pointer pushes. Together with the existing block ABI this supports the source path's199h/3Fh/9 requested counts as409/63/9 bytes once that open succeeds. Actual cold acceptance still records open result, initialized record size and returned counts; source evidence is not proof a particular runtime open succeeded.
- Main reader clears serialized pointer pairs at character+143/145,+E3/E5,+183/185,+17F/181. Complete63-byte STF nodes are copied then relinked using+2A/+2C and terminated with zero; complete9-byte SFX nodes use+5/+7 and zero termination. Short final node reads do not become fabricated complete nodes. Temporary buffers are freed through original helpers. Use original code for reconstruction and validate the resulting owned links.
- Insertion sets character+137 toFFh while scanning occupied slots, assigns an available slot below8, writes party/current pointers, appends via+17F/+181 and increments the original count at the structure referenced by DS4B2C plus67Ch. Preserve this work; seeing the name in a list is not proof of insertion.
- Add's empty/nonempty branches, duplicate check and party restrictions remain original code. Source uses fields+E7,+FC,+FD,+10A and bounds6/8/3; this review does not invent gameplay meanings for unresolved fields. Reject/cancel cleanup still matters.

## REA limits and acceptance

Ghidra reports inferred far-call signatures, reused flag variables and segment arguments that can look inconsistent in pseudocode. Its resident overlay-stub function extents may encompass neighboring stubs. Use original physical bytes, existing exact dispatcher contracts and original assembly for call identity; do not compile pseudocode or widen guards based on those inferred boundaries.

The host search adapter remains separately reviewed. After it passes, cold headless acceptance must show actual KRA list selection, full reader counts, live pointer reconstruction, party insertion and View/subsequent action, with negative search/file/cancel cases. These REA results close a static cross-check, not original DOS gameplay comparison or M1 completion.
