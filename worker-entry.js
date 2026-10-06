/**
 * III Points shared schedule.
 *
 * Serves the API at /picks and hands everything else to the static files in
 * public/. Page and API share one domain, so the page needs no configuring and
 * the browser needs no CORS.
 *
 *   GET  /picks?board=miamiii   -> { board, people: [ {person, name, sets, updated} ] }
 *   POST /picks?board=miamiii   <- { person, name, sets: ["fri|Hamdi", ...] }
 *   POST /picks?board=miamiii   <- { person, leave: true }   removes that person
 *
 * STORAGE: one KV key per board holding every member, so a read is a single
 * get(). The earlier design kept a key per person, which meant a list() on every
 * poll — and KV's free tier allows only 1,000 list operations a day, about 1.7
 * hours of one person having the page open. Writes read-modify-write the board
 * key; a write only ever touches the author's own entry, so the worst case of
 * two people saving in the same instant is that one of them re-saves.
 */

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const clean = (s, max) => String(s || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, max);

// Boards expire 60 days after the last write, so old festivals clear themselves out.
const TTL = 60 * 60 * 24 * 60;

const keyFor = board => "board:" + board;
const legacyPrefix = board => "b:" + board + ":";

/** Read a board. Falls back once to the old per-person keys and upgrades them. */
async function readBoard(env, board) {
  const agg = await env.PICKS.get(keyFor(board), "json");
  if (agg && agg.people) return agg;

  // One-time migration off the old layout. Costs a single list, then never again.
  const listed = await env.PICKS.list({ prefix: legacyPrefix(board), limit: 200 });
  const people = {};
  for (const k of listed.keys) {
    const row = await env.PICKS.get(k.name, "json");
    if (row && row.person) {
      people[row.person] = { name: row.name || "", sets: row.sets || [], updated: row.updated || 0 };
    }
  }
  const migrated = { people };
  if (listed.keys.length) {
    await env.PICKS.put(keyFor(board), JSON.stringify(migrated), { expirationTtl: TTL });
  }
  return migrated;
}

function asList(agg) {
  return Object.entries(agg.people || {})
    .map(([person, v]) => ({ person, name: v.name || "", sets: v.sets || [], at: v.at || null, updated: v.updated || 0 }))
    .sort((a, b) => (a.updated || 0) - (b.updated || 0));
}

async function handlePicks(request, env, url) {
  if (!env.PICKS) return json({ error: "kv_not_bound" }, 500);

  const board = clean(url.searchParams.get("board"), 32).toLowerCase();
  if (!board) return json({ error: "missing_board" }, 400);

  if (request.method === "GET") {
    const agg = await readBoard(env, board);
    return json({ board, people: asList(agg) });
  }

  if (request.method === "POST") {
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400); }

    const person = clean(body.person, 40);
    if (!person) return json({ error: "missing_person" }, 400);

    const agg = await readBoard(env, board);
    agg.people = agg.people || {};

    if (body.leave) {
      delete agg.people[person];
      await env.PICKS.put(keyFor(board), JSON.stringify(agg), { expirationTtl: TTL });
      return json({ ok: true, removed: true });
    }

    const prev = agg.people[person] || {};
    const next = { name: prev.name || "", sets: prev.sets || [], at: prev.at || null };

    // Names are typed by whoever opens the link. Stored as plain text; the page
    // renders them with textContent and never as markup.
    if (body.name !== undefined) {
      next.name = String(body.name || "").replace(/[\u0000-\u001F<>]/g, "").trim().slice(0, 24);
    }

    if (Array.isArray(body.sets)) {
      next.sets = body.sets.filter(x => typeof x === "string" && x.length <= 80).slice(0, 400);
    }

    // "at" is a live check-in: the set this person says they are at right now.
    // Passing null clears it. The page decides when a check-in has gone stale.
    if ("at" in body) {
      const a = body.at;
      next.at = (a && typeof a.s === "string" && a.s.length <= 80)
        ? { s: a.s, t: Number(a.t) || Date.now(), fire: !!a.fire }
        : null;
    }

    next.updated = Date.now();
    agg.people[person] = next;

    // Guard against one board growing without bound.
    const ids = Object.keys(agg.people);
    if (ids.length > 200) {
      ids.sort((x, y) => (agg.people[x].updated || 0) - (agg.people[y].updated || 0));
      ids.slice(0, ids.length - 200).forEach(id => delete agg.people[id]);
    }

    await env.PICKS.put(keyFor(board), JSON.stringify(agg), { expirationTtl: TTL });
    return json({ ok: true, saved: next.sets.length });
  }

  return json({ error: "method_not_allowed" }, 405);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/picks") return handlePicks(request, env, url);

    // Everything else is the page itself.
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};
