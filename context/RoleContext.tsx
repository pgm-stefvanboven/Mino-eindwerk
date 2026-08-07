import React, { createContext, useState, useEffect, useContext } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

type Role = "patient" | "mantelzorger" | null;

interface RoleContextData {
  role: Role;
  setRole: (role: Role) => Promise<void>;
  loading: boolean;
}

const RoleContext = createContext<RoleContextData>({} as RoleContextData);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  // Bij het opstarten van de app: check of er al een rol is opgeslagen
  useEffect(() => {
    const loadRole = async () => {
      try {
        const savedRole = await AsyncStorage.getItem("USER_ROLE");
        if (savedRole === "patient" || savedRole === "mantelzorger") {
          setRoleState(savedRole);
        }
      } catch (e) {
        console.error("Fout bij laden van de rol:", e);
      } finally {
        setLoading(false); // Het laden is klaar, de app mag nu renderen
      }
    };

    loadRole();
  }, []);

  // Functie om de rol te veranderen én definitief op te slaan
  const setRole = async (newRole: Role) => {
    try {
      if (newRole) {
        await AsyncStorage.setItem("USER_ROLE", newRole);
      } else {
        await AsyncStorage.removeItem("USER_ROLE");
      }
      setRoleState(newRole);
    } catch (e) {
      console.error("Fout bij opslaan van de rol:", e);
    }
  };

  return (
    <RoleContext.Provider value={{ role, setRole, loading }}>
      {children}
    </RoleContext.Provider>
  );
}

export const useRole = () => useContext(RoleContext);