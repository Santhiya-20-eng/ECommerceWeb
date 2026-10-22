import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyCKyX1lBOKqRWvH5EOyYFjr7m8QRgRQ6ps",
  authDomain: "ecomweb-a96f2.firebaseapp.com",
  projectId: "ecomweb-a96f2",
  storageBucket: "ecomweb-a96f2.firebasestorage.app",
  messagingSenderId: "898088902878",
  appId: "1:898088902878:web:563d9ca7fe2858e026a24f",
  measurementId: "G-66EWXQ0WF9"
};

const app = initializeApp(firebaseConfig);
try { getAnalytics(app); } catch (e) { /* analytics is optional */ }

export const auth = getAuth(app);
export const db = getFirestore(app);
