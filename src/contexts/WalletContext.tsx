import React, { createContext, useContext, useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { CHAIN_CONFIG } from '../constants/chainConfig'

// Extend Window interface for TypeScript
declare global {
  interface Window {
    ethereum?: any
  }
}

interface WalletContextType {
  account: string | null
  chainId: number | null
  provider: ethers.BrowserProvider | null
  isConnected: boolean
  isConnecting: boolean
  connectWallet: () => Promise<void>
  disconnectWallet: () => void
  switchChain: (chainId: number) => Promise<boolean>
}

const WalletContext = createContext<WalletContextType | undefined>(undefined)

export const useWallet = () => {
  const context = useContext(WalletContext)
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider')
  }
  return context
}

interface WalletProviderProps {
  children: React.ReactNode
}

export const WalletProvider: React.FC<WalletProviderProps> = ({ children }) => {
  const [account, setAccount] = useState<string | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)

  const isConnected = !!account

  const connectWallet = async () => {
    if (typeof window.ethereum === 'undefined') {
      alert('Please install MetaMask or use a Web3-enabled browser!')
      return
    }

    try {
      setIsConnecting(true)
      const provider = new ethers.BrowserProvider(window.ethereum, 'any')
      
      // Request accounts
      const accounts = await provider.send('eth_requestAccounts', []).catch((error) => {
        console.error('Failed to request accounts:', error)
        throw new Error('Failed to connect wallet')
      })
      
      const network = await provider.getNetwork().catch((error: any) => {
        console.error('Failed to get network:', error)
        throw new Error('Failed to get network information')
      })
      
      setProvider(provider)
      setAccount(accounts[0])
      setChainId(Number(network.chainId))
      
      // Save connection state
      localStorage.setItem('walletConnected', 'true')
    } catch (error) {
      console.error('Failed to connect wallet:', error)
      alert(`Failed to connect wallet: ${error instanceof Error ? error.message : 'Please try again'}`)
    } finally {
      setIsConnecting(false)
    }
  }

  const disconnectWallet = () => {
    setAccount(null)
    setChainId(null)
    setProvider(null)
    localStorage.removeItem('walletConnected')
  }

  const switchChain = async (targetChainId: number): Promise<boolean> => {
    if (!window.ethereum) return false

    const chainConfig = CHAIN_CONFIG[targetChainId]
    if (!chainConfig) {
      console.error(`Chain configuration not found for chain ID: ${targetChainId}`)
      return false
    }

    const hexChainId = chainConfig.chainId

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hexChainId }],
      })
      return true
    } catch (error: any) {
      if (error.code === 4902) {
        // Chain not added to wallet
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: chainConfig.chainId,
              chainName: chainConfig.chainName,
              nativeCurrency: chainConfig.nativeCurrency,
              rpcUrls: chainConfig.rpcUrls,
              blockExplorerUrls: chainConfig.blockExplorerUrls
            }]
          })
          
          // Try switching again after adding
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: hexChainId }],
          })
          
          return true
        } catch (addError) {
          console.error('Failed to add chain to wallet:', addError)
          return false
        }
      }
      console.error('Failed to switch chain:', error)
      return false
    }
  }

  useEffect(() => {
    if (window.ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          disconnectWallet()
        } else {
          setAccount(accounts[0])
        }
      }

      const handleChainChanged = (chainId: string) => {
        setChainId(parseInt(chainId, 16))
      }

      window.ethereum.on('accountsChanged', handleAccountsChanged)
      window.ethereum.on('chainChanged', handleChainChanged)

      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged)
        window.ethereum.removeListener('chainChanged', handleChainChanged)
      }
    }
  }, [])

  // Auto-connect on page load if previously connected
  useEffect(() => {
    const autoConnect = async () => {
      if (window.ethereum && localStorage.getItem('walletConnected') === 'true') {
        try {
          const provider = new ethers.BrowserProvider(window.ethereum)
          const accounts = await provider.listAccounts().catch(error => {
            console.error('Failed to list accounts:', error)
            return []
          })
          
          if (accounts.length > 0) {
            const network = await provider.getNetwork().catch(error => {
              console.error('Failed to get network:', error)
              throw error
            })
            setProvider(provider)
            setAccount(accounts[0].address)
            setChainId(Number(network.chainId))
          }
        } catch (error) {
          console.error('Auto-connect failed:', error)
          // Clear the connected flag if auto-connect fails
          localStorage.removeItem('walletConnected')
        }
      }
    }
    
    autoConnect()
  }, [])

  return (
    <WalletContext.Provider
      value={{
        account,
        chainId,
        provider,
        isConnected,
        isConnecting,
        connectWallet,
        disconnectWallet,
        switchChain
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}
