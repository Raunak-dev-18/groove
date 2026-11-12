/**
 * Groove seed — fills the MAIN database with demo artists and songs.
 *
 * - Audio: synthesized melodic WAV tracks (no external assets needed)
 * - Artwork: images from web/seed-assets/ (generated per the design system)
 * - Files are stored via the LOCAL storage provider so playback works
 *   immediately; when the Dropin CDN download side is live you can re-seed
 *   with STORAGE_PROVIDER=dropin to push files there instead.
 *
 * Run:  npm run seed
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { artists, songArtists, songs } from "../src/db/schema";

const ASSETS = path.join(process.cwd(), "seed-assets");
const LOCAL_DIR = path.join(process.cwd(), "data", "uploads");

/* ------------------------------------------------------------------ */
/* local storage (mirror of lib/storage.ts, standalone for seeding)     */
/* ------------------------------------------------------------------ */

async function saveLocal(file: File) {
  const id = randomUUID();
  const dir = path.join(LOCAL_DIR, id);
  await fs.mkdir(dir, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, "file"), buf);
  await fs.writeFile(
    path.join(dir, "meta.json"),
    JSON.stringify({ id, name: file.name, size: buf.length, mime: file.type }),
  );
  return { id, name: file.name, size: buf.length, mime: file.type };
}

async function storeAsset(baseName: string, mime: string) {
  const stem = baseName.replace(/\.(png|jpe?g|webp|gif)$/i, "");
  const candidates = [".jpg", ".jpeg", ".png", ".webp"];
  let target: string | null = null;
  for (const ext of candidates) {
    try {
      await fs.access(path.join(ASSETS, stem + ext));
      target = stem + ext;
      break;
    } catch {
      /* try next */
    }
  }
  if (!target) throw new Error(`asset not found: ${baseName}`);
  const buf = await fs.readFile(path.join(ASSETS, target));
  return saveLocal(new File([buf], target, { type: mime }));
}

/* ------------------------------------------------------------------ */
/* tiny synth — pleasant lo-fi melodic loops                           */
/* ------------------------------------------------------------------ */

const RATE = 22050;

function noteHz(semitoneFromA4: number) {
  return 440 * Math.pow(2, semitoneFromA4 / 12);
}

/** Render one synthesized track. */
function synthWav(spec: {
  chords: number[][]; // semitone offsets for each chord
  bars: number; // chord repeats
  bpm: number;
  lead: number[]; // lead melody semitones (one per 2 beats, -99 = rest)
}): Buffer {
  const beat = 60 / spec.bpm; // seconds per beat
  const bar = beat * 4;
  const total = spec.chords.length * spec.bars * bar;
  const n = Math.floor(total * RATE);
  const buf = Buffer.alloc(44 + n * 2);

  // header
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);

  const padGain = 0.16;
  const leadGain = 0.22;

  const samples = new Float32Array(n);
  const t = (i: number) => i / RATE;

  // pads: sustained chords with slow attack
  spec.chords.forEach((chord, ci) => {
    for (let b = 0; b < spec.bars; b++) {
      const start = (ci * spec.bars + b) * bar;
      const s0 = Math.floor(start * RATE);
      const len = Math.floor(bar * RATE);
      for (let i = 0; i < len && s0 + i < n; i++) {
        const tt = t(i);
        const env = Math.min(1, tt / 0.6) * Math.min(1, (len / RATE - tt) / 0.4 + 0.2);
        let v = 0;
        for (const semi of chord) {
          const f = noteHz(semi);
          v += Math.sin(2 * Math.PI * f * tt) * 0.6;
          v += Math.sin(2 * Math.PI * f * 2 * tt) * 0.15; // soft octave shimmer
        }
        samples[s0 + i] += (v * padGain * env) / chord.length;
      }
    }
  });

  // lead: plucky melody, two per bar
  const notesTotal = spec.chords.length * spec.bars * 2;
  for (let k = 0; k < notesTotal; k++) {
    const semi = spec.lead[k % spec.lead.length];
    if (semi === -99) continue;
    const start = k * bar * 0.5;
    const s0 = Math.floor(start * RATE);
    const len = Math.floor(beat * 1.8 * RATE);
    const f = noteHz(semi);
    for (let i = 0; i < len && s0 + i < n; i++) {
      const tt = t(i);
      const env = Math.exp(-tt * 5.5) * Math.min(1, tt / 0.01);
      const v =
        Math.sin(2 * Math.PI * f * tt) * 0.8 +
        Math.sin(4 * Math.PI * f * tt) * 0.2;
      samples[s0 + i] += v * leadGain * env;
    }
  }

  // soft beat: low thump on beat 1 & 3 of each bar
  const barsTotal = spec.chords.length * spec.bars;
  for (let barI = 0; barI < barsTotal; barI++) {
    for (const beatIn of [0, 2]) {
      const start = barI * bar + beatIn * beat;
      const s0 = Math.floor(start * RATE);
      const len = Math.floor(0.35 * RATE);
      for (let i = 0; i < len && s0 + i < n; i++) {
        const tt = t(i);
        const env = Math.exp(-tt * 18);
        samples[s0 + i] += Math.sin(2 * Math.PI * 55 * tt) * 0.35 * env;
      }
    }
  }

  // master fade in/out + write
  const fade = Math.floor(1.2 * RATE);
  for (let i = 0; i < n; i++) {
    let g = 1;
    if (i < fade) g = i / fade;
    if (i > n - fade) g = (n - i) / fade;
    const v = Math.max(-1, Math.min(1, samples[i] * g));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

/* ------------------------------------------------------------------ */
/* seed data                                                           */
/* ------------------------------------------------------------------ */

const TRACKS: {
  title: string;
  artistKey: string;
  coverFile: string;
  genre: string;
  description: string;
  spec: { chords: number[][]; bars: number; bpm: number; lead: number[] };
  featuredKey?: string;
}[] = [
  {
    title: "Starlight Drive",
    artistKey: "luna",
    coverFile: "cover-starlight.png",
    genre: "Indie pop",
    description: "A dreamy nighttime cruise with the windows down.",
    spec: {
      chords: [
        [-9, -5, -2, 0],
        [-7, -4, 0, 3],
        [-5, -2, 2, 5],
        [-4, 0, 3, 7],
      ],
      bars: 3,
      bpm: 96,
      lead: [7, 5, 3, 0, 3, 5, 7, 10, 12, 10, 7, 5],
    },
  },
  {
    title: "Paper Hearts",
    artistKey: "luna",
    coverFile: "cover-hearts.png",
    genre: "Indie pop",
    description: "Folded notes, unsent letters, one chorus you'll hum for days.",
    spec: {
      chords: [
        [-12, -8, -5, -1],
        [-10, -7, -3, 0],
        [-8, -5, -1, 2],
        [-7, -3, 0, 4],
      ],
      bars: 3,
      bpm: 88,
      lead: [4, 7, 4, 2, 0, 2, 4, -1, 0, 2, 4, 7],
    },
  },
  {
    title: "Midnight Coffee",
    artistKey: "kiro",
    coverFile: "cover-coffee.png",
    genre: "Lo-fi",
    description: "For 2am deadlines and quiet cities.",
    spec: {
      chords: [
        [-13, -9, -6, -2],
        [-11, -8, -4, -1],
        [-13, -9, -6, -2],
        [-6, -2, 1, 3],
      ],
      bars: 3,
      bpm: 72,
      lead: [-1, 2, 3, 6, 3, 2, -1, -6, -4, -1, 2, 6],
    },
  },
  {
    title: "Tape Deck Summer",
    artistKey: "kiro",
    coverFile: "cover-tape.png",
    genre: "Lo-fi",
    description: "Sun-bleached chords looped on a borrowed cassette.",
    spec: {
      chords: [
        [-10, -6, -3, 1],
        [-8, -5, -1, 2],
        [-10, -6, -3, 1],
        [-3, 1, 4, 6],
      ],
      bars: 3,
      bpm: 84,
      lead: [1, 4, 6, 8, 6, 4, 1, -3, -1, 1, 4, 8],
    },
  },
  {
    title: "Indigo Hour",
    artistKey: "indigo",
    coverFile: "cover-hour.png",
    genre: "Synthwave",
    description: "The sky turns electric for exactly sixty minutes.",
    spec: {
      chords: [
        [-14, -10, -7, -3],
        [-12, -9, -5, -2],
        [-14, -10, -7, -3],
        [-7, -3, 0, 2],
      ],
      bars: 3,
      bpm: 104,
      lead: [11, 9, 7, 4, 7, 9, 11, 14, 16, 14, 11, 9],
    },
  },
  {
    title: "Neon Cassette",
    artistKey: "indigo",
    coverFile: "cover-cassette.png",
    genre: "Synthwave",
    description: "A duet with Luna Ray — analog hearts in a digital town.",
    featuredKey: "luna",
    spec: {
      chords: [
        [-12, -8, -5, -1],
        [-10, -7, -3, 0],
        [-8, -4, -1, 3],
        [-10, -7, -3, 0],
      ],
      bars: 3,
      bpm: 100,
      lead: [8, 10, 12, 15, 12, 10, 8, 5, 3, 5, 8, 12],
    },
  },
];

const ARTISTS: {
  key: string;
  name: string;
  genre: string;
  bio: string;
  avatarFile: string;
}[] = [
  {
    key: "luna",
    name: "Luna Ray",
    genre: "Indie pop",
    bio: "Bedroom-pop songwriter turning late-night thoughts into anthems. Debut EP written entirely on a train.",
    avatarFile: "avatar-luna.png",
  },
  {
    key: "kiro",
    name: "Kiro Tanaka",
    genre: "Lo-fi",
    bio: "Beat maker from Osaka. Half his discography was made before sunrise with a cup of coffee and a broken sampler.",
    avatarFile: "avatar-kiro.png",
  },
  {
    key: "indigo",
    name: "The Indigo Kids",
    genre: "Synthwave",
    bio: "A duo that never met in person — one in Lisbon, one in Manila, both in love with 1985.",
    avatarFile: "avatar-indigo.png",
  },
];

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  const url = (process.env.DB_URL ?? "").replace("channel_binding=require", "");
  if (!url) throw new Error("DB_URL missing");
  const client = postgres(url, { prepare: false, ssl: "require" });
  const db = drizzle({ client });

  const existing = await db.select({ id: songs.id }).from(songs).limit(1);
  if (existing.length > 0) {
    console.log("Songs already exist — skipping seed (delete songs to re-seed).");
    await client.end();
    return;
  }

  // artist avatars
  const artistIds = new Map<string, string>();
  for (const a of ARTISTS) {
    let avatarFileId: string | null = null;
    try {
      avatarFileId = (await storeAsset(a.avatarFile, "image/png")).id;
    } catch {
      console.warn(`(avatar ${a.avatarFile} not found — using placeholder)`);
    }
    const [row] = await db
      .insert(artists)
      .values({ name: a.name, genre: a.genre, bio: a.bio, avatarFileId })
      .returning();
    artistIds.set(a.key, row.id);
    console.log(`artist: ${a.name}`);
  }

  // songs
  for (const t of TRACKS) {
    const wav = synthWav(t.spec);
    const audioFile = await saveLocal(
      new File([new Uint8Array(wav)], `${t.title.toLowerCase().replace(/\s+/g, "-")}.wav`, {
        type: "audio/wav",
      }),
    );
    let coverFileId: string | null = null;
    try {
      coverFileId = (await storeAsset(t.coverFile, "image/png")).id;
    } catch {
      console.warn(`(cover ${t.coverFile} not found — using placeholder)`);
    }

    const [song] = await db
      .insert(songs)
      .values({
        title: t.title,
        description: t.description,
        audioFileId: audioFile.id,
        coverFileId,
        durationSec: (wav.length - 44) / 2 / RATE, // 16-bit mono PCM
        genre: t.genre,
        primaryArtistId: artistIds.get(t.artistKey)!,
      })
      .returning();
    await db
      .insert(songArtists)
      .values({ songId: song.id, artistId: artistIds.get(t.artistKey)!, role: "primary" })
      .onConflictDoNothing();
    if (t.featuredKey) {
      await db
        .insert(songArtists)
        .values({ songId: song.id, artistId: artistIds.get(t.featuredKey)!, role: "featured" })
        .onConflictDoNothing();
    }
    console.log(
      `song: ${t.title} (${(wav.length / 1024 / 1024).toFixed(1)} MB, ${(song.durationSec).toFixed(0)}s)`,
    );
  }

  await client.end();
  console.log("\nSeed complete — artists and songs are live.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
