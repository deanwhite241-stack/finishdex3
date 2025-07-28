import React from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useWallet } from '../../contexts/WalletContext'
import WalletButton from '../Wallet/WalletButton'
import ChainSelector from '../Wallet/ChainSelector'
import NetworkStatus from '../NetworkStatus'

interface HeaderProps {
  testnetMode: boolean;
}

const Header: React.FC<HeaderProps> = ({ testnetMode }) => {
  const { theme, toggleTheme } = useTheme()
  const { isConnected } = useWallet()

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
      <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1 sm:space-x-2">
            <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs sm:text-sm">DB</span>
            </div>
            <div className="flex items-center">
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
                DexBridge
              </h1>
              {testnetMode && (
                <span className="ml-1 sm:ml-2 text-[10px] sm:text-xs px-1 sm:px-2 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded-full">
                  Testnet Mode
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-4">
            {isConnected && (
              <>
                <NetworkStatus />
                <ChainSelector />
              </>
            )}
            
            <button
              onClick={toggleTheme}
              className="p-1 sm:p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'light' ? (
                <Moon className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-300" />
              ) : (
                <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-300" />
              )}
            </button>

            <WalletButton />
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
