import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { useWallet } from '../contexts/WalletContext'
import { getContractAddresses } from '../constants/contracts'
import { isTestnetChain } from '../constants/chainConfig'
import BRIDGE_ABI from '../../abi/Bridge/BridgeCore.json'
import ERC20_ABI from '../../abi/Tokens/DexBridgeToken.json'

export interface BridgeTransaction {
  txId: string
  user: string
  token: string
  amount: string
  fee: string
  sourceChain: number
  targetChain: number
  targetAddress: string
  timestamp: number
  status: BridgeStatus
}

export enum BridgeStatus {
  Pending = 0,
  Locked = 1,
  Released = 2,
  Completed = 3,
  Failed = 4
}

export const useBridgeContract = () => {
  const { provider, chainId, account } = useWallet()
  const [bridgeContract, setBridgeContract] = useState<ethers.Contract | null>(null)

  // Default transaction object for error cases
  const defaultTransaction = {
    txId: '',
    user: '',
    token: '',
    amount: '0',
    fee: '0',
    sourceChain: 0,
    targetChain: 0,
    targetAddress: '',
    timestamp: 0,
    status: BridgeStatus.Pending
  }

  useEffect(() => {
    if (!provider || !chainId) {
      setBridgeContract(null)
      return
    }

    const addresses = getContractAddresses(chainId)
    if (!addresses) {
      setBridgeContract(null)
      return 
    }

    const loadContract = async () => {
      try {
        const signer = await provider.getSigner()
        const bridge = new ethers.Contract(addresses.bridge, BRIDGE_ABI, signer)
        setBridgeContract(bridge)
      } catch (error) {
        console.error('Error loading bridge contract:', error) 
        setBridgeContract(null)
      }
    }

    loadContract()
  }, [provider, chainId])

  const lockTokens = async (
    tokenAddress: string,
    amount: string,
    targetChain: number,
    targetAddress: string = '',
    options: { gasLimit?: number, gasPrice?: string } = {}
  ) => {
    try {
      if (!bridgeContract || !account) throw new Error('Bridge contract not available') 
      
      // Validate inputs
      if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
        throw new Error('Invalid token address')
      }
      
      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        throw new Error('Invalid amount')
      }
      
      if (!targetChain || isNaN(targetChain)) {
        throw new Error('Invalid target chain')
      }
      
      // Check if source and target chains are compatible (both testnet or both mainnet)
      if (chainId) {
        const sourceIsTestnet = isTestnetChain(chainId)
        const targetIsTestnet = isTestnetChain(targetChain)
        
        if (sourceIsTestnet !== targetIsTestnet) {
          throw new Error('Cannot bridge between testnet and mainnet networks')
        }
      }
      
      const destination = targetAddress || account
      
      // First approve the token
      const signer = await provider!.getSigner()
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer)
      const amountWei = ethers.parseEther(amount)
      
      try {
        const bridgeAddress = await bridgeContract.getAddress()
        const allowance = await tokenContract.allowance(account, bridgeAddress)
        
        if (allowance < amountWei) {
          try {
            const approveTx = await tokenContract.approve(bridgeAddress, amountWei)
            await approveTx.wait()
            console.info(`Approved ${amount} tokens for bridge transfer`)
          } catch (approveError) {
            console.error('Token approval failed:', approveError)
            throw new Error('Failed to approve token transfer. Please try again.')
          }
        }
        
        // Prepare transaction options
        const txOptions: any = {}
        if (options.gasLimit) txOptions.gasLimit = options.gasLimit
        if (options.gasPrice) txOptions.gasPrice = ethers.parseUnits(options.gasPrice, 'gwei')
        
        // Execute the bridge transaction
        const tx = await bridgeContract.lockTokens(
          tokenAddress,
          amountWei,
          targetChain,
          destination,
          txOptions
        ).catch((error: any) => {
          console.error('Bridge transaction failed:', error);
          throw new Error(`Bridge transaction failed: ${error.message || 'Unknown error'}`);
        });
        
        // Wait for transaction confirmation
        const receipt = await tx.wait().catch((error: any) => {
          console.error('Transaction confirmation failed:', error);
          throw new Error(`Transaction failed to confirm: ${error.message || 'Unknown error'}`);
        });
        
        // Check for TokenLocked event
        const tokenLockedEvent = receipt.logs
          .filter((log: any) => {
            try {
              const parsedLog = bridgeContract.interface.parseLog(log)
              return parsedLog && parsedLog.name === 'TokenLocked'
            } catch (e) {
              return false
            }
          })
          .map((log: any) => bridgeContract.interface.parseLog(log))[0]
        
        if (!tokenLockedEvent) {
          throw new Error('Bridge transaction failed: TokenLocked event not found')
        }
        
        return receipt
      } catch (error: any) {
        // Handle specific error types
        if (error && (error as any).code === 'ACTION_REJECTED') {
          throw new Error('Transaction rejected by user')
        } else if ((error as any).message && (error as any).message.includes('insufficient funds')) {
          throw new Error('Insufficient funds for transaction')
        } else if ((error as any).message && (error as any).message.includes('gas required exceeds allowance')) {
          throw new Error('Transaction requires more gas than available. Try increasing gas limit.')
        } else {
          console.error('Error in lockTokens:', error)
          throw new Error(`Bridge transaction failed: ${error.message || 'Unknown error'}`)
        }
      }
    } catch (error) {
      console.error('Bridge contract not available for lockTokens:', error)
      throw error
    }
  }

  const burnAndBridge = async (
    tokenAddress: string,
    amount: string,
    targetChain: number,
    targetAddress: string = '',
    options: { gasLimit?: number, gasPrice?: string } = {}
  ) => {
    try {
      if (!bridgeContract) {
        throw new Error('Bridge contract not available');
      }
      
      if (!account) {
        throw new Error('Bridge contract not available');
      }
      
      // Validate inputs
      if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
        throw new Error('Invalid token address');
      }
      
      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        throw new Error('Invalid amount');
      }
      
      if (!targetChain || isNaN(targetChain)) {
        throw new Error('Invalid target chain');
      }
      
      // Check if source and target chains are compatible (both testnet or both mainnet)
      if (chainId) {
        const sourceIsTestnet = isTestnetChain(chainId);
        const targetIsTestnet = isTestnetChain(targetChain);
        
        if (sourceIsTestnet !== targetIsTestnet && sourceIsTestnet !== undefined && targetIsTestnet !== undefined) {
          throw new Error('Cannot bridge between testnet and mainnet networks');
        }
      }
      
      const destination = targetAddress || account;
      let amountWei;
      try {
        amountWei = ethers.parseEther(amount);
      } catch (parseError) {
        console.error('Error parsing amount:', parseError);
        throw new Error('Invalid amount format');
      }
      
      try {
        // First check if token is approved for burning
        const signer = await provider!.getSigner();
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
        let bridgeAddress;
        try {
          bridgeAddress = await bridgeContract.getAddress();
        } catch (error) {
          console.error('Error getting bridge address:', error);
          throw new Error('Failed to get bridge contract address');
        }
        
        let allowance;
        try {
          allowance = await tokenContract.allowance(account, bridgeAddress);
        } catch (error) {
          console.error('Error checking token allowance:', error);
          throw new Error('Failed to check token allowance');
        }
        
        if (allowance < amountWei) {
          try {
            const approveTx = await tokenContract.approve(bridgeAddress, amountWei);
            await approveTx.wait();
            console.log(`Approved ${amount} tokens for bridge burning`);
          } catch (approveError) {
            console.error('Token approval failed:', approveError);
            throw new Error('Failed to approve token burning. Please try again.');
          }
        }
        
        // Prepare transaction options
        const txOptions: any = {};
        if (options.gasLimit) txOptions.gasLimit = options.gasLimit;
        if (options.gasPrice) {
          try {
            txOptions.gasPrice = ethers.parseUnits(options.gasPrice, 'gwei');
          } catch (error) {
            console.error('Error parsing gas price:', error);
            // Continue without setting gas price
          }
        }
        
        // Execute the burn and bridge transaction
        let tx;
        try {
          tx = await bridgeContract.burnAndBridge(
            tokenAddress,
            amountWei,
            targetChain,
            destination,
            txOptions
          );
        } catch (error: any) {
          console.error('Error executing burnAndBridge transaction:', error);
          
          // Check for specific error messages
          if (error.message.includes('Cannot burn native token')) {
            throw new Error('This token cannot be burned. It may be a native token that should be locked instead.');
          } else if (error.message.includes('Token not supported')) {
            throw new Error('This token is not supported for bridging on this chain.');
          } else {
            throw new Error(`Failed to execute bridge transaction: ${error.message || 'Unknown error'}`);
          }
        }
        
        // Wait for transaction confirmation
        let receipt;
        try {
          receipt = await tx.wait();
        } catch (error) {
          console.error('Error waiting for transaction confirmation:', error);
          throw new Error('Transaction was submitted but failed to confirm');
        }
        
        // Check for TokenBurned event
        let tokenBurnedEvent;
        try {
          tokenBurnedEvent = receipt.logs
            .filter((log: any) => {
              try {
                const parsedLog = bridgeContract.interface.parseLog(log);
                return parsedLog && parsedLog.name === 'TokenBurned';
              } catch (e) {
                return false;
              }
            })
            .map((log: any) => bridgeContract.interface.parseLog(log))[0];
        } catch (error) {
          console.error('Error parsing logs for TokenBurned event:', error);
          // Continue without event data
        }
        
        if (!tokenBurnedEvent) {
          console.warn('Bridge transaction completed but TokenBurned event not found');
          // Continue anyway as the transaction was successful
        }
        
        return receipt;
      } catch (error) {
        // Handle specific error types
        if ((error as any).code === 'ACTION_REJECTED') {
          throw new Error('Transaction rejected by user');
        } else if ((error as any).message && (error as any).message.includes('insufficient funds')) {
          throw new Error('Insufficient funds for transaction');
        } else if ((error as any).message && (error as any).message.includes('gas required exceeds allowance')) {
          throw new Error('Transaction requires more gas than available. Try increasing gas limit.');
        } else {
          console.error('Error in burnAndBridge:', error);
          throw error; // Re-throw the error that was already processed
        }
      }
    } catch (error) {
      console.error('Error in burnAndBridge:', error);
      throw error;
    }
  }

  const getTransaction = async (txId: string): Promise<BridgeTransaction> => {
    if (!bridgeContract) return { ...defaultTransaction, txId };
    try {
      const tx = await bridgeContract.getTransaction(txId)
      return {
        txId: tx.txId || txId,
        user: tx.user || '',
        token: tx.token || '',
        amount: tx.amount ? ethers.formatEther(tx.amount) : '0',
        fee: tx.fee ? ethers.formatEther(tx.fee) : '0',
        sourceChain: tx.sourceChain ? Number(tx.sourceChain) : 0,
        targetChain: tx.targetChain ? Number(tx.targetChain) : 0,
        targetAddress: tx.targetAddress || '',
        timestamp: tx.timestamp ? Number(tx.timestamp) : 0,
        status: (tx.status || 0) as BridgeStatus
      }
    } catch (error) {
      console.error('Error getting transaction details:', error)
      return { ...defaultTransaction, txId
      }
    }
  }

  const getUserTransactions = async (userAddress?: string): Promise<string[]> => {
    if (!bridgeContract) {
      console.warn('Bridge contract not available for getUserTransactions')
      return []
    }
    
    const address = userAddress || account
    if (!address) {
      return []
    }
    
    try {
      const txs = await bridgeContract.getUserTransactions(address)
      return txs || []
    } catch (error) {
      console.error('Error getting user transactions:', error)
      return []
    }
  }
  
  const getAllTransactions = async (): Promise<string[]> => {
    if (!bridgeContract) {
      console.warn('Bridge contract not available for getAllTransactions')
      return [] 
    }
    
    try {
      // Check if the function exists before calling it
      if (bridgeContract.getAllTransactions && typeof bridgeContract.getAllTransactions === 'function') {
        return await bridgeContract.getAllTransactions()
      } else {
        console.warn('getAllTransactions function not available on bridge contract') 
        return []
      }
    } catch (error) {
      console.error('Error getting all transactions:', error)
      return []
    }
  }

  const estimateBridgeFee = async (tokenAddress: string, amount: string) => {
    if (!bridgeContract) throw new Error('Bridge contract not available')

    try { 
      try {
        const tokenInfo = await bridgeContract.supportedTokens(tokenAddress)
        const amountBN = ethers.parseEther(amount)
        const feeBN = (amountBN * BigInt(tokenInfo.fee || 250)) / BigInt(10000)
        return ethers.formatEther(feeBN) 
      } catch (error) {
        console.error('Error getting token info:', error)
        // Default to 2.5% fee if we can't get the actual fee
        return ethers.formatEther((ethers.parseEther(amount) * BigInt(250)) / BigInt(10000)) 
      }
    } catch (error) {
      console.error('Bridge contract not available for estimateBridgeFee:', error)
      return '0'
    }
  }

  const checkFeeRequirements = async (userAddress?: string) => {
    if (!bridgeContract) throw new Error('Bridge contract not available')
    
    const address = userAddress || account
    if (!address) {
      return {
        hasBalance: false,
        hasAllowance: false,
        balance: '0',
        allowance: '0'
      }
    }
    
    try {
      // Check if the user has enough USDT balance and allowance for the bridge fee
      const requirements = await bridgeContract.checkFeeRequirements(address)
      return {
        hasBalance: requirements.hasBalance,
        hasAllowance: requirements.hasAllowance,
        balance: requirements.balance.toString(),
        allowance: requirements.allowance.toString()
      }
    } catch (error) {
      // If the check fails, assume the user doesn't have enough USDT
      console.error('Error checking fee requirements:', error)
      return {
        hasBalance: false,
        hasAllowance: false,
        balance: '0',
        allowance: '0'
      }
    }
  }

  // New function to monitor bridge transaction status
  const monitorTransaction = async (txId: string, pollInterval = 15000): Promise<BridgeTransaction> => {
    if (!bridgeContract) throw new Error('Bridge contract not available')
    
    let transaction = await getTransaction(txId).catch(error => {
      console.error('Error getting initial transaction:', error);
      return { ...defaultTransaction, txId };
    });
    
    // If transaction is already completed or failed, return it
    if (transaction.status === BridgeStatus.Completed || transaction.status === BridgeStatus.Failed) {
      return transaction
    }
    
    // Return a promise that resolves when the transaction is completed or fails
    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const updatedTx = await getTransaction(txId).catch(error => transaction);
          
          // If status changed, resolve or continue polling
          if (updatedTx.status !== transaction.status) {
            const updatedTx = await getTransaction(txId).catch(error => {
              console.error('Error fetching transaction:', error.message || error);
              return transaction;
            });
            
            if (updatedTx.status === BridgeStatus.Completed || updatedTx.status === BridgeStatus.Failed) {
              clearInterval(interval)
              resolve(updatedTx)
            }
          }
        } catch (error) {
          console.error('Error monitoring transaction:', error)
          clearInterval(interval);
          reject(error)
        }
      }, pollInterval)
      
      // Return the current transaction state immediately
      resolve(transaction)
    })
  }
  
  // Helper function to get chain name from chain ID
  const getChainName = (chainId: number): string => {
    const chains: Record<number, string> = { 1: 'Ethereum', 56: 'BSC', 137: 'Polygon', 42161: 'Arbitrum', 43114: 'Avalanche', 250: 'Fantom', 25062019: 'ESR' };
    return chains[chainId] || `Chain ${chainId}`;
  }

  return {
    bridgeContract,
    lockTokens,
    burnAndBridge,
    getTransaction,
    getUserTransactions,
    getAllTransactions,
    estimateBridgeFee,
    checkFeeRequirements, 
    monitorTransaction,
    getChainName
  }
}
