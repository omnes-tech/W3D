// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/** @author Omnes Blockchain team (@EWCunha and @Afonsodalvi)
    @title Security settings for upgradeable smart contracts */

/// -----------------------------------------------------------------------
/// Imports
/// -----------------------------------------------------------------------

///@dev inhouse implemented smart contracts and interfaces.
import {IManagement} from "./interfaces/IManagement.sol";

///@dev ERC20 token standard.
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

///@dev security settings.
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

/// -----------------------------------------------------------------------
/// Errors
/// -----------------------------------------------------------------------

///@dev error for when the crowdfund has past due data
error SecurityUpgradeable__NotAllowed();

///@dev error for when the collection/creator has been corrupted
error SecurityUpgradeable__CollectionOrCreatorCorrupted();

///@dev error for when ETH/MATIC transfer fails
error SecurityUpgradeable__TransferFailed();

///@dev error for when ERC20 transfer fails
error SecurityUpgradeable__ERC20TransferFailed();

///@dev error for when ERC20 mint fails
error SecurityUpgradeable__ERC20MintFailed();

///@dev error for when an invalid coin is used
error SecurityUpgradeable__InvalidCoin();

/// -----------------------------------------------------------------------
/// Contract
/// -----------------------------------------------------------------------

contract SecurityUpgradeable is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    /// -----------------------------------------------------------------------
    /// Storage
    /// -----------------------------------------------------------------------

    ///@dev Management contract
    IManagement internal s_management;

    /// -----------------------------------------------------------------------
    /// Events
    /// -----------------------------------------------------------------------

    /** @notice event for when a manager withdraws funds to address
        @param manager: manager address
        @param receiver: withdrawn fund receiver address
        @param amount: amount withdrawn
        @param coin: coin to be withdrawn */
    event WithdrawnToAddress(
        address indexed manager,
        address indexed receiver,
        uint256 amount,
        IManagement.Coin coin
    );

    /// -----------------------------------------------------------------------
    /// Permissions and Restrictions (private functions as modifiers)
    /// -----------------------------------------------------------------------

    ///@dev internal function for whenNotPaused modifier
    function _whenNotPaused() internal view whenNotPaused {}

    ///@dev internal function for nonReentrant modifier
    function _nonReentrant() internal nonReentrant {}

    ///@dev internal function for onlyOwner modifier
    function _onlyOwner() internal view onlyOwner {}

    ///@dev only allowed 3WDfunding manager addresses can call function.
    function _onlyManagers() internal view virtual {
        if (!s_management.getManagers(msg.sender)) {
            revert SecurityUpgradeable__NotAllowed();
        }
    }

    ///@dev checks if caller is authorized
    function _onlyAuthorized() internal view virtual {
        if (!s_management.getIsCorrupted(owner())) {
            if (
                !(s_management.getManagers(msg.sender) ||
                    msg.sender == address(s_management) ||
                    msg.sender == owner())
            ) {
                revert SecurityUpgradeable__NotAllowed();
            }
        } else {
            if (
                !(s_management.getManagers(msg.sender) ||
                    msg.sender == address(s_management))
            ) {
                revert SecurityUpgradeable__NotAllowed();
            }
        }
    }

    ///@dev checks if collection/creator is corrupted
    function _notCorrupted() internal view virtual {
        if (s_management.getIsCorrupted(owner())) {
            revert SecurityUpgradeable__CollectionOrCreatorCorrupted();
        }
    }

    ///@dev checks if used coin is valid
    function _onlyValidCoin(IManagement.Coin coin) internal pure virtual {
        if (coin == IManagement.Coin.REPUTATION_TOKEN) {
            revert SecurityUpgradeable__InvalidCoin();
        }
    }

    /// -----------------------------------------------------------------------
    /// Functions
    /// -----------------------------------------------------------------------

    /** @dev initiates all security dependencies. Uses onlyInitializing modifier.
        @param owner_: address of contract owner
        @param management: management contract address */
    function _SecurityUpgradeable_init(
        address owner_,
        address management
    ) internal virtual onlyInitializing {
        __Ownable_init();
        transferOwnership(owner_);
        __ReentrancyGuard_init();
        __Pausable_init();

        s_management = IManagement(management);
    }

    /** @notice withdraws funds to given address
        @dev whenNotPaused and nonReentrant third parties modifiers added. Only managers are allowed 
        to execute this function.
        @param receiver: fund receiver address
        @param amount: amount to withdraw 
        @param coin: coin to be withdrawn */
    function withdrawToAddress(
        address receiver,
        uint256 amount,
        IManagement.Coin coin
    ) external virtual {
        _nonReentrant();
        _onlyManagers();

        if (coin == IManagement.Coin.ETH_COIN) {
            _transferTo(receiver, amount);
        } else {
            _transferERC20To(coin, address(this), receiver, amount);
        }

        emit WithdrawnToAddress(msg.sender, receiver, amount, coin);
    }

    // --- Pause and Unpause functions ---

    /** @notice pauses the contract so that functions cannot be executed.
        Uses _pause internal function from PausableUpgradeable. */
    function pause() public virtual {
        _nonReentrant();

        _pause();
    }

    /** @notice unpauses the contract so that functions can be executed        
        Uses _pause internal function from PausableUpgradeable. */
    function unpause() public virtual {
        _nonReentrant();

        _unpause();
    }

    // --- Implemented functions ---

    /** @notice performs ETH/MATIC transfer using the call low-level function. It reverts if
        transfer fails. 
        @dev >>IMPORTANT<< [SECURITY] this function does NOT use any modifier!
        @dev >>IMPORTANT<< this function does NOT use nonReentrant modifier or the _nonReentrant internal
        function. Be sure to use one of those in the function that calls this function.
        @param to: transfer receiver address
        @param amount: amount to transfer */
    function _transferTo(address to, uint256 amount) internal virtual {
        if (amount > 0) {
            (bool success, ) = payable(to).call{value: amount}("");

            if (!success) {
                revert SecurityUpgradeable__TransferFailed();
            }
        }
    }

    /** @notice performs ERC20 transfer using the call low-level function. It reverts if
        transfer fails. 
        @dev >>IMPORTANT<< [SECURITY] this function does NOT use any modifier!
        @dev >>IMPORTANT<< this function does NOT use nonReentrant modifier or the _nonReentrant internal
        function. Be sure to use one of those in the function that calls this function.
        @param coin: ERC20 coin to transfer
        @param from: transfer sender address
        @param to: transfer receiver address
        @param amount: amount to transfer */
    function _transferERC20To(
        IManagement.Coin coin,
        address from,
        address to,
        uint256 amount
    ) internal virtual {
        if (coin == IManagement.Coin.ETH_COIN) {
            revert SecurityUpgradeable__InvalidCoin();
        }

        IERC20 token = s_management.getTokenContract(coin);
        bytes memory functionCall;
        if (from == address(this)) {
            functionCall = abi.encodeWithSelector(
                token.transfer.selector,
                to,
                amount
            );
        } else {
            functionCall = abi.encodeWithSelector(
                token.transferFrom.selector,
                from,
                to,
                amount
            );
        }

        (bool success, bytes memory data) = address(token).call(functionCall);
        if (!(success && (data.length == 0 || abi.decode(data, (bool))))) {
            revert SecurityUpgradeable__ERC20TransferFailed();
        }
    }

    /** @notice performs ERC20 mint using the call low-level function. It reverts if
        mint fails. 
        @dev >>IMPORTANT<< [SECURITY] this function does NOT use any modifier!
        @dev >>IMPORTANT<< this function does NOT use nonReentrant modifier or the _nonReentrant internal
        function. Be sure to use one of those in the function that calls this function.
        @param coin: ERC20 coin to mint
        @param to: mint receiver address
        @param amount: amount to mint */
    function _mintERC20Token(
        IManagement.Coin coin,
        address to,
        uint256 amount
    ) internal virtual {
        if (coin == IManagement.Coin.ETH_COIN) {
            revert SecurityUpgradeable__InvalidCoin();
        }

        bool success = s_management.getTokenContract(coin).mint(to, amount);

        if (!success) {
            revert SecurityUpgradeable__ERC20MintFailed();
        }
    }

    /** @notice reads management public storage variable 
        @return IManagement instance of Management interface */
    function getManagement() external view virtual returns (IManagement) {
        return s_management;
    }
}
