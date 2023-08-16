// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/** @author Omnes Blockchain team (@EWCunha, @Afonsodalvi and @G-Deps)
    @title ERC721 contract for artistic workpieces from allowed artists/content creators */

/// -----------------------------------------------------------------------
/// Imports
/// -----------------------------------------------------------------------

///@dev inhouse implemented smart contracts and interfaces.
import {IERC721ACH} from "./interfaces/IERC721ACH.sol"; ///@dev ATTENTION! ------ understand before implementing
///After meeting with Mercado Bitcoin, I thought of implementing the Hooks for transferring NFTs from crowdfunding according to the dilution of the company.


import {IERC721Acompany} from "./interfaces/IERC721Acompany.sol";
import {IManagement} from "./interfaces/IManagement.sol";
import {ICrowdfund} from "./interfaces/ICrowdfund.sol";

//import {ERC721AC} from "@limitbreak/creator-token-contracts/contracts/erc721c/ERC721AC.sol";

import {ERC721AUpgradeable} from "erc721a-upgradeable/contracts/ERC721AUpgradeable.sol";
//import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';

///@dev ATTENTION! ---- understand everything below before implementing it for good
import {IBeforeTokenTransfersHook} from "./interfaces/IBeforeTokenTransfersHook.sol";
import {IAfterTokenTransfersHook} from "./interfaces/IAfterTokenTransfersHook.sol";
import {IOwnerOfHook} from "./interfaces/IOwnerOfHook.sol";
import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';


///@dev security settings.
import {SecurityUpgradeable, OwnableUpgradeable} from "./SecurityUpgradeable.sol";


contract ERC721Acompany is 
IERC721ACH, 
ERC721AUpgradeable, 
IERC721Acompany, 
SecurityUpgradeable {

    // Specifics of ERC721 settings for Creator project
    uint256 internal s_maxSupply;
    string internal s_baseURI;
    mapping(IManagement.Coin /* coin */ => uint256 /* price_ */)
        internal s_pricePerCoin;
    mapping(uint256 /* tokenId */ => uint256 /* lastTransferTimestamp */)
        internal s_lastTransfer;

    ///@dev mapping that specifies price of token for different coins/tokens.
    mapping(uint256 /* tokenId */ => mapping(IManagement.Coin /* coin */ => uint256 /* price_ */))
        internal s_tokenPrice;

    ///@dev crowdfund contract settings
        address internal s_crowdfund;



    ///@dev Hooks for quotas diluation captable
    mapping(HookType => address) public hooks;


    /// -----------------------------------------------------------------------
    /// Permissions and Restrictions (internal functions as modifiers)
    /// -----------------------------------------------------------------------

    /** @dev checks if it has reached the max supply 
        @param tokenId: ID of the token */
    function _checkSupply(uint256 tokenId) internal view virtual {
        if (s_maxSupply > 0 && !(tokenId < s_maxSupply)) {
            revert ERC721Art__MaxSupplyReached();
        }
    }

    ///@dev checks if caller is authorized (crowdfund)
    function _crowdFundOnlyAuthorized() internal view virtual {
        if (s_crowdfund == address(0)) {
            if (!s_management.getIsCorrupted(owner())) {
                if (
                    !(s_management.getManagers(msg.sender) ||
                        msg.sender == owner())
                ) {
                    revert ERC721Art__NotAllowed();
                }
            } else {
                if (!s_management.getManagers(msg.sender)) {
                    revert ERC721Art__NotAllowed();
                }
            }
        } else {
            if (msg.sender != s_crowdfund) {
                revert ERC721Art__NotAllowed();
            }
        }
    }

    /** @dev checks if calles is token owner 
        @param tokenId: ID of the token */
    function _onlyTokenOwner(uint256 tokenId) internal view virtual {
        if (msg.sender != ERC721AUpgradeable.ownerOf(tokenId)) {
            revert ERC721Art__NotTokenOwner();
        }
    }


    /// -----------------------------------------------------------------------
    /// Receive function
    /// -----------------------------------------------------------------------

    receive() external payable {}

    /// @dev initializer modifier added
    /// @inheritdoc IERC721Acompany
    function initialize(
        string memory name_,
        string memory symbol_,
        address owner_,
        uint256 maxSupply,
        uint256 price_,
        uint256 priceInUSD,
        uint256 priceInCompanyCoin,
        string memory baseURI
    ) external virtual override(IERC721Acompany) initializerERC721A initializer {
        _SecurityUpgradeable_init(owner_, msg.sender);
        __ERC721A_init(name_, symbol_);

        s_maxSupply = maxSupply;
        s_pricePerCoin[IManagement.Coin.ETH_COIN] = price_;
        s_pricePerCoin[IManagement.Coin.USD_TOKEN] = priceInUSD;
        s_pricePerCoin[IManagement.Coin.CREATORS_TOKEN] = priceInCompanyCoin;
        s_baseURI = baseURI;

        address royaltyReceiver;
        if (IManagement(msg.sender).getManagers(owner_)) {
             royaltyReceiver = IManagement(msg.sender).getMultiSig();
         } 

    }


    // --- ERC721 functions ---

    /** @dev whenNotPaused and nonReentrant third parties modifiers added. _tokenId input parameter
    must be less than maxSupply (if not 0). Function won't work if creator/collection has been corrupted. */
    /// @inheritdoc IERC721Acompany
    function mintForCrowdfund(
        uint256[] memory tokenIds,
        uint8[] memory classes,
        address to
    ) external virtual override(IERC721Acompany) {
        _whenNotPaused();
        _nonReentrant();
        _notCorrupted();

        if (s_crowdfund == address(0)) {
            revert ERC721Art__CollectionForFund();
        }

        if (s_crowdfund != msg.sender) {
            revert ERC721Art__CallerNotCrowdfund();
        }

        if (tokenIds.length != classes.length) {
            revert ERC721Art__ArraysDoNotMatch();
        }

        // uint256 precision = s_management
        //     .getProxyReward()
        //     .getInteracPointsPrecision()[2];
        // address escrow = s_escrow;
        // _setApprovalForAll(to, escrow, true);
        for (uint256 ii; ii < tokenIds.length; ++ii) {
            if (!(tokenIds[ii] < s_maxSupply)) {
                revert ERC721Art__MaxSupplyReached();
            }

            _safeMint(to, tokenIds[ii]);
            // _approve(escrow, tokenIds[ii]);
            // _setPoints(
            //     to,
            //     tokenIds[ii],
            //     classes[ii] * MINT_FOR_CROWDFUND_MULTIPLIER * precision,
            //     uint8(IManagement.Coin.USD_TOKEN),
            //     false
            // );
        }
    }


    /** @dev whenNotPaused and nonReentrant third parties modifiers added. 
    Function won't work if creator/collection has been corrupted. 
    Only authorized addresses (managers and creator) can call this function. */
    /// @inheritdoc IERC721Acompany
    // function mintToAddress(
    //     address to,
    //     uint256 tokenId
    // ) external virtual override(IERC721Acompany) {
    //     _whenNotPaused();
    //     _nonReentrant();
    //     _onlyAuthorized();
    //     _mintToAddress(to, tokenId);
    // }


     /////////////////////////////////////////////////
    /// ERC721 overrides
    /////////////////////////////////////////////////

    /**
     * @notice Before token transfer hook. This function is called before any token transfer.
     * This includes minting and burning.
     * @param from The source address.
     * @param to The destination address.
     * @param startTokenId The ID of the first token to be transferred.
     * @param quantity The number of tokens to be transferred.
     */
    function _beforeTokenTransfers(
        address from,
        address to,
        uint256 startTokenId,
        uint256 quantity
    ) internal virtual override {
        super._beforeTokenTransfers(from, to, startTokenId, quantity);
        IBeforeTokenTransfersHook hook = IBeforeTokenTransfersHook(
            hooks[HookType.BeforeTokenTransfers]
        );
        if (address(hook) != address(0)) {
            hook.beforeTokenTransfersHook(from, to, startTokenId, quantity);
        }
    }

    /**
     * @notice After token transfer hook. This function is called after any token transfer.
     * This includes minting and burning.
     * @param from The source address.
     * @param to The destination address.
     * @param startTokenId The ID of the first token to be transferred.
     * @param quantity The number of tokens to be transferred.
     */
    function _afterTokenTransfers(
        address from,
        address to,
        uint256 startTokenId,
        uint256 quantity
    ) internal virtual override {
        super._afterTokenTransfers(from, to, startTokenId, quantity);
        IAfterTokenTransfersHook hook = IAfterTokenTransfersHook(
            hooks[HookType.AfterTokenTransfers]
        );
        if (address(hook) != address(0)) {
            hook.afterTokenTransfersHook(from, to, startTokenId, quantity);
        }
    }

    /**
     * @notice Returns the owner of the `tokenId` token.
     * @dev The owner of a token is also its approver by default.
     * @param tokenId The ID of the token to query.
     * @return owner of the `tokenId` token.
     */
    function ownerOf(
        uint256 tokenId
    ) public view virtual override returns (address owner) {
        bool runSuper;
        IOwnerOfHook hook = IOwnerOfHook(hooks[HookType.OwnerOf]);

        if (address(hook) != address(0)) {
            (owner, runSuper) = hook.ownerOfHook(tokenId);
        } else {
            runSuper = true;
        }

        if (runSuper) {
            owner = super.ownerOf(tokenId);
        }
    }

    /**
     * @notice Returns the address of the contract that implements the logic for the given hook type.
     * @param hookType The type of the hook to query.
     * @return address of the contract that implements the hook's logic.
     */
    function getHook(HookType hookType) external view returns (address) {
        return hooks[hookType];
    }

    /////////////////////////////////////////////////
    /// ERC721C Override
    /////////////////////////////////////////////////

    /**
     * @notice This internal function is used to ensure that the caller is the contract owner.
     * @dev Throws if called by any account other than the owner.
     */
    //function _requireCallerIsContractOwner() internal view virtual override {}


    /////////////////////////////////////////////////
    /// ERC721H Admin Controls
    /////////////////////////////////////////////////

    /**
     * @notice Updates the contract address for a specific hook type.
     * @dev Throws if called by any account other than the owner.
     * Emits a {UpdatedHook} event.
     * @param hookType The type of the hook to set.
     * @param hookAddress The address of the contract that implements the hook's logic.
     */
    function setHook(
        HookType hookType,
        address hookAddress
    ) external virtual {
        _onlyAuthorized();
        hooks[hookType] = hookAddress;
        emit UpdatedHook(msg.sender, hookType, hookAddress);
    }

    /** @dev whenNotPaused and nonReentrant third parties modifiers added. It will also
    revert if caller is not a valid crowdfund contract */
    /// @inheritdoc IERC721Acompany
    function setCrowdfund(
        address crowdfund
    ) external virtual override(IERC721Acompany) {
        _whenNotPaused();
        _nonReentrant();
        if (msg.sender != address(s_management)) {
            revert ERC721Art__NotAllowed();
        }
        if (s_crowdfund != address(0)) {
            revert ERC721Art__CrodFundIsSet();
        }
        uint256 amountLow = ICrowdfund(crowdfund)
            .getQuotaInfos(ICrowdfund.QuotaClass.LOW)
            .amount;
        uint256 amountReg = ICrowdfund(crowdfund)
            .getQuotaInfos(ICrowdfund.QuotaClass.REGULAR)
            .amount;
        uint256 amountHigh = ICrowdfund(crowdfund)
            .getQuotaInfos(ICrowdfund.QuotaClass.HIGH)
            .amount;
        if (
            address(SecurityUpgradeable(crowdfund).getManagement()) !=
            address(s_management) ||
            OwnableUpgradeable(crowdfund).owner() != owner() ||
            amountLow + amountReg + amountHigh != s_maxSupply ||
            address(ICrowdfund(crowdfund).getCollection()) != address(this)
        ) {
            revert ERC721Art__InvalidCrowdFund();
        }

        s_crowdfund = crowdfund;

        emit CrowdfundSet(crowdfund);
    }

    /**
     * @notice This modifier checks if the caller is the contract owner.
     * @dev Throws if called by any account other than the owner.
     */
    // modifier onlyOwner() override{
    //     _requireCallerIsContractOwner();

    //     _;
    // }

    // --- Pause and Unpause functions ---

    /** @dev Function won't work if creator/collection has been corrupted. Only authorized addresses 
    are allowed to execute this function. */
    /// @inheritdoc SecurityUpgradeable
    function pause() public virtual override(SecurityUpgradeable, IERC721Acompany) {
        _crowdFundOnlyAuthorized();

        SecurityUpgradeable.pause();
    }

    /** @dev Function won't work if creator/collection has been corrupted. Only authorized addresses 
    are allowed to execute this function. Uses _pause internal function from PausableUpgradeable. */
    /// @inheritdoc SecurityUpgradeable
    function unpause()
        public
        virtual
        override(SecurityUpgradeable, IERC721Acompany)
    {
        _crowdFundOnlyAuthorized();

        SecurityUpgradeable.unpause();
    }


    
    /// @inheritdoc IERC721Acompany
    function price(
        address token
    ) public view virtual override(IERC721Acompany) returns (uint256) {
        if (
            token ==
            address(s_management.getTokenContract(IManagement.Coin.USD_TOKEN))
        ) {
            return s_pricePerCoin[IManagement.Coin.USD_TOKEN];
        } else if (
            token ==
            address(
                s_management.getTokenContract(IManagement.Coin.CREATORS_TOKEN)
            )
        ) {
            return s_pricePerCoin[IManagement.Coin.CREATORS_TOKEN];
        } else if (token == address(0)) {
            return s_pricePerCoin[IManagement.Coin.ETH_COIN];
        } else {
            revert ERC721Art__InvalidAddress();
        }
    }

    /// @inheritdoc IERC721Acompany
    function getMaxSupply()
        external
        view
        virtual
        override(IERC721Acompany)
        returns (uint256)
    {
        return s_maxSupply;
    }

    /// @inheritdoc IERC721Acompany
    function getBaseURI()
        external
        view
        virtual
        override(IERC721Acompany)
        returns (string memory)
    {
        return s_baseURI;
    }

    /// @inheritdoc IERC721Acompany
    function getPricePerCoin(
        IManagement.Coin coin
    ) external view virtual override(IERC721Acompany) returns (uint256) {
        return s_pricePerCoin[coin];
    }

    /// @inheritdoc IERC721Acompany
    function getLastTransfer(
        uint256 tokenId
    ) external view virtual override(IERC721Acompany) returns (uint256) {
        return s_lastTransfer[tokenId];
    }

    /// @inheritdoc IERC721Acompany
    function getTokenPrice(
        uint256 tokenId,
        IManagement.Coin coin
    ) external view virtual override(IERC721Acompany) returns (uint256) {
        return s_tokenPrice[tokenId][coin];
    }

    /// @inheritdoc IERC721Acompany
    function getCrowdfund()
        external
        view
        virtual
        override(IERC721Acompany)
        returns (address)
    {
        return s_crowdfund;
    }

    /// @inheritdoc IERC721Acompany
    function contractURI()
        external
        view
        virtual
        override(IERC721Acompany)
        returns (string memory)
    {
        return string(abi.encodePacked(s_baseURI, "collection.json"));
    }


}