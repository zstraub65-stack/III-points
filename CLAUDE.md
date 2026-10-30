# Festival board

A shared set-times grid for a music festival. One self-contained HTML page plus a
Cloudflare Worker that stores everyone's picks and live check-ins. No accounts, no
build step, no framework.

Currently set up for EDC Orlando 2026 (Tinker Field, 6–8 Nov 2026): three days,
four stages, 107 sets, doors 1pm to midnight. It ran III Points 2026 before that.
The festival lives in one `FEST` object near the top of the page rather than in
scattered constants; finishing that generalisation is the active project. Read
`HANDOFF.md` before starting it.

- Live: https://iii-points.zstraub65.workers.dev
- Repo: https://github.com/zstraub65-stack/III-points

## Layout

```
public/index.html   the entire app, ~124 KB, no build step
worker-entry.js     /picks API; everything else falls through to static assets
wrangler.jsonc      config, including the KV binding (never use the dashboard)
tests/              node + jsdom, run with `npm test`
```

## Hard rules

1. **Run `npm test` before and after every change.** 20 files, all green at last
   commit. jsdom drives the real `public/index.html` with a frozen festival
   clock. A change that breaks a test is a regression until proven otherwise;
   several times the test was right and the code was wrong, and twice it was the
   reverse. **Assert, never print booleans.** Use the `ck(label, got, want)`
   pattern and end with a verdict line; the runner treats a bare `: false` as a
   failure, because a stale test that logged `false` sat green for hours.
2. **Picks are keyed `day|artistname`.** Renaming an artist in the schedule
   orphans everyone who picked that set. Migrate, never rename.
3. **KV free tier allows 1,000 list operations a day.** Never add a `list()` to a
   read path. Board state is one aggregate key, `board:<name>`, for exactly this
   reason; a previous per-person layout burned the daily cap in under two hours
   with a single viewer.
4. **POST /picks is a partial update.** Only the fields present in the body are
   written. Never send a whole-person object; it will clobber a concurrent
   check-in or someone's picks.
5. **Don't invent set descriptions.** Most sets have no note on purpose. Blank
   means unknown, not missing. For EDC the only notes that exist are the ones
   printed on the posters: B2B pairings, aliases, sunset markers. `REC`, `NOTE`
   and `INFO` are deliberately empty.
6. **The official festival map is the owner's file, not Claude's to commit.**
   The Map tab overlays tap targets on it at normalised coordinates in
   `MAPIMG`. The page probes `MAP_SRC_TRY` for the filename, because a phone
   upload may arrive as `.jpeg`, `.png` or uppercase. Both the image and the
   no-image paths must keep working: with no image, or an image but no
   coordinates, the tab falls back to a tappable stage list. There is no EDC
   map file in the repo yet, so the list is what ships today.
7. **`wrangler.jsonc` holds all config.** The owner works from a phone much of
   the time, where the Cloudflare dashboard is close to unusable.
8. **The page opens on the day you are standing in.** `todayId()` picks it:
   live during a day (from three hours before doors to an hour after close),
   otherwise the next day, and the last day once it is over. Never reintroduce
   a hard-wired starting day. Reading the right tab in a dark field at 2am is
   not a thing to ask of anyone.
9. **Changing festival means changing `FEST`, the schedule arrays, `ST` and the
   storage prefix together.** The prefix (`edc26-`) and default board (`edc`)
   namespace everyone's picks; bumping them is a deliberate reset, not a
   rename, and it is how a new festival starts clean.

## Deploying

Cloudflare ignores pushes attributed to the Claude GitHub App and only builds
commits attributed to `zstraub65-stack`. So pushing is not deploying.

After pushing, the owner double-clicks `Deploy.bat` on their Desktop, which hits a
Cloudflare deploy hook. Build takes about a minute. Verify afterwards by fetching
the live page rather than trusting the push.

## Working style

Direct and concise. Honest analysis over agreement, including about this code.
State confidence and say what the evidence does and does not show. No em-dashes,
minimal exclamation marks.
