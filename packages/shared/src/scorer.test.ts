import { describe, expect, it } from "vitest";
import { RuleBasedScorer, type ScorableChild } from "./scorer";

const scorer = new RuleBasedScorer();

function child(overrides: Partial<ScorableChild> = {}): ScorableChild {
  return {
    birthYear: 2018,
    likes: ["Animals", "Trains & vehicles"],
    dislikes: [],
    triggers: ["Loud noises"],
    activityPreferences: ["Playground", "Quiet indoor play"],
    traits: {
      communication: "Some words and phrases",
      interaction_style: "A mix of parallel and interactive",
      energy: "Somewhere in between",
      group_size: "Either works",
    },
    ...overrides,
  };
}

describe("RuleBasedScorer", () => {
  it("is symmetric", () => {
    const a = child({ likes: ["Animals"], birthYear: 2017 });
    const b = child({ likes: ["Animals", "Music"], birthYear: 2019 });
    const ctx = { distanceKm: 3 };
    expect(scorer.score(a, b, ctx).score).toBe(scorer.score(b, a, ctx).score);
  });

  it("scores identical nearby children very high", () => {
    const a = child();
    const { score } = scorer.score(a, child(), { distanceKm: 0 });
    expect(score).toBeGreaterThanOrEqual(90);
  });

  it("stays within 0-100", () => {
    const a = child({ likes: ["Rough play"], dislikes: [] });
    const b = child({
      birthYear: 2010,
      likes: ["Team sports"],
      dislikes: ["Rough play"],
      activityPreferences: ["Trampoline park"],
      traits: {
        communication: "Fully verbal",
        interaction_style: "Mostly interactive play",
        energy: "High energy",
        group_size: "One-on-one only",
      },
    });
    const { score } = scorer.score(a, b, { distanceKm: 100 });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("penalizes like/dislike conflicts", () => {
    const base = child();
    const compatible = child({ likes: ["Animals"] });
    const conflicting = child({
      likes: ["Animals"],
      dislikes: ["Trains & vehicles"], // conflicts with base's like
    });
    const ctx = { distanceKm: 2 };
    expect(scorer.score(base, conflicting, ctx).score).toBeLessThan(
      scorer.score(base, compatible, ctx).score,
    );
  });

  it("rewards shared triggers slightly", () => {
    const base = child({ triggers: ["Loud noises", "Crowded places"] });
    const similar = child({ triggers: ["Loud noises", "Crowded places"] });
    const different = child({ triggers: [] });
    const ctx = { distanceKm: 2 };
    expect(scorer.score(base, similar, ctx).score).toBeGreaterThan(
      scorer.score(base, different, ctx).score,
    );
  });

  it("decays with age gap", () => {
    const base = child({ birthYear: 2018 });
    const near = scorer.score(base, child({ birthYear: 2019 }), { distanceKm: 2 });
    const far = scorer.score(base, child({ birthYear: 2013 }), { distanceKm: 2 });
    expect(near.score).toBeGreaterThan(far.score);
    expect(far.breakdown.age).toBe(0);
  });

  it("decays with distance", () => {
    const a = child();
    const b = child();
    expect(scorer.score(a, b, { distanceKm: 1 }).score).toBeGreaterThan(
      scorer.score(a, b, { distanceKm: 24 }).score,
    );
  });

  it("treats missing questionnaire data as neutral, not zero", () => {
    const sparse = child({ likes: [], activityPreferences: [], traits: {} });
    const { breakdown } = scorer.score(sparse, child(), { distanceKm: 2 });
    expect(breakdown.likes).toBeCloseTo(12.5);
    expect(breakdown.communication).toBeCloseTo(5);
  });
});
