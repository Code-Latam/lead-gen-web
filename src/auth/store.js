// src/auth/store.js
import { create } from "zustand";
import { api } from "../api/client.js";

export const useAuth = create((set, get) => ({
  user: null,
  client: null,
  token: localStorage.getItem("token") || null,
  loading: true,

  async hydrate() {
    const token = localStorage.getItem("token");
    if (!token) {
      set({ loading: false, user: null, client: null, token: null });
      return;
    }
    try {
      const data = await api.get("/auth/me");
      set({
        user: data.user,
        client: data.client,
        token,
        loading: false,
      });
    } catch {
      localStorage.removeItem("token");
      set({ user: null, client: null, token: null, loading: false });
    }
  },

  async login(email, password) {
  const data = await api.post("/auth/login", { email, password });
  const { token, user } = data;
  localStorage.setItem("token", token);

  // The /auth/login response is missing fields the app needs
  // (notably leadGenSubscribed). After setting the token, fetch the
  // full client via /auth/me and hydrate the store from that.
  set({ token, user, loading: true });
  try {
    const meData = await api.get("/auth/me");
    set({
      user: meData.user,
      client: meData.client,
      loading: false,
    });
  } catch {
    // If /auth/me fails, keep the login response's client as a fallback
    set({ client: data.client, loading: false });
  }
  return data;
},

  logout() {
    localStorage.removeItem("token");
    set({ user: null, client: null, token: null });
  },

  isAuthenticated() {
    return !!(get().token && get().user);
  },
  isSubscribed() {
    return get().client?.leadGenSubscribed === true;
  },
  hasMeetingMakerPlan() {
    return !!(get().client?.plan && get().client.plan !== "free");
  },
}));