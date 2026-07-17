import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { supabase } from "../lib/supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotifications() {
  if (!Device.isDevice) {
    console.log("Gebruik een echte telefoon.");
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();

  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();

    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("Geen toestemming voor notificaties.");
    return null;
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data;

  console.log("Expo Push Token:", token);

  return token;
}

export async function registerCaregiver(name: string) {
  const token = await registerForPushNotifications();

  if (!token) return;

  const { error } = await supabase.from("caregiver_devices").insert({
    name,
    expo_push_token: token,
  });

  if (error) {
    console.error("Supabase:", error);
  } else {
    console.log("Mantelzorger geregistreerd.");
  }
}