# Festival board — handoff

State of the code, and the plan for turning it into something reusable across
festivals. `CLAUDE.md` holds the short version that loads every session; this file
is the detail, read on demand.

Last updated 30 Oct 2026, after III Points ran and the page was converted to
EDC Orlando.

## 1. What exists today

A shared set-times grid for a festival. Everyone on the link shares a board and
sees each other's picks and live check-ins. Nobody signs in.

It ran live at III Points 2026 (Mana Wynwood, Miami, 16–17 October) for about a
dozen friends across three crews. It is now set up for EDC Orlando 2026 (Tinker
Field, 6–8 November): three days, four stages, 107 sets, 1pm to midnight.

### What the field test actually showed

Two days of real use, which is the only evidence in this repo that is not
simulated:

- **Nobody checked in.** Checking in is a habit twelve people have to maintain
  all night, and it was not a habit anyone had. The rally point was built in
  response: one person declares a place and time, everyone else just reads it.
  That is the design lesson and it should steer whatever gets added next.
  Features needing sustained input from everyone lose to features needing one
  input from one person.
- **The day tab was wrong all of Saturday.** The page opened on Friday and had to
  be switched by hand, in the dark, repeatedly. Fixed by `todayId()`, and hard
  rule 8 exists so it does not come back. Treat any state the user has to correct
  on arrival as a bug, not a preference.
- **Set times changed mid-festival.** The 16 Oct update had to be applied
  slot-by-slot to avoid renaming artists and orphaning picks, which is hard rule 2
  in practice rather than in theory. A `CHANGED` map marked what moved so people
  could see it on the grid.
- **The drawn map was not good enough to navigate with.** The official festival
  map with tap targets overlaid on it replaced it. The owner supplies that image,
  because it is not Claude's artwork to commit.

### Architecture

Cloudflare Worker with static assets. One origin, so the page and the API share a
domain and there is no CORS and nothing to configure in the page.

```
public/index.html   grid, detail sheets, crews, check-ins, crowd grid, QR, sync
worker-entry.js     /picks; everything else to env.ASSETS
wrangler.jsonc      KV namespace PICKS, id 8685ee6c39594812ac20dcc4c3841d8a
tests/              20 files, `npm test`
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

`#board=<slug>` in the URL picks the board; default `edc`. You can follow other
crews, which shows their picks on your grid without showing them yours. Deliberately
asymmetric. Each crew gets a shape, each person within a crew gets a colour; your
own crew is always the triangle.

### Polling

Adaptive: 5s while you are actively tapping, 30s idle, nothing after 10 minutes
untouched or while the tab is hidden. This exists because of the KV quota, not for
elegance. Check-ins also age visibly, so there is a 30s redraw on a timer
independent of the network.

### Data in the page

- `FEST` — the festival itself: name, year, city, `openHour`, `span` in minutes,
  and a `days` array of `{id, short, long, date, dateShort, doors}`. `DAYS`,
  `DAYOF` and `DOORS` all derive from it, and the day buttons are generated from
  it at boot. This is the one place a day gets added or a door time moves.
- `FRI` / `SAT` / `SUN` — `[stage, name, start, end, extra?]`, 35 / 36 / 36 sets
  across four stages. **Transcribed by hand from the three official posters and
  never verified against the official app.** Treat every time as suspect. Two in
  particular: Sunday Kinetic Field "Jessica Audiffred" reads 3:35–4:45 on the
  poster but Ian Asher starts 4:35, so 4:35 was used; and Friday Neon Garden
  "Brunello" appeared to carry a SUNSET tag at 9:00pm, which is implausible, so it
  was dropped.
- `REC` / `NOTE` / `INFO` / `CHANGED` — the curation layer, keyed the same way as
  picks. **All four are empty for EDC.** They held one person's opinions about the
  III Points lineup. Blank means unknown. Do not fill them in.
- Poster notes that do exist live in the fifth element of a set row: B2B pairings,
  aliases, sunset markers. B2B notes are keyed on the **first** artist's name.
- `ST` — stage → `[colour, isDark]`, in poster column order. Four stages for EDC:
  Kinetic Field, Circuit Grounds, Neon Garden, Stereo Bloom.
- `MAP` / `MAPIMG` — both empty. No EDC site plan has been supplied, so the Map
  tab shows a tappable stage list. Supplying `map.jpg` plus normalised coordinates
  in `MAPIMG` switches it to the overlay.
- localStorage keys: `edc26-mine`, `-name`, `-pid`, `-cache`, `-follows`,
  `-hidden`, `-welcomed`, `-left`. The prefix changed from `iiip26-`, which is a
  deliberate reset: everyone starts EDC with an empty board.

### Tests

`npm test` runs `tests/run.js` over 20 files. They load the real `public/index.html`
in jsdom with a mocked `fetch` and a frozen festival clock, and drive the actual UI.
The worker tests run the real `worker-entry.js` against a fake KV that counts
operations, so the quota claims are measured rather than asserted.

Worth knowing: on at least four occasions a failing test was the test being wrong,
not the code. Read the failure before changing the source. Equally, two shipped
bugs were caught only because a test drove the real DOM rather than a mock.

Test debt: the newer files assert with `ck(label, got, want)` and end with a
verdict. Several older ones (`checkin`, `crew`, `shapes`, `layout`, `verify`,
`worker`, `worker-partial`) still print booleans for a human to read. That is how
`worker-test.js` sat reported-green while crashing on a syntax error, and how a
stale `welcome-test.js` logged `false` twice without failing. The runner now
catches both, but converting the rest to assertions is worth doing before relying
on the suite for anything larger.

## 2. Known weaknesses

Ordered by how much they would hurt.

| Weakness | Impact |
| --- | --- |
| No auth of any kind | Anyone with a link can read, write or remove anyone on that board. Now includes a remove button. |
| Identity is per browser | Clearing site data or switching phones makes you a new person with no picks. No recovery. |
| Schedule unverified | Typed by hand off posters. A wrong set time is invisible until someone misses a set. |
| Check-ins go unused | Two days of real use and almost nobody checked in. The data the crowd grid and live counts depend on mostly is not there. The rally point works around that; it does not fix it. |
| Crowd grid barely exercised | It ran at III Points but with too few check-ins to say whether the cell-plus-landmark model is useful. |
| Deploy is manual | Push does not deploy. A human has to run `Deploy.bat`. |
| One crew at a time, leakily | `BOARD` is a single value from the URL hash and `push()` only writes there, but `mine` is one global localStorage key, so switching crews carries your picks into the new board and the two copies then drift apart. `hasLeft` is scoped per board; picks are not. |
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
| `FRI` / `SAT` / `SUN` arrays | index.html | A festival data file, fetched not inlined |
| `REC` / `NOTE` / `INFO` | index.html | Optional per-festival curation, cleanly separable |
| `board:<name>` KV key | worker-entry.js | `<festival>:<board>`, or two festivals sharing a crew slug collide |
| Theme colours and per-day accents | index.html CSS | Per-festival, currently hand-edited |
| `MAP` / `MAPIMG` coordinates | index.html | Per-festival, and still entered by hand |

What the EDC conversion already fixed:

| Was hard-coded | Now |
| --- | --- |
| `DOORS` timestamps | `FEST.days[].doors` |
| `SPAN=720`, open hour 16 | `FEST.span`, `FEST.openHour`; `T()` and `fmt()` derive from them |
| Two-day assumption | `FEST.days` of arbitrary length; day buttons, grid, sheets and tests all iterate it |
| Starting day `"fri"` | `todayId()` |
| `iiip26-` prefix, board `miamiii` | `edc26-`, board `edc`, each a single constant |
| `ST` assumed 13 stages | Read generically; 13 then, 4 now, nothing assumes a count |

That was done by editing literals, not by building a loader. It was the right
call for a festival a week out, and it is the thing to replace next.

### Suggested order

1. ~~**Get a second festival's data in before refactoring anything.**~~ Done. EDC
   Orlando is the second schedule, and it exposed exactly what reasoning had not:
   the hard-wired starting day, the open-hour arithmetic buried in `T()` and
   `fmt()`, the two-day day list, and the assumption that a curation layer always
   exists. `FEST` came out of that. A third festival should be mostly data.
2. **Extract the festival into a JSON file** served alongside the page and fetched
   at boot. Keep the single-file page otherwise. Resist adding a build step; the
   no-build property is why this has been editable from a phone all along.
3. **Namespace storage properly.** The localStorage prefix and default board were
   bumped by hand for EDC, which worked only because somebody remembered. The KV
   key is still `board:<name>` with no festival in it, so two festivals using the
   same crew slug would collide. Derive both from a festival id. There is
   precedent: seeded picks leaked between users once already and a friend
   unknowingly edited someone else's list.
4. **Make the layout derive from the data.** Mostly done: day count, span and open
   hour come from `FEST`, and the grid handled 13 stages then and 4 now. What is
   left is the skin. Restyling for EDC meant hand-editing CSS custom properties and
   the per-day accent classes, which is now the least reusable part of the page.
5. **Decide what crew membership means.** Today you belong to one board and can
   follow others read-only. Real multi-crew membership touches more than it looks:
   `push()` has to fan out, `mine` has to be per-board or explicitly shared, and the
   crowd grid has to decide whose markers it draws when you are in two. Settle this
   before auth, because it decides what an account would even own.
6. **Then decide about auth**, because multi-festival means strangers, and the
   current model assumes everyone on the link is a friend.

### Things to be careful about

- **Schedule entry is the real bottleneck, not the code.** Transcribing III Points
  by hand took longer than any feature in this repo, and EDC took a full pass over
  three posters on top of that. Both were read off photographs of posters, which is
  also why every time in the file is suspect. Any multi-festival plan that does not
  answer "where does the schedule data come from" is not a plan. Consider an
  importer before more UI.
- **A new festival is a reset, not a migration.** Picks are keyed `day|artistname`
  and the storage prefix changes, so nobody carries anything over. That is correct,
  and it is worth telling people before they open the link and find an empty board.
- **The no-build, single-file property is load-bearing.** It is why the owner can
  edit and deploy from a phone, and why there is no toolchain to rot between
  festivals. A framework would be a real loss, not just a preference.
- **The page is ~124 KB and parsed on every load.** Splitting the festival data out
  helps; adding a framework does not.
- **Don't generalise the curation layer too early.** `REC`/`NOTE`/`INFO` are one
  person's opinions about one lineup. They should be optional and absent by default
  for a new festival.

## 4. Deploying

Cloudflare only builds commits attributed to `zstraub65-stack`. Pushes from the
Claude GitHub App are ignored, so pushing is not deploying.

1. Commit and push.
2. Owner triggers the deploy hook: `Deploy.bat` on the Desktop (`III Points`
   folder) from the PC, or the one-tap iOS Shortcut from a phone. Either POSTs to
   the hook and should return `"success":true`.
3. Wait about a minute.
4. **Verify from outside.** Fetch the live page and check for a symbol you just
   added, or read the deployed worker code. Do not trust the push.

Fallback if the hook fails: make any trivial commit through the GitHub web UI, which
is attributed to the owner and does trigger a build.

Saved picks live in KV and survive redeploys.
