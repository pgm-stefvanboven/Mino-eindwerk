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
        {/* Role Selection Screen */}
        <Stack.Screen name="index" options={{ headerShown: false }} />

        {/* The Tabs (Today, Medications, Camera) - Hide header because tabs have their own header */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

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