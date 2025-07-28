import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { useWallet } from '../contexts/WalletContext'
import { getContractAddresses } from '../constants/contracts'

// Import ABIs
import FACTORY_ABI from '../../abi/DEX/Factory.json'
import ROUTER_ABI from '../../abi/DEX/Router.json'
import ERC20_ABI from '../../abi/Tokens/DexBridgeToken.json'

export const useDexContract = () => {
  const { provider, chainId, account } = useWallet()
  const [contracts, setContracts] = useState<{
    factory: ethers.Contract | null
    router: ethers.Contract | null
  }>({ factory: null, router: null })

  useEffect(() => {
    const initializeContracts = async () => {
      try {
        if (!provider || !chainId) {
          setContracts({ factory: null, router: null })
          return
        }

        const addresses = getContractAddresses(chainId)
        if (!addresses) {
          setContracts({ factory: null, router: null })
          return
        }

        const signer = await provider.getSigner()
        
        const factory = new ethers.Contract(addresses.factory, FACTORY_ABI, signer)
        const router = new ethers.Contract(addresses.router, ROUTER_ABI, signer)

        setContracts({ factory, router })
      } catch (error) {
        console.error('Error initializing contracts:', error)
        setContracts({ factory: null, router: null })
      }
    }

    initializeContracts()
  }, [provider, chainId])

  const getTokenContract = async (tokenAddress: string) => {
    if (!provider) return null
    const signer = await provider.getSigner()
    try {
      return new ethers.Contract(tokenAddress, ERC20_ABI, signer)
    } catch (error) {
      console.error('Error creating token contract:', error)
      return null
    }
  }

  const getAllPairs = async () => {
    if (!contracts.factory) throw new Error('Factory not available')
    
    try {
      // Check if we're on a network with deployed contracts
      const pairsLength = await contracts.factory.allPairsLength().catch(() => BigInt(0))
      const pairs: string[] = []
      
      // Only try to get pairs if length is greater than 0
      if (pairsLength > 0) {
        for (let i = 0; i < Number(pairsLength); i++) {
          try {
            const pairAddress = await contracts.factory.allPairs(i)
            pairs.push(pairAddress)
          } catch (error) { 
            console.error(`Error getting pair at index ${i}:`, error)
          }
        }
      }
      
      return pairs
    } catch (error) {
      console.error('Error getting all pairs:', error) 
      return []
    }
  }

  const getPairReserves = async (pairAddress: string) => {
    if (!provider) throw new Error('Provider not available')
    
    try { 
      try {
        const signer = await provider.getSigner()
        const pairContract = new ethers.Contract(
          pairAddress,
          [
            'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
            'function token0() external view returns (address)',
            'function token1() external view returns (address)',
            'function totalSupply() external view returns (uint256)'
          ],
          signer
        )
        
        const [reserve0, reserve1] = await pairContract.getReserves().catch(() => [BigInt(0), BigInt(0)]) 
        const token0 = await pairContract.token0()
        const token1 = await pairContract.token1()
        const totalSupply = await pairContract.totalSupply()
        
        return {
          reserve0: ethers.formatEther(reserve0),
          reserve1: ethers.formatEther(reserve1),
          token0,
          token1,
          totalSupply: ethers.formatEther(totalSupply)
        }
      } catch (error) { 
        console.error('Error getting pair details:', error)
        return {
          reserve0: '0',
          reserve1: '0',
          token0: ethers.ZeroAddress,
          token1: ethers.ZeroAddress,
          totalSupply: '0'
        }
      }
    } catch (error) { 
      console.error('Error getting pair reserves:', error)
      return {
        reserve0: '0',
        reserve1: '0',
        token0: ethers.ZeroAddress,
        token1: ethers.ZeroAddress,
        totalSupply: '0'
      }
    }
  }

  const swapExactTokensForTokens = async (
    amountIn: string,
    amountOutMin: string,
    path: string[],
    deadline: number
  ) => {
    if (!contracts.router || !account) throw new Error('Router not available')
    
    const tx = await contracts.router.swapExactTokensForTokens(
      ethers.parseEther(amountIn),
      ethers.parseEther(amountOutMin),
      path,
      account,
      deadline
    )
    
    return tx.wait()
  }

  const addLiquidity = async (
    tokenA: string,
    tokenB: string,
    amountADesired: string,
    amountBDesired: string,
    amountAMin: string,
    amountBMin: string,
    deadline: number
  ) => {
    if (!contracts.router || !account) throw new Error('Router not available')
    
    const tx = await contracts.router.addLiquidity(
      tokenA,
      tokenB,
      ethers.parseEther(amountADesired),
      ethers.parseEther(amountBDesired),
      ethers.parseEther(amountAMin),
      ethers.parseEther(amountBMin),
      account,
      deadline
    )
    
    return tx.wait()
  }

  const getAmountsOut = async (amountIn: string, path: string[]) => {
    if (!contracts.router) throw new Error('Router not available')
    
    try {
      // Validate inputs
      if (!amountIn || isNaN(parseFloat(amountIn)) || parseFloat(amountIn) <= 0) {
        return [amountIn, '0']; // Return input amount and 0 for output if invalid
      }
      
      // Ensure path is valid
      if (!path || !Array.isArray(path) || path.length < 2) {
        throw new Error('Invalid token path');
      }
      
      // Call contract method with proper error handling
      const amounts = await contracts.router.getAmountsOut(
        ethers.parseEther(amountIn),
        path
      ).catch((error: any) => {
        console.error('Router.getAmountsOut failed:', error);
        throw new Error('Failed to calculate output amount');
      });
      
      return amounts ? amounts.map((amount: bigint) => ethers.formatEther(amount)) : [amountIn, '0']
    } catch (error) { 
      console.error('Error getting amounts out:', error)
      return [amountIn, '0'] // Return input amount and 0 for output
    }
  }

  const getPairAddress = async (tokenA: string, tokenB: string) => {
    if (!contracts.factory) throw new Error('Factory not available')
    
    try {
      // Validate token addresses
      if (!tokenA || !ethers.isAddress(tokenA) || !tokenB || !ethers.isAddress(tokenB)) {
        throw new Error('Invalid token addresses');
      }
      
      // Call contract method with proper error handling
      const pairAddress = await contracts.factory.getPair(tokenA, tokenB)
        .catch(error => {
          console.error('Factory.getPair failed:', error);
          throw new Error('Failed to get pair address');
        });
      
      return pairAddress;
    } catch (error) { 
      console.error('Error getting pair address:', error)
      return ethers.ZeroAddress
    }
  }

  const createPair = async (tokenA: string, tokenB: string) => {
    if (!contracts.factory) throw new Error('Factory not available')
    
    try {
      // Validate token addresses
      if (!tokenA || !ethers.isAddress(tokenA) || !tokenB || !ethers.isAddress(tokenB)) {
        throw new Error('Invalid token addresses');
      }
      
      // Check if pair already exists
      const existingPair = await contracts.factory.getPair(tokenA, tokenB)
        .catch(error => {
          console.error('Factory.getPair failed:', error);
          return ethers.ZeroAddress;
        });
      
      if (existingPair !== ethers.ZeroAddress) {
        console.log('Pair already exists:', existingPair);
        return { hash: existingPair };
      }
      
      // Create new pair with proper error handling
      const tx = await contracts.factory.createPair(tokenA, tokenB)
        .catch(error => {
          console.error('Factory.createPair failed:', error);
          throw new Error('Failed to create token pair');
        });
      
      // Wait for transaction confirmation
      const receipt = await tx.wait()
        .catch(error => {
          console.error('Transaction confirmation failed:', error);
          throw new Error('Failed to confirm pair creation');
        });
      
      return receipt;
    } catch (error) { 
      console.error('Error creating pair:', error)
      throw error
    }
  }

  const getTokenBalance = async (tokenAddress: string, userAddress?: string) => {
    try {
      const token = await getTokenContract(tokenAddress)
      if (!token) {
        console.warn('Token contract not available for getTokenBalance')
        return '0'
      }
      
      const address = userAddress || account
      if (!address) {
        console.warn('No address provided for getTokenBalance')
        return '0'
      }
      
      const balance = await token.balanceOf(address)
      return ethers.formatEther(balance)
    } catch (error) {
      console.error('Error getting token balance:', error)
      return '0'
    }
  }

  const approveToken = async (tokenAddress: string, spenderAddress: string, amount: string) => {
    try {
      const token = await getTokenContract(tokenAddress)
      if (!token) {
        throw new Error('Token contract not available for approval')
      }
      
      const tx = await token.approve(spenderAddress, ethers.parseEther(amount))
      return tx.wait()
    } catch (error) {
      console.error('Error approving token:', error)
      throw error
    }
  }

  const getTokenAllowance = async (tokenAddress: string, spenderAddress: string) => {
    try {
      const token = await getTokenContract(tokenAddress)
      if (!token || !account) {
        console.warn('Token contract or account not available for getTokenAllowance')
        return '0'
      }
      
      const allowance = await token.allowance(account, spenderAddress)
      return ethers.formatEther(allowance)
    } catch (error) {
      console.error('Error getting token allowance:', error)
      return '0'
    }
  }

  const checkFeeRequirements = async (userAddress?: string) => {
    try {
      if (!contracts.router) throw new Error('Router not available')
       
      const address = userAddress || account
      if (!address) {
        console.warn('No address provided for checkFeeRequirements')
        return {
          hasBalance: false,
          hasAllowance: false,
          balance: '0',
          allowance: '0'
        }
      }
      
      const requirements = await contracts.router.checkFeeRequirements(address)
      return {
        hasBalance: requirements.hasBalance,
        hasAllowance: requirements.hasAllowance,
        balance: requirements.balance.toString(),
        allowance: requirements.allowance.toString()
      }
    } catch (error) {
      console.error('Error checking fee requirements:', error)
      return {
        hasBalance: false,
        hasAllowance: false,
        balance: '0',
        allowance: '0'
      }
    }
  }

  return {
    contracts,
    getTokenContract,
    getAllPairs,
    getPairReserves,
    swapExactTokensForTokens,
    addLiquidity,
    getAmountsOut,
    getPairAddress,
    createPair,
    getTokenBalance,
    approveToken,
    getTokenAllowance,
    checkFeeRequirements
  }
}
