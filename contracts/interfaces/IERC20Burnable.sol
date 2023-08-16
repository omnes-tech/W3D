// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/** @author Omnes Blockchain team (@EWCunha and @Afonsodalvi)
    @title Interface for the ERC20 burnable contract */

/// -----------------------------------------------------------------------
/// Imports
/// -----------------------------------------------------------------------

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// -----------------------------------------------------------------------
/// Interface
/// -----------------------------------------------------------------------

interface IERC20Burnable is IERC20Metadata {
    /// -----------------------------------------------------------------------
    /// Functions
    /// -----------------------------------------------------------------------

    /** @notice mints given amount of tokens to given address.       
        @param to: address for which tokens will be minted.
        @param amount: amount of tokens to mint .
        @return bool that specifies if mint was successful (true) or not (false). */
    function mint(address to, uint256 amount) external returns (bool);

    /** @notice burns given amount tokens from given account address.      
        @param account: account address from which tokens will be burned
        @param amount: amount of tokens to burn
        @return bool that specifies if tokens burn was successful (true) or not (false) */
    function burn(address account, uint256 amount) external returns (bool);
}
