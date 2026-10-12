// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test-only wrapped native token with the same surface as the chain's WMON.
contract MockWrapped {
    string public constant name = "Wrapped MON";
    string public constant symbol = "WMON";
    uint8 public constant decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
    }

    function approve(address s, uint256 v) external returns (bool) {
        allowance[msg.sender][s] = v;
        return true;
    }

    function transfer(address to, uint256 v) external returns (bool) {
        require(balanceOf[msg.sender] >= v, "balance");
        balanceOf[msg.sender] -= v;
        balanceOf[to] += v;
        return true;
    }

    function transferFrom(address f, address to, uint256 v) external returns (bool) {
        require(balanceOf[f] >= v, "balance");
        if (allowance[f][msg.sender] != type(uint256).max) {
            require(allowance[f][msg.sender] >= v, "allowance");
            allowance[f][msg.sender] -= v;
        }
        balanceOf[f] -= v;
        balanceOf[to] += v;
        return true;
    }
}
