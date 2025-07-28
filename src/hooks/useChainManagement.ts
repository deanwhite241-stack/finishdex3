import { useState, useCallback } from 'react';
import { CHAIN_CONFIG } from '../constants/chainConfig';

interface UseChainManagementReturn {
  addNetwork: (chainId: number) => Promise<boolean>;
  switchNetwork: (chainId: number) => Promise<boolean>;
  ensureSupportedChain: (testnetMode: boolean, preferredChainId?: number) => Promise<boolean>;
  isProcessing: boolean;
  error: string | null;
}

/**
 * Hook for managing chain switching and adding in MetaMask
 */
export const useChainManagement = (): UseChainManagementReturn => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Adds a network to MetaMask
   * @param {number} chainId - The chain ID to add
   * @returns {Promise<boolean>} - Whether the operation was successful
   */
  const addNetwork = useCallback(async (chainId: number): Promise<boolean> => {
    if (!(window as any).ethereum) {
      setError('MetaMask is not installed');
      return false;
    }

    const chainConfig = CHAIN_CONFIG[chainId];
    if (!chainConfig) {
      setError(`Chain configuration not found for chain ID: ${chainId}`);
      return false;
    }

    setIsProcessing(true);
    setError(null);

    try {
      await (window as any).ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: chainConfig.chainId,
            chainName: chainConfig.chainName,
            nativeCurrency: chainConfig.nativeCurrency,
            rpcUrls: chainConfig.rpcUrls,
            blockExplorerUrls: chainConfig.blockExplorerUrls
          }
        ]
      });
      return true;
    } catch (err: any) {
      console.error('Error adding network to MetaMask:', err);
      setError(err.message || 'Failed to add network to MetaMask');
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  /**
   * Switches to a network in MetaMask
   * @param {number} chainId - The chain ID to switch to
   * @returns {Promise<boolean>} - Whether the operation was successful
   */
  const switchNetwork = useCallback(async (chainId: number): Promise<boolean> => {
    if (!(window as any).ethereum) {
      setError('MetaMask is not installed');
      return false;
    }

    const chainConfig = CHAIN_CONFIG[chainId];
    if (!chainConfig) {
      setError(`Chain configuration not found for chain ID: ${chainId}`);
      return false;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // First try to switch to the network
      await (window as any).ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainConfig.chainId }]
      }).catch((error: any) => {
        // If the chain hasn't been added to MetaMask, this will throw an error
        if (error.code === 4902) {
          throw error; // Re-throw to be caught by the outer catch
        }
        console.error('Error switching network:', error);
        throw new Error(`Failed to switch network: ${error.message || 'Unknown error'}`);
      });
      
      // If we get here, the switch was successful
      return true;
    } catch (err: any) {
      // This error code indicates that the chain has not been added to MetaMask
      if (err.code === 4902) {
        try {
          // Try to add the network to MetaMask
          await (window as any).ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: chainConfig.chainId,
                chainName: chainConfig.chainName,
                nativeCurrency: chainConfig.nativeCurrency,
                rpcUrls: chainConfig.rpcUrls,
                blockExplorerUrls: chainConfig.blockExplorerUrls
              }
            ]
          }).catch((addError: any) => {
            console.error('Error adding network to MetaMask:', addError);
            throw new Error(`Failed to add network: ${addError.message || 'Unknown error'}`);
          });
            // Try switching again after adding
            await (window as any).ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: chainConfig.chainId }]
            }).catch((switchError: any) => {
            console.error('Error switching to newly added network:', switchError);
            throw new Error(`Failed to switch to newly added network: ${switchError.message || 'Unknown error'}`);
          });
          return true;
        } catch (addError: any) {
          console.error('Error adding then switching network:', addError);
          setError(addError.message || 'Failed to add then switch network');
          return false;
        }
      } else {
        console.error('Error switching network in MetaMask:', err);
        setError(err.message || 'Failed to switch network in MetaMask');
        return false;
      }
    } finally {
      setIsProcessing(false);
    }
  }, []);

  /**
   * Ensures the user is connected to a supported chain
   * @param {boolean} testnetMode - Whether to check for testnet or mainnet chains
   * @param {number} preferredChainId - The preferred chain ID to switch to
   * @returns {Promise<boolean>} - Whether the operation was successful
   */
  const ensureSupportedChain = useCallback(async (testnetMode: boolean, preferredChainId?: number): Promise<boolean> => {
    if (!(window as any).ethereum) {
      setError('MetaMask is not installed');
      return false;
    }

    try {
      // Get current chain ID
      const chainIdHex = await (window as any).ethereum.request({ method: 'eth_chainId' }).catch((error: any) => {
        console.error('Failed to get chain ID:', error);
        throw error;
      });
      const currentChainId: number = parseInt(chainIdHex, 16);
      
      // Check if current chain is supported and matches the mode (testnet/mainnet)
      const chainConfig = CHAIN_CONFIG[currentChainId];
      if (chainConfig && chainConfig.isTestnet === testnetMode) {
        return true; // Already on a supported chain for the current mode
      }

      // If preferred chain is provided and it's valid for the current mode, switch to it
      if (preferredChainId) {
        const preferredConfig = CHAIN_CONFIG[preferredChainId];
        if (preferredConfig && preferredConfig.isTestnet === testnetMode) {
          return await switchNetwork(preferredChainId);
        }
      }

      // Otherwise, switch to the first available chain for the current mode
      const availableChains: number[] = Object.keys(CHAIN_CONFIG)
        .filter((id: string) => CHAIN_CONFIG[parseInt(id)].isTestnet === testnetMode)
        .map((id: string) => parseInt(id));

      if (availableChains.length > 0) {
        return await switchNetwork(availableChains[0]);
      }

      setError(`No supported ${testnetMode ? 'testnet' : 'mainnet'} chains found`);
      return false;
    } catch (err: any) {
      console.error('Error ensuring supported chain:', err);
      setError(err.message || 'Failed to ensure supported chain');
      return false;
    }
  }, [switchNetwork]);

  return {
    addNetwork,
    switchNetwork,
    ensureSupportedChain,
    isProcessing,
    error
  };
};
