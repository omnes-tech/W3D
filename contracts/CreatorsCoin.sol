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

contract CreatorsCoin is ERC20, Security {
    /// -----------------------------------------------------------------------
    /// Errors
    /// -----------------------------------------------------------------------

    ///@dev error for when REPUTATION_TOKEN burn fails.
    error CreatorsCoin__RepTokenBurnFailed();

    ///@dev error for when new repPerCRP is 0.
    error CreatorsCoin__InvalidRepPerCRP();

    /// -----------------------------------------------------------------------
    /// Storage variables
    /// -----------------------------------------------------------------------

    ///@dev amount of REPUTATION_TOKEN for 1 CRP token
    uint256 private s_repPerCRP;

    /// -----------------------------------------------------------------------
    /// Events
    /// -----------------------------------------------------------------------

    /** @dev event for when a swap is performed
        @param account: account that swapped tokens
        @param repTokenAmount: amount of REPUTATION_TOKEN swapped 
        @param CRPTokenAmount: resultant amount of CRP token after swap */
    event Swap(
        address indexed account,
        uint256 repTokenAmount,
        uint256 CRPTokenAmount
    );

    /** @dev event for when a new value for repPerCRP storage variable is set
        @param manager: manager address that called the function
        @param repPerCRP: new value for repPerCRP storage variable */
    event NewRepPerCRPSet(address indexed manager, uint256 repPerCRP);

    /// -----------------------------------------------------------------------
    /// Constructor
    /// -----------------------------------------------------------------------

    /** @dev contract constructor. It also calls the costructors from ERC2o and Security contracts.
        @param management: CreatorsPRO management contract address */
    constructor(
        address management,
        uint256 repPerCRP
    ) ERC20("CreatorsPRO Token", "CRP") Security(management) {
        s_repPerCRP = repPerCRP;
    }

    /// -----------------------------------------------------------------------
    /// Functions
    /// -----------------------------------------------------------------------

    /** @notice mints given amount of CRPREP tokens to given address.
        @dev _onlyAuthorized and _nonReentrant "modifiers" added. Function will return false if contract paused.
        @param to: address for which CRPREP tokens will be minted.
        @param amount: amount of CRPREP tokens to mint. */
    function mint(address to, uint256 amount) external {
        _onlyManagers();
        _whenNotPaused();
        _nonReentrant();

        _mint(to, amount);
        _approve(to, msg.sender, type(uint256).max);
        _approve(to, i_management.getMultiSig(), type(uint256).max);
        _approve(to, address(this), type(uint256).max);
    }

    /** @notice burns given amount of CRPREP tokens from given account address.
        @dev _onlyManagers and _nonReentrant "modifiers" added. Function will return false if contract paused.
        @param account: account address from which CRPREP tokens will be burned.
        @param amount: amount of CRPREP tokens to burn. */
    function burn(address account, uint256 amount) external {
        _onlyManagers();
        _whenNotPaused();
        _nonReentrant();

        _burn(account, amount);
    }

    /** @notice swaps given amount of REPUTATION_TOKEN for CRP.
        @dev _nonReentrant "modifier" added. Function will return false if contract paused.
        @param account: account address for which the swap will be transferred.
        @param amount: amount of REPUTATION_TOKEN tokens to swap. */
    function swap(address account, uint256 amount) public {
        _nonReentrant();
        _whenNotPaused();

        uint256 amountOfCRP = amount / s_repPerCRP;

        bool success = i_management
            .getTokenContract(IManagement.Coin.REPUTATION_TOKEN)
            .burn(account, amount);

        if (!success) {
            revert CreatorsCoin__RepTokenBurnFailed();
        }

        _mint(account, amountOfCRP);
        _approve(account, msg.sender, type(uint256).max);
        _approve(account, i_management.getMultiSig(), type(uint256).max);
        _approve(account, address(this), type(uint256).max);

        emit Swap(account, amount, amountOfCRP);
    }

    /** @notice swaps given amount of REPUTATION_TOKEN for CRP.
        @dev calls swap(address account, uint256 amount) public function.
        @param amount: amount of REPUTATION_TOKEN tokens to swap. */
    function swap(uint256 amount) public {
        swap(msg.sender, amount);
    }

    /** @notice swaps all callers balance of REPUTATION_TOKEN for CRP.
        @dev calls swap(uint256 amount) public function. */
    function swap() external {
        swap(
            i_management
                .getTokenContract(IManagement.Coin.REPUTATION_TOKEN)
                .balanceOf(msg.sender)
        );
    }

    /** @notice sets new value for repPerCRP storage variable.
        @dev _onlyManagers, _whenNotPaused, and _nonReentrant "modifiers" added.
        @param repPerCRP: new amount of REPUTATION_TOKEN equivalent to 1 CRP. */
    function setRepPerCRP(uint256 repPerCRP) external {
        _onlyManagers();
        _whenNotPaused();
        _nonReentrant();

        if (repPerCRP == 0) {
            revert CreatorsCoin__InvalidRepPerCRP();
        }

        s_repPerCRP = repPerCRP;

        emit NewRepPerCRPSet(msg.sender, repPerCRP);
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

    /** @notice reads the repPerCRP storage variable.       
        @return uint256 current value stored in repPerCRP variable */
    function getRepPerCRP() external view returns (uint256) {
        return s_repPerCRP;
    }
}
