const firebaseConfig = {
  apiKey: "AIzaSyAdB7QsZrUYPsVoagB-kfwh2_yBgGPzMsg",
  authDomain: "twitter-app-d879c.firebaseapp.com",
  projectId: "twitter-app-d879c",
  storageBucket: "twitter-app-d879c.firebasestorage.app",
  messagingSenderId: "836611938624",
  appId: "1:836611938624:web:52e59fe1b7406f5175c2a5",
  measurementId: "G-QFWCNNMDDL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
