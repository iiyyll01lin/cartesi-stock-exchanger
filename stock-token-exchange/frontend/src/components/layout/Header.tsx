import React from 'react';

interface HeaderProps {
  title: string;
  isDarkMode: boolean;
  toggleTheme: () => void;
  account: string | null;
  isLoading: boolean;
  connectWallet: () => Promise<void>;
}

const Header: React.FC<HeaderProps> = ({ 
  title, 
  isDarkMode, 
  toggleTheme, 
  account, 
  isLoading, 
  connectWallet 
}) => {
  return (
    <header>
      <h1>{title}</h1>
      <div className="header-controls">
        {!account && (
          <button 
            onClick={connectWallet} 
            className="connect-button" 
            disabled={isLoading}
          >
            Connect MetaMask
          </button>
        )}
        <div className="theme-toggle" onClick={toggleTheme}>
          {isDarkMode ? '🌙' : '☀️'}
        </div>
      </div>
    </header>
  );
};

export default Header;
