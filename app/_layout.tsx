import { Stack, useRouter } from "expo-router";
import { StatusBar } from "react-native";
import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { RoleProvider, useRole } from "../context/RoleContext";
import { resolveNotificationRoute } from "../lib/notificationRouting";
import {
  getCurrentRoleForNotifications,
  setCurrentRoleForNotifications,
} from "../lib/notificationRole";

// Notificatietypes waarvoor het GELUID enkel voor de patiënt bedoeld is
// (bv. batterij-waarschuwing: de patiënt hoort dit al via de robot zelf).
// De mantelzorger krijgt de melding nog steeds te zien, enkel zonder geluid.
const SOUND_MUTED_FOR_CAREGIVER_TYPES = ["battery"];

// Make sure this is only set up once, app-wide (was previously duplicated
// in app/(tabs)/_layout.tsx and app/notifications.tsx too).
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = (notification.request.content.data ?? {}) as {
      type?: string;
    };
    const role = getCurrentRoleForNotifications();

    const muteSoundForThisDevice =
      role === "mantelzorger" &&
      !!data.type &&
      SOUND_MUTED_FOR_CAREGIVER_TYPES.includes(data.type);

    return {
      shouldShowAlert: true,
      shouldPlaySound: !muteSoundForThisDevice,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});

function routeFromResponse(response: Notifications.NotificationResponse) {
  const content = response.notification.request.content;
  const data = (content.data ?? {}) as { route?: string; type?: string };

  return resolveNotificationRoute({
    route: data.route,
    type: data.type,
    title: content.title ?? undefined,
    body: content.body ?? undefined,
  });
}

/**
 * Listens for notification taps and navigates to the relevant screen.
 * Mounted once, inside RoleProvider, so `useRole()` (and therefore
 * `loading`) is available to it.
 */
function NotificationTapRouter() {
  const router = useRouter();
  const { role, loading } = useRole();
  const handledColdStart = useRef(false);

  // Houd de losstaande modulevariabele in sync met de huidige rol, zodat de
  // (buiten React geregistreerde) Notifications.setNotificationHandler hierboven
  // weet of dit toestel de patiënt of de mantelzorger is.
  useEffect(() => {
    setCurrentRoleForNotifications(role ?? null);
  }, [role]);

  // Case A: app is already open (foreground or backgrounded) and the
  // user taps a notification.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        router.push(routeFromResponse(response) as any);
      },
    );

    return () => subscription.remove();
  }, [router]);

  // Case B: app was fully killed and got launched BY tapping a
  // notification. We have to ask for the "last response" once role
  // finishes loading, then push on top of whatever the splash screen
  // (app/index.tsx) already navigated to.
  useEffect(() => {
    if (loading || handledColdStart.current) return;
    handledColdStart.current = true;

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const route = routeFromResponse(response);

      // Small delay so this push happens *after* the splash screen's own
      // router.replace("/(tabs)" | "/login") has taken effect.
      setTimeout(() => router.push(route as any), 400);
    });
  }, [loading, router]);

  return null;
}

export default function RootLayout() {
  return (
    <RoleProvider>
      <StatusBar barStyle="light-content" />
      <NotificationTapRouter />
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