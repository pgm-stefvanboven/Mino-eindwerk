import { Stack } from "expo-router";
import { StatusBar } from "react-native";
import { RoleProvider } from "../context/RoleContext"; // 1. Import Context Provider

export default function RootLayout() {
  return (
    // 2. Wrap the RoleProvider around your entire application
    <RoleProvider>
      <StatusBar barStyle="light-content" />
      <Stack
        screenOptions={{
          // Dark Theme styling for all screens
          headerStyle: { backgroundColor: "#09090b" },
          headerTintColor: "#fff",
          headerTitleStyle: { fontWeight: "bold" },
          contentStyle: { backgroundColor: "#09090b" },
        }}
      >
        {/* Launcher Screen */}
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="notifications"
          options={{
            title: "Meldingen",
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            title: "INSTELLINGEN",
            headerBackTitle: "Terug",
          }}
        />
      </Stack>
    </RoleProvider>
  );
}
