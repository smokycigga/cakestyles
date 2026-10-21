/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from "react";
import api from "../lib/api";
import { hasPermission } from "../lib/permissions";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("cs_user") || "null");
    } catch {
      return null;
    }
  });

  const login = async (email, password) => {
    const res = await api.post("/auth/login", { email, password });
    localStorage.setItem("cs_token", res.data.token);
    localStorage.setItem("cs_user", JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = () => {
    localStorage.removeItem("cs_token");
    localStorage.removeItem("cs_user");
    setUser(null);
  };

  const can = (perm) => !!user && hasPermission(user.role, perm);

  return (
    <AuthContext.Provider value={{ user, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
