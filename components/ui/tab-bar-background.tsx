import { useColorScheme } from "@/hooks/use-color-scheme";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import { StyleSheet } from "react-native";

export default function TabBarBackground() {
  const colorScheme = useColorScheme();

  return (
    <BlurView
      tint={colorScheme === "dark" ? "dark" : "light"}
      intensity={100}
      style={StyleSheet.absoluteFill}
    />
  );
}

export function useBottomTabOverflow() {
  return useBottomTabBarHeight();
}
