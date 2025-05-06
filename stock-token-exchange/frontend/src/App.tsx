import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import Notifications from './components/common/Notifications';
import Dashboard from './pages/Dashboard';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { NotificationProvider, useNotificationContext } from './contexts/NotificationContext';
import { WalletProvider, useWalletContext } from './contexts/WalletContext';
import { ContractProvider } from './contexts/ContractContext';
import './App.css';

// Main App content component that has access to all context providers
const AppContent = () => {
  const { isDarkMode, toggleTheme } = useTheme();
  const { notifications, removeNotification } = useNotificationContext();
  const { account, isLoading, connectWallet } = useWalletContext();
  
  return (
    <div className="App">
      <Header 
        title="Decentralized Exchange" 
        isDarkMode={isDarkMode} 
        toggleTheme={toggleTheme}
        account={account}
        isLoading={isLoading}
        connectWallet={connectWallet}
      />
      
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          {/* Add more routes here as needed */}
        </Routes>
        
        <Notifications 
          notifications={notifications} 
          removeNotification={removeNotification} 
        />
      </main>
      
      <Footer repoUrl="https://github.com/iiyyll01lin/cartesi-stock-exchanger/tree/202504-rc1" />
    </div>
  );
};

// The main App component with all providers
const App = () => {
  return (
    <Router>
      <ThemeProvider>
        <NotificationProvider>
          <WalletProvider>
            <ContractProvider>
              <AppContent />
            </ContractProvider>
          </WalletProvider>
        </NotificationProvider>
      </ThemeProvider>
    </Router>
  );
};

export default App;