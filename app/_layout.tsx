import { Stack } from "expo-router";
import { StatusBar } from "react-native";

export default function RootLayout() {
  return (
    <>
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
    </>
  );
}