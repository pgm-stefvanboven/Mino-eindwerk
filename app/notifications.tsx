import { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

type Notification = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  read: boolean;
};

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    setNotifications(data ?? []);
  };

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View
            style={{
              backgroundColor: "#1c1c1e",
              padding: 16,
              borderRadius: 12,
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                color: "white",
                fontSize: 16,
                fontWeight: "bold",
                marginBottom: 6,
              }}
            >
              {item.title}
            </Text>

            <Text
              style={{
                color: "#d4d4d8",
                marginBottom: 8,
              }}
            >
              {item.body}
            </Text>

            <Text
              style={{
                color: "#71717a",
                fontSize: 12,
              }}
            >
              {new Date(item.created_at).toLocaleString("nl-BE")}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={{ marginTop: 40 }}>
            <Text
              style={{
                color: "white",
                fontSize: 18,
                fontWeight: "600",
                marginBottom: 8,
              }}
            >
              Nog geen meldingen
            </Text>

            <Text
              style={{
                color: "#a1a1aa",
                lineHeight: 22,
              }}
            >
              Meldingen van Mino verschijnen hier zodra er een gebeurtenis
              plaatsvindt.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#09090b",
    padding: 20,
  },
  subtitle: {
    color: "#a1a1aa",
    fontSize: 16,
  },
});
