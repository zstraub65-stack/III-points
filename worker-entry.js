/**
 * III Points board.
 *
 * Serves the API at /picks and hands everything else to the static files in
 * public/. Page and API share one domain, so the page needs no configuring and
 * the browser needs no CORS.
 *
 *   GET  /picks?board=miamiii   -> { board, people: [ {person, name, sets, updated} ] }
 *   POST /picks?board=miamiii   <- { person, name, sets: ["fri|Hamdi", ...] }
 *   POST /picks?board=miamiii   <- { person, leave: true }   removes that person
 *
 * One KV entry per person per board, so two people saving at the same moment
 * cannot overwrite each other.
 */

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const clean = (s, max) => String(s || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, max);

// Boards expire 60 days after the last write, so old festivals clear themselves out.
const TTL = 60 * 60 * 24 * 60;

async function handlePicks(request, env, url) {
  if (!env.PICKS) return json({ error: "kv_not_bound" }, 500);

  const board = clean(url.searchParams.get("board"), 32).toLowerCase();
  if (!board) return json({ error: "missing_board" }, 400);

  const prefix = "b:" + board + ":";

  if (request.method === "GET") {
    const listed = await env.PICKS.list({ prefix, limit: 200 });
    const people = [];
    for (const key of listed.keys) {
      const row = await env.PICKS.get(key.name, "json");
      if (row) people.push(row);
    }
    people.sort((a, b) => (a.updated || 0) - (b.updated || 0));
    return json({ board, people });
  }

  if (request.method === "POST") {
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400); }

    const person = clean(body.person, 40);
    if (!person) return json({ error: "missing_person" }, 400);

    if (body.leave) {
      await env.PICKS.delete(prefix + person);
      return json({ ok: true, removed: true });
    }

    // Names are typed by whoever opens the link. Stored as plain text; the page
    // renders them with textContent and never as markup.
    const name = String(body.name || "").replace(/[\u0000-\u001F<>]/g, "").trim().slice(0, 24);

    const sets = Array.isArray(body.sets)
      ? body.sets.filter(s => typeof s === "string" && s.length <= 80).slice(0, 400)
      : [];

    await env.PICKS.put(
      prefix + person,
      JSON.stringify({ person, name, sets, updated: Date.now() }),
      { expirationTtl: TTL }
    );
    return json({ ok: true, saved: sets.length });
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
