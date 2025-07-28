import React from 'react';
import { useWallet } from '../contexts/WalletContext';
import { getChainName, isTestnetChain } from '../constants/chainConfig';

const NetworkStatus: React.FC = () => {
  const { isConnected, chainId } = useWallet()
  
  if (!isConnected || !chainId) {
    return null
  }
  
  const networkName: string = getChainName(chainId) || 'Unknown Network'
  const isTestnet: boolean = isTestnetChain(chainId) || false
  
  return (
    <div className={`px-3 py-1 rounded-full text-sm font-medium ${
      isTestnet
        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300'
        : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' 
    }`}>
      <span className="hidden sm:inline">{networkName}</span>
      <span className="sm:hidden">{networkName?.split(' ')[0] || 'Unknown'}</span>
      {isTestnet && <span className="ml-1 hidden sm:inline">(Testnet)</span>}
    </div>
  )
}

export default NetworkStatus
