import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Button, Card, Screen } from "@/components/ui/controls";
import { VerifyGate } from "@/components/verify-gate";
import {
  declineMatch,
  expressInterest,
  getMyChildren,
  getMyMatches,
  getNearbyFamilies,
  scorePair,
  type ChildRow,
  type MatchRow,
  type NearbyChild,
} from "@/lib/data";
import { Spacing } from "@/constants/theme";

interface Suggestion {
  candidate: NearbyChild;
  myChild: ChildRow;
  score: number;
}

function statusLabel(m: MatchRow): string {
  if (m.status === "mutual") return "Mutual — say hello!";
  if (m.status === "declined") return "Declined";
  return m.i_am_interested ? "Waiting for the other parent" : "They're interested in a playdate";
}

export default function Matches() {
  const router = useRouter();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [myChildren, setMyChildren] = useState<ChildRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [mine, existing, nearby] = await Promise.all([
        getMyChildren(),
        getMyMatches(),
        getNearbyFamilies(),
      ]);
      setMyChildren(mine);
      setMatches(existing);
      const matchedIds = new Set(existing.map((m) => m.other_child_id));
      const scored = nearby
        .filter((c) => !matchedIds.has(c.child_id))
        .map((candidate) => {
          const best = mine
            .map((myChild) => ({ myChild, score: scorePair(myChild, candidate).score }))
            .sort((a, b) => b.score - a.score)[0];
          return best ? { candidate, myChild: best.myChild, score: best.score } : null;
        })
        .filter((s): s is Suggestion => s !== null)
        .sort((a, b) => b.score - a.score);
      setSuggestions(scored);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onInterest(s: Suggestion) {
    await expressInterest(s.myChild.id, s.candidate.child_id, s.score);
    await load();
  }

  return (
    <VerifyGate>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <Screen>
          {error ? <ThemedText style={{ color: "#d64545" }}>{error}</ThemedText> : null}

          {myChildren.length === 0 ? (
            <Card>
              <ThemedText>Add your child&apos;s profile to start seeing matches.</ThemedText>
              <Button title="Add a child" onPress={() => router.push("/children/new")} />
            </Card>
          ) : null}

          {matches.filter((m) => m.status !== "declined").length > 0 ? (
            <>
              <ThemedText type="subtitle">Your matches</ThemedText>
              {matches
                .filter((m) => m.status !== "declined")
                .map((m) => (
                  <Card key={m.match_id}>
                    <ThemedText type="smallBold">
                      {m.my_child_nickname} × {m.other_child_nickname}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {m.other_parent_name} · confidence {m.score} · {statusLabel(m)}
                    </ThemedText>
                    <View style={{ flexDirection: "row", gap: Spacing.two }}>
                      {m.status === "mutual" && m.conversation_id ? (
                        <Button
                          title="Open chat"
                          onPress={() => router.push(`/messages/${m.conversation_id}`)}
                        />
                      ) : null}
                      {!m.i_am_interested && m.status === "interested" ? (
                        <Button
                          title="I'm interested too"
                          onPress={async () => {
                            await expressInterest(m.my_child_id, m.other_child_id, m.score);
                            await load();
                          }}
                        />
                      ) : null}
                      <Button
                        title="Decline"
                        kind="secondary"
                        onPress={async () => {
                          await declineMatch(m.match_id);
                          await load();
                        }}
                      />
                    </View>
                  </Card>
                ))}
            </>
          ) : null}

          <ThemedText type="subtitle">Suggested playmates</ThemedText>
          {suggestions.length === 0 ? (
            <ThemedText themeColor="textSecondary">
              No suggestions right now. Try widening your location range in Profile, or check back
              as more families join your area.
            </ThemedText>
          ) : (
            suggestions.map((s) => (
              <Card key={`${s.candidate.child_id}-${s.myChild.id}`}>
                <ThemedText type="smallBold">
                  {s.candidate.nickname} — {s.score} match for {s.myChild.nickname}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Parent {s.candidate.parent_display_name}
                  {s.candidate.city ? ` · ${s.candidate.city}` : ""} · {s.candidate.distance_km} km
                  away
                </ThemedText>
                {s.candidate.likes.length > 0 ? (
                  <ThemedText type="small">Loves: {s.candidate.likes.join(", ")}</ThemedText>
                ) : null}
                {s.candidate.triggers.length > 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Sensitive to: {s.candidate.triggers.join(", ")}
                  </ThemedText>
                ) : null}
                <Button title="Suggest a playdate" onPress={() => void onInterest(s)} />
              </Card>
            ))
          )}
        </Screen>
      </ScrollView>
    </VerifyGate>
  );
}
