import { defaultScorer, type MatchScore, type ScorableChild } from "@spectrum/shared";

import { supabase } from "@/lib/supabase";

export interface ChildRow {
  id: string;
  parent_id: string;
  nickname: string;
  birth_year: number;
  likes: string[];
  dislikes: string[];
  triggers: string[];
  activity_preferences: string[];
  traits: Record<string, string>;
}

export interface QuestionRow {
  id: string;
  kind: "multi_select" | "single_select" | "scale" | "free_text";
  prompt: string;
  options: string[];
  dimension: string;
  sort_order: number;
}

export interface NearbyChild {
  child_id: string;
  nickname: string;
  birth_year: number;
  likes: string[];
  dislikes: string[];
  triggers: string[];
  activity_preferences: string[];
  traits: Record<string, string>;
  parent_display_name: string;
  city: string | null;
  neighborhood: string | null;
  distance_km: number;
}

export interface MatchRow {
  match_id: string;
  status: "interested" | "mutual" | "declined";
  score: number;
  my_child_id: string;
  my_child_nickname: string;
  other_child_id: string;
  other_child_nickname: string;
  other_parent_name: string;
  i_am_interested: boolean;
  they_are_interested: boolean;
  conversation_id: string | null;
}

export interface ConversationRow {
  conversation_id: string;
  match_id: string;
  other_parent_name: string;
  last_message: string | null;
  last_message_at: string | null;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

function throwIfError<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export async function getMyChildren(): Promise<ChildRow[]> {
  return throwIfError(await supabase.from("children").select("*").order("created_at"));
}

export async function getChild(id: string): Promise<ChildRow> {
  return throwIfError(await supabase.from("children").select("*").eq("id", id).single());
}

export async function createChild(nickname: string, birthYear: number): Promise<ChildRow> {
  const user = (await supabase.auth.getUser()).data.user;
  return throwIfError(
    await supabase
      .from("children")
      .insert({ parent_id: user?.id, nickname, birth_year: birthYear })
      .select()
      .single(),
  );
}

export async function getActiveQuestions(): Promise<QuestionRow[]> {
  const version = throwIfError(
    await supabase
      .from("questionnaire_versions")
      .select("id")
      .eq("active", true)
      .order("version", { ascending: false })
      .limit(1)
      .single(),
  ) as { id: string };
  return throwIfError(
    await supabase
      .from("questions")
      .select("id, kind, prompt, options, dimension, sort_order")
      .eq("version_id", version.id)
      .order("sort_order"),
  );
}

export async function getAnswers(childId: string): Promise<Record<string, string[]>> {
  const rows = throwIfError(
    await supabase.from("answers").select("question_id, values").eq("child_id", childId),
  ) as { question_id: string; values: string[] }[];
  return Object.fromEntries(rows.map((r) => [r.question_id, r.values]));
}

export async function saveAnswer(
  childId: string,
  questionId: string,
  values: string[],
): Promise<void> {
  throwIfError(
    await supabase
      .from("answers")
      .upsert({ child_id: childId, question_id: questionId, values }),
  );
}

export async function getNearbyFamilies(): Promise<NearbyChild[]> {
  return throwIfError(await supabase.rpc("nearby_families"));
}

export function toScorable(c: ChildRow | NearbyChild): ScorableChild {
  return {
    birthYear: c.birth_year,
    likes: c.likes ?? [],
    dislikes: c.dislikes ?? [],
    triggers: c.triggers ?? [],
    activityPreferences: c.activity_preferences ?? [],
    traits: c.traits ?? {},
  };
}

export function scorePair(mine: ChildRow, candidate: NearbyChild): MatchScore {
  return defaultScorer.score(toScorable(mine), toScorable(candidate), {
    distanceKm: candidate.distance_km,
  });
}

export async function expressInterest(
  myChildId: string,
  otherChildId: string,
  score: number,
): Promise<void> {
  throwIfError(
    await supabase.rpc("express_interest", {
      my_child_id: myChildId,
      other_child_id: otherChildId,
      score,
    }),
  );
}

export async function declineMatch(matchId: string): Promise<void> {
  throwIfError(await supabase.rpc("decline_match", { match_id: matchId }));
}

export async function getMyMatches(): Promise<MatchRow[]> {
  return throwIfError(await supabase.rpc("my_matches"));
}

export async function getMyConversations(): Promise<ConversationRow[]> {
  return throwIfError(await supabase.rpc("my_conversations"));
}

export async function getMessages(conversationId: string): Promise<MessageRow[]> {
  return throwIfError(
    await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at"),
  );
}

export async function sendMessage(conversationId: string, body: string): Promise<void> {
  const user = (await supabase.auth.getUser()).data.user;
  throwIfError(
    await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, sender_id: user?.id, body }),
  );
}

export function subscribeToMessages(
  conversationId: string,
  onMessage: (m: MessageRow) => void,
): () => void {
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onMessage(payload.new as MessageRow),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
