import React from 'react';
import { CHAIN_CONFIG } from '../../utils/constants';

interface ConnectionErrorMessageProps {
  checkConnections: () => void;
}

const ConnectionErrorMessage: React.FC<ConnectionErrorMessageProps> = ({ checkConnections }) => {
  return (
    <div className="connection-error">
      <h3>Connection Issues Detected</h3>
      <div className="error-details">
        <p>There seem to be connection issues with the blockchain or API server. Please check the following:</p>
        <ul>
          <li>Is MetaMask installed and unlocked?</li>
          <li>Is the Hardhat node running? Start it with <code>npx hardhat node</code></li>
          <li>Are the contracts deployed? Run <code>npx hardhat run --network localhost scripts/deploy.js</code></li>
          <li>Is the backend API server running? Start it with <code>cd backend && python server.py</code></li>
          <li>Is MetaMask connected to the Hardhat network (Chain ID: {CHAIN_CONFIG.chainId})?</li>
          <li><strong>Account Switching Issue:</strong> If you've changed accounts in MetaMask, click "Reconnect Wallet" to sync the UI.</li>
        </ul>
        <div className="connection-actions">
          <button onClick={checkConnections} className="check-button">
            Check Connections
          </button>
          <button onClick={() => window.location.reload()} className="retry-button">
            Refresh Page
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConnectionErrorMessage;
