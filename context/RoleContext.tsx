import React, { createContext, useState, useContext, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// 1. We define the two possible roles (and null for when no choice has been made yet)
export type Role = "patient" | "mantelzorger" | null;

// 2. We determine how our state looks
interface RoleContextType {
  role: Role;
  loading: boolean;
  setRole: (role: Role) => Promise<void>;
}

// 3. We create the actual context, starting with undefined to enforce that it must be used within a provider.
const RoleContext = createContext<RoleContextType | undefined>(undefined);

// 4. This is the “shell” we will wrap around your app. It provides the context to all child components.
export const RoleProvider = ({ children }: { children: ReactNode }) => {
  const [role, setRoleState] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  const setRole = async (newRole: Role) => {
    setRoleState(newRole);

    if (newRole) {
      await AsyncStorage.setItem("ROLE", newRole);
    } else {
      await AsyncStorage.removeItem("ROLE");
    }
  };

  React.useEffect(() => {
    const loadRole = async () => {
      const savedRole = await AsyncStorage.getItem("ROLE");

      if (savedRole === "patient" || savedRole === "mantelzorger") {
        setRoleState(savedRole);
      }

      setLoading(false);
    };

    loadRole();
  }, []);

  return (
    <RoleContext.Provider value={{ role, loading, setRole }}>
      {children}
    </RoleContext.Provider>
  );
};

// Custom hook om de rol te gebruiken
export const useRole = () => {
  const context = useContext(RoleContext);

  if (context === undefined) {
    throw new Error("useRole must be used within a RoleProvider");
  }

  return context;
};
