import { useRouter } from "expo-router";
import { useState } from "react";

import { ThemedText } from "@/components/themed-text";
import { Button, Field, Screen } from "@/components/ui/controls";
import { createChild } from "@/lib/data";

export default function NewChild() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const child = await createChild(nickname.trim(), Number(birthYear));
      router.replace(`/children/${child.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const year = Number(birthYear);
  const valid = nickname.trim().length > 0 && year > 1990 && year < 2100;

  return (
    <Screen>
      <ThemedText themeColor="textSecondary">
        Use a first name or nickname only — no last names. Photos aren&apos;t part of Spectrum by
        design.
      </ThemedText>
      <Field label="First name or nickname" value={nickname} onChangeText={setNickname} />
      <Field
        label="Birth year"
        keyboardType="numeric"
        placeholder="e.g. 2018"
        value={birthYear}
        onChangeText={setBirthYear}
      />
      {error ? <ThemedText type="small" style={{ color: "#d64545" }}>{error}</ThemedText> : null}
      <Button title="Continue to questionnaire" onPress={save} loading={busy} disabled={!valid} />
    </Screen>
  );
}
