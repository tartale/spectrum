/**
 * Rule-based compatibility scoring. Deliberately behind an interface so a
 * trained model can replace it once there is real interaction data — the rest
 * of the app only ever sees a 0-100 confidence score plus a breakdown.
 */

export interface ScorableChild {
  birthYear: number;
  likes: string[];
  dislikes: string[];
  triggers: string[];
  activityPreferences: string[];
  /** Scalar questionnaire dimensions keyed by dimension name. */
  traits: Record<string, string | undefined>;
}

export interface ScoreContext {
  /** Distance between the two families, if known. */
  distanceKm?: number;
  /** Distance considered "far" for scoring purposes. */
  maxDistanceKm?: number;
}

export interface MatchScore {
  /** 0-100 confidence. */
  score: number;
  /** Per-component contribution, for explainable "why this match" UI. */
  breakdown: Record<string, number>;
}

export interface MatchScorer {
  score(a: ScorableChild, b: ScorableChild, context?: ScoreContext): MatchScore;
}

/**
 * Option orders for ordinal questionnaire dimensions, matching questionnaire
 * v1 content in the database. Proximity on these scales contributes to the
 * score; a new questionnaire version ships a new table here.
 */
export const ORDINAL_SCALES_V1: Record<string, string[]> = {
  communication: [
    "Fully verbal",
    "Some words and phrases",
    "AAC device or signs",
    "Mostly nonverbal",
  ],
  interaction_style: [
    "Mostly parallel play (alongside other kids)",
    "A mix of parallel and interactive",
    "Mostly interactive play",
  ],
  energy: ["Calm and low-key", "Somewhere in between", "High energy"],
};

const WEIGHTS = {
  likes: 25,
  activities: 20,
  age: 15,
  communication: 10,
  interaction_style: 10,
  energy: 5,
  group_size: 5,
  distance: 10,
} as const;

function overlapScore(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0.5; // unknown, not incompatible
  const setB = new Set(b);
  const shared = a.filter((x) => setB.has(x)).length;
  return shared / Math.min(a.length, b.length);
}

function ordinalProximity(dimension: string, a?: string, b?: string): number {
  const scale = ORDINAL_SCALES_V1[dimension];
  if (!scale || a === undefined || b === undefined) return 0.5;
  const ia = scale.indexOf(a);
  const ib = scale.indexOf(b);
  if (ia < 0 || ib < 0) return 0.5;
  return 1 - Math.abs(ia - ib) / (scale.length - 1);
}

function groupSizeCompatibility(a?: string, b?: string): number {
  if (!a || !b) return 0.5;
  if (a === b) return 1;
  const either = "Either works";
  if (a === either || b === either) return 0.8;
  return 0.3; // one-on-one only vs small group
}

function ageProximity(yearA: number, yearB: number): number {
  const gap = Math.abs(yearA - yearB);
  if (gap <= 1) return 1;
  if (gap >= 5) return 0;
  return 1 - (gap - 1) / 4;
}

export class RuleBasedScorer implements MatchScorer {
  score(a: ScorableChild, b: ScorableChild, context: ScoreContext = {}): MatchScore {
    const maxKm = context.maxDistanceKm ?? 25;
    const distanceFactor =
      context.distanceKm === undefined
        ? 0.5
        : Math.max(0, 1 - context.distanceKm / maxKm);

    const breakdown: Record<string, number> = {
      likes: WEIGHTS.likes * overlapScore(a.likes, b.likes),
      activities:
        WEIGHTS.activities * overlapScore(a.activityPreferences, b.activityPreferences),
      age: WEIGHTS.age * ageProximity(a.birthYear, b.birthYear),
      communication:
        WEIGHTS.communication *
        ordinalProximity("communication", a.traits.communication, b.traits.communication),
      interaction_style:
        WEIGHTS.interaction_style *
        ordinalProximity(
          "interaction_style",
          a.traits.interaction_style,
          b.traits.interaction_style,
        ),
      energy: WEIGHTS.energy * ordinalProximity("energy", a.traits.energy, b.traits.energy),
      group_size:
        WEIGHTS.group_size * groupSizeCompatibility(a.traits.group_size, b.traits.group_size),
      distance: WEIGHTS.distance * distanceFactor,
    };

    // Families managing similar sensitivities tend to pick compatible venues.
    const sharedTriggers = a.triggers.filter((t) => new Set(b.triggers).has(t)).length;
    breakdown.shared_triggers = Math.min(5, sharedTriggers * 2);

    // One child's favorite thing being the other's strong dislike is a real
    // playdate risk — penalize each direction.
    const conflicts =
      a.likes.filter((x) => new Set(b.dislikes).has(x)).length +
      b.likes.filter((x) => new Set(a.dislikes).has(x)).length;
    breakdown.conflicts = -Math.min(10, conflicts * 5);

    const total = Object.values(breakdown).reduce((s, v) => s + v, 0);
    return {
      score: Math.round(Math.max(0, Math.min(100, total))),
      breakdown,
    };
  }
}

export const defaultScorer: MatchScorer = new RuleBasedScorer();
