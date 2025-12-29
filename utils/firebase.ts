import { initializeApp } from "firebase/app";
import { getDatabase, Database } from "firebase/database";

const getEnv = (key: string) => {
  try {
    // @ts-ignore
    if (import.meta.env && import.meta.env[key]) {
      // @ts-ignore
      return import.meta.env[key];
    }
  } catch (e) {}
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

let db: Database | null = null;

const isConfigured = firebaseConfig.apiKey && 
                     firebaseConfig.apiKey !== "REPLACE_WITH_YOUR_API_KEY" &&
                     !firebaseConfig.apiKey.includes("REPLACE");

if (isConfigured) {
  try {
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    console.log("Firebase initialized successfully");
  } catch (e) {
    console.error("Firebase initialization error:", e);
  }
} else {
  console.info("Firebase not configured. Running in offline/demo mode.");
}

export { db };