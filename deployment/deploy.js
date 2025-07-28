const { ethers } = require('hardhat')

async function main() {
  const [deployer] = await ethers.getSigners()
  
  console.log('Deploying contracts with the account:', deployer.address)
  console.log('Account balance:', (await deployer.provider.getBalance(deployer.address)).toString())

  // Get network info
  const network = await deployer.provider.getNetwork()
  const chainId = Number(network.chainId)
  console.log('Deploying to chain ID:', chainId)

  // Deploy USDT first (for fees)
  const USDT = await ethers.getContractFactory('DexBridgeToken') // Reuse token contract for USDT
  const usdt = await USDT.deploy()
  await usdt.waitForDeployment()
  const usdtAddress = await usdt.getAddress()
  console.log('USDT deployed to:', usdtAddress)
  
  // Set USDT name and symbol
  await usdt.setName("Tether USD").catch(error => {
    console.error('Error setting USDT name:', error);
  })
  await usdt.setSymbol("USDT").catch(error => {
    console.error('Error setting USDT symbol:', error);
  })
  console.log('USDT name and symbol set')

  // Deploy WETH first (if not using existing)
  const WETH = await ethers.getContractFactory('WETH')
  const weth = await WETH.deploy()
  await weth.waitForDeployment()
  const wethAddress = await weth.getAddress()
  console.log('WETH deployed to:', wethAddress)

  // Deploy DXB Token (used as governance token)
  const DexBridgeToken = await ethers.getContractFactory('DexBridgeToken')
  const dxbToken = await DexBridgeToken.deploy() 
  await dxbToken.waitForDeployment()
  const dxbTokenAddress = await dxbToken.getAddress()
  console.log('DXB Token deployed to:', dxbTokenAddress)
  
  // Deploy ESR Token (used for staking and rewards)
  const ESRToken = await ethers.getContractFactory('DexBridgeToken')
  const esrToken = await ESRToken.deploy()
  await esrToken.waitForDeployment()
  const esrTokenAddress = await esrToken.getAddress()
  
  // Set ESR name and symbol
  await esrToken.setName("ESR Token").catch(error => {
    console.error('Error setting ESR name:', error);
  })
  await esrToken.setSymbol("ESR").catch(error => {
    console.error('Error setting ESR symbol:', error);
  })
  console.log('ESR Token deployed to:', esrTokenAddress)

  // Deploy Factory
  const Factory = await ethers.getContractFactory('DexBridgeFactory')
  const factory = await Factory.deploy()
  await factory.waitForDeployment()
  const factoryAddress = await factory.getAddress()
  console.log('Factory deployed to:', factoryAddress)

  // Deploy Router
  const Router = await ethers.getContractFactory('DexBridgeRouter')
  const router = await Router.deploy(factoryAddress, wethAddress, usdtAddress)
  await router.waitForDeployment()
  const routerAddress = await router.getAddress()
  console.log('Router deployed to:', routerAddress)

  // Deploy ESR Staking Contract
  const ESRStaking = await ethers.getContractFactory('ESRStaking')
  const esrStaking = await ESRStaking.deploy(
    esrTokenAddress, // Use dedicated ESR token
    usdtAddress,
    routerAddress, // Fee collector
    deployer.address  // Reward pool
  )
  await esrStaking.waitForDeployment()
  const stakingAddress = await esrStaking.getAddress()
  console.log('ESR Staking deployed to:', stakingAddress)

  // Deploy Bridge
  const Bridge = await ethers.getContractFactory('DexBridgeCore')
  const bridge = await Bridge.deploy(chainId, deployer.address, usdtAddress) // deployer as fee collector
  await bridge.waitForDeployment()
  const bridgeAddress = await bridge.getAddress()
  console.log('Bridge deployed to:', bridgeAddress)

  // Configure Router with Staking Contract
  await router.setStakingContract(stakingAddress).catch(error => {
    console.error('Error setting staking contract in router:', error);
  })
  console.log('Router configured with staking contract')

  // Configure Bridge with Staking Contract  
  await bridge.setStakingContract(stakingAddress).catch(error => {
    console.error('Error setting staking contract in bridge:', error);
  })
  console.log('Bridge configured with staking contract')

  // Deploy LP Farming Contract
  const LPFarming = await ethers.getContractFactory('LPFarming')
  const lpFarming = await LPFarming.deploy(
    esrTokenAddress, // Use dedicated ESR token for farming rewards
    deployer.address, // Reward pool
    ethers.parseEther('0.1'), // 0.1 ESR per second
    Math.floor(Date.now() / 1000) // Start time
  )
  await lpFarming.waitForDeployment()
  const farmingAddress = await lpFarming.getAddress()
  console.log('LP Farming deployed to:', farmingAddress)

  // Add some initial supported tokens to bridge
  console.log('Adding supported tokens to bridge...')
  
  // Add WETH/WAVAX/WFTM
  try {
    await bridge.addSupportedToken(
      wethAddress,
      chainId,
      true, // is native
      ethers.parseEther('0.001'), // min amount
      ethers.parseEther('100'), // max amount
      250 // 2.5% fee
    )
    console.log(`Added WETH/WAVAX/WFTM to bridge (${wethAddress})`)
  } catch (error) {
    console.error('Error adding wrapped native token to bridge:', error)
  }
  
  // Add DXB Token
  try {
    await bridge.addSupportedToken(
      dxbTokenAddress,
      chainId,
      true, // is native
      ethers.parseEther('1'), // min amount
      ethers.parseEther('10000'), // max amount
      200 // 2% fee
    )
    console.log(`Added DXB token to bridge (${dxbTokenAddress})`)
  } catch (error) {
    console.error('Error adding DXB token to bridge:', error)
  }
  
  // Add ESR Token
  try {
    await bridge.addSupportedToken(
      esrTokenAddress,
      chainId,
      true, // is native
      ethers.parseEther('1'), // min amount
      ethers.parseEther('10000'), // max amount
      200 // 2% fee
    )
    console.log(`Added ESR token to bridge (${esrTokenAddress})`)
  } catch (error) {
    console.error('Error adding ESR token to bridge:', error)
  }

  console.log('Deployment completed!')
  console.log('Contract addresses:')
  console.log('- Factory:', factoryAddress)
  console.log('- Router:', routerAddress)
  console.log('- Bridge:', bridgeAddress)
  console.log('- ESR Staking:', stakingAddress)
  console.log('- LP Farming:', farmingAddress)
  console.log('- DXB Token:', dxbTokenAddress)
  console.log('- ESR Token:', esrTokenAddress)
  console.log('- USDT:', usdtAddress)
  console.log('- WETH:', wethAddress)
  
  // Write contract addresses to a file for easy access
  const fs = require('fs');
  const contractAddresses = {
    factory: factoryAddress || '',
    router: routerAddress || '',
    bridge: bridgeAddress || '',
    staking: stakingAddress || '',
    farming: farmingAddress || '',
    dxbToken: dxbTokenAddress || '',
    esrToken: esrTokenAddress || '',
    usdt: usdtAddress || '',
    weth: wethAddress || ''
  };
  
  try {
    fs.writeFileSync(
      './deployed-addresses.json',
      JSON.stringify({ [chainId]: contractAddresses }, null, 2)
    );
    console.log('Contract addresses written to deployed-addresses.json');
    
    // Also update the frontend contract addresses
    updateFrontendAddresses(chainId, contractAddresses);
  } catch (error) {
    console.error('Error writing contract addresses to file:', error);
  }

  // Chain-specific notes
  if (chainId === 43114 || chainId === 43113) {
    console.log('\n🔺 AVALANCHE DEPLOYMENT NOTES:')
    console.log('- Native token: AVAX')
    console.log('- Wrapped token: WAVAX')
    console.log('- Consider integrating with Trader Joe DEX')
    console.log('- Gas fees are typically low on Avalanche')
    if (chainId === 43113) {
      console.log('- TESTNET: This is Fuji (Avalanche Testnet)')
    }
  } else if (chainId === 250 || chainId === 4002) {
    console.log('\n👻 FANTOM DEPLOYMENT NOTES:')
    console.log('- Native token: FTM')
    console.log('- Wrapped token: WFTM')
    console.log('- Consider integrating with SpookySwap DEX')
    console.log('- Very low gas fees on Fantom')
    if (chainId === 4002) {
      console.log('- TESTNET: This is Fantom Testnet')
    }
  } else if (chainId === 5) {
    console.log('\n⟠ GOERLI DEPLOYMENT NOTES:')
    console.log('- TESTNET: This is Ethereum Goerli Testnet')
    console.log('- Use faucets to get test ETH')
    console.log('- Goerli will be deprecated soon, consider Sepolia for future deployments')
  } else if (chainId === 97) {
    console.log('\n🟡 BSC TESTNET DEPLOYMENT NOTES:')
    console.log('- TESTNET: This is Binance Smart Chain Testnet')
    console.log('- Use BSC faucet to get test BNB')
  } else if (chainId === 80001) {
    console.log('\n🟣 MUMBAI DEPLOYMENT NOTES:')
    console.log('- TESTNET: This is Polygon Mumbai Testnet')
    console.log('- Use Mumbai faucet to get test MATIC')
  }
}

// Add a function to update contract addresses in the frontend
async function updateFrontendAddresses(chainId, addresses) {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const contractsPath = path.join(__dirname, '../src/constants/contracts.ts');
    
    if (!fs.existsSync(contractsPath)) {
      console.warn('contracts.ts file not found, skipping update');
      return;
    }
    
    let content = fs.readFileSync(contractsPath, 'utf8');
    
    // Find the CONTRACT_ADDRESSES object
    const regex = new RegExp(`${chainId}: {[^}]*}`, 'g');
    
    // Create the new content
    const newAddresses = `${chainId}: {
    factory: '${addresses.factory}',
    router: '${addresses.router}',
    bridge: '${addresses.bridge}',
    staking: '${addresses.staking}',
    farming: '${addresses.farming}',
    dxbToken: '${addresses.dxbToken}',
    esrToken: '${addresses.esrToken}',
    weth: '${addresses.weth}'
  }`;
    
    // Replace the existing addresses or add new ones
    if (content.match(regex)) {
      content = content.replace(regex, newAddresses);
    } else {
      // If the chain ID doesn't exist, add it
      content = content.replace(/export const CONTRACT_ADDRESSES: Record<number, ContractAddresses> = {/, 
        `export const CONTRACT_ADDRESSES: Record<number, ContractAddresses> = {\n  ${newAddresses},`);
    }
    
    fs.writeFileSync(contractsPath, content);
    console.log(`Updated contract addresses in contracts.ts for chain ID ${chainId}`);
  } catch (error) {
    console.error('Error updating frontend addresses:', error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
