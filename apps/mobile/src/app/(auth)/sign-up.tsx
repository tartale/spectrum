import { Link } from "expo-router";
import { useState } from "react";

import { ThemedText } from "@/components/themed-text";
import { Button, Card, Field, Screen } from "@/components/ui/controls";
import { supabase } from "@/lib/supabase";

export default function SignUp() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signUp() {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName.trim() } },
    });
    if (err) setError(err.message);
    setBusy(false);
  }

  return (
    <Screen>
      <ThemedText type="subtitle">Create account</ThemedText>
      <ThemedText themeColor="textSecondary">
        Membership is verified: after signing up you&apos;ll be asked for proof of identity and
        address before you can see other families. We never show photos or share contact details.
      </ThemedText>
      <Card>
        <Field label="Your first name" value={displayName} onChangeText={setDisplayName} />
        <Field
          label="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Field
          label="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {error ? <ThemedText type="small" style={{ color: "#d64545" }}>{error}</ThemedText> : null}
        <Button
          title="Sign up"
          onPress={signUp}
          loading={busy}
          disabled={!displayName.trim() || !email || password.length < 8}
        />
        <ThemedText type="small" themeColor="textSecondary">
          Password must be at least 8 characters.
        </ThemedText>
      </Card>
      <Link href="/sign-in">
        <ThemedText type="linkPrimary">Already a member? Sign in</ThemedText>
      </Link>
    </Screen>
  );
}
