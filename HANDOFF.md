# Festival board — handoff

State of the code, and the plan for turning it into something reusable across
festivals. `CLAUDE.md` holds the short version that loads every session; this file
is the detail, read on demand.

Last updated 6 Oct 2026, after the crowd-position and leave/rejoin work.

## 1. What exists today

A shared set-times grid for III Points 2026 (Mana Wynwood, Miami, Fri 16 and Sat
17 October, 4pm–4am both days), laid out to match the official poster. Everyone on
the link shares a board and sees each other's picks and live check-ins. Nobody
signs in.

Built for about a dozen friends across three crews. It works and is in use.

### Architecture

Cloudflare Worker with static assets. One origin, so the page and the API share a
domain and there is no CORS and nothing to configure in the page.

```
public/index.html   grid, detail sheets, crews, check-ins, crowd grid, QR, sync
worker-entry.js     /picks; everything else to env.ASSETS
wrangler.jsonc      KV namespace PICKS, id 8685ee6c39594812ac20dcc4c3841d8a
tests/              12 files, `npm test`
```

### API

```
GET  /picks?board=<name>
  -> { board, people: [ { person, name, sets, at, updated } ] }

POST /picks?board=<name>     partial update, only the keys you send
  { person, name? , sets? }                  picks and display name
  { person, at: {s,t,fire,p?,n?} | null }    live check-in
  { person, leave: true }                    leave, and stay gone
  { person, remove: "<pid>" }                remove somebody else
  { person, rejoin: true, name, sets }       come back after leaving
  -> { ok: true, ... }  or  { ok: true, blocked: true }  if you have left
```

Storage is one KV key per board, `board:<name>`, holding `{ people: {...}, gone:
{...} }`. 60-day TTL from last write. 200-person cap, oldest dropped. The `gone`
map is capped at 100.

A person is a random 10-byte hex id their browser generates and keeps in
localStorage. There are no accounts and no auth: anyone with the link can read and
write any board whose name they know. That was a deliberate trade for a festival
schedule among friends, and it is the single biggest thing to revisit if this goes
wider.

### Check-in model

`at = { s: "fri|Hamdi", t: <ms>, fire: <bool>, p: [col,row]?, n: "<=24 chars"? }`

A check-in expires on its own at `min(setEnd + 10min, checkinTime + 90min)`, so
nobody has to remember to check out. `p` is a cell on a 4x4 crowd grid with the
stage at row 0; `n` is a landmark note, which in practice is more useful than the
cell. The worker bounds-checks `p` to 0–3 and strips control characters and angle
brackets from `n`.

### Crews

`#board=<slug>` in the URL picks the board; default `miamiii`. You can follow other
crews, which shows their picks on your grid without showing them yours. Deliberately
asymmetric. Each crew gets a shape, each person within a crew gets a colour; your
own crew is always the triangle.

### Polling

Adaptive: 5s while you are actively tapping, 30s idle, nothing after 10 minutes
untouched or while the tab is hidden. This exists because of the KV quota, not for
elegance. Check-ins also age visibly, so there is a 30s redraw on a timer
independent of the network.

### Data in the page

- `FRI` / `SAT` — `[stage, name, start, end, extra?]`, 112 and 119 sets, 13 stages.
  **Transcribed by hand from the two official posters and never verified against
  the official app.** Treat every time as suspect.
- `REC` 13, `NOTE` 11, `INFO` 58 — a curation layer keyed the same way as picks.
  82 of 231 sets carry something; the other 149 are blank on purpose because there
  was no reliable information about them. Blank means unknown. Do not fill them in.
- B2B notes are keyed on the **first** artist's name.
- `ST` — stage → `[colour, isDark]`, in poster column order.
- localStorage keys: `iiip26-mine`, `-name`, `-pid`, `-cache`, `-follows`,
  `-hidden`, `-welcomed`, `-left`.

### Tests

`npm test` runs `tests/run.js` over 12 files. They load the real `public/index.html`
in jsdom with a mocked `fetch` and a frozen festival clock, and drive the actual UI.
The worker tests run the real `worker-entry.js` against a fake KV that counts
operations, so the quota claims are measured rather than asserted.

Worth knowing: on at least four occasions a failing test was the test being wrong,
not the code. Read the failure before changing the source. Equally, two shipped
bugs were caught only because a test drove the real DOM rather than a mock.

## 2. Known weaknesses

Ordered by how much they would hurt.

| Weakness | Impact |
| --- | --- |
| No auth of any kind | Anyone with a link can read, write or remove anyone on that board. Now includes a remove button. |
| Identity is per browser | Clearing site data or switching phones makes you a new person with no picks. No recovery. |
| Schedule unverified | Typed by hand off posters. A wrong set time is invisible until someone misses a set. |
| Untested in the field | Check-ins, crowd grid and expiry have only ever run against a simulated festival night. |
| Deploy is manual | Push does not deploy. A human has to run `Deploy.bat`. |
| Clash detection is self-only | It does not look at the crew's picks. |
| Walk times are guesses | The stage-to-stage estimates were never measured. |
| Single region | KV is eventually consistent; two people writing in the same second can race. Low stakes here. |

## 3. The actual project: make it work for any festival

Right now the festival is not data, it is the source code. The schedule arrays, the
stage colours, the poster layout constants, the door times and the localStorage key
prefix are all literals inside `public/index.html`.

### What has to come apart

| Currently hard-coded | Where | Needs to become |
| --- | --- | --- |
| `FRI` / `SAT` arrays | index.html | A festival data file, N days not 2 |
| `DOORS` timestamps | index.html | Per-festival, with a real timezone, not a UTC literal |
| `ST` stage colours and order | index.html | Part of the festival file |
| `SPAN=720`, `PPM`, `PAD`, `GAPAFTER` | index.html | Derived from the data, not constants |
| `REC` / `NOTE` / `INFO` | index.html | Optional per-festival curation, cleanly separable |
| `iiip26-` localStorage prefix | index.html | Namespaced per festival, or picks leak between them |
| `board:<name>` KV key | worker-entry.js | `<festival>:<board>` |
| Default board `miamiii` | index.html | Per-festival default |
| Two-day assumption | Everywhere | Day list of arbitrary length |

### Suggested order

1. **Get a second festival's data in before refactoring anything.** The shape of
   the abstraction should be decided by two real schedules, not one. A festival with
   three days, or one stage, or overlapping day boundaries, will expose assumptions
   that reasoning alone will not.
2. **Extract the festival into a JSON file** served alongside the page and fetched
   at boot. Keep the single-file page otherwise. Resist adding a build step; the
   no-build property is why this has been editable from a phone all along.
3. **Namespace storage.** localStorage prefix and KV key both. Do this before
   anyone uses a second festival, or picks will cross-contaminate. There is
   precedent: seeded picks leaked between users once already and a friend
   unknowingly edited someone else's list.
4. **Make the layout derive from the data.** Day count, span, stage count and
   column order all come from the file. This is where the poster-faithful rendering
   will fight back, because the current layout is tuned to a 13-stage, 12-hour,
   2-day grid.
5. **Then decide about auth**, because multi-festival means strangers, and the
   current model assumes everyone on the link is a friend.

### Things to be careful about

- **Schedule entry is the real bottleneck, not the code.** Transcribing III Points
  by hand took longer than any feature in this repo. Any multi-festival plan that
  does not answer "where does the schedule data come from" is not a plan. Consider
  an importer before more UI.
- **The no-build, single-file property is load-bearing.** It is why the owner can
  edit and deploy from a phone, and why there is no toolchain to rot between
  festivals. A framework would be a real loss, not just a preference.
- **The page is ~105 KB and parsed on every load.** Splitting the festival data out
  helps; adding a framework does not.
- **Don't generalise the curation layer too early.** `REC`/`NOTE`/`INFO` are one
  person's opinions about one lineup. They should be optional and absent by default
  for a new festival.

## 4. Deploying

Cloudflare only builds commits attributed to `zstraub65-stack`. Pushes from the
Claude GitHub App are ignored, so pushing is not deploying.

1. Commit and push.
2. Owner double-clicks `Deploy.bat` (Desktop, `III Points` folder). It POSTs to a
   Cloudflare deploy hook and should print `"success":true`.
3. Wait about a minute.
4. **Verify from outside.** Fetch the live page and check for a symbol you just
   added, or read the deployed worker code. Do not trust the push.

Fallback if the hook fails: make any trivial commit through the GitHub web UI, which
is attributed to the owner and does trigger a build.

Saved picks live in KV and survive redeploys.
