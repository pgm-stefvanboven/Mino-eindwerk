import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { supabase } from "../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

Notifications.setNotificationHandler({
  handleNotification: async () => {
    // 1. Check welke rol actief is op dit specifieke toestel
    const currentRole = await AsyncStorage.getItem("USER_ROLE");

    // 2. Als dit toestel op "patient" staat, negeer de pop-up volledig
    if (currentRole === "patient") {
      return {
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      };
    }

    // 3. Standaard gedrag (voor de mantelzorger)
    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    };
  },
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

// NIEUW: Functie om het toestel uit de database te gooien
export async function unregisterCaregiver() {
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;

    if (!token) return;

    const { error } = await supabase
      .from("caregiver_devices")
      .delete()
      .eq("expo_push_token", token);

    if (error) {
      console.error("Fout bij verwijderen mantelzorger in Supabase:", error);
    } else {
      console.log("Toestel succesvol afgemeld voor notificaties.");
    }
  } catch (err) {
    console.log(
      "Kan token niet ophalen of verwijderen (misschien geen permissie):",
      err,
    );
  }
}