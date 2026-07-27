# Acting on the first agent's feedback on a walkthrough bundle

> Status: **done** (shipped 2026-07-26 in 0.4.0) · 2026-07-26

An agent read a real `gripes/<slug>/` walkthrough and sent back seven ranked notes. Every one is
about the *handoff* — the folder is fine, the way it addresses the model is not. Mapping each note
to the change:

| # | Feedback | Change |
| --- | --- | --- |
| 1 | The path didn't resolve — six tool calls of `find` | Ask once for the absolute project path (FSA can't tell us), store it in kv, open every report with a `This folder:` line, use it in the copy-prompt |
| 2 | 68 stills for 6 spoken lines; grids were the high-value artifact | Flip the default: grids become the primary timeline section, stills inlined only inside a speech window (cap 24), the rest collapse to one line per run with their grid reference |
| 3 | Speech stamped at start; the line at 0:23 was about 0:26–0:28 | Every line renders as a **window** (`0:23–0:31`) and names the frames it covers; Whisper's chunk end-time lands in `TranscriptSegment.d`, estimated from word count otherwise |
| 4 | ASR ate "tile" → "pixel", a 16× error | Report states whether a human checked the transcript; panel nags until "looks right" is clicked; `Alt+Shift+M` stamps a marked frame mid-sentence (always inlined, `★`) |
| 5 | The one captured error was from another tab | Events (and pointer samples) are scoped to the origin of the tab in front when recording started; drop count is reported, not hidden |
| 6 | "these over here" is unresolvable without a pointer | The recorded tab forwards mouse position + the element under it; each frame carries it, a crosshair is drawn when the capture can be mapped, the selector is printed either way |
| 7 | The debug HUD was worth more than the pixels | Documented in README + the feature spec |

## Not doing

- Changing dedup thresholds. 68 keyframes for 40s is the *dedup* working (decisions.md 2026-07-26
  bought that with evidence); the fix is what the report inlines, which is what the agent asked for.
- Auto-correcting ASR numbers. A wrong guess is worse than a flagged one.
