window.LAUNCHPAD_CONFIG = {
  chainId: 97,
  chainName: "BSC Testnet",
  blockExplorerBaseUrl: "https://testnet.bscscan.com",
  rpcUrls: ["https://data-seed-prebsc-1-s1.binance.org:8545"],
  nativeCurrency: {
    name: "Test BNB",
    symbol: "tBNB",
    decimals: 18
  },
  factoryAddress: "0xYourLaunchpadAddress",
  abi: [
    {
      "inputs": [
        { "internalType": "address payable", "name": "_feeWallet", "type": "address" },
        { "internalType": "uint256", "name": "_launchFeeWei", "type": "uint256" },
        { "internalType": "address", "name": "_taxWallet", "type": "address" }
      ],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "anonymous": false,
      "inputs": [
        { "indexed": true, "internalType": "address", "name": "creator", "type": "address" },
        { "indexed": true, "internalType": "address", "name": "token", "type": "address" },
        { "indexed": false, "internalType": "string", "name": "name", "type": "string" },
        { "indexed": false, "internalType": "string", "name": "symbol", "type": "string" },
        { "indexed": false, "internalType": "uint256", "name": "supply", "type": "uint256" },
        { "indexed": false, "internalType": "uint256", "name": "taxPercentage", "type": "uint256" },
        { "indexed": false, "internalType": "address", "name": "taxWallet", "type": "address" },
        { "indexed": false, "internalType": "uint256", "name": "feePaidWei", "type": "uint256" }
      ],
      "name": "TokenLaunched",
      "type": "event"
    },
    {
      "inputs": [],
      "name": "launchFeeWei",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "string", "name": "_name", "type": "string" },
        { "internalType": "string", "name": "_symbol", "type": "string" },
        { "internalType": "uint256", "name": "_supply", "type": "uint256" },
        { "internalType": "uint256", "name": "_taxPercentage", "type": "uint256" }
      ],
      "name": "launchToken",
      "outputs": [{ "internalType": "address", "name": "tokenAddress", "type": "address" }],
      "stateMutability": "payable",
      "type": "function"
    }
  ]
};
