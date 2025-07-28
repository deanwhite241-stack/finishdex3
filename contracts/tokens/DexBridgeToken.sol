// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DexBridgeToken is ERC20, ERC20Burnable, Ownable {
    uint256 public constant MAX_SUPPLY = 1000000000 * 10**18; // 1 billion tokens
    
    constructor() ERC20("DexBridge Token", "DXB") {
        // Mint initial supply to deployer
        _mint(msg.sender, 100000000 * 10**18); // 100 million tokens (10% of max supply)
    }
    
    // Allow changing name and symbol for different token types (DXB, ESR, USDT)
    function setName(string memory newName) public onlyOwner {
        _name = newName;
    }
    
    function setSymbol(string memory newSymbol) public onlyOwner {
        _symbol = newSymbol;
    }
    
    function mint(address to, uint256 amount) public onlyOwner {
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds maximum supply");
        _mint(to, amount);
    }
}
