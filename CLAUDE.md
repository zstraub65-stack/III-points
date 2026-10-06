# Festival board

A shared set-times grid for a music festival. One self-contained HTML page plus a
Cloudflare Worker that stores everyone's picks and live check-ins. No accounts, no
build step, no framework.

Currently hard-wired to III Points 2026 (Miami, 16–17 Oct 2026). The active project
is generalising it to any festival. Read `HANDOFF.md` before starting that work.

- Live: https://iii-points.zstraub65.workers.dev
- Repo: https://github.com/zstraub65-stack/III-points

## Layout

```
public/index.html   the entire app, ~105 KB, no build step
worker-entry.js     /picks API; everything else falls through to static assets
wrangler.jsonc      config, including the KV binding (never use the dashboard)
tests/              node + jsdom, run with `npm test`
```

## Hard rules

1. **Run `npm test` before and after every change.** 13 files, all green at last
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
5. **Don't invent set descriptions.** 149 of 231 sets have no note on purpose.
   Blank means unknown, not missing.
6. **`wrangler.jsonc` holds all config.** The owner works from a phone much of
   the time, where the Cloudflare dashboard is close to unusable.

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
