import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// --- IMPORTANT: This file ONLY sets global variables for App.js to use. ---
// --- DO NOT initialize Firebase or call getAnalytics here. ---

// Your web app's Firebase configuration
// Please ensure these values are correct from your Firebase Project Settings -> Your apps (web app)
window.__app_id = 'task-manager-local-app'; // You can keep this as a simple string for local testing
window.__firebase_config = JSON.stringify({
  apiKey: "AIzaSyBG8YGntW5mY85Tx3FvQcKqa3Gk3TZPJP8",
  authDomain: "task-manager-7c6f4.firebaseapp.com",
  projectId: "task-manager-7c6f4",
  storageBucket: "task-manager-7c6f4.firebasestorage.app",
  messagingSenderId: "512795463333",
  appId: "1:512795463333:web:347a95504d47dd7601c74c",
  measurementId: "G-BXVD0DX8M5" // This is optional and won't affect core functionality
});
window.__initial_auth_token = null; // Leave as null for anonymous sign-in

// This is how React starts your app and connects it to the 'root' div in index.html
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);