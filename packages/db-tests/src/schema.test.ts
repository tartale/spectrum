import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./harness";

let t: TestDb;
let alice: string; // verified parent in Springfield
let bob: string; // verified parent in Springfield, ~2km away
let carol: string; // unverified parent
let admin: string;

beforeAll(async () => {
  t = await createTestDb();
  alice = await t.createUser("Alice");
  bob = await t.createUser("Bob");
  carol = await t.createUser("Carol");
  admin = await t.createUser("Admin");
  await t.sql(`update public.profiles set role = 'admin' where id = $1`, [admin]);
}, 120_000);

afterAll(async () => {
  await t.close();
});

describe("accounts & profiles", () => {
  it("creates a profile automatically on signup", async () => {
    const rows = await t.sql(`select display_name, verification_status from public.profiles where id = $1`, [alice]);
    expect(rows[0]).toEqual({ display_name: "Alice", verification_status: "unverified" });
  });

  it("RLS: users can read their own profile but not others'", async () => {
    const mine = await t.asUser(alice, () =>
      t.sql(`select id from public.profiles`),
    );
    expect(mine.map((r) => r.id)).toEqual([alice]);
  });

  it("blocks self-service verification/role escalation", async () => {
    await t.asUser(alice, () =>
      t.sql(`update public.profiles set verification_status = 'verified', role = 'admin' where id = $1`, [alice]),
    );
    const rows = await t.sql(`select role, verification_status from public.profiles where id = $1`, [alice]);
    expect(rows[0]).toEqual({ role: "parent", verification_status: "unverified" });
  });
});

describe("verification flow", () => {
  it("submission marks the profile pending; admin approval verifies and geocodes", async () => {
    for (const [user, lat, lng] of [
      [alice, 44.046, -123.022],
      [bob, 44.06, -123.03],
    ] as const) {
      await t.asUser(user, () =>
        t.sql(
          `insert into public.verification_requests (user_id, id_doc_path, address_doc_path, address_text)
           values ($1, $2, $3, '123 Main St Springfield')`,
          [user, `${user}/id.png`, `${user}/addr.png`],
        ),
      );
      const pending = await t.sql(`select verification_status from public.profiles where id = $1`, [user]);
      expect(pending[0]!.verification_status).toBe("pending");

      const req = await t.sql<{ id: string }>(
        `select id from public.verification_requests where user_id = $1 and status = 'pending'`,
        [user],
      );
      await t.asUser(admin, () =>
        t.sql(`select public.review_verification($1, true, null, $2, $3, 'Springfield', 'Friendly Area')`, [
          req[0]!.id,
          lat,
          lng,
        ]),
      );
      const verified = await t.sql(
        `select verification_status, latitude, city from public.profiles where id = $1`,
        [user],
      );
      expect(verified[0]!.verification_status).toBe("verified");
      expect(verified[0]!.latitude).toBe(lat);
      expect(verified[0]!.city).toBe("Springfield");
    }
  });

  it("rejects review calls from non-admins", async () => {
    await t.asUser(carol, () =>
      t.sql(
        `insert into public.verification_requests (user_id, id_doc_path, address_doc_path, address_text)
         values ($1, $2, $3, 'somewhere')`,
        [carol, `${carol}/id.png`, `${carol}/addr.png`],
      ),
    );
    const req = await t.sql<{ id: string }>(
      `select id from public.verification_requests where user_id = $1`,
      [carol],
    );
    await expect(
      t.asUser(alice, () => t.sql(`select public.review_verification($1, true)`, [req[0]!.id])),
    ).rejects.toThrow(/admin only/);
  });
});

describe("children & questionnaire", () => {
  let aliceChild: string;
  let bobChild: string;

  it("parents manage their own children; others cannot see them", async () => {
    aliceChild = (
      await t.asUser(alice, () =>
        t.sql<{ id: string }>(
          `insert into public.children (parent_id, nickname, birth_year) values ($1, 'Sam', 2018) returning id`,
          [alice],
        ),
      )
    )[0]!.id;
    bobChild = (
      await t.asUser(bob, () =>
        t.sql<{ id: string }>(
          `insert into public.children (parent_id, nickname, birth_year) values ($1, 'Riley', 2019) returning id`,
          [bob],
        ),
      )
    )[0]!.id;

    const bobSees = await t.asUser(bob, () => t.sql(`select id from public.children`));
    expect(bobSees.map((r) => r.id)).toEqual([bobChild]);

    await expect(
      t.asUser(bob, () =>
        t.sql(`insert into public.children (parent_id, nickname, birth_year) values ($1, 'Fake', 2018)`, [alice]),
      ),
    ).rejects.toThrow();
  });

  it("answers sync into scoring dimensions and traits", async () => {
    const questions = await t.sql<{ id: string; dimension: string; kind: string }>(
      `select id, dimension, kind from public.questions`,
    );
    const likesQ = questions.find((q) => q.dimension === "likes")!;
    const commQ = questions.find((q) => q.dimension === "communication")!;

    await t.asUser(alice, async () => {
      await t.sql(
        `insert into public.answers (child_id, question_id, values) values ($1, $2, '["Animals", "Music"]')`,
        [aliceChild, likesQ.id],
      );
      await t.sql(
        `insert into public.answers (child_id, question_id, values) values ($1, $2, '["Fully verbal"]')`,
        [aliceChild, commQ.id],
      );
    });

    const rows = await t.sql<{ likes: string[]; traits: { communication?: string } }>(
      `select likes, traits from public.children where id = $1`,
      [aliceChild],
    );
    expect(rows[0]!.likes.sort()).toEqual(["Animals", "Music"]);
    expect(rows[0]!.traits.communication).toBe("Fully verbal");
  });

  it("discovery shows nearby verified families with distance but no coordinates", async () => {
    const seen = await t.asUser(alice, () =>
      t.sql<{ nickname: string; distance_km: number }>(`select * from public.nearby_families()`),
    );
    expect(seen.map((r) => r.nickname)).toEqual(["Riley"]);
    expect(seen[0]!.distance_km).toBeGreaterThan(0);
    expect(seen[0]!.distance_km).toBeLessThan(5);
    expect(Object.keys(seen[0]!)).not.toContain("latitude");

    // Carol is unverified: sees nothing, is seen by nobody.
    const carolSees = await t.asUser(carol, () => t.sql(`select * from public.nearby_families()`));
    expect(carolSees).toEqual([]);
  });

  it("respects the stricter of both families' range preferences", async () => {
    await t.sql(`update public.profiles set range_type = 'radius', range_radius_km = 1 where id = $1`, [bob]);
    const seen = await t.asUser(alice, () => t.sql(`select * from public.nearby_families()`));
    expect(seen).toEqual([]); // bob only wants families within 1km; alice is ~2km away
    await t.sql(`update public.profiles set range_type = 'same_city' where id = $1`, [bob]);
  });

  describe("matching & messaging", () => {
    let matchId: string;
    let conversationId: string;

    it("first interest creates a match, reciprocation makes it mutual with a conversation", async () => {
      matchId = (
        await t.asUser(alice, () =>
          t.sql<{ express_interest: string }>(`select public.express_interest($1, $2, 87)`, [aliceChild, bobChild]),
        )
      )[0]!.express_interest;

      let mine = await t.asUser(alice, () =>
        t.sql<{ status: string; they_are_interested: boolean; conversation_id: string | null }>(
          `select * from public.my_matches()`,
        ),
      );
      expect(mine[0]!.status).toBe("interested");
      expect(mine[0]!.they_are_interested).toBe(false);

      await t.asUser(bob, () =>
        t.sql(`select public.express_interest($1, $2, 87)`, [bobChild, aliceChild]),
      );
      mine = await t.asUser(alice, () => t.sql(`select * from public.my_matches()`));
      expect(mine[0]!.status).toBe("mutual");
      conversationId = mine[0]!.conversation_id!;
      expect(conversationId).toBeTruthy();
    });

    it("cannot express interest on someone else's behalf or while unverified", async () => {
      await expect(
        t.asUser(carol, () => t.sql(`select public.express_interest($1, $2, 50)`, [aliceChild, bobChild])),
      ).rejects.toThrow(/verified members only/);
      await expect(
        t.asUser(bob, () => t.sql(`select public.express_interest($1, $2, 50)`, [aliceChild, bobChild])),
      ).rejects.toThrow(/not your child/);
    });

    it("mutual parents can message; outsiders can neither read nor write", async () => {
      await t.asUser(alice, () =>
        t.sql(`insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Hi! Sam would love a playdate.')`, [
          conversationId,
          alice,
        ]),
      );
      const bobReads = await t.asUser(bob, () =>
        t.sql<{ body: string }>(`select body from public.messages where conversation_id = $1`, [conversationId]),
      );
      expect(bobReads).toHaveLength(1);

      const carolReads = await t.asUser(carol, () =>
        t.sql(`select body from public.messages where conversation_id = $1`, [conversationId]),
      );
      expect(carolReads).toEqual([]);

      await expect(
        t.asUser(carol, () =>
          t.sql(`insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'intruding')`, [
            conversationId,
            carol,
          ]),
        ),
      ).rejects.toThrow();

      // Impersonation: bob cannot send as alice.
      await expect(
        t.asUser(bob, () =>
          t.sql(`insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'spoofed')`, [
            conversationId,
            alice,
          ]),
        ),
      ).rejects.toThrow();
    });

    it("declining hides the match from suggestions", async () => {
      await t.asUser(bob, () => t.sql(`select public.decline_match($1)`, [matchId]));
      const rows = await t.sql<{ status: string }>(`select status from public.matches where id = $1`, [matchId]);
      expect(rows[0]!.status).toBe("declined");
    });
  });
});
