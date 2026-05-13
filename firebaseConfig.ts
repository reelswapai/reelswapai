import { initializeApp } from "firebase/app";
import {
  getReactNativePersistence,
  initializeAuth,
} from "firebase/auth";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDSWwIHreBJS7wXz7dfp4-ebhhKcrPzYfw",
  authDomain: "reelswapai-8e8e8.firebaseapp.com",
  projectId: "reelswapai-8e8e8",
  storageBucket: "reelswapai-8e8e8.firebasestorage.app",
  messagingSenderId: "646777059817",
  appId: "1:646777059817:web:f27ec9ea6a27b143e7f378",
  measurementId: "G-RFQKXXFXPY"
};

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
export const db = getFirestore(app);

export default app;