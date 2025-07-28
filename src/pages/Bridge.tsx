import React, { useState, useEffect } from 'react'
import { Grid as BridgeIcon, ArrowRight, Clock, AlertCircle } from 'lucide-react'
import { CHAIN_CONFIG, isTestnetChain } from '../constants/chainConfig'
import { useWallet } from '../contexts/WalletContext'
import { useBridgeContract, BridgeStatus } from '../hooks/useBridgeContract'
import { getTokensByChain } from '../constants/tokens'
import TestnetBadge from '../components/TestnetBadge'

interface BridgeProps {
  testnetMode: boolean;
}

const Bridge: React.FC<BridgeProps> = ({ testnetMode }) => {
  const { isConnected, account, chainId } = useWallet()
  const { lockTokens, burnAndBridge, getUserTransactions, estimateBridgeFee, checkFeeRequirements, getTransaction } = useBridgeContract()
  
  // Get chains based on testnet mode
  const availableChains = Object.entries(CHAIN_CONFIG)
    .filter(([_, config]) => config.isTestnet === testnetMode)
    .map(([id, config]) => ({
      id: parseInt(id),
      name: config.chainName,
      symbol: config.nativeCurrency.symbol,
      icon: getChainIcon(parseInt(id))
    }));
  
  const [fromChain, setFromChain] = useState(availableChains[0] || { id: 1, name: 'Ethereum', symbol: 'ETH', icon: '⟠' })
  const [toChain, setToChain] = useState(availableChains[1] || { id: 56, name: 'BSC', symbol: 'BNB', icon: '🟡' })
  const [amount, setAmount] = useState('')
  const [destinationAddress, setDestinationAddress] = useState('')
  const [selectedToken, setSelectedToken] = useState('')
  const [bridgeFee, setBridgeFee] = useState('0')
  const [isBridging, setIsBridging] = useState(false)
  const [userTransactions, setUserTransactions] = useState<Array<{
    txId: string;
    status: string;
    amount: string;
    token: string;
    sourceChain: number;
    targetChain: number;
    timestamp: number;
  }>>([])
  const [pendingTxId, setPendingTxId] = useState<string | null>(null)
  const [feeWarning, setFeeWarning] = useState('')
  const [bridgeError, setBridgeError] = useState<string | null>(null)
  const [isLoadingTransactions, setIsLoadingTransactions] = useState<boolean>(false)

  // Get available tokens for current chain
  const availableTokens = chainId ? getTokensByChain(chainId) : []

  // Helper function to get chain icon
  function getChainIcon(chainId: number): string {
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

  useEffect(() => {
    if (amount && selectedToken) {
      estimateFee()
    }
  }, [amount, selectedToken])

  useEffect(() => {
    if (account) {
      checkUSDTFeeRequirements()
      loadUserTransactions()
    }
  }, [account])

  // Monitor pending transaction
  useEffect(() => {
    if (pendingTxId) {
      let intervalId: NodeJS.Timeout;
      
      const monitorTransaction = async () => {
        try {
          const tx = await getTransaction(pendingTxId);
          
          // If transaction is completed or failed, stop monitoring
          if (tx && (tx.status === BridgeStatus.Completed || tx.status === BridgeStatus.Failed)) {
            clearInterval(intervalId);
            loadUserTransactions();
            setPendingTxId(null);
          }
        } catch (error) {
          console.error('Error monitoring transaction:', error);
        }
      };
      
      // Poll every 10 seconds
      intervalId = setInterval(monitorTransaction, 10000);
      
      // Initial check
      monitorTransaction();
      
      // Cleanup interval on unmount or when pendingTxId changes
      return () => {
        clearInterval(intervalId);
      };
    }
  }, [pendingTxId])

  const checkUSDTFeeRequirements = async () => {
    if (!account) return
    
    try {
      const feeStatus = await checkFeeRequirements(account)
      if (!feeStatus.hasBalance || !feeStatus.hasAllowance) {
        setFeeWarning('You need $3 USDT balance and approval for bridge fees')
      } else {
        setFeeWarning('')
      }
    } catch (error) {
      setFeeWarning('Unable to verify USDT fee requirements')
    }
  }

  const estimateFee = async () => {
    if (!selectedToken || !amount) return
    
    try {
      const fee = await estimateBridgeFee(selectedToken, amount).catch(() => '0')
      setBridgeFee(fee)
    } catch (error) {
      console.error('Error estimating fee:', error)
      setBridgeFee('0')
    }
  }

  const loadUserTransactions = async () => {
    if (!account || !chainId) return
    
    setBridgeError(null)
    setIsLoadingTransactions(true)
    
    try {
      // Get transaction IDs for the current user
      const txIds = await getUserTransactions(account)
        .catch((err) => {
          console.warn('Could not load user transactions:', err);
          return [];
        });
      
      // Get full details for each transaction
      const txDetails = await Promise.all(txIds.slice(0, 10).map(async (txId) => {
        try {
          const tx = await getTransaction(txId);
          const statusMap = ['Pending', 'Locked', 'Released', 'Completed', 'Failed'];
          const status = tx && tx.status !== undefined && statusMap[tx.status] 
            ? statusMap[tx.status] 
            : 'Pending';
          
          // Find token info
          const tokenInfo = availableTokens.find(t => t.address.toLowerCase() === tx.token.toLowerCase());
          
          return {
            txId: txId || '',
            status: status || 'Pending',
            amount: tx?.amount || '0',
            token: tokenInfo?.symbol || 'Unknown',
            sourceChain: tx?.sourceChain || 0,
            targetChain: tx?.targetChain || 0,
            timestamp: tx?.timestamp || 0
          }
        } catch (error) {
          console.warn(`Could not get transaction details for ${txId}:`, error);
          return { 
            txId, 
            status: 'Pending',
            amount: '0',
            token: 'Unknown',
            sourceChain: 0,
            targetChain: 0,
            timestamp: 0
          }
        }
      }));
      
      // Sort by timestamp (newest first)
      const sortedTxs = txDetails.sort((a, b) => b.timestamp - a.timestamp);
      setUserTransactions(sortedTxs);
    } catch (error) {
      console.error('Error loading user transactions:', error);
      setUserTransactions([]);
    } finally {
      setIsLoadingTransactions(false);
    }
  }

  const handleBridge = async () => {
    if (!isConnected) {
      alert('Please connect your wallet first')
      return 
    }
    
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount')
      return
    }

    if (!selectedToken) {
      alert('Please select a token')
      return
    }
    
    setBridgeError(null)
    try {
      setIsBridging(true)
      const destination = destinationAddress || account!

      // Check if we need to lock or burn tokens based on token origin
      const token = availableTokens.find(t => t.address === selectedToken)
      const isNativeToken = token && token.chainId === chainId
      let txResult;
      
      if (isNativeToken) {
        // Lock tokens on source chain
        try {
          txResult = await lockTokens(selectedToken, amount, toChain.id, destination, {
            gasLimit: 500000 // Higher gas limit for complex operations
          })
          
          // Extract transaction ID from events
          const txId = txResult.logs
            .filter((log: any) => log.topics[0] === ethers.utils.id("TokenLocked(bytes32,address,address,uint256,uint256,address)"))
            .map((log: any) => log.topics[1])[0]
          
          if (txId) {
            setPendingTxId(txId)
          }
        } catch (error) {
          console.error('Lock tokens failed:', error)
          throw new Error((error as any).message || 'Failed to lock tokens')
        }
      } else {
        // Burn wrapped tokens
        try {
          txResult = await burnAndBridge(selectedToken, amount, toChain.id, destination, {
            gasLimit: 500000 // Higher gas limit for complex operations
          })
          
          // Extract transaction ID from events
          const txId = txResult.logs
            .filter((log: any) => log.topics[0] === ethers.utils.id("TokenBurned(bytes32,address,address,uint256)"))
            .map((log: any) => log.topics[1])[0]
          
          if (txId) {
            setPendingTxId(txId)
          }
        } catch (error) {
          console.error('Burn and bridge failed:', error)
          throw new Error((error as any).message || 'Failed to burn tokens')
        }
      }
      
      alert('Bridge transaction initiated! Please wait for confirmation on the destination chain.')
      setAmount('')
      setDestinationAddress('')
      loadUserTransactions()
    } catch (error) {
      console.error('Bridge failed:', error)
      setBridgeError((error as any).message || 'Bridge transaction failed. Please try again.')
    } finally {
      setIsBridging(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="card p-6 mb-6">
        <div className="flex items-center space-x-2 mb-6">
            <BridgeIcon className="w-6 h-6" />
            <h2 className="text-xl font-bold">Cross-Chain Bridge</h2>
            <TestnetBadge />
        </div>

        <div className="space-y-6">
          {/* Chain Selection */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                From
              </label>
              <select
                value={fromChain.id}
                onChange={(e) => setFromChain(availableChains.find(c => c.id === Number(e.target.value))!)}
                className="input-field"
              >
                {availableChains.map((chain) => (
                  <option key={chain.id} value={chain.id}>
                    {chain.icon} {chain.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-center">
              <ArrowRight className="w-6 h-6 text-gray-400" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                To
              </label>
              <select
                value={toChain.id}
                onChange={(e) => setToChain(availableChains.find(c => c.id === Number(e.target.value))!)}
                className="input-field"
              >
                {availableChains.filter(c => c.id !== fromChain.id).map((chain) => (
                  <option key={chain.id} value={chain.id}>
                    {chain.icon} {chain.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Error Message */}
          {bridgeError && (
            <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg mb-4">
              <div className="flex items-center space-x-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4" />
                <span>{bridgeError}</span>
              </div>
            </div>
          )}

          {/* Token Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Token
            </label>
            <select
              value={selectedToken}
              onChange={(e) => setSelectedToken(e.target.value)}
              className="input-field mb-4"
            >
              <option value="">Select a token</option>
              {availableTokens.map((token) => (
                <option key={token.address} value={token.address}>
                  {token.symbol} - {token.name}
                </option>
              ))}
            </select>
            
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Amount
            </label>
            <input
              type="number"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input-field text-right text-xl font-semibold"
            />
          </div>

          {/* Destination Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Destination Address (Optional)
            </label>
            <input
              type="text"
              placeholder="0x... (leave empty to use connected wallet)"
              value={destinationAddress}
              onChange={(e) => setDestinationAddress(e.target.value)}
              className="input-field"
            />
          </div>

          {/* Bridge Info */}
          <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Bridge Fee</span>
              <span className="font-medium text-orange-600 dark:text-orange-400">$3 USDT</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Token Fee</span>
              <span className="font-medium">{bridgeFee} tokens</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Estimated Time</span>
              <span className="font-medium">
                {fromChain.id === 43114 || toChain.id === 43114 ? '2-5 minutes' : 
                 fromChain.id === 250 || toChain.id === 250 ? '1-3 minutes' : '5-10 minutes'}
              </span>
            </div>
            {parseFloat(bridgeFee) > parseFloat(amount) * 0.1 && (
              <div className="flex items-center space-x-2 text-sm text-orange-600 dark:text-orange-400">
                <AlertCircle className="w-4 h-4" />
                <span>High bridge fee relative to amount</span>
              </div>
            )}
            {feeWarning && (
              <div className="flex items-center space-x-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4" />
                <span>{feeWarning}</span>
              </div>
            )}
          </div>

          {/* Bridge Button */}
          <button
            onClick={handleBridge}
            disabled={!amount || !selectedToken || !isConnected || isBridging || !!feeWarning}
            className="w-full btn-primary py-4 text-lg font-semibold"
          >
            {!isConnected ? 'Connect Wallet' : isBridging ? 'Bridging...' : 'Bridge Tokens'}
          </button>
        </div>
      </div>

      {/* Bridge History */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold mb-4">Bridge History</h3>
        {isLoadingTransactions ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <div className="space-y-3">
            {userTransactions.length > 0 ? (
              userTransactions.map((tx) => (
                <div key={tx.txId} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${
                      tx.status === 'Completed' ? 'bg-green-500' : 
                      tx.status === 'Failed' ? 'bg-red-500' : 
                      (tx.txId && tx.txId === pendingTxId) ? 'bg-blue-500 animate-pulse' : 'bg-yellow-500'
                    }`} />
                    <div>
                      <p className="font-medium text-sm">{tx.txId && tx.txId.length > 10 ? tx.txId.slice(0, 10) + '...' : tx.txId || 'Unknown'}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {parseFloat(tx.amount).toFixed(4)} {tx.token}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-medium ${
                      tx.status === 'Completed' ? 'text-green-600 dark:text-green-400' : 
                      tx.status === 'Failed' ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'
                    }`}>{(tx.txId && tx.txId === pendingTxId) ? 'Processing...' : tx.status}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center justify-end">
                      <Clock className="w-3 h-3 mr-1" />
                      {tx.timestamp ? new Date(tx.timestamp * 1000).toLocaleString() : 'Processing'}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <BridgeIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">No bridge transactions yet</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default Bridge
