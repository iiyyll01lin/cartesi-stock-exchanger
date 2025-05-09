import React from 'react';
import ReactDOM from 'react-dom/client';
// If you have global CSS, import it here (e.g., import './index.css';)
import App from './App';
import './App.css'; // Assuming App.css contains global styles or styles for App
import './components/common/ConnectionErrorMessage.css'; // Import the ConnectionErrorMessage CSS
import './components/wallet/WalletInfo.css'; // Import the WalletInfo CSS

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
