import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCzrAHX85YU-EBVp6ATq_54AGTVmQAH9sE",
  authDomain: "spirit-stone-krackathon.firebaseapp.com",
  databaseURL: "https://spirit-stone-krackathon-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "spirit-stone-krackathon",
  storageBucket: "spirit-stone-krackathon.firebasestorage.app",
  messagingSenderId: "949226254977",
  appId: "1:949226254977:web:9872aa068abc2e26dfd380",
  measurementId: "G-LP3143761F"
};

const app = initializeApp(firebaseConfig);

export const db = getDatabase(app);
export const auth = getAuth(app);

// Auto login anonymously
signInAnonymously(auth)
  .then(() => {
    console.log("Anonymous login successful");
  })
  .catch((error) => {
    console.error("Auth error:", error);
  });
