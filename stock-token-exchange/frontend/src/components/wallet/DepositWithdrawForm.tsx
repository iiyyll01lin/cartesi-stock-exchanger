import React, { useState } from 'react';

interface DepositWithdrawFormProps {
  tokenSymbol: string;
  onDepositETH: (amount: string) => Promise<void>;
  onWithdrawETH: (amount: string) => Promise<void>;
  onDepositToken: (amount: string) => Promise<void>;
  onWithdrawToken: (amount: string) => Promise<void>;
  isDepositing: boolean;
  isWithdrawing: boolean;
  exchangeEthBalance: string;
  exchangeTokenBalance: string;
  isConnectedToCorrectNetwork?: boolean;
}

const DepositWithdrawForm: React.FC<DepositWithdrawFormProps> = ({
  tokenSymbol,
  onDepositETH,
  onWithdrawETH,
  onDepositToken,
  onWithdrawToken,
  isDepositing,
  isWithdrawing,
  exchangeEthBalance,
  exchangeTokenBalance,
  isConnectedToCorrectNetwork = true
}) => {
  const [ethDepositAmount, setEthDepositAmount] = useState<string>('');
  const [ethWithdrawAmount, setEthWithdrawAmount] = useState<string>('');
  const [tokenDepositAmount, setTokenDepositAmount] = useState<string>('');
  const [tokenWithdrawAmount, setTokenWithdrawAmount] = useState<string>('');

  const handleDepositETH = async () => {
    if (!ethDepositAmount || parseFloat(ethDepositAmount) <= 0) return;
    await onDepositETH(ethDepositAmount);
    setEthDepositAmount('');
  };

  const handleWithdrawETH = async () => {
    if (!ethWithdrawAmount || parseFloat(ethWithdrawAmount) <= 0) return;
    await onWithdrawETH(ethWithdrawAmount);
    setEthWithdrawAmount('');
  };

  const handleDepositToken = async () => {
    if (!tokenDepositAmount || parseFloat(tokenDepositAmount) <= 0) return;
    await onDepositToken(tokenDepositAmount);
    setTokenDepositAmount('');
  };

  const handleWithdrawToken = async () => {
    if (!tokenWithdrawAmount || parseFloat(tokenWithdrawAmount) <= 0) return;
    await onWithdrawToken(tokenWithdrawAmount);
    setTokenWithdrawAmount('');
  };

  const maxEthWithdraw = () => {
    const balance = parseFloat(exchangeEthBalance);
    if (balance > 0) {
      setEthWithdrawAmount(exchangeEthBalance);
    }
  };

  const maxTokenWithdraw = () => {
    const balance = parseFloat(exchangeTokenBalance);
    if (balance > 0) {
      setTokenWithdrawAmount(exchangeTokenBalance);
    }
  };

  return (
    <div className="trade-section deposit-withdraw-section">
      <div className="section-header">
        <h2>Deposit & Withdraw</h2>
      </div>
      
      <div className="section-content">
        {/* ETH Section */}
        <div className="asset-section eth-section">
          <div className="asset-header">
            <h3 className="asset-title">ETH</h3>
            <div className="asset-balance">
              <div className="balance-display">
                <span className="balance-label">Exchange Balance:</span>
                <span className="balance-value">{parseFloat(exchangeEthBalance).toFixed(4)} ETH</span>
              </div>
              {!isConnectedToCorrectNetwork && (
                <div className="warning-message">
                  * This balance may be outdated. Connect to Hardhat Network to see accurate balances.
                </div>
              )}
            </div>
            <div className="helper-note">
              * ETH must be deposited to the exchange before placing buy orders. The cost of a buy order will be deducted from your exchange balance.
            </div>
          </div>
          
          <div className="asset-actions">
            <div className="action-container deposit-container">
              <div className="action-label">Deposit ETH</div>
              <div className="improved-input-group">
                <div className="input-with-max">
                  <input
                    type="number"
                    value={ethDepositAmount}
                    onChange={(e) => setEthDepositAmount(e.target.value)}
                    placeholder="Enter amount to deposit"
                    min="0"
                    step="0.01"
                    className="wide-input"
                  />
                </div>
                <button 
                  onClick={handleDepositETH} 
                  disabled={isDepositing || !ethDepositAmount || parseFloat(ethDepositAmount) <= 0}
                  className="action-button deposit-button"
                >
                  {isDepositing ? 'Depositing...' : 'Deposit'}
                </button>
              </div>
            </div>
            
            <div className="action-container withdraw-container">
              <div className="action-label">Withdraw ETH</div>
              <div className="improved-input-group">
                <div className="input-with-max">
                  <input
                    type="number"
                    value={ethWithdrawAmount}
                    onChange={(e) => setEthWithdrawAmount(e.target.value)}
                    placeholder="Enter amount to withdraw"
                    min="0"
                    step="0.01"
                    className="wide-input"
                  />
                  <button 
                    onClick={maxEthWithdraw} 
                    className="max-button"
                    title="Use maximum available balance"
                  >
                    Max
                  </button>
                </div>
                <button 
                  onClick={handleWithdrawETH} 
                  disabled={isWithdrawing || !ethWithdrawAmount || parseFloat(ethWithdrawAmount) <= 0}
                  className="action-button withdraw-button"
                >
                  {isWithdrawing ? 'Withdrawing...' : 'Withdraw'}
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Token Section */}
        <div className="asset-section token-section">
          <div className="asset-header">
            <h3 className="asset-title">{tokenSymbol}</h3>
            <div className="asset-balance">
              <div className="balance-display">
                <span className="balance-label">Exchange Balance:</span>
                <span className="balance-value">{parseFloat(exchangeTokenBalance || '0').toFixed(4)} {tokenSymbol}</span>
              </div>
              {!isConnectedToCorrectNetwork && (
                <div className="warning-message">
                  * This balance may be outdated. Connect to Hardhat Network to see accurate balances.
                </div>
              )}
            </div>
            <div className="helper-note">
              * Tokens must be deposited to the exchange before placing sell orders or they won't appear in your Exchange Balance.
            </div>
          </div>
          
          <div className="asset-actions">
            <div className="action-container deposit-container">
              <div className="action-label">Deposit {tokenSymbol}</div>
              <div className="improved-input-group">
                <div className="input-with-max">
                  <input
                    type="number"
                    value={tokenDepositAmount}
                    onChange={(e) => setTokenDepositAmount(e.target.value)}
                    placeholder="Enter amount to deposit"
                    min="0"
                    step="1"
                    className="wide-input"
                  />
                </div>
                <button 
                  onClick={handleDepositToken} 
                  disabled={isDepositing || !tokenDepositAmount || parseFloat(tokenDepositAmount) <= 0}
                  className="action-button deposit-button"
                >
                  {isDepositing ? 'Depositing...' : 'Deposit'}
                </button>
              </div>
            </div>
            
            <div className="action-container withdraw-container">
              <div className="action-label">Withdraw {tokenSymbol}</div>
              <div className="improved-input-group">
                <div className="input-with-max">
                  <input
                    type="number"
                    value={tokenWithdrawAmount}
                    onChange={(e) => setTokenWithdrawAmount(e.target.value)}
                    placeholder="Enter amount to withdraw"
                    min="0"
                    step="1"
                    className="wide-input"
                  />
                  <button 
                    onClick={maxTokenWithdraw} 
                    className="max-button"
                    title="Use maximum available balance"
                  >
                    Max
                  </button>
                </div>
                <button 
                  onClick={handleWithdrawToken} 
                  disabled={isWithdrawing || !tokenWithdrawAmount || parseFloat(tokenWithdrawAmount) <= 0}
                  className="action-button withdraw-button"
                >
                  {isWithdrawing ? 'Withdrawing...' : 'Withdraw'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DepositWithdrawForm;
