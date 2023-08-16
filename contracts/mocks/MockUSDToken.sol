// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import {ERC20} from "../@openzeppelin/token/ERC20.sol";

contract MockUSDToken is ERC20 {
    address immutable creator;
    uint8 private immutable __decimals;

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals
    ) ERC20(_name, _symbol) {
        creator = msg.sender;
        __decimals = _decimals;
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }

    function decimals() public view override(ERC20) returns (uint8) {
        return __decimals;
    }
}
