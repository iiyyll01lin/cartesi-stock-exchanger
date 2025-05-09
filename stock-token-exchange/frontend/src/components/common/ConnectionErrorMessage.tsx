import React, { useState, useEffect, useRef } from 'react';
import { CHAIN_CONFIG } from '../../utils/constants';
import './ConnectionErrorMessage.css';

interface ConnectionErrorMessageProps {
  checkConnections: () => void;
  errorMessage?: string;
}

const ConnectionErrorMessage: React.FC<ConnectionErrorMessageProps> = ({ 
  checkConnections,
  errorMessage = "There seems to be an issue with the connection to the blockchain."
}) => {
  const [isExpanded, setIsExpanded] = useState(true); // Start expanded by default when rendered
  const [isBadgeVisible, setIsBadgeVisible] = useState(false); // Badge is hidden when panel is initially expanded
  const [showToast, setShowToast] = useState(true);
  const errorRef = useRef<HTMLDivElement | null>(null);

  const closePanel = () => {
    setIsExpanded(false);
    setIsBadgeVisible(true); // Show badge when panel is closed
  };

  const showErrorPanel = () => {
    setIsExpanded(true);
    setIsBadgeVisible(false); // Hide badge when panel is shown
  };

  // Effect for one-time toast auto-hide
  useEffect(() => {
    const toastTimer = setTimeout(() => {
      setShowToast(false);
    }, 10000); // Auto-hide toast after 10 seconds
    return () => clearTimeout(toastTimer);
  }, []); // Runs once on mount

  // Effect for managing panel expansion, auto-collapse, click outside, and body class
  useEffect(() => {
    let autoCollapseTimerId: NodeJS.Timeout | null = null;

    if (isExpanded) {
      document.body.classList.add('has-error-message');
      // Auto-collapse the panel after 8 seconds if it\'s expanded
      autoCollapseTimerId = setTimeout(() => {
        closePanel(); 
      }, 8000);
    } else {
      document.body.classList.remove('has-error-message');
    }

    const handleClickOutside = (event: MouseEvent) => {
      const targetElement = event.target as HTMLElement;

      // If the click was directly on the overlay, let the overlay's own onClick handler manage it.
      if (targetElement.classList.contains('error-overlay')) {
        return;
      }

      const badgeClicked = targetElement.closest('.error-badge');

      // If the panel is expanded, and the click was outside the panel's content, and not on the badge
      if (isExpanded && errorRef.current && !errorRef.current.contains(targetElement as Node) && !badgeClicked) {
        // Manually closing, so clear the auto-collapse timer
        if (autoCollapseTimerId) {
          clearTimeout(autoCollapseTimerId);
        }
        closePanel();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      if (autoCollapseTimerId) clearTimeout(autoCollapseTimerId);
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.classList.remove('has-error-message'); // Ensure cleanup on unmount
    };
  }, [isExpanded]); // Re-run this effect when isExpanded changes

  const toggleExpanded = () => {
    if (isExpanded) {
      closePanel();
    } else {
      showErrorPanel();
    }
  };
  
  return (
    <>
      {/* Critical error toast notification at the top */}
      {showToast && (
        <div className="critical-error-toast">
          <span className="toast-icon" aria-hidden="true">!</span>
          <span className="toast-message">Connection issues detected. Check wallet connection.</span>
          <button 
            className="toast-close" 
            onClick={() => setShowToast(false)}
            aria-label="Close notification"
          >
            ×
          </button>
        </div>
      )}
      
      {/* Semi-transparent overlay for better contrast and for closing the error message */}
      <div 
        className={`error-overlay ${isExpanded ? 'visible' : ''}`}
        onClick={closePanel} // Use closePanel to ensure badge visibility is handled
      ></div>
      
      <div 
        ref={errorRef}
        className={`connection-error ${isExpanded ? 'visible' : ''}`}
        aria-live="assertive"
      >
        <div className="connection-error-header">
          <h3 onClick={toggleExpanded}>
            <span className="connection-error-icon" aria-hidden="true">!</span>
            Wallet Connection Error
          </h3>
          <button 
            className="connection-error-close" 
            onClick={closePanel} // Use closePanel here
            aria-label="Close error message"
          >
            ×
          </button>
        </div>
        <div className={`error-details ${isExpanded ? 'expanded' : ''}`}>
          <p>{errorMessage}</p>
          <ul>
            <li>Is MetaMask installed and unlocked?</li>
            <li>Is the Hardhat node running? Start it with <code>npx hardhat node</code></li>
            <li>Are the contracts deployed? Run <code>npx hardhat run --network localhost scripts/deploy.js</code></li>
            <li>Is the backend API server running? Start it with <code>cd backend && python server.py</code></li>
            <li>Is MetaMask connected to the Hardhat network (Chain ID: {CHAIN_CONFIG.chainId})?</li>
            <li><strong>Account switching issues:</strong> If you changed accounts in MetaMask, click "Refresh Wallet" to sync the UI.</li>
          </ul>
          <div className="connection-actions">
            <button onClick={checkConnections} className="wallet-button primary-button">
              Diagnose Connection Issues
            </button>
            <button onClick={() => window.location.reload()} className="wallet-button reconnect-button">
              Reload Page
            </button>
          </div>
        </div>
      </div>
      
      {/* Floating error badge that appears when the main error panel is collapsed */}
      <div 
        className={`error-badge ${!isExpanded && isBadgeVisible ? 'visible' : ''}`}
        onClick={showErrorPanel} // Use showErrorPanel to ensure badge visibility is handled
        title="Connection issues detected. Click to view details."
        aria-label="Connection issues detected. Click to view details."
      >
        <span aria-hidden="true">!</span>
      </div>
    </>
  );
};

export default ConnectionErrorMessage;
