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
    <div className="section">
      <h2>Deposit & Withdraw</h2>
      <div className="deposit-withdraw-form">
        <div className="form-section">
          <h3>ETH</h3>
          <div className="balance-info">
            <strong>Exchange Balance:</strong> {parseFloat(exchangeEthBalance).toFixed(4)} ETH
            {!isConnectedToCorrectNetwork && (
              <div className="warning-message">
                * This balance may be outdated. Connect to Hardhat Network to see accurate balances.
              </div>
            )}
            <div className="helper-note">
              <small>* ETH must be deposited to the exchange before placing buy orders. The cost of a buy order will be deducted from your exchange balance.</small>
            </div>
          </div>
          <div className="action-row">
            <div className="input-group">
              <input
                type="number"
                value={ethDepositAmount}
                onChange={(e) => setEthDepositAmount(e.target.value)}
                placeholder="Amount"
                min="0"
                step="0.01"
              />
              <button 
                onClick={handleDepositETH} 
                disabled={isDepositing || !ethDepositAmount || parseFloat(ethDepositAmount) <= 0}
                className="primary-button"
                title="Deposit ETH to the exchange contract"
              >
                {isDepositing ? 'Depositing...' : 'Deposit ETH'}
              </button>
            </div>
          </div>
          <div className="action-row">
            <div className="input-group">
              <input
                type="number"
                value={ethWithdrawAmount}
                onChange={(e) => setEthWithdrawAmount(e.target.value)}
                placeholder="Amount"
                min="0"
                step="0.01"
              />
              <button 
                onClick={maxEthWithdraw} 
                className="secondary-button"
              >
                Max
              </button>
              <button 
                onClick={handleWithdrawETH} 
                disabled={isWithdrawing || !ethWithdrawAmount || parseFloat(ethWithdrawAmount) <= 0}
                className="primary-button"
              >
                {isWithdrawing ? 'Withdrawing...' : 'Withdraw ETH'}
              </button>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3>{tokenSymbol}</h3>
          <div className="balance-info">
            <strong>Exchange Balance:</strong> {parseFloat(exchangeTokenBalance).toFixed(4)} {tokenSymbol}
            {!isConnectedToCorrectNetwork && (
              <div className="warning-message">
                * This balance may be outdated. Connect to Hardhat Network to see accurate balances.
              </div>
            )}
          </div>
          <div className="action-row">
            <div className="input-group">
              <input
                type="number"
                value={tokenDepositAmount}
                onChange={(e) => setTokenDepositAmount(e.target.value)}
                placeholder="Amount"
                min="0"
                step="1"
              />
              <button 
                onClick={handleDepositToken} 
                disabled={isDepositing || !tokenDepositAmount || parseFloat(tokenDepositAmount) <= 0}
                className="primary-button"
              >
                {isDepositing ? 'Depositing...' : `Deposit ${tokenSymbol}`}
              </button>
            </div>
          </div>
          <div className="action-row">
            <div className="input-group">
              <input
                type="number"
                value={tokenWithdrawAmount}
                onChange={(e) => setTokenWithdrawAmount(e.target.value)}
                placeholder="Amount"
                min="0"
                step="1"
              />
              <button 
                onClick={maxTokenWithdraw} 
                className="secondary-button"
              >
                Max
              </button>
              <button 
                onClick={handleWithdrawToken} 
                disabled={isWithdrawing || !tokenWithdrawAmount || parseFloat(tokenWithdrawAmount) <= 0}
                className="primary-button"
              >
                {isWithdrawing ? 'Withdrawing...' : `Withdraw ${tokenSymbol}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DepositWithdrawForm;
