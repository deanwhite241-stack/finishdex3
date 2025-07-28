import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { useWallet } from '../contexts/WalletContext'
import { getContractAddresses } from '../constants/contracts'
import { getTokensByChain } from '../constants/tokens'
import STAKING_ABI from '../../abi/Staking/ESRStaking.json'
import ERC20_ABI from '../../abi/Tokens/DexBridgeToken.json'

export const useStakingContract = () => {
  const { provider, chainId, account } = useWallet()
  const [stakingContract, setStakingContract] = useState<ethers.Contract | null>(null)
  const [esrContract, setEsrContract] = useState<ethers.Contract | null>(null)
  const [usdtContract, setUsdtContract] = useState<ethers.Contract | null>(null)

  useEffect(() => {
    const initializeContracts = async () => {
      if (!provider || !chainId) {
        setStakingContract(null)
        setEsrContract(null)
        setUsdtContract(null)
        return
      }

      try {
        const addresses = getContractAddresses(chainId)
        if (!addresses) return

        const signer = await provider.getSigner()
        
        const staking = new ethers.Contract(addresses.staking, STAKING_ABI, signer)
        
        // Use dedicated ESR token if available, otherwise fall back to DXB
        const esrTokenAddress = addresses.esrToken || addresses.dxbToken;
        const esr = new ethers.Contract(esrTokenAddress, ERC20_ABI, signer)
        
        // Get USDT address from tokens config
        const tokens = getTokensByChain(chainId)
        const usdtToken = tokens.find(token => token.symbol === 'USDT')
        
        if (usdtToken) {
          const usdt = new ethers.Contract(usdtToken.address, ERC20_ABI, signer)
          setUsdtContract(usdt)
        }

        setStakingContract(staking)
        setEsrContract(esr)
      } catch (error) {
        console.error('Error initializing staking contracts:', error)
      }
    }

    initializeContracts()
  }, [provider, chainId])

  const stakeESR = async (amount: string) => {
    if (!stakingContract || !esrContract || !account) {
      console.warn('Contracts not available for stakeESR')
      throw new Error('Staking contract not available')
    }

    try {
      const addresses = getContractAddresses(chainId!)
      if (!addresses) throw new Error('Contract addresses not found')
  
      const amountWei = ethers.parseEther(amount)
      
      // Check allowance
      try {
        const allowance = await esrContract.allowance(account, addresses.staking)
        if (allowance < amountWei) {
          const approveTx = await esrContract.approve(addresses.staking, amountWei)
          await approveTx.wait()
        }
  
        const tx = await stakingContract.stake(amountWei)
        return tx.wait()
      } catch (error) {
        console.error('Error in stakeESR:', error)
        throw error
      }
    } catch (error) {
      console.error('Error preparing for stakeESR:', error)
      throw error
    }
  }

  const unstakeESR = async (amount: string) => {
    if (!stakingContract) {
      console.warn('Staking contract not available for unstakeESR')
      throw new Error('Staking contract not available for unstaking')
    }
    
    try {
      const tx = await stakingContract.unstake(ethers.parseEther(amount))
      return tx.wait()
    } catch (error) {
      console.error('Error in unstakeESR:', error)
      throw error
    }
  }

  const claimAllRewards = async () => {
    if (!stakingContract) {
      console.warn('Staking contract not available for claimAllRewards')
      throw new Error('Staking contract not available for claiming rewards')
    }
    
    try {
      const tx = await stakingContract.claimAllRewards()
      return tx.wait()
    } catch (error) {
      console.error('Error in claimAllRewards:', error)
      throw error
    }
  }

  const getStakeInfo = async (userAddress: string) => {
    if (!stakingContract) {
      console.warn('Staking contract not available for getStakeInfo')
      const defaultStakeInfo = {
        amount: '0',
        stakedAt: 0,
        lockEndsAt: 0,
        canUnstake: false,
        pendingRewards: '0'
      }
      return defaultStakeInfo;
    }
    
    try {
      // Validate address
      if (!userAddress || !ethers.isAddress(userAddress)) {
        throw new Error('Invalid user address');
      }
      
      // Call contract method with proper error handling
      const info = await stakingContract.getStakeInfo(userAddress)
        .catch(error => {
          console.error('StakingContract.getStakeInfo failed:', error);
          throw new Error('Failed to get stake information');
        });
      
      // Format and validate response
      if (!info) {
        throw new Error('Invalid response from staking contract');
      }
      
      return {
        amount: ethers.formatEther(info.amount),
        stakedAt: Number(info.stakedAt),
        lockEndsAt: Number(info.lockEndsAt),
        canUnstake: info.canUnstake,
        pendingRewards: info.pendingRewards ? ethers.formatUnits(info.pendingRewards, 6) : '0' // USDT has 6 decimals
      }
    } catch (error) {
      console.error('Error in getStakeInfo:', error)
      return {
        amount: '0',
        stakedAt: 0,
        lockEndsAt: 0,
        canUnstake: false,
        pendingRewards: '0'
      }
    }
  }

  const getStakingStats = async () => {
    if (!stakingContract) {
      console.warn('Staking contract not available for getStakingStats')
      return { 
        totalStaked: '0',
        totalStakers: 0,
        totalRewardsDistributed: '0',
        pendingRewards: '0',
        currentAPR: '0',
        lastDistribution: 0
      };
    }
    
    try {
      // Call contract method with proper error handling
      const stats = await stakingContract.getStakingStats()
        .catch(error => {
          console.error('StakingContract.getStakingStats failed:', error);
          throw new Error('Failed to get staking statistics');
        });
      
      // Format and validate response
      if (!stats) {
        throw new Error('Invalid response from staking contract');
      }
      
      // Get last distribution timestamp
      let lastDistribution = 0;
      try {
        // Try to get the last distribution timestamp if the contract has this method
        if (stakingContract.lastDistributionTime && typeof stakingContract.lastDistributionTime === 'function') {
          lastDistribution = Number(await stakingContract.lastDistributionTime());
        } else {
          // Try to get the current distribution ID and then get the timestamp from that distribution
          const currentId = await stakingContract.currentDistributionId().catch(() => 0);
          if (currentId > 0) {
            // This is a simplification - in a real contract you'd need to get the distribution struct
            const distribution = await stakingContract.rewardDistributions(currentId).catch(() => ({ distributedAt: 0 }));
            lastDistribution = Number(distribution.distributedAt || 0);
          }
        }
      } catch (error) {
        console.warn('Could not get last distribution timestamp:', error);
      }
      
      try {
        return {
          totalStaked: stats._totalStaked ? ethers.formatEther(stats._totalStaked) : '0',
          totalStakers: stats._totalStakers ? Number(stats._totalStakers) : 0,
          totalRewardsDistributed: stats._totalRewardsDistributed ? ethers.formatUnits(stats._totalRewardsDistributed, 6) : '0',
          pendingRewards: stats._pendingRewards ? ethers.formatUnits(stats._pendingRewards, 6) : '0',
          currentAPR: stats._currentAPR ? ethers.formatEther(stats._currentAPR) : '0',
          lastDistribution
        } 
      } catch (error) {
        console.error('Error parsing staking stats:', error)
        return {
          totalStaked: '0',
          totalStakers: 0,
          totalRewardsDistributed: '0',
          pendingRewards: '0',
          currentAPR: '0',
          lastDistribution: 0
        } 
      }
    } catch (error) {
      console.error('Error in getStakingStats:', error)
      return {
        totalStaked: '0',
        totalStakers: 0,
        totalRewardsDistributed: '0',
        pendingRewards: '0',
        currentAPR: '0',
        lastDistribution: 0
      } 
    }
  }

  const checkFeeRequirements = async (userAddress: string) => {
    if (!stakingContract) {
      console.warn('Staking contract not available for checkFeeRequirements')
      return { 
        hasBalance: false,
        hasAllowance: false,
        balance: '0',
        allowance: '0'
      } 
    }
    
    try {
      const requirements = await stakingContract.checkFeeRequirements(userAddress) 
      return { 
        hasBalance: requirements.hasBalance,
        hasAllowance: requirements.hasAllowance,
        balance: requirements.balance.toString(),
        allowance: requirements.allowance.toString()
      } 
    } catch (error) {
      console.error('Error in checkFeeRequirements:', error)
      return {
        hasBalance: false,
        hasAllowance: false,
        balance: '0',
        allowance: '0'
      }
    }
  }

  const distributeRewards = async () => {
    if (!stakingContract) {
      console.warn('Staking contract not available for distributeRewards')
      throw new Error('Staking contract not available for distributing rewards')
    }
    
    try {
      // Check if there are pending rewards to distribute
      const stats = await getStakingStats().catch(() => ({ pendingRewards: '0' }));
      if (parseFloat(stats.pendingRewards) <= 0) {
        throw new Error('No pending rewards to distribute');
      }
      
      // Execute the distribution transaction
      const tx = await stakingContract.distributeRewards();
      return tx.wait();
    } catch (error) {
      console.error('Error distributing rewards:', error);
      
      // Provide more specific error messages
      if ((error as any).message && (error as any).message.includes('No pending rewards')) {
        throw new Error('There are no pending rewards to distribute');
      } else if ((error as any).message && (error as any).message.includes('No stakers')) {
        throw new Error('There are no active stakers to receive rewards');
      } else {
        throw error;
      }
    }
  }
  
  // Calculate APR based on recent rewards and total staked
  const calculateAPR = (rewardsDistributed: string, totalStaked: string, days: number = 30): string => {
    try {
      if (!rewardsDistributed || !totalStaked || parseFloat(totalStaked) === 0) return '0';
      
      const rewards = parseFloat(rewardsDistributed);
      const staked = parseFloat(totalStaked);
      
      // Annual percentage rate = (rewards / staked) * (365 / days) * 100
      const apr = (rewards / staked) * (365 / days) * 100;
      return apr.toFixed(2);
    } catch (error) {
      console.error('Error calculating APR:', error);
      return '0';
    }
  }

  return {
    stakingContract,
    esrContract,
    usdtContract,
    stakeESR,
    unstakeESR,
    claimAllRewards,
    getStakeInfo,
    getStakingStats,
    checkFeeRequirements, 
    distributeRewards,
    calculateAPR
  }
}
