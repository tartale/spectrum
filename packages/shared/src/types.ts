export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected";

export type LocationRangeType = "radius" | "same_city" | "same_neighborhood";

export interface LocationRange {
  type: LocationRangeType;
  /** Kilometers; only meaningful when type === "radius". */
  radiusKm?: number;
}

export interface Profile {
  id: string;
  displayName: string;
  role: "parent" | "admin";
  verificationStatus: VerificationStatus;
  /** Set after address verification; never shown to other users at full precision. */
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  neighborhood: string | null;
  rangeType: LocationRangeType;
  rangeRadiusKm: number;
}

export interface Child {
  id: string;
  parentId: string;
  /** First name or nickname only — no surnames, no photos anywhere in the system. */
  nickname: string;
  birthYear: number;
  likes: string[];
  dislikes: string[];
  triggers: string[];
  activityPreferences: string[];
}

export type QuestionKind = "multi_select" | "single_select" | "scale" | "free_text";

export interface Question {
  id: string;
  versionId: string;
  kind: QuestionKind;
  prompt: string;
  /** Options for select kinds; 1..N labels for scale. */
  options: string[];
  /** Which scoring dimension this feeds (e.g. "likes", "triggers", "activity"). */
  dimension: string;
  sortOrder: number;
}

export interface Answer {
  questionId: string;
  childId: string;
  /** Selected option values, scale value as string, or free text. */
  values: string[];
}

export type MatchStatus = "suggested" | "interested" | "mutual" | "declined";

export interface Match {
  id: string;
  childAId: string;
  childBId: string;
  /** 0-100 confidence score from the current scorer. */
  score: number;
  status: MatchStatus;
  /** Parent ids that have expressed interest so far. */
  interestedParentIds: string[];
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
}
