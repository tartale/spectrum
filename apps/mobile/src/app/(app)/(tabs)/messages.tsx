import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Card, Screen } from "@/components/ui/controls";
import { VerifyGate } from "@/components/verify-gate";
import { getMyConversations, type ConversationRow } from "@/lib/data";

export default function Conversations() {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationRow[]>([]);

  const load = useCallback(async () => {
    setConversations(await getMyConversations());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <VerifyGate>
      <Screen>
        {conversations.length === 0 ? (
          <ThemedText themeColor="textSecondary">
            Conversations open when both parents are interested in a playdate. No messages yet.
          </ThemedText>
        ) : (
          conversations.map((c) => (
            <Pressable
              key={c.conversation_id}
              onPress={() => router.push(`/messages/${c.conversation_id}`)}
            >
              <Card>
                <ThemedText type="smallBold">{c.other_parent_name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {c.last_message ?? "Say hello 👋"}
                </ThemedText>
              </Card>
            </Pressable>
          ))
        )}
      </Screen>
    </VerifyGate>
  );
}
