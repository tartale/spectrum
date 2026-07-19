import { useRouter } from "expo-router";
import { type PropsWithChildren } from "react";

import { ThemedText } from "@/components/themed-text";
import { Button, Card, Screen } from "@/components/ui/controls";
import { useAuth } from "@/lib/auth-context";

/**
 * Wraps screens that must only be visible to verified members. Everything
 * behind this gate is additionally enforced server-side by RLS — this is UX,
 * not the security boundary.
 */
export function VerifyGate({ children }: PropsWithChildren) {
  const { profile } = useAuth();
  const router = useRouter();

  if (profile?.verification_status === "verified") return <>{children}</>;

  return (
    <Screen>
      <Card>
        <ThemedText type="subtitle">Verification required</ThemedText>
        {profile?.verification_status === "pending" ? (
          <ThemedText themeColor="textSecondary">
            Your documents are being reviewed. You&apos;ll get access as soon as an administrator
            approves them — usually within a day or two.
          </ThemedText>
        ) : (
          <>
            <ThemedText themeColor="textSecondary">
              Spectrum is a verified community. To keep every family safe, we ask each member for
              proof of identity and address before they can see other families.
            </ThemedText>
            <Button title="Start verification" onPress={() => router.push("/verify")} />
          </>
        )}
        {profile?.verification_status === "rejected" ? (
          <>
            <ThemedText style={{ color: "#d64545" }}>
              Your last submission was declined. You can submit new documents.
            </ThemedText>
            <Button title="Resubmit documents" onPress={() => router.push("/verify")} />
          </>
        ) : null}
      </Card>
    </Screen>
  );
}
