import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";

function icon(emoji: string) {
  return ({ color }: { color: ColorValue }) => (
    <Text style={{ fontSize: 18, color }}>{emoji}</Text>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="index" options={{ title: "Matches", tabBarIcon: icon("✨") }} />
      <Tabs.Screen name="families" options={{ title: "Families", tabBarIcon: icon("🏘️") }} />
      <Tabs.Screen name="messages" options={{ title: "Messages", tabBarIcon: icon("💬") }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: icon("👤") }} />
    </Tabs>
  );
}
