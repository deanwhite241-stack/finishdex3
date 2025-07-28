import React from 'react';
import { useWallet } from '../contexts/WalletContext';
import { isTestnetChain, getMainnetChains, getTestnetChains } from '../constants/chainConfig';

interface TestnetModeToggleProps {
  testnetMode: boolean;
  setTestnetMode: (mode: boolean) => void;
}

const TestnetModeToggle: React.FC<TestnetModeToggleProps> = ({ testnetMode, setTestnetMode }) => {
  const { isConnected, switchChain, chainId } = useWallet();

  const handleToggle = async (): Promise<void> => {
    const newMode: boolean = !testnetMode;
    setTestnetMode(newMode);
    
    // If wallet is connected, try to switch to appropriate chain type
    if (isConnected) {
      try {
        // Get available chains based on the new mode
        const availableChains = newMode ? getTestnetChains() : getMainnetChains()
        
        // If we have chains available, switch to the first one
        if (availableChains.length > 0) {
          // If current chain is already of the correct type, don't switch
          const currentIsCorrectType: boolean = chainId ? isTestnetChain(chainId) === newMode : false
          if (!currentIsCorrectType) {
            try {
              await switchChain(availableChains[0].id)
            } catch (switchError) {
              console.error('Failed to switch network:', switchError)
              // Continue anyway, the user can manually switch later
            }
          }
        } else {
          console.error(`No ${newMode ? 'testnet' : 'mainnet'} chains available`)
        }
      } catch (error: any) {
        console.error('Failed to switch network type:', error)
        // Continue anyway, the NetworkSwitcher will show a message to the user
      }
    }
  }

  return (
    <div className="flex items-center space-x-2">
      <span className={`text-sm font-medium ${!testnetMode ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
        Mainnet
      </span>
      <button
        onClick={handleToggle}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
          testnetMode ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            testnetMode ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
      <span className={`text-sm font-medium ${testnetMode ? 'text-purple-600 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400'}`}>
        Testnet
      </span>
    </div>
  );
};

export default TestnetModeToggle;
