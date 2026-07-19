import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Boots an in-process Postgres, stubs the Supabase-managed schemas (auth,
 * storage) just enough for our migrations, applies every real migration from
 * supabase/migrations, and provides an `asUser` helper that runs SQL under the
 * `authenticated` role with auth.uid() set — so RLS is enforced exactly as it
 * will be in production PostgREST.
 */

const MIGRATIONS_DIR = join(import.meta.dirname, "../../../supabase/migrations");

const SUPABASE_STUBS = `
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'
);
create function auth.uid() returns uuid
language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean not null default false);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[]
language sql immutable as
$$ select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1] $$;

create role authenticated nologin;
`;

const GRANTS = `
grant usage on schema public, storage to authenticated;
grant all on all tables in schema public to authenticated;
grant all on storage.objects to authenticated;
grant execute on all functions in schema public to authenticated;
`;

export interface TestDb {
  db: PGlite;
  /** Run fn with RLS enforced as the given user (or as anon when null). */
  asUser<T>(userId: string | null, fn: () => Promise<T>): Promise<T>;
  /** Insert an auth user (fires the profile trigger) and return its id. */
  createUser(displayName: string): Promise<string>;
  sql<T = Record<string, unknown>>(query: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  if (files.length === 0) throw new Error(`no migrations found in ${MIGRATIONS_DIR}`);
  for (const file of files) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    } catch (e) {
      throw new Error(`migration ${file} failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  await db.exec(GRANTS);

  const sql = async <T,>(query: string, params: unknown[] = []): Promise<T[]> =>
    (await db.query<T>(query, params)).rows;

  return {
    db,
    sql,
    async asUser(userId, fn) {
      await db.exec(
        `select set_config('request.jwt.claim.sub', '${userId ?? ""}', false); set role authenticated;`,
      );
      try {
        return await fn();
      } finally {
        await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
      }
    },
    async createUser(displayName) {
      const rows = await sql<{ id: string }>(
        `insert into auth.users (email, raw_user_meta_data)
         values ($1, jsonb_build_object('display_name', $2::text)) returning id`,
        [`${displayName.toLowerCase()}@example.com`, displayName],
      );
      return rows[0]!.id;
    },
    close: () => db.close(),
  };
}
