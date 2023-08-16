// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {ERC20} from "../@openzeppelin/token/ERC20.sol";

contract MockCreatorsCoin is ERC20 {
    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _initialSupply //1000000000000000000000
    ) ERC20(_name, _symbol) {
        _mint(msg.sender, _initialSupply);
    }
}
