import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Button, Field } from "@/components/ui/controls";
import { Spacing } from "@/constants/theme";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/hooks/use-theme";
import {
  getMessages,
  sendMessage,
  subscribeToMessages,
  type MessageRow,
} from "@/lib/data";

export default function Conversation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const theme = useTheme();
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (id) setMessages(await getMessages(id));
  }, [id]);

  useEffect(() => {
    void load();
    if (!id) return;
    return subscribeToMessages(id, (m) => {
      setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
    });
  }, [id, load]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  async function send() {
    const body = draft.trim();
    if (!id || !body) return;
    setBusy(true);
    setDraft("");
    try {
      await sendMessage(id, body);
      await load(); // realtime echo may be delayed; refresh directly
    } finally {
      setBusy(false);
    }
  }

  const myId = session?.user.id;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView ref={scrollRef} contentContainerStyle={styles.list}>
        {messages.map((m) => {
          const mine = m.sender_id === myId;
          return (
            <View
              key={m.id}
              style={[
                styles.bubble,
                mine
                  ? { alignSelf: "flex-end", backgroundColor: "#3c87f7" }
                  : { alignSelf: "flex-start", backgroundColor: theme.backgroundElement },
              ]}
            >
              <ThemedText type="small" style={mine ? { color: "#fff" } : undefined}>
                {m.body}
              </ThemedText>
            </View>
          );
        })}
      </ScrollView>
      <View style={styles.composer}>
        <View style={{ flex: 1 }}>
          <Field
            placeholder="Message…"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => void send()}
          />
        </View>
        <Button title="Send" onPress={() => void send()} loading={busy} disabled={!draft.trim()} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  bubble: {
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    maxWidth: "80%",
  },
  composer: {
    flexDirection: "row",
    gap: Spacing.two,
    padding: Spacing.three,
    alignItems: "flex-end",
  },
});
