// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/** @author Omnes Blockchain team (@EWCunha and @Afonsodalvi)
    @title Interface for the ERC721 contract for artistic workpieces from allowed 
    artists/content creators */

/// -----------------------------------------------------------------------
/// Imports
/// -----------------------------------------------------------------------

import {IManagement} from "./IManagement.sol";

/// -----------------------------------------------------------------------
/// Interface
/// -----------------------------------------------------------------------

interface IERC721Acompany {
    /// -----------------------------------------------------------------------
    /// Errors
    /// -----------------------------------------------------------------------

    ///@dev error for when the collection max supply is reached (when maxSupply > 0)
    error ERC721Art__MaxSupplyReached();

    ///@dev error for when the value sent or the allowance is not enough to mint/buy token
    error ERC721Art__NotEnoughValueOrAllowance();

    ///@dev error for when caller is neighter manager nor collection creator
    error ERC721Art__NotAllowed();

    ///@dev error for when caller is not token owner
    error ERC721Art__NotTokenOwner();

    ///@dev error for when collection is for a crowdfund
    error ERC721Art__CollectionForFund();

    ///@dev error for when an invalid crowdfund address is set
    error ERC721Art__InvalidCrowdFund();

    ///@dev error for when the caller is not the crowdfund contract
    error ERC721Art__CallerNotCrowdfund();

    ///@dev error for when a crowfund address is already set
    error ERC721Art__CrodFundIsSet();

    ///@dev error for when input arrays don't have same length
    error ERC721Art__ArraysDoNotMatch();

    ///@dev error for when an invalid ERC20 contract address is given
    error ERC721Art__InvalidAddress();

    /// -----------------------------------------------------------------------
    /// Events
    /// -----------------------------------------------------------------------

    /** @dev event for when a new mint price is set.
        @param newPrice: new mint price 
        @param coin: token/coin of transfer */
    event PriceSet(uint256 indexed newPrice, IManagement.Coin indexed coin);

    /** @dev event for when owner sets new price for his/her token.
        @param tokenId: ID of ERC721 token
        @param price: new token price
        @param coin: token/coin of transfer */
    event TokenPriceSet(
        uint256 indexed tokenId,
        uint256 price,
        IManagement.Coin indexed coin
    );

    /** @dev event for when royalties transfers are done (mint).
        @param tokenId: ID of ERC721 token
        @param creatorsProRoyalty: royalty to CreatorsPRO
        @param creatorRoyalty: royalty to collection creator 
        @param fromWallet: address from which the payments was made */
    event RoyaltiesTransferred(
        uint256 indexed tokenId,
        uint256 creatorsProRoyalty,
        uint256 creatorRoyalty,
        address fromWallet
    );

    /** @dev event for when owner payments are done (creatorsProSafeTransferFrom).
        @param tokenId: ID of ERC721 token
        @param owner: owner address
        @param amount: amount transferred */
    event OwnerPaymentDone(
        uint256 indexed tokenId,
        address indexed owner,
        uint256 amount
    );

    /** @dev event for when a new royalty fee is set
        @param _royalty: new royalty fee value */
    event RoyaltySet(uint256 _royalty);

    /** @dev event for when a new crowdfund address is set
        @param _crowdfund: address from crowdfund */
    event CrowdfundSet(address indexed _crowdfund);

    /** @dev event for when a new max discount for an ERC20 contract is set
        @param token: ERC20 contract address
        @param discount: discount value */
    event MaxDiscountSet(address indexed token, uint256 discount);

    /** @notice event for when a new coreSFT address is set
        @param caller: function's caller address
        @param _coreSFT: new address for the SFT protocol */
    event NewCoreSFTSet(address indexed caller, address _coreSFT);

    /// -----------------------------------------------------------------------
    /// Functions
    /// -----------------------------------------------------------------------

    // --- Implemented functions ---

    /** @notice initializes the contract. Required function, since a proxy pattern is used.
        @param name_: name of the NFT collection
        @param symbol_: symbol of the NFT collection
        @param owner_: collection owner/creator
        @param maxSupply: maximum NFT supply. If 0 is given, the maximum is 2^255 - 1
        @param price_: mint price of a single NFT
        @param priceInUSD: mint price of a single NFT
        @param priceInCompanyCoin: mint price of a single NFT
        @param baseURI: base URI for the collection's metadata  */
    function initialize(
        string memory name_,
        string memory symbol_,
        address owner_,
        uint256 maxSupply,
        uint256 price_,
        uint256 priceInUSD,
        uint256 priceInCompanyCoin,
        string memory baseURI
    ) external;

    /** @notice mints NFT of the given tokenId to the given address
        @param to: address to which the ticket is going to be minted
        @param tokenId: ID of the token */
    //function mintToAddress(address to, uint256 tokenId) external;

    
    /** @notice mints token for crowdfunding        
        @param tokenIds: array of token IDs to mint
        @param classes: array of classes 
        @param to: address from tokens owner */
    function mintForCrowdfund(
        uint256[] memory tokenIds,
        uint8[] memory classes,
        address to
    ) external;

    /** @notice burns NFT of the given tokenId.
        @param tokenId: token ID to be burned */
    //function burn(uint256 tokenId) external;


    /** @notice sets NFT mint price.
        @param price: new NFT mint price 
        @param coin: coin/token to be set */
    //function setPrice(uint256 price, IManagement.Coin coin) external;

    /** @notice sets the price of the ginve token ID.
        @param tokenId: ID of token
        @param price: new price to be set 
        @param coin: coin/token to be set */
    // function setTokenPrice(
    //     uint256 tokenId,
    //     uint256 price,
    //     IManagement.Coin coin
    // ) external;

    /** @notice sets new base URI for the collection.
        @param uri: new base URI to be set */
    //function setBaseURI(string memory uri) external;

    /** @notice sets the crowdfund address 
        @param crowdfund: crowdfund contract address */
    function setCrowdfund(address crowdfund) external;

    /** @notice gets the price of mint for the given address
        @param token: ERC20 token contract address 
        @return uint256 price value in the given ERC20 token */
    function price(address token) external view returns (uint256);

    ///@notice pauses the contract so that functions cannot be executed.
    function pause() external;

    ///@notice unpauses the contract so that functions can be executed
    function unpause() external;

    // --- From storage variables ---

    /** @notice reads maxSupply public storage variable
        @return uint256 value of maximum supply */
    function getMaxSupply() external view returns (uint256);

    /** @notice reads baseURI public storage variable 
        @return string of the base URI */
    function getBaseURI() external view returns (string memory);

    /** @notice reads price public storage mapping
        @param coin: coin/token for price
        @return uint256 value for price */
    function getPricePerCoin(
        IManagement.Coin coin
    ) external view returns (uint256);

    /** @notice reads lastTransfer public storage mapping 
        @param tokenId: ID of the token
        @return uint256 value for last trasfer of the given token ID */
    function getLastTransfer(uint256 tokenId) external view returns (uint256);

    /** @notice reads tokenPrice public storage mapping 
        @param tokenId: ID of the token
        @param coin: coin/token for specific token price 
        @return uint256 value for price of specific token */
    function getTokenPrice(
        uint256 tokenId,
        IManagement.Coin coin
    ) external view returns (uint256);

    /** @notice reads crowdfund public storage variable 
        @return address of the set crowdfund contract */
    function getCrowdfund() external view returns (address);

    /** @notice gets the contract URI
        @return string of the contract URI */
    function contractURI() external view returns (string memory);
}
