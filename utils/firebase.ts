// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyClXTiTuySY7d-iRqYAbQAW_5l_qwwv-lE",
  authDomain: "on-and-order-21f2d.firebaseapp.com",
  databaseURL: "https://on-and-order-21f2d-default-rtdb.firebaseio.com",
  projectId: "on-and-order-21f2d",
  storageBucket: "on-and-order-21f2d.firebasestorage.app",
  messagingSenderId: "790365813676",
  appId: "1:790365813676:web:f7ab08185fb9e92629d809",
  measurementId: "G-PPY39CWZ9V"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);