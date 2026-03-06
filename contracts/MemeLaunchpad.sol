// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MemeToken.sol";

contract MemeLaunchpad {
    address public owner;
    address payable public feeWallet;
    address public immutable taxWallet;
    uint256 public launchFeeWei;

    address[] public allTokens;
    mapping(address => address[]) private _tokensByCreator;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event FeeWalletUpdated(address indexed previousWallet, address indexed newWallet);
    event LaunchFeeUpdated(uint256 previousFeeWei, uint256 newFeeWei);
    event TokenLaunched(
        address indexed creator,
        address indexed token,
        string name,
        string symbol,
        uint256 supply,
        uint256 taxPercentage,
        address taxWallet,
        uint256 feePaidWei
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address payable _feeWallet, uint256 _launchFeeWei, address _taxWallet) {
        require(_feeWallet != address(0), "Invalid fee wallet");
        require(_taxWallet != address(0), "Invalid tax wallet");
        owner = msg.sender;
        feeWallet = _feeWallet;
        taxWallet = _taxWallet;
        launchFeeWei = _launchFeeWei;
        emit OwnershipTransferred(address(0), owner);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setFeeWallet(address payable newFeeWallet) external onlyOwner {
        require(newFeeWallet != address(0), "Invalid fee wallet");
        emit FeeWalletUpdated(feeWallet, newFeeWallet);
        feeWallet = newFeeWallet;
    }

    function setLaunchFeeWei(uint256 newLaunchFeeWei) external onlyOwner {
        emit LaunchFeeUpdated(launchFeeWei, newLaunchFeeWei);
        launchFeeWei = newLaunchFeeWei;
    }

    function launchToken(
        string calldata _name,
        string calldata _symbol,
        uint256 _supply,
        uint256 _taxPercentage
    ) external payable returns (address tokenAddress) {
        require(msg.value == launchFeeWei, "Incorrect launch fee");
        require(_supply > 0, "Supply must be > 0");

        MemeToken token = new MemeToken(_name, _symbol, _supply, _taxPercentage, taxWallet, msg.sender);
        tokenAddress = address(token);

        allTokens.push(tokenAddress);
        _tokensByCreator[msg.sender].push(tokenAddress);

        (bool sent, ) = feeWallet.call{value: msg.value}("");
        require(sent, "Fee transfer failed");

        emit TokenLaunched(msg.sender, tokenAddress, _name, _symbol, _supply, _taxPercentage, taxWallet, msg.value);
    }

    function totalLaunchedTokens() external view returns (uint256) {
        return allTokens.length;
    }

    function getTokensByCreator(address creator) external view returns (address[] memory) {
        return _tokensByCreator[creator];
    }
}
