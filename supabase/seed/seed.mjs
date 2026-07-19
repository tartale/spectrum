/**
 * Seeds a running Supabase stack (local `supabase start` or hosted) with an
 * admin plus three verified families for manual testing.
 *
 *   node supabase/seed/seed.mjs
 *
 * Reads EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from env/.env.
 * Idempotent: re-running updates the same users by email.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

for (const line of (() => {
  try {
    return readFileSync(new URL("../../.env", import.meta.url), "utf8").split("\n");
  } catch {
    return [];
  }
})()) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Set EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env)");
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

async function upsertUser(email, displayName) {
  const { data: created, error } = await db.auth.admin.createUser({
    email,
    password: "spectrum-dev-1234",
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (!error) return created.user.id;
  const { data: list } = await db.auth.admin.listUsers();
  const existing = list.users.find((u) => u.email === email);
  if (!existing) throw new Error(`could not create or find ${email}: ${error.message}`);
  return existing.id;
}

const families = [
  {
    email: "dana@example.com",
    name: "Dana",
    lat: 44.0462,
    lng: -123.0221,
    child: { nickname: "Sam", birth_year: 2018, likes: ["Animals", "Trains & vehicles", "Water play"], triggers: ["Loud noises", "Crowded places"], activities: ["Playground", "Quiet indoor play"] },
  },
  {
    email: "morgan@example.com",
    name: "Morgan",
    lat: 44.06,
    lng: -123.03,
    child: { nickname: "Riley", birth_year: 2019, likes: ["Animals", "Drawing & art"], triggers: ["Loud noises"], activities: ["Playground", "Arts & crafts"] },
  },
  {
    email: "jamie@example.com",
    name: "Jamie",
    lat: 44.11,
    lng: -123.15,
    child: { nickname: "Alex", birth_year: 2013, likes: ["Video games", "Numbers & puzzles"], triggers: ["Changes in routine"], activities: ["Video games together", "Board games"] },
  },
];

const adminId = await upsertUser("admin@example.com", "Admin");
await db.from("profiles").update({ role: "admin", verification_status: "verified" }).eq("id", adminId);
console.log("admin@example.com ready (password: spectrum-dev-1234)");

const { data: questions } = await db
  .from("questions")
  .select("id, dimension, kind");

for (const fam of families) {
  const userId = await upsertUser(fam.email, fam.name);
  await db
    .from("profiles")
    .update({
      verification_status: "verified",
      latitude: fam.lat,
      longitude: fam.lng,
      city: "Springfield",
      neighborhood: "Friendly Area",
      range_type: "same_city",
    })
    .eq("id", userId);

  const { data: existingChildren } = await db.from("children").select("id").eq("parent_id", userId);
  let childId = existingChildren?.[0]?.id;
  if (!childId) {
    const { data: child, error } = await db
      .from("children")
      .insert({ parent_id: userId, nickname: fam.child.nickname, birth_year: fam.child.birth_year })
      .select()
      .single();
    if (error) throw new Error(error.message);
    childId = child.id;
  }

  const byDimension = { likes: fam.child.likes, triggers: fam.child.triggers, activity: fam.child.activities };
  for (const [dimension, values] of Object.entries(byDimension)) {
    const q = questions?.find((q) => q.dimension === dimension && q.kind === "multi_select");
    if (q) await db.from("answers").upsert({ child_id: childId, question_id: q.id, values });
  }
  console.log(`${fam.email} ready with child ${fam.child.nickname}`);
}

console.log("Seed complete.");
