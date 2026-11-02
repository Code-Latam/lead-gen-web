import { useAuth as useStore } from "./store.js";

export function useAuth() {
  const store = useStore();
  return {
    ...store,
    isAuthenticated: store.isAuthenticated(),
    isSubscribed: store.isSubscribed(),
    hasMeetingMakerPlan: store.hasMeetingMakerPlan(),
  };
}