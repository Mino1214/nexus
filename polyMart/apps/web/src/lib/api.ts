import axios from "axios";
import { useUserStore } from "../store/userStore";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "/api",
});

api.interceptors.request.use((config) => {
  const token = useUserStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error?.response?.data?.message;
    if (typeof message === "string") {
      error.message = message;
    }

    if (error?.response?.status === 401) {
      useUserStore.getState().clearSession();
    }

    return Promise.reject(error);
  },
);
