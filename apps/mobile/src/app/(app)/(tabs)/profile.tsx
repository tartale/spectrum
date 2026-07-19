import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Button, Card, ChipGroup, Field, Screen } from "@/components/ui/controls";
import { Spacing } from "@/constants/theme";
import { useAuth } from "@/lib/auth-context";
import { getMyChildren, type ChildRow } from "@/lib/data";
import { supabase } from "@/lib/supabase";

const RANGE_LABELS: Record<string, string> = {
  radius: "Distance from home",
  same_city: "Same city",
  same_neighborhood: "Same neighborhood",
};

export default function Profile() {
  const { profile, refreshProfile, signOut } = useAuth();
  const router = useRouter();
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [radius, setRadius] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setChildren(await getMyChildren());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (profile) setRadius(String(profile.range_radius_km));
  }, [profile]);

  if (!profile) return null;

  const rangeLabel = RANGE_LABELS[profile.range_type] ?? profile.range_type;

  async function saveRange(nextType?: string) {
    setSaving(true);
    const type = nextType ?? profile!.range_type;
    await supabase
      .from("profiles")
      .update({
        range_type: type,
        range_radius_km: Math.max(1, Number(radius) || profile!.range_radius_km),
      })
      .eq("id", profile!.id);
    await refreshProfile();
    setSaving(false);
  }

  return (
    <Screen>
      <ThemedText type="subtitle">{profile.display_name}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Status: {profile.verification_status}
        {profile.city ? ` · ${profile.city}` : ""}
        {profile.neighborhood ? ` · ${profile.neighborhood}` : ""}
      </ThemedText>

      {profile.verification_status !== "verified" ? (
        <Button title="Get verified" onPress={() => router.push("/verify")} />
      ) : null}

      <Card>
        <ThemedText type="smallBold">Who can you see?</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Currently: {rangeLabel}
          {profile.range_type === "radius" ? ` (${profile.range_radius_km} km)` : ""}
        </ThemedText>
        <ChipGroup
          single
          options={Object.values(RANGE_LABELS)}
          selected={[rangeLabel]}
          onToggle={(next) => {
            const key = Object.entries(RANGE_LABELS).find(([, v]) => v === next[0])?.[0];
            if (key) void saveRange(key);
          }}
        />
        {profile.range_type === "radius" ? (
          <View style={{ flexDirection: "row", gap: Spacing.two, alignItems: "flex-end" }}>
            <View style={{ flex: 1 }}>
              <Field label="Radius (km)" keyboardType="numeric" value={radius} onChangeText={setRadius} />
            </View>
            <Button title="Save" onPress={() => void saveRange()} loading={saving} kind="secondary" />
          </View>
        ) : null}
      </Card>

      <Card>
        <ThemedText type="smallBold">Children</ThemedText>
        {children.map((c) => (
          <Button
            key={c.id}
            title={`${c.nickname} (born ${c.birth_year})`}
            kind="secondary"
            onPress={() => router.push(`/children/${c.id}`)}
          />
        ))}
        <Button title="Add a child" onPress={() => router.push("/children/new")} />
      </Card>

      {profile.role === "admin" ? (
        <Button title="Verification review queue" onPress={() => router.push("/admin")} />
      ) : null}

      <Button title="Sign out" kind="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}
