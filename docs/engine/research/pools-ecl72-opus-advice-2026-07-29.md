The audit is complete and written to `{local-user-profile}\.claude\plans\you-are-a-read-only-humming-sunbeam.md`. Nothing was edited, committed, or deployed.

A few things worth calling out beyond the summary above:

**On the framing question's strength.** The reason years of corpus scans missed this is visible in the bytes: the 3-operand mis-frame at block 69 raw `0x3C` creates only a 3-byte bubble and then re-lands on the same instruction boundary at raw `0x47`. Every "does the block decode cleanly?" test passes under both readings. The discriminating test is the operand-code validity check at slot 3 (34/88), not stream cleanliness — worth encoding as the standing test for future dialect splits.

**On what I could not settle.** The `Area+0x15 ⇒ logical [0x0016]` mapping in the prompt is asserted rather than shown, and `program.ts`'s new comment states it as proven. The conclusion is correct on independent ECL evidence, so this is a wording fix, not a retraction. `0x1F`'s semantics and `0x37`'s `0x7F`/bit-7 result forms remain genuinely unlocated — only their operand frames are proven.

**One caveat on my own numbers.** My corpus walker models `IF_*` as "next instruction conditionally skipped," which is close to but not identical to the retail `SkipNextCommand`. The instruction counts (29 452 reachable under the proposed table) are indicative; recompute with the engine's own walker before pinning any of them into a test.
