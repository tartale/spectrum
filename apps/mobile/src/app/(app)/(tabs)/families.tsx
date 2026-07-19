import { useCallback, useEffect, useState } from "react";

import { ThemedText } from "@/components/themed-text";
import { Card, Screen } from "@/components/ui/controls";
import { VerifyGate } from "@/components/verify-gate";
import { getNearbyFamilies, type NearbyChild } from "@/lib/data";

/** Manual browse: every verified family whose range preferences overlap ours. */
export default function Families() {
  const [families, setFamilies] = useState<NearbyChild[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setFamilies(await getNearbyFamilies());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <VerifyGate>
      <Screen>
        <ThemedText themeColor="textSecondary">
          Verified families in your area, based on both sides&apos; distance preferences.
        </ThemedText>
        {error ? <ThemedText style={{ color: "#d64545" }}>{error}</ThemedText> : null}
        {families.map((f) => (
          <Card key={f.child_id}>
            <ThemedText type="smallBold">
              {f.nickname} · born {f.birth_year}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Parent {f.parent_display_name}
              {f.neighborhood ? ` · ${f.neighborhood}` : f.city ? ` · ${f.city}` : ""} ·{" "}
              {f.distance_km} km away
            </ThemedText>
            {f.likes.length > 0 ? (
              <ThemedText type="small">Loves: {f.likes.join(", ")}</ThemedText>
            ) : null}
            {f.activity_preferences.length > 0 ? (
              <ThemedText type="small">Up for: {f.activity_preferences.join(", ")}</ThemedText>
            ) : null}
            {f.triggers.length > 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                Sensitive to: {f.triggers.join(", ")}
              </ThemedText>
            ) : null}
          </Card>
        ))}
        {families.length === 0 && !error ? (
          <ThemedText themeColor="textSecondary">No families in range yet.</ThemedText>
        ) : null}
      </Screen>
    </VerifyGate>
  );
}
