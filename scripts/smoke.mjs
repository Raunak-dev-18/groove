/* End-to-end smoke test for Groove against a scratch DB.
 * Covers: auth (first user = super admin), role-based nav data, artist/song
 * admin CRUD, upload + range streaming, likes, plays, follows, jams (control +
 * chat + state polling), blends (join, taste match), admin role management. */

const BASE = process.env.SMOKE_BASE ?? "http://localhost:3100";

function makeClient() {
  const cookies = new Map();
  return async function call(method, path, body) {
    const headers = {
      // better-auth CSRF check requires a trusted Origin on POSTs (browsers send it automatically;
      // React Native + scripts must set it explicitly)
      Origin: "http://localhost:3000",
    };
    let payload;
    if (body instanceof FormData) {
      payload = body;
    } else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    if (cookies.size) headers["Cookie"] = [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: "manual" });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const idx = pair.indexOf("=");
      cookies.set(pair.slice(0, idx), pair.slice(idx + 1));
    }
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  };
}

const results = [];
function check(name, cond, extra) {
  results.push({ name, pass: !!cond, extra });
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}${cond ? "" : " — " + (extra ?? "")}`);
}

async function main() {
  /* ---------- reset scratch DB ---------- */
  if (process.env.DB_URL) {
    const postgres = (await import("postgres")).default;
    const sql = postgres(process.env.DB_URL, { ssl: "require", prepare: false, max: 1 });
    await sql`truncate "user" cascade`;
    await sql.end();
    console.log("(scratch db truncated)");
  }

  /* ---------- tiny WAV generator for the audio upload ---------- */
  function makeWav(seconds = 4, freq = 440) {
    const rate = 22050;
    const n = rate * seconds;
    const buf = Buffer.alloc(44 + n * 2);
    buf.write("RIFF", 0);
    buf.writeUInt32LE(36 + n * 2, 4);
    buf.write("WAVEfmt ", 8);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(rate, 24);
    buf.writeUInt32LE(rate * 2, 28);
    buf.writeUInt16LE(2, 32);
    buf.writeUInt16LE(16, 34);
    buf.write("data", 36);
    for (let i = 0; i < n; i++) {
      const env = Math.min(1, i / 2000) * Math.min(1, (n - i) / 2000);
      const v = Math.sin((2 * Math.PI * freq * i) / rate) * 0.5 * env;
      buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
    }
    return buf;
  }

  const alice = makeClient();
  const bob = makeClient();

  /* ---------- auth: first user becomes super admin ---------- */
  let r = await alice("POST", "/api/auth/sign-up/email", {
    name: "Alice Admin",
    email: "alice@groove.test",
    password: "password123",
  });
  check("alice signup ok", r.status === 200 || r.status === 201, JSON.stringify(r.data).slice(0, 200));

  r = await alice("GET", "/api/me");
  check("alice role = super_admin", r.data?.user?.role === "super_admin", JSON.stringify(r.data));

  r = await bob("POST", "/api/auth/sign-up/email", {
    name: "Bob Listener",
    email: "bob@groove.test",
    password: "password123",
  });
  r = await bob("GET", "/api/me");
  check("bob role = user (everyone after first is normal)", r.data?.user?.role === "user", JSON.stringify(r.data));

  /* ---------- admin: artist + upload + song ---------- */
  r = await bob("POST", "/api/artists", { name: "Hacker" });
  check("bob cannot create artist (403)", r.status === 403, JSON.stringify(r.data));

  r = await alice("POST", "/api/artists", { name: "Luna Ray", genre: "Indie pop", bio: "Dreamy synths." });
  check("alice creates artist", r.status === 201 && r.data?.artist?.id, JSON.stringify(r.data).slice(0, 200));
  const artistId = r.data?.artist?.id;

  const fd = new FormData();
  fd.append("file", new Blob([makeWav(4, 440)], { type: "audio/wav" }), "track.wav");
  r = await alice("POST", "/api/cdn/upload", fd);
  check("audio upload", r.status === 200 && r.data?.id, JSON.stringify(r.data).slice(0, 200));
  const audioId = r.data?.id;

  const fd2 = new FormData();
  fd2.append("file", new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }), "cover.png");
  r = await alice("POST", "/api/cdn/upload", fd2);
  const coverId = r.data?.id;
  check("cover upload", r.status === 200 && coverId, JSON.stringify(r.data).slice(0, 100));

  r = await alice("POST", "/api/songs", {
    title: "Starlight Drive",
    primaryArtistId: artistId,
    audioFileId: audioId,
    coverFileId: coverId,
    durationSec: 4,
    genre: "Indie",
  });
  check("song published", r.status === 201 && r.data?.song?.id, JSON.stringify(r.data).slice(0, 200));
  const songId = r.data?.song?.id;

  /* ---------- streaming with range ---------- */
  const streamRes = await fetch(`${BASE}/api/cdn/files/${audioId}`, { headers: { Range: "bytes=0-99" } });
  check(
    "range streaming 206",
    streamRes.status === 206 && (await streamRes.arrayBuffer()).byteLength === 100,
    `status=${streamRes.status}`,
  );

  /* ---------- user flows ---------- */
  r = await bob("GET", "/api/home");
  check("bob home feed has song", r.data?.trending?.some((s) => s.id === songId), JSON.stringify(r.data).slice(0, 120));

  r = await bob("PUT", `/api/songs/${songId}/like`);
  check("bob likes song", r.status === 200);

  r = await bob("POST", `/api/songs/${songId}/play`);
  check("play counted", r.data?.plays === 1, JSON.stringify(r.data));

  r = await bob("PUT", `/api/artists/${artistId}/follow`);
  check("bob follows artist", r.data?.following === true, JSON.stringify(r.data));

  r = await bob("GET", "/api/library");
  check(
    "library has liked song + following artist",
    r.data?.likedSongs?.some((s) => s.id === songId) && r.data?.followingArtists?.some((a) => a.id === artistId),
    JSON.stringify(r.data).slice(0, 150),
  );

  r = await bob("GET", `/api/search?q=star`);
  check("search finds Starlight Drive", r.data?.songs?.some((s) => s.id === songId), JSON.stringify(r.data).slice(0, 150));

  /* ---------- jams ---------- */
  r = await bob("POST", "/api/jams", { name: "Test Jam" });
  check("bob creates jam", r.status === 201 && r.data?.jam?.id, JSON.stringify(r.data).slice(0, 200));
  const jamId = r.data?.jam?.id;
  const jamCode = r.data?.jam?.code;

  r = await alice("POST", "/api/jams/join", { code: jamCode });
  check("alice joins jam by code", r.status === 200 && r.data?.jam?.id === jamId, JSON.stringify(r.data));

  r = await bob("POST", `/api/jams/${jamId}/control`, { songId, isPlaying: true, positionSec: 0 });
  check("host (bob) sets song + plays", r.status === 200, JSON.stringify(r.data));

  r = await alice("GET", `/api/jams/${jamId}`);
  check(
    "alice polls jam: song synced + positionNow",
    r.data?.jam?.currentSong?.id === songId && r.data?.jam?.positionNow >= 0 && r.data?.jam?.isPlaying === true,
    JSON.stringify(r.data?.jam).slice(0, 200),
  );

  r = await alice("POST", `/api/jams/${jamId}/messages`, { content: "Hello from non-host!" });
  check("host sends chat", r.status === 201 && r.data?.message?.id, JSON.stringify(r.data));
  const msgAt = r.data?.message?.createdAt;

  r = await bob("POST", `/api/jams/${jamId}/messages`, { content: "Hi alice 👋" });
  check("bob sends chat", r.status === 201);

  r = await alice("GET", `/api/jams/${jamId}?msgAfter=${encodeURIComponent(msgAt)}`);
  check("message polling (msgAfter)", r.data?.messages?.some((m) => m.content === "Hi alice 👋"), JSON.stringify(r.data?.messages));

  r = await alice("POST", `/api/jams/${jamId}/control`, { isPlaying: false });
  check("non-host cannot control (403)", r.status === 403, JSON.stringify(r.data));

  r = await bob("POST", `/api/jams/${jamId}/leave`);
  check("bob leaves jam", r.status === 200);

  /* ---------- blends ---------- */
  r = await alice("POST", "/api/blends", { name: "Roadtrip" });
  check("alice creates blend", r.status === 201 && r.data?.blend?.id, JSON.stringify(r.data).slice(0, 200));
  const blendId = r.data?.blend?.id;
  const blendCode = r.data?.blend?.code;

  r = await bob("POST", "/api/blends/join", { code: blendCode });
  check("bob joins blend by code", r.status === 200 && r.data?.blend?.id === blendId, JSON.stringify(r.data));

  r = await bob("POST", `/api/blends/${blendId}/songs`, { songId });
  check("bob adds song to blend", r.status === 201);

  r = await bob("PUT", `/api/songs/${songId}/like`);
  check("bob likes the blend song too", r.status === 200);

  r = await alice("GET", `/api/blends/${blendId}`);
  check(
    "blend detail: members, song, taste > 0",
    r.data?.blend?.members?.length === 2 && r.data?.blend?.songs?.length === 1 && r.data?.blend?.tasteMatch > 0,
    `members=${r.data?.blend?.members?.length} songs=${r.data?.blend?.songs?.length} match=${r.data?.blend?.tasteMatch}`,
  );

  /* ---------- admin role management ---------- */
  r = await bob("GET", "/api/admin/stats");
  check("bob blocked from admin stats", r.status === 403);

  const aliceId = (await alice("GET", "/api/me")).data.user.id;
  const bobId = (await bob("GET", "/api/me")).data.user.id;

  r = await alice("PATCH", `/api/admin/users/${bobId}`, { role: "admin" });
  check("super admin promotes bob", r.status === 200 && r.data?.role === "admin", JSON.stringify(r.data));

  r = await bob("GET", "/api/admin/stats");
  check("bob (now admin) reads stats", r.status === 200 && r.data?.totals?.users === 2, JSON.stringify(r.data?.totals));

  r = await bob("PATCH", `/api/admin/users/${bobId}`, { role: "user" });
  check("admin cannot change roles (403)", r.status === 403);

  /* ---------- admin CRUD cleanup ---------- */
  r = await alice("DELETE", `/api/songs/${songId}`);
  check("admin deletes song", r.status === 200);
  r = await alice("DELETE", `/api/artists/${artistId}`);
  check("admin deletes artist (cascade)", r.status === 200);

  /* ---------- storage health ---------- */
  r = await alice("GET", "/api/cdn/health");
  check("storage health endpoint", r.status === 200 && r.data?.local === "ok", JSON.stringify(r.data));

  const passed = results.filter((x) => x.pass).length;
  console.log(`\n${passed}/${results.length} passed`);
  if (passed !== results.length) process.exit(1);
}

main().catch((e) => {
  console.error("SMOKE CRASH:", e);
  process.exit(1);
});
