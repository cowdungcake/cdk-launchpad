// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MemeToken {
    string public name;
    string public symbol;
    uint8 public decimals = 18;
    uint256 public totalSupply;

    uint256 public taxPercentage;
    address public taxWallet;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _supply,
        uint256 _taxPercentage,
        address _taxWallet,
        address _owner
    ) {
        require(bytes(_name).length > 0, "Name required");
        require(bytes(_symbol).length > 0, "Symbol required");
        require(_taxWallet != address(0), "Invalid tax wallet");
        require(_owner != address(0), "Invalid owner");
        require(_taxPercentage <= 20, "Tax too high");

        name = _name;
        symbol = _symbol;
        taxPercentage = _taxPercentage;
        taxWallet = _taxWallet;

        totalSupply = _supply * (10 ** decimals);
        balanceOf[_owner] = totalSupply;

        emit Transfer(address(0), _owner, totalSupply);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 currentAllowance = allowance[from][msg.sender];
        require(currentAllowance >= amount, "Allowance exceeded");

        allowance[from][msg.sender] = currentAllowance - amount;
        emit Approval(from, msg.sender, allowance[from][msg.sender]);

        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "Invalid recipient");
        require(balanceOf[from] >= amount, "Insufficient balance");

        uint256 tax = (amount * taxPercentage) / 100;
        uint256 amountAfterTax = amount - tax;

        balanceOf[from] -= amount;
        balanceOf[to] += amountAfterTax;
        emit Transfer(from, to, amountAfterTax);

        if (tax > 0) {
            balanceOf[taxWallet] += tax;
            emit Transfer(from, taxWallet, tax);
        }
    }
}

