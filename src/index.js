import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Temporarily remove Firebase config setting here to avoid conflict
// window.__app_id = '...';
// window.__firebase_config = JSON.stringify({...});
// window.__initial_auth_token = null;

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);