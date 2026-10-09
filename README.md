# Festival board

A shared set-times grid for a music festival. Everyone on the link sees each
other's picks, says where they are during the night, and finds each other in
the crowd. One HTML page, one Cloudflare Worker, no build step, no accounts,
no app to install.

Built for III Points 2026 (Mana Wynwood, Miami, 16 and 17 October).

**Live:** https://iii-points.zstraub65.workers.dev

## What it does

**The grid.** The full two-day schedule laid out to match the official
posters, 231 sets across 13 stages. Tap a set to open it, mark it as yours,
and read a note on the ones worth knowing about. Clash detection flags
overlaps in your own picks with a realistic view of whether you can catch
both.

**Crews.** Everyone on your link shares picks with each other. Follow another
crew to see their picks on your grid without showing them yours. Each person
gets their own colour and each crew its own shape, so you can read who and
which group at a glance. Your own crew is always the triangle.

**Live check-ins.** Open the set you are actually at and say you are there.
A 4x4 grid of the room lets you tap the square you are standing in, with a
landmark note for the part the grid cannot do. Mark a set as going off to
tell your crew it is worth leaving whatever they are at. Check-ins expire on
their own when the set ends, so nobody has to remember to check out.

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

