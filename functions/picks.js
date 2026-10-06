/**
 * III Points board API, as a Cloudflare Pages Function.
 *
 * Lives at /picks on the same domain as the page, so the browser needs no CORS
 * and the page needs no configuring. One KV entry per person per board, so two
 * people saving at the same moment cannot overwrite each other.
 *
 *   GET  /picks?board=miamiii   -> { board, people: [ {person, name, sets, updated} ] }
 *   POST /picks?board=miamiii   <- { person, name, sets: ["fri|Hamdi", ...] }
 *   POST /picks?board=miamiii   <- { person, leave: true }   removes that person
 *
 * Needs a KV namespace bound as PICKS in the Pages project settings.
 */

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const clean = (s, max) => String(s || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, max);

// Boards expire 60 days after the last write, so old festivals clear themselves out.
const TTL = 60 * 60 * 24 * 60;

function boardOf(request) {
  const url = new URL(request.url);
  return clean(url.searchParams.get("board"), 32).toLowerCase();
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.PICKS) return json({ error: "kv_not_bound" }, 500);

  const board = boardOf(request);
  if (!board) return json({ error: "missing_board" }, 400);

  const prefix = "b:" + board + ":";
  const listed = await env.PICKS.list({ prefix, limit: 200 });
  const people = [];
  for (const key of listed.keys) {
    const row = await env.PICKS.get(key.name, "json");
    if (row) people.push(row);
  }
  people.sort((a, b) => (a.updated || 0) - (b.updated || 0));
  return json({ board, people });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.PICKS) return json({ error: "kv_not_bound" }, 500);

  const board = boardOf(request);
  if (!board) return json({ error: "missing_board" }, 400);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400); }

  const person = clean(body.person, 40);
  if (!person) return json({ error: "missing_person" }, 400);

  const prefix = "b:" + board + ":";

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
