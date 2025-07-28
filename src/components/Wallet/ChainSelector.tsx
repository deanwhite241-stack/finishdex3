import React, { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useWallet } from '../../contexts/WalletContext'
import { CHAIN_CONFIG, isTestnetChain } from '../../constants/chainConfig'
import { useEffect } from 'react'

const ChainSelector: React.FC = () => {
  const { chainId, switchChain } = useWallet()
  const [isOpen, setIsOpen] = useState(false)
  const [showTestnets, setShowTestnets] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Get current chain info
  const currentChainConfig = chainId ? CHAIN_CONFIG[chainId] : null
  const currentIsTestnet = chainId ? isTestnetChain(chainId) : false

  // Clear error message when dropdown closes
  useEffect(() => {
    if (!isOpen) {
      setErrorMessage(null);
    }
  }, [isOpen]);

  const handleChainSelect = async (targetChainId: number) => {
    try {
      setIsProcessing(true);
      setErrorMessage(null);
      
      const success = await switchChain(targetChainId);
      if (!success) {
        setErrorMessage(`Failed to switch to ${CHAIN_CONFIG[targetChainId]?.chainName || 'network'}. Please try adding the network manually in your wallet.`);
      } else {
        setIsOpen(false);
      }
    } catch (error) {
      console.error('Failed to switch chain:', error);
      setErrorMessage('Failed to switch network. Please try again or add the network manually in your wallet.');
    } finally {
      setIsProcessing(false);
    }
  }

  // Get chains based on testnet toggle
  const displayedChains = Object.entries(CHAIN_CONFIG)
    .filter(([_, config]) => config.isTestnet === showTestnets)
    .map(([id, config]) => ({
      id: parseInt(id),
      name: config.chainName,
      icon: getChainIcon(parseInt(id)),
      isTestnet: config.isTestnet
    }));

  // Helper function to get chain icon
  function getChainIcon(chainId: number) {
    const icons: Record<number, string> = {
      1: '⟠', // Ethereum
      5: '⟠', // Goerli
      56: '🟡', // BSC
      97: '🟡', // BSC Testnet
      137: '🟣', // Polygon
      80001: '🟣', // Mumbai
      42161: '🔵', // Arbitrum
      43114: '🔺', // Avalanche
      43113: '🔺', // Fuji
      250: '👻', // Fantom
      4002: '👻', // Fantom Testnet
      2612: '🟢', // ESR Mainnet
      25062019: '🟢', // ESR Testnet
    };
    return icons[chainId] || '🔗';
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center space-x-1 sm:space-x-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-colors ${isProcessing ? 'opacity-75 cursor-not-allowed' : ''}`}
      >
        {currentChainConfig ? (
          <>
            <span className="text-base sm:text-lg">{getChainIcon(chainId!)}</span>
            <span className="font-medium flex items-center text-sm sm:text-base">
              {currentChainConfig.chainName}
              {currentIsTestnet && (
                <span className="ml-1 text-xs px-1 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded-full hidden sm:inline-block">
                  Testnet
                </span>
              )}
            </span>
          </>
        ) : (
          <span className="font-medium text-sm sm:text-base">Unknown</span>
        )}
        <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 min-w-[200px] sm:min-w-[250px] w-screen max-w-[calc(100vw-2rem)] sm:max-w-none">
          <div className="p-1.5 sm:p-2 border-b border-gray-200 dark:border-gray-700">
            <label className="flex items-center text-sm">
              <input 
                type="checkbox" 
                checked={showTestnets} 
                onChange={() => setShowTestnets(!showTestnets)}
                className="mr-2"
              />
              Show Testnets
            </label>
          </div>

          {errorMessage && (
            <div className="p-1.5 sm:p-2 border-b border-gray-200 dark:border-gray-700">
              <div className="text-xs sm:text-sm text-red-600 dark:text-red-400 p-1.5 sm:p-2 bg-red-100 dark:bg-red-900/20 rounded">
                {errorMessage}
              </div>
            </div>
          )}
          
          
          <div className="max-h-40 sm:max-h-60 overflow-y-auto">
            {displayedChains.map(chain => (
              <button
                key={chain.id}
                onClick={() => handleChainSelect(chain.id)}
                className={`w-full flex items-center justify-between px-2 sm:px-3 py-1.5 sm:py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                  isProcessing ? 'opacity-50 cursor-not-allowed' : ''
                } ${
                  chainId === chain.id ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400' : ''
                }`}
              >
                <div className="flex items-center space-x-1 sm:space-x-2">
                  <span className="text-base sm:text-lg">{chain.icon}</span>
                  <span className="font-medium text-sm sm:text-base">{chain.name}</span>
                </div>
                {chain.isTestnet && (
                  <span className="text-xs px-1 sm:px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded-full">
                    Testnet
                  </span>
                )}
              </button>
            ))}
            {chainId && CHAIN_CONFIG && !CHAIN_CONFIG[chainId] && (
              <div className="px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                Unknown Chain ({chainId})
              </div>
            )}
          </div>
        </div>
      )}

      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-transparent"
          onClick={() => !isProcessing && setIsOpen(false)}
        />
      )}
    </div>
  )
}

export default ChainSelector
