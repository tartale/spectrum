import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/lib/auth-context";

export default function AppLayout() {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (!session) return <Redirect href="/sign-in" />;
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="verify" options={{ title: "Get verified" }} />
      <Stack.Screen name="admin" options={{ title: "Review queue" }} />
      <Stack.Screen name="children/new" options={{ title: "Add a child" }} />
      <Stack.Screen name="children/[id]" options={{ title: "Child profile" }} />
      <Stack.Screen name="messages/[id]" options={{ title: "Conversation" }} />
    </Stack>
  );
}
