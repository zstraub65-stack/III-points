# Festival board

A shared set-times grid for a music festival. Everyone on the link sees each
other's picks, says where they are during the night, and finds each other in
the crowd. One HTML page, one Cloudflare Worker, no build step, no accounts,
no app to install.

Set up for EDC Orlando 2026 (Tinker Field, 6–8 November). It ran at III Points
2026 in Miami before that.

**Live:** https://iii-points.zstraub65.workers.dev

## What it does

**The grid.** The full schedule laid out to match the official posters, 107
sets across three days and four stages. It opens on the day you are actually
standing in, so there is no tab to find in the dark. Tap a set to open it and
mark it as yours. Clash detection flags overlaps in your own picks with a
realistic view of whether you can catch both.

**Crews.** Everyone on your link shares picks with each other. Follow another
crew to see their picks on your grid without showing them yours. Each person
gets their own colour and each crew its own shape, so you can read who and
which group at a glance. Your own crew is always the triangle.

**Live check-ins.** Open the set you are actually at and say you are there.
A 4x4 grid of the room lets you tap the square you are standing in, with a
landmark note for the part the grid cannot do. Mark a set as going off to
tell your crew it is worth leaving whatever they are at. Check-ins expire on
their own when the set ends, so nobody has to remember to check out.

**Rally point.** One person sets a place and a time and everyone else just
reads it. Built after a real night where nobody kept checking in, because one
declaration beats a habit twelve people have to maintain.

**Map.** A tab with the stages on it. Tap a stage to see who from your crew
has picks there, who is standing there now, and the whole lineup for that
stage if you want it. With the official site map dropped in it overlays tap
targets on the real map; without one it falls back to a stage list.

**Your night.** The running order shows your picks in order with the markers
of everyone joining you on each one. Tap a row to open that set. For ten
minutes before one of your picks starts, the status line says so.

**Getting people on.** Two QR codes under Crews: one to join your crew, one
for someone with a different group to start their own. A "?" button explains
the parts that are not obvious.

Works with no signal once loaded. Changes made offline sync when you are back.

## How it works

Cloudflare Worker serving one static page, with Workers KV behind it. One
JSON blob per crew, keyed `board:<slug>`, 60 day expiry. Reads cost a single
`get`, which matters because the free tier allows 1,000 list operations a day
and an earlier per-person layout burned that in under two hours.

