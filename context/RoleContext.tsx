import React, { createContext, useState, useContext, ReactNode } from 'react';

// 1. We define the two possible roles (and null for when no choice has been made yet)
export type Role = 'patient' | 'mantelzorger' | null;

// 2. We determine how our state looks
interface RoleContextType {
  role: Role;
  setRole: (role: Role) => void;
}

// 3. We create the actual context, starting with undefined to enforce that it must be used within a provider.
const RoleContext = createContext<RoleContextType | undefined>(undefined);

// 4. This is the “shell” we will wrap around your app. It provides the context to all child components.
export const RoleProvider = ({ children }: { children: ReactNode }) => {
  // By default, we set the role to null so that we can ask for a choice at startup.
  const [role, setRole] = useState<Role>(null);

  return (
    <RoleContext.Provider value={{ role, setRole }}>
      {children}
    </RoleContext.Provider>
  );
};

// 5. A handy custom hook so you can easily type ‘useRole()’ in any screen to get access to the role and the function to change it. It also ensures that you can only use this hook within a RoleProvider.
export const useRole = () => {
  const context = useContext(RoleContext);
  if (context === undefined) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
};