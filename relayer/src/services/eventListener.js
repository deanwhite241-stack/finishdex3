import { ethers } from 'ethers';
import { SUPPORTED_CHAINS, BRIDGE_ABI, getChainConfig } from '../config/chains.js';
import database from '../database/db.js';
import logger from '../utils/logger.js';
import { sendAlert } from '../utils/alerts.js';

class EventListener {
  constructor() {
    this.providers = new Map();
    this.contracts = new Map();
    this.isListening = false;
    this.listeners = new Map();
    this.reconnectAttempts = new Map();
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 10000; // 10 seconds
  }

  async initialize() {
    try {
      // Initialize providers and contracts for each chain
      for (const [chainId, config] of Object.entries(SUPPORTED_CHAINS)) {
        if (!config.rpcUrl || !config.bridgeAddress) {
          logger.warn(`Skipping chain ${chainId}: Missing RPC URL or bridge address`);
          continue;
        }

        try {
          const provider = new ethers.JsonRpcProvider(config.rpcUrl);
          // Add connection error handling
          provider.on('error', (error) => {
            logger.error(`Provider error for chain ${chainId}:`, error);
            this.handleProviderDisconnect(parseInt(chainId));
          });

          // Test connection
          await provider.getBlockNumber();
          
          const contract = new ethers.Contract(config.bridgeAddress, BRIDGE_ABI, provider);
          
          this.providers.set(parseInt(chainId), provider);
          this.contracts.set(parseInt(chainId), contract);
          this.reconnectAttempts.set(parseInt(chainId), 0);

          logger.info(`Initialized provider for ${config.name} (Chain ID: ${chainId})`);
        } catch (error) {
          logger.error(`Failed to initialize provider for chain ${chainId}:`, error);
        }
      }

      logger.info('Event listener initialized successfully');
    } catch (error) {
      logger.error('Event listener initialization failed:', error);
      throw error;
    }
  }

  async startListening() {
    if (this.isListening) {
      logger.warn('Event listener is already running');
      return;
    }

    this.isListening = true;
    logger.info('Starting event listeners for all chains...');

    for (const [chainId, contract] of this.contracts.entries()) {
      try {
        await this.startChainListener(chainId, contract);
      } catch (error) {
        logger.error(`Failed to start listener for chain ${chainId}:`, error);
        // Schedule reconnection attempt
        this.scheduleReconnect(chainId);
      }
    }

    // Also start historical event processing
    this.startHistoricalProcessing();
  }

  async handleProviderDisconnect(chainId) {
    if (!this.isListening) return;
    
    const attempts = this.reconnectAttempts.get(chainId) || 0;
    if (attempts < this.maxReconnectAttempts) {
      this.reconnectAttempts.set(chainId, attempts + 1);
      this.scheduleReconnect(chainId);
    } else {
      logger.error(`Max reconnection attempts reached for chain ${chainId}`);
      await sendAlert({
        type: 'system_error',
        message: `Failed to reconnect to chain ${chainId} after ${this.maxReconnectAttempts} attempts`,
        data: { chainId }
      });
    }
  }
  
  scheduleReconnect(chainId) {
    const attempts = this.reconnectAttempts.get(chainId) || 0;
    const delay = this.reconnectDelay * Math.pow(2, attempts); // Exponential backoff
    
    logger.info(`Scheduling reconnection for chain ${chainId} in ${delay}ms (attempt ${attempts + 1})`);
    
    setTimeout(async () => {
      try {
        if (!this.isListening) return;
        
        const config = getChainConfig(chainId);
        logger.info(`Attempting to reconnect to chain ${chainId} (${config.name})`);
        
        // Recreate provider and contract
        const provider = new ethers.JsonRpcProvider(config.rpcUrl);
        await provider.getBlockNumber(); // Test connection
        
        const contract = new ethers.Contract(config.bridgeAddress, BRIDGE_ABI, provider);
        
        this.providers.set(chainId, provider);
        this.contracts.set(chainId, contract);
        
        // Restart listener
        await this.startChainListener(chainId, contract);
        
        // Reset reconnect attempts on success
        this.reconnectAttempts.set(chainId, 0);
        
        logger.info(`Successfully reconnected to chain ${chainId}`);
      } catch (error) {
        logger.error(`Reconnection attempt failed for chain ${chainId}:`, error);
        this.handleProviderDisconnect(chainId);
      }
    }, delay);
  }

  async startChainListener(chainId, contract) {
    const config = getChainConfig(chainId);
    
    try {
      // Listen for TokenLocked events
      const lockedListener = contract.on(
        'TokenLocked', 
        async (txId, user, token, amount, targetChain, targetAddress, event) => {
          try {
            logger.info(`TokenLocked event detected on chain ${chainId}: ${txId}`);
            
            await this.handleBridgeEvent({
              txId,
              eventType: 'TokenLocked',
              sourceChain: chainId,
              targetChain: Number(targetChain),
              userAddress: user,
              tokenAddress: token,
              amount: amount.toString(),
              targetAddress,
              blockNumber: event.blockNumber,
              transactionHash: event.transactionHash
            });
          } catch (error) {
            logger.error(`Error handling TokenLocked event ${txId}:`, error);
          }
        }
      );

      // Listen for TokenBurned events
      const burnedListener = contract.on(
        'TokenBurned', 
        async (txId, user, token, amount, event) => {
          try {
            logger.info(`TokenBurned event detected on chain ${chainId}: ${txId}`);
            
            // Get transaction details to find target chain
            const tx = await contract.getTransaction(txId).catch(error => {
              logger.error(`Failed to get transaction details for ${txId}:`, error);
              throw new Error(`Failed to get transaction details: ${error.message}`);
            });
            
            if (!tx || !tx.targetChain) {
              throw new Error(`Invalid transaction data for ${txId}`);
            }
            
            await this.handleBridgeEvent({
              txId,
              eventType: 'TokenBurned',
              sourceChain: chainId,
              targetChain: Number(tx.targetChain),
              userAddress: user,
              tokenAddress: token,
              amount: amount.toString(),
              targetAddress: tx.targetAddress,
              blockNumber: event.blockNumber,
              transactionHash: event.transactionHash
            });
          } catch (error) {
            logger.error(`Error handling TokenBurned event ${txId}:`, error);
          }
        }
      );

      // Listen for BridgeCompleted events
      const completedListener = contract.on(
        'BridgeCompleted',
        async (txId, event) => {
          try {
            logger.info(`BridgeCompleted event detected on chain ${chainId}: ${txId}`);
            
            // Update transaction status in database
            await database.updateEventStatus(txId, 'completed', event.transactionHash);
            
            // Send alert for completed bridge
            await sendAlert({
              type: 'successful_relay',
              message: `Bridge transaction ${txId} completed on chain ${chainId}`,
              data: {
                txId,
                chainId,
                transactionHash: event.transactionHash
              }
            });
          } catch (error) {
            logger.error(`Error handling BridgeCompleted event ${txId}:`, error);
          }
        }
      );

      this.listeners.set(`${chainId}-locked`, lockedListener);
      this.listeners.set(`${chainId}-burned`, burnedListener);
      this.listeners.set(`${chainId}-completed`, completedListener);

      logger.info(`Started event listeners for ${config.name} (Chain ID: ${chainId})`);
    } catch (error) {
      logger.error(`Failed to start listener for chain ${chainId}:`, error);
      throw error; // Propagate error for reconnection handling
    }
  }

  async handleBridgeEvent(eventData) {
    try {
      logger.info(`New bridge event detected: ${eventData.eventType} - ${eventData.txId}`);

      // Check if event already processed
      const isProcessed = await database.isEventProcessed(eventData.txId).catch((error) => {
        logger.error(`Error checking if event ${eventData.txId} is processed:`, error);
        return false; // Assume not processed if check fails
      });
      
      if (isProcessed) {
        logger.info(`Event already processed: ${eventData.txId}`);
        return;
      }

      // Get current block number for confirmation calculation
      let confirmations = 0;
      try {
        const provider = this.providers.get(eventData.sourceChain);
        if (!provider) {
          throw new Error(`No provider for chain ${eventData.sourceChain}`);
        }
        
        const currentBlock = await provider.getBlockNumber();
        confirmations = Math.max(0, currentBlock - eventData.blockNumber);
        eventData.confirmations = confirmations;
      } catch (error) {
        logger.error(`Error calculating confirmations for event ${eventData.txId}:`, error);
        eventData.confirmations = 0; // Continue with 0 confirmations, will be updated later
      }

      // Save event to database
      await database.saveBridgeEvent(eventData).catch(error => {
        logger.error(`Error saving event ${eventData.txId} to database:`, error);
        throw error;
      });

      // Send alert for new bridge event
      await sendAlert({
        type: 'new_bridge_event',
        message: `New ${eventData.eventType} event detected`,
        data: eventData
      }).catch(error => {
        logger.error(`Error sending alert for event ${eventData.txId}:`, error);
        // Don't throw here, continue processing
      });

      logger.info(`Bridge event saved: ${eventData.txId} (${confirmations} confirmations)`);
    } catch (error) {
      logger.error(`Error handling bridge event ${eventData.txId}:`, error);
    }
  }

  async startHistoricalProcessing() {
    // Process historical events every 30 seconds
    const intervalId = setInterval(async () => {
      if (!this.isListening) return;

      try {
        await this.processHistoricalEvents();
      } catch (error) {
        logger.error('Error in historical event processing:', error);
        // Continue processing in next interval
      }
    }, 30000);
    
    // Store interval ID for cleanup
    this.historicalProcessingInterval = intervalId;
  }

  async processHistoricalEvents() {
    for (const [chainId, contract] of this.contracts.entries()) {
      try {
        const config = getChainConfig(chainId);
        if (!config) {
          logger.warn(`No configuration found for chain ${chainId}, skipping historical processing`);
          continue;
        }
        
        const provider = this.providers.get(chainId);
        
        if (!provider) {
          logger.warn(`No provider available for chain ${chainId}, skipping historical processing`);
          continue;
        }
        
        const currentBlock = await provider.getBlockNumber().catch(error => {
          logger.error(`Error getting current block for chain ${chainId}:`, error);
          throw error;
        });
        
        const lastProcessedBlock = await database.getLastProcessedBlock(chainId).catch(error => {
          logger.error(`Error getting last processed block for chain ${chainId}:`, error);
          return 0; // Start from beginning if we can't get last processed block
        });

        // Process blocks in chunks to avoid RPC limits
        const maxBlockRange = 1000; // Limit block range to avoid RPC timeouts
        const fromBlock = Math.max(lastProcessedBlock + 1, currentBlock - maxBlockRange);
        const toBlock = currentBlock - config.minConfirmations;

        if (fromBlock > toBlock) {
          logger.debug(`No new blocks to process for chain ${chainId}`);
          continue; // No new blocks to process
        }

        logger.debug(`Processing historical events for ${config.name}: blocks ${fromBlock} to ${toBlock}`);

        try {
          // Get TokenLocked events
          const lockedEvents = await contract.queryFilter('TokenLocked', fromBlock, toBlock)
            .catch(error => {
              logger.error(`Error querying TokenLocked events for chain ${chainId}:`, error);
              return []; // Return empty array on error
            });
            
          logger.info(`Found ${lockedEvents.length} TokenLocked events for chain ${chainId}`);
          
          for (const event of lockedEvents) {
            await this.handleHistoricalEvent(chainId, event, 'TokenLocked')
              .catch(error => {
                logger.error(`Error handling historical TokenLocked event:`, error);
                // Continue with next event
              });
          }
        } catch (error) {
          logger.error(`Error processing TokenLocked events for chain ${chainId}:`, error);
          // Continue with next event type
        }

        try {
          // Get TokenBurned events
          const burnedEvents = await contract.queryFilter('TokenBurned', fromBlock, toBlock)
            .catch(error => {
              logger.error(`Error querying TokenBurned events for chain ${chainId}:`, error);
              return []; // Return empty array on error
            });
            
          logger.info(`Found ${burnedEvents.length} TokenBurned events for chain ${chainId}`);
          
          for (const event of burnedEvents) {
            await this.handleHistoricalEvent(chainId, event, 'TokenBurned')
              .catch(error => {
                logger.error(`Error handling historical TokenBurned event:`, error);
                // Continue with next event
              });
          }
        } catch (error) {
          logger.error(`Error processing TokenBurned events for chain ${chainId}:`, error);
          // Continue with next event type
        }

        // Update last processed block
        await database.saveProcessedBlock(chainId, toBlock).catch(error => {
          logger.error(`Error saving processed block for chain ${chainId}:`, error);
        });

      } catch (error) {
        logger.error(`Error processing historical events for chain ${chainId}:`, error);
        // Schedule reconnection attempt
        this.scheduleReconnect(chainId);
      }
    }
  }

  async handleHistoricalEvent(chainId, event, eventType) {
    try {
      const args = event.args;
      let eventData = {
        txId: '',
        eventType: '',
        sourceChain: chainId,
        targetChain: 0,
        userAddress: '',
        tokenAddress: '',
        amount: '0',
        targetAddress: '',
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        confirmations: 0
      };

      if (eventType === 'TokenLocked') {
        eventData = {
          ...eventData,
          txId: args.txId,
          eventType: 'TokenLocked',
          targetChain: Number(args.targetChain),
          userAddress: args.user,
          tokenAddress: args.token,
          amount: args.amount.toString(),
          targetAddress: args.targetAddress
        };
      } else if (eventType === 'TokenBurned') {
        // Get transaction details for target chain info
        const contract = this.contracts.get(chainId);
        let targetChain = 0;
        let targetAddress = ethers.ZeroAddress;
        
        try {
          const tx = await contract.getTransaction(args.txId);
          targetChain = tx.targetChain ? Number(tx.targetChain) : 0;
          targetAddress = tx.targetAddress || ethers.ZeroAddress;
        } catch (error) {
          logger.error(`Error getting transaction details for ${args.txId}:`, error);
        }
        
        eventData = {
          ...eventData,
          txId: args.txId,
          eventType: 'TokenBurned',
          targetChain: targetChain,
          userAddress: args.user,
          tokenAddress: args.token,
          amount: args.amount.toString(),
          targetAddress: targetAddress
        };
      }

      // Check if already processed
      const isProcessed = await database.isEventProcessed(eventData.txId).catch(() => false);
      if (!isProcessed) {
        const provider = this.providers.get(chainId);
        let confirmations = 0;
        try {
          const currentBlock = await provider.getBlockNumber();
          confirmations = Math.max(0, currentBlock - event.blockNumber);
        } catch (error) {
          logger.error(`Error calculating confirmations for historical event ${eventData.txId}:`, error);
        }
        eventData.confirmations = confirmations;
        
        await database.saveBridgeEvent(eventData).catch(error => {
          logger.error(`Error saving historical event ${eventData.txId}:`, error);
          throw error;
        });
        
        logger.info(`Historical event processed: ${eventData.txId} (${eventData.confirmations} confirmations)`);
      }
    } catch (error) {
      logger.error(`Error handling historical event:`, error);
      throw error;
    }
  }

  async stopListening() {
    this.isListening = false;
    
    // Clear historical processing interval
    if (this.historicalProcessingInterval) {
      clearInterval(this.historicalProcessingInterval);
      this.historicalProcessingInterval = null;
    }
    
    // Remove all event listeners
    for (const [key, listener] of this.listeners.entries()) {
      try {
        const [chainId, eventType] = key.split('-');
        const contract = this.contracts.get(parseInt(chainId));
        if (contract && listener) {
          const eventName = 
            eventType === 'locked' ? 'TokenLocked' : 
            eventType === 'burned' ? 'TokenBurned' : 
            eventType === 'completed' ? 'BridgeCompleted' : null;
            
          if (eventName) {
            contract.off(eventName, listener);
            logger.debug(`Removed ${eventName} listener for chain ${chainId}`);
          }
        }
      } catch (error) {
        logger.error(`Error removing listener ${key}:`, error);
      }
    }

    this.listeners.clear();
    logger.info('Event listeners stopped');
  }

  getStatus() {
    return {
      isListening: this.isListening,
      connectedChains: Array.from(this.providers.keys()),
      activeListeners: this.listeners.size,
      reconnectAttempts: Object.fromEntries(this.reconnectAttempts.entries()),
      lastUpdated: new Date().toISOString()
    };
  }
}

export default new EventListener();
