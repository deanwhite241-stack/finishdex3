import React from 'react'
import { Wallet, LogOut } from 'lucide-react'
import { useWallet } from '../../contexts/WalletContext'

const WalletButton: React.FC = () => {
  const { account, isConnected, isConnecting, connectWallet, disconnectWallet } = useWallet()

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  if (isConnected && account) {
    return (
      <div className="flex items-center space-x-2">
        <div className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 sm:px-3 py-1 sm:py-2 rounded-lg text-xs sm:text-sm font-medium">
          {formatAddress(account)}
        </div>
        <button
          onClick={disconnectWallet}
          className="p-1 sm:p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
          aria-label="Disconnect wallet"
        >
          <LogOut className="w-3 h-3 sm:w-4 sm:h-4" />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={connectWallet}
      disabled={isConnecting}
      className="btn-primary flex items-center space-x-1 sm:space-x-2 text-xs sm:text-sm py-1 sm:py-2 px-2 sm:px-4"
    >
      <Wallet className="w-3 h-3 sm:w-4 sm:h-4" />
      <span>{isConnecting ? 'Connecting...' : 'Connect Wallet'}</span>
    </button>
  )
}

export default WalletButton
