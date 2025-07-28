import React, { useState } from 'react'
import { Search, ChevronDown } from 'lucide-react'
import { Token, getTokensByChain } from '../constants/tokens'
import { useWallet } from '../contexts/WalletContext'

interface TokenSelectorProps {
  selectedToken: Token | null
  onTokenSelect: (token: Token) => void
  label: string
}

const TokenSelector: React.FC<TokenSelectorProps> = ({
  selectedToken,
  onTokenSelect,
  label
}) => {
  const { chainId } = useWallet()
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const availableTokens = chainId ? getTokensByChain(chainId) : []
  const filteredTokens = availableTokens.filter(token =>
    token.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
    token.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleTokenSelect = (token: Token) => {
    onTokenSelect(token)
    setIsOpen(false)
    setSearchTerm('')
  }

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {label}
      </label>
      
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-2 sm:p-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
      >
        {selectedToken ? (
          <div className="flex items-center space-x-2 sm:space-x-3">
            <img
              src={selectedToken.logoURI}
              alt={selectedToken.symbol}
              className="w-5 h-5 sm:w-6 sm:h-6 rounded-full"
              onError={(e) => {
                e.currentTarget.src = `https://via.placeholder.com/24/3B82F6/FFFFFF?text=${selectedToken.symbol[0] || 'T'}`
              }}
            />
            <div className="text-left">
              <div className="font-medium text-sm sm:text-base">{selectedToken.symbol}</div>
              <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate max-w-[120px] sm:max-w-none">{selectedToken.name}</div>
            </div>
          </div>
        ) : (
          <span className="text-gray-500 dark:text-gray-400 text-sm sm:text-base">Select a token</span>
        )}
        <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 max-h-60 sm:max-h-80 overflow-hidden">
          <div className="p-2 sm:p-3 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search tokens..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 sm:pl-10 pr-2 sm:pr-3 py-1.5 sm:py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>
          </div>
          
          <div className="max-h-40 sm:max-h-60 overflow-y-auto">
            {filteredTokens.length > 0 ? (
              filteredTokens.map((token) => (
                <button
                  key={`${token.chainId}-${token.address}`}
                  onClick={() => handleTokenSelect(token)}
                  className="w-full flex items-center space-x-2 sm:space-x-3 p-2 sm:p-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <img
                    src={token.logoURI}
                    alt={token.symbol || 'Token'}
                    className="w-5 h-5 sm:w-6 sm:h-6 rounded-full"
                    onError={(e) => {
                      e.currentTarget.src = `https://via.placeholder.com/32/3B82F6/FFFFFF?text=${token.symbol && token.symbol.length > 0 ? token.symbol[0] : 'T'}`;
                    }}
                  />
                  <div className="text-left flex-1 min-w-0">
                    <div className="font-medium text-sm sm:text-base">{token.symbol || 'Unknown Token'}</div>
                    <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate max-w-[150px] sm:max-w-none">{token.name || 'Unknown Token'}</div>
                  </div>
                </button>
              ))
            ) : (
              <div className="p-3 sm:p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                No tokens found
              </div>
            )}
          </div>
        </div>
      )}

      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-transparent"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}

export default TokenSelector
