// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TestUSD
/// @notice Testnet dollar for the quote side of the book. No owner and no open mint: each address
///         may claim a fixed amount once per cooldown, so the supply cannot be conjured at will.
contract TestUSD {
    string public constant name = "Test USD";
    string public constant symbol = "tUSD";
    uint8 public constant decimals = 18;
    uint256 public constant CLAIM = 1_000e18;
    uint256 public constant COOLDOWN = 1 hours;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => uint256) public lastClaim;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error Cooldown(uint256 readyAt);

    function claim() external {
        uint256 last = lastClaim[msg.sender];
        if (last != 0 && block.timestamp < last + COOLDOWN) revert Cooldown(last + COOLDOWN);
        lastClaim[msg.sender] = block.timestamp;
        totalSupply += CLAIM;
        balanceOf[msg.sender] += CLAIM;
        emit Transfer(address(0), msg.sender, CLAIM);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _move(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) {
            require(a >= value, "allowance");
            allowance[from][msg.sender] = a - value;
        }
        _move(from, to, value);
        return true;
    }

    function _move(address from, address to, uint256 value) internal {
        require(balanceOf[from] >= value, "balance");
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
