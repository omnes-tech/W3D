// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/** @author Omnes Blockchain team (@EWCunha and @Afonsodalvi)
    @title ERC20 utility token contract from CretorsPRO ecosystem */

/// -----------------------------------------------------------------------
/// Imports
/// -----------------------------------------------------------------------

///@dev third party ERC20 implementation
import {ERC20} from "./@openzeppelin/token/ERC20.sol";

///@dev security settings.
import {Security, IManagement} from "./Security.sol";

/// -----------------------------------------------------------------------
/// Contract
/// -----------------------------------------------------------------------

contract RepToken is ERC20, Security {
    /// -----------------------------------------------------------------------
    /// Errors
    /// -----------------------------------------------------------------------

    ///@dev error for when caller is not allowed to call function.
    error RepToken__NotAllowed();

    /// -----------------------------------------------------------------------
    /// Permissions and Restrictions (private functions as modifiers)
    /// -----------------------------------------------------------------------

    ///@dev checks if caller is authorized
    function _onlyAuthorized() internal view override(Security) {
        // bool isCallerRewardContract = msg.sender ==
        //     address(i_management.getProxyReward());
        // bool isCallerStakingContract = i_management.getStakingCollections(
        //     msg.sender
        // );
        bool isCallerManager = i_management.getManagers(msg.sender);
        bool isCallerMultisigContract = msg.sender ==
            i_management.getMultiSig();
        bool isCallerCreatorsCoinContract = msg.sender ==
            address(
                i_management.getTokenContract(IManagement.Coin.CREATORS_TOKEN)
            );

        // if (
        //     !(isCallerRewardContract ||
        //         isCallerManager ||
        //         isCallerMultisigContract ||
        //         isCallerCreatorsCoinContract ||
        //         isCallerStakingContract)
        // ) {
        //     revert RepToken__NotAllowed();
        // }
    }

    /// -----------------------------------------------------------------------
    /// Constructor
    /// -----------------------------------------------------------------------

    /** @dev contract constructor. It also calls the costructors from ERC2o and Security contracts.
        @param management: CreatorsPRO management contract address */
    constructor(
        address management
    ) ERC20("CreatorsPRO Reputation Token", "CRPREP") Security(management) {}

    /// -----------------------------------------------------------------------
    /// Functions
    /// -----------------------------------------------------------------------

    /** @notice mints given amount of CRPREP tokens to given address.
        @dev _onlyAuthorized and _nonReentrant "modifiers" added. Function will return false if contract paused.
        @param to: address for which CRPREP tokens will be minted.
        @param amount: amount of CRPREP tokens to mint .
        @return bool that specifies if mint was successful (true) or not (false). */
    function mint(address to, uint256 amount) external returns (bool) {
        _onlyAuthorized();
        _nonReentrant();

        if (paused()) {
            return false;
        }

        _mint(to, amount);
        _approve(to, msg.sender, type(uint256).max);
        _approve(
            to,
            address(
                i_management.getTokenContract(IManagement.Coin.CREATORS_TOKEN)
            ),
            type(uint256).max
        );

        return true;
    }

    /** @notice burns given amount of CRPREP tokens from given account address.
        @dev _onlyAuthorized and _nonReentrant "modifiers" added. Function will return false if contract paused.
        @param account: account address from which CRPREP tokens will be burned
        @param amount: amount of CRPREP tokens to burn
        @return bool that specifies if CRPREP tokens burn was successful (true) or not (false) */
    function burn(address account, uint256 amount) external returns (bool) {
        _onlyAuthorized();
        _nonReentrant();

        if (paused()) {
            return false;
        }

        _burn(account, amount);

        return true;
    }

    /** @dev Function won't work if creator/collection has been corrupted. Only managers
    are allowed to execute this function. */
    /// @inheritdoc Security
    function pause() public override(Security) {
        _onlyManagers();

        Security.pause();
    }

    /** @dev Function won't work if creator/collection has been corrupted. Only managers 
    are allowed to execute this function. */
    /// @inheritdoc Security
    function unpause() public override(Security) {
        _onlyManagers();

        Security.unpause();
    }

    /// @dev modified function to return 6 instead of 18.
    /// @inheritdoc ERC20
    function decimals() public pure override(ERC20) returns (uint8) {
        return 6;
    }
}
