import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// Helper to safely access env vars without crashing if import.meta.env is undefined
const getEnv = (key: string) => {
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      // @ts-ignore
      return import.meta.env[key];
    }
  } catch (e) {
    // Ignore errors
  }
  return "";
};

const firebaseConfig = {
  apiKey: getEnv("VITE_FIREBASE_API_KEY") || "REPLACE_WITH_YOUR_API_KEY",
  authDomain: getEnv("VITE_FIREBASE_AUTH_DOMAIN") || "REPLACE_WITH_YOUR_AUTH_DOMAIN",
  databaseURL: getEnv("VITE_FIREBASE_DATABASE_URL") || "REPLACE_WITH_YOUR_DATABASE_URL",
  projectId: getEnv("VITE_FIREBASE_PROJECT_ID") || "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket: getEnv("VITE_FIREBASE_STORAGE_BUCKET") || "REPLACE_WITH_YOUR_STORAGE_BUCKET",
  messagingSenderId: getEnv("VITE_FIREBASE_MESSAGING_SENDER_ID") || "REPLACE_WITH_YOUR_MESSAGING_SENDER_ID",
  appId: getEnv("VITE_FIREBASE_APP_ID") || "REPLACE_WITH_YOUR_APP_ID",
};

let app;
let db = null;

const isConfigured = firebaseConfig.apiKey && firebaseConfig.apiKey !== "REPLACE_WITH_YOUR_API_KEY";

if (isConfigured) {
    try {
        app = initializeApp(firebaseConfig);
        db = getDatabase(app);
        console.log("Firebase initialized successfully");
    } catch (e) {
        console.error("Firebase initialization error:", e);
    }
} else {
    console.warn("Firebase configuration missing. Please update utils/firebase.ts or set environment variables.");
}

export { db };