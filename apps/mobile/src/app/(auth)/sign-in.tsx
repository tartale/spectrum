import { Link } from "expo-router";
import { useState } from "react";

import { ThemedText } from "@/components/themed-text";
import { Button, Card, Field, Screen } from "@/components/ui/controls";
import { supabase } from "@/lib/supabase";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError(err.message);
    setBusy(false);
  }

  return (
    <Screen>
      <ThemedText type="subtitle">Spectrum</ThemedText>
      <ThemedText themeColor="textSecondary">
        A private community for families to find compatible playmates nearby.
      </ThemedText>
      <Card>
        <Field
          label="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Field label="Password" secureTextEntry value={password} onChangeText={setPassword} />
        {error ? <ThemedText type="small" style={{ color: "#d64545" }}>{error}</ThemedText> : null}
        <Button title="Sign in" onPress={signIn} loading={busy} disabled={!email || !password} />
      </Card>
      <Link href="/sign-up">
        <ThemedText type="linkPrimary">New here? Create an account</ThemedText>
      </Link>
    </Screen>
  );
}
