// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/** @author Omnes Blockchain team (@EWCunha and @Afonsodalvi)
    @title Interface for the management contract from Company */

/// -----------------------------------------------------------------------
/// Imports
/// -----------------------------------------------------------------------

import {IERC20Burnable} from "./IERC20Burnable.sol";

/// -----------------------------------------------------------------------
/// Interface
/// -----------------------------------------------------------------------

interface IManagement {
    /// -----------------------------------------------------------------------
    /// Errors
    /// -----------------------------------------------------------------------

    ///@dev error for when caller is not allowed creator or manager
    error Management__NotAllowed();

    ///@dev error for when collection name is invalid
    error Management__InvalidName();

    ///@dev error for when collection symbol is invalid
    error Management__InvalidSymbol();

    ///@dev error for when the input is an invalid address
    error Management__InvalidAddress();

    ///@dev error for when the resulting max supply is 0
    error Management__FundMaxSupplyIs0();

    ///@dev error for when a token contract address is set for ETH/MATIC
    error Management__CannotSetAddressForETH();

    ///@dev error for when creator is corrupted
    error Management__CreatorCorrupted();

    ///@dev error for when an invalid collection address is given
    error Management__InvalidCollection();

    ///@dev error for when not the collection creator address calls function
    error Management__NotCollectionCreator();

    ///@dev error for when given address is not allowed creator
    error Management__AddressNotCreator();

    /// -----------------------------------------------------------------------
    /// Type declarations (structs and enums)
    /// -----------------------------------------------------------------------

    /** @dev enum to specify the coin/token of transfer 
        @param ETH_COIN: ETH
        @param USD_TOKEN: a US dollar stablecoin        
        @param CREATORS_TOKEN: ERC20 token from Company
        @param REPUTATION_TOKEN: ERC20 token for reputation */
    enum Coin {
        ETH_COIN,
        USD_TOKEN,
        CREATORS_TOKEN,
        REPUTATION_TOKEN
    }

    /** @dev struct to be used as imput parameter that comprises with values for
    setting the crowdfunding contract   
        @param valuesLowQuota: array of values for the low class quota in ETH, USD token, and Company token
        @param valuesRegQuota: array of values for the regular class quota in ETH, USD token, and Company token 
        @param valuesHighQuota: array of values for the high class quota in ETH, USD token, and Company token 
        @param amountLowQuota: amount of low class quotas available 
        @param amountRegQuota: amount of low regular quotas available
        @param amountHighQuota: amount of low high quotas available 
        @param donationReceiver: address for the donation receiver 
        @param donationFee: fee value for the donation
        @param minSoldRate: minimum rate of sold quotas
        @param crowdfundDuration: duration of the crowdfund, in seconds */
    struct CrowdFundParams {
        uint256[3] valuesLowQuota;
        uint256[3] valuesRegQuota;
        uint256[3] valuesHighQuota;
        uint256 amountLowQuota;
        uint256 amountRegQuota;
        uint256 amountHighQuota;
        address donationReceiver;
        uint256 donationFee;
        uint256 minSoldRate;
        uint256 crowdfundDuration;
    }

    /** @dev struct used for store creators info
        @param escrow: escrow address for a creator
        @param isAllowed: defines if address is an allowed creator (true) or not (false) */
    struct Creator {
        //address escrow;
        bool isAllowed;
    }

    /// -----------------------------------------------------------------------
    /// Events
    /// -----------------------------------------------------------------------

    /** @dev event for when a new ERC721 art collection is instantiated
        @param collection: new ERC721 art collection address
        @param creator: collection creator address 
        @param caller: caller address of the function */
    event ArtCollection(
        address indexed collection,
        address indexed creator,
        address indexed caller
    );

    /** @dev event for when a new ERC721 crowdfund collection is instantiated
        @param fundCollection: new ERC721 crowdfund collection address
        @param artCollection: new ERC721 art collection address
        @param creator: collection creator address 
        @param caller: caller address of the function */
    event Crowdfund(
        address indexed fundCollection,
        address indexed artCollection,
        address indexed creator,
        address caller
    );

    /** @dev event for when a new ERC721 collection from Company staff is instantiated
        @param collection: new ERC721 address
        @param creator: creator address of the ERC721 collection */
    event CreatorsCollection(
        address indexed collection,
        address indexed creator
    );

    /** @dev event for when a creator address is set
        @param creator: the creator address that was set
        @param allowed: the permission given for the address
        @param manager: the manager address that has done the setting */
    event CreatorSet(
        address indexed creator,
        bool allowed,
        address indexed manager
    );

    /** @dev event for when a new beacon admin address for ERC721 art collection contract is set
        @param beacon: new beacon admin address
        @param manager: the manager address that has done the setting */
    event NewBeaconAdminArt(address indexed beacon, address indexed manager);

    /** @dev event for when a new beacon admin address for ERC721 crowdfund collection contract is set 
        @param beacon: new beacon admin address
        @param manager: the manager address that has done the setting */
    event NewBeaconAdminFund(address indexed beacon, address indexed manager);

    /** @dev event for when a new beacon admin address for ERC721 Company collection contract is set 
        @param beacon: new beacon admin address
        @param manager: the manager address that has done the setting */
    event NewBeaconAdminCompany(
        address indexed beacon,
        address indexed manager
    );

    /** @dev event for when a new multisig wallet address is set
        @param multisig: new multisig wallet address
        @param manager: the manager address that has done the setting */
    event NewMultiSig(address indexed multisig, address indexed manager);

    /** @dev event for when a creator address is set
        @param setManager: the manager address that was set
        @param allowed: the permission given for the address
        @param manager: the manager address that has done the setting */
    event ManagerSet(
        address indexed setManager,
        bool allowed,
        address indexed manager
    );

    /** @dev event for when a new token contract address is set
        @param manager: address of the manager that has set the hash object
        @param token: address of the token contract 
        @param coin: coin/token of the contract */
    event TokenContractSet(
        address indexed manager,
        address indexed token,
        Coin coin
    );

    /** @dev event for when a new ERC721 staking contract is instantiated
        @param staking: new ERC721 staking contract address
        @param creator: contract creator address 
        @param caller: caller address of the function */
    event CRPStaking(
        address indexed staking,
        address indexed creator,
        address indexed caller
    );

    /** @dev event for when a creator's address is set to corrupted (true) or not (false) 
        @param manager: maanger's address
        @param creator: creator's address
        @param corrupted: boolean that sets if creatos is corrupted (true) or not (false) */
    event CorruptedAddressSet(
        address indexed manager,
        address indexed creator,
        bool corrupted
    );

    /** @dev event for when a new beacon admin address for ERC721 staking contract is set 
        @param beacon: new beacon admin address
        @param manager: the manager address that has done the setting */
    event NewBeaconAdminStaking(
        address indexed beacon,
        address indexed manager
    );

    /** @dev event for when a new proxy address for reward contract is set 
        @param proxy: new beacon admin address
        @param manager: the manager address that has done the setting */
    event NewProxyReward(address indexed proxy, address indexed manager);

    /** @dev event for when a Company collection is set
        @param collection: collection address
        @param set: true if collection is from Company, false otherwise */
    event CollectionSet(address indexed collection, bool set);

    /// -----------------------------------------------------------------------
    /// Functions
    /// -----------------------------------------------------------------------

    // --- Implemented functions ---

    /** @dev smart contract's initializer/constructor.
        @param beaconAdminFund: address of the beacon admin for the creators ERC721 fund smart contract
        @param beconAdminCompany: address of the beacon admin for the Company ERC721 smart contract 
        @param erc20USD: address of a stablecoin contract (USDC/USDT/DAI)
        @param multiSig: address of the Multisig smart contract */
    function initialize(
        //address beaconAdminArt,
        address beaconAdminFund,
        address beconAdminCompany,
        address erc20USD,
        address multiSig
    ) external;

    /** @notice instantiates/deploys new NFT fund collection smart contract.
        @param name: name of the NFT collection
        @param symbol: symbol of the NFT collection
        @param baseURI: base URI for the collection's metadata
        @param cfParams: parameters of the crowdfunding */
    function newCrowdfund(
        string memory name,
        string memory symbol,
        string memory baseURI,
        /*uint256 royalty,*/
        CrowdFundParams memory cfParams
    ) external;

    /** @notice instantiates/deploys new NFT fund collection smart contract.
        @param name: name of the NFT collection
        @param symbol: symbol of the NFT collection
        @param baseURI: base URI for the collection's metadata
        @param owner: owner address of the collection
        @param cfParams: parameters of the crowdfunding */
    function newCrowdfund(
        string memory name,
        string memory symbol,
        string memory baseURI,
        /*uint256 royalty,*/
        address owner,
        CrowdFundParams memory cfParams
    ) external;


    /** @notice instantiates new ERC721 staking contract
        @param stakingToken: crowdfunding contract NFTArt address
        @param timeUnit: unit of time to be considered when calculating rewards
        @param rewardsPerUnitTime: stipulated time reward */
    // function newCRPStaking(
    //     address stakingToken,
    //     uint256 timeUnit,
    //     uint256[3] calldata rewardsPerUnitTime
    // ) external;

    /** @notice instantiates new ERC721 staking contract
        @param stakingToken: crowdfunding contract NFTArt address
        @param timeUnit: unit of time to be considered when calculating rewards
        @param rewardsPerUnitTime: stipulated time reward
        @param owner: owner address of the collection */
    // function newCRPStaking(
    //     address stakingToken,
    //     uint256 timeUnit,
    //     uint256[3] calldata rewardsPerUnitTime,
    //     address owner
    // ) external;

    // --- Setter functions ---

    /** @notice sets manager permission.
        @param manager: manager address
        @param allowed: boolean that specifies if manager address has permission (true) or not (false) */
    function setManager(address manager, bool allowed) external;

    /** @notice sets new beacon admin address for the creators ERC721 art smart contract.
        @param beacon: new address */
    function setBeaconAdminArt(address beacon) external;

    /** @notice sets new beacon admin address for the creators ERC721 fund smart contract.
        @param beacon: new address */
    function setBeaconAdminFund(address beacon) external;

    /** @notice sets new beacon admin address for the Company ERC721 smart contract.
        @param beacon: new address */
    function setBeaconAdminCompany(address beacon) external;

    /** @notice sets new address for the Multisig smart contract.
        @param multisig: new address */
    function setMultiSig(address multisig) external;

    /** @notice sets new contract address for the given token 
        @param coin: coin/token for the given contract address
        @param token: new address of the token contract */
    function setTokenContract(Coin coin, address token) external;

    /** @notice sets given creator address to corrupted (true) or not (false)
        @param creator: creator address
        @param corrupted: boolean that sets if creatos is corrupted (true) or not (false) */
    function setCorrupted(address creator, bool corrupted) external;

    /** @notice sets new beacon admin address for the ERC721 staking smart contract.
        @param beacon: new address */
    function setBeaconAdminStaking(address beacon) external;

    /** @notice sets new proxy address for the reward smart contract.
        @param proxy: new address */
    //function setProxyReward(address proxy) external;

    /** @notice sets new collection address
        @param collection: collection address
        @param set: true (collection from Company) or false */
    //function setCollections(address collection, bool set) external;

    ///@notice pauses the contract so that functions cannot be executed.
    function pause() external;

    ///@notice unpauses the contract so that functions can be executed
    function unpause() external;

    // --- Getter functions ---

    // --- From storage variables ---

    /** @notice reads beaconAdminArt storage variable
        @return address of the beacon admin for the art collection (ERC721) contract */
    function getBeaconAdminArt() external view returns (address);

    /** @notice reads beaconAdminFund storage variable
        @return address of the beacon admin for the crowdfund (ERC721) contract */
    function getBeaconAdminFund() external view returns (address);

    /** @notice reads beconAdminCompany storage variable
        @return address of the beacon admin for the Company collection (ERC721) contract */
    function getBeaconAdminCompany() external view returns (address);

    /** @notice reads beaconAdminStaking storage variable
        @return address of the beacon admin for staking contract */
    function getBeaconAdminStaking() external view returns (address);

    /** @notice reads proxyReward storage variable
        @return address of the beacon admin for staking contract */
    //function getProxyReward() external view returns (ICRPReward);

    /** @notice reads multiSig storage variable 
        @return address of the multisig wallet */
    function getMultiSig() external view returns (address);

    /** @notice reads fee storage variable 
        @return the royalty fee */
    function getFee() external pure returns (uint256);

    /** @notice reads managers storage mapping
        @param caller: address to check if is manager
        @return boolean if the given address is a manager */
    function getManagers(address caller) external view returns (bool);

    /** @notice reads tokenContract storage mapping
        @param coin: coin/token for the contract address
        @return IERC20 instance for the given coin/token */
    function getTokenContract(Coin coin) external view returns (IERC20Burnable);

    /** @notice reads isCorrupted storage mapping 
        @param creator: creator address
        @return bool that sepcifies if creator is corrupted (true) or not (false) */
    function getIsCorrupted(address creator) external view returns (bool);

    /** @notice reads collections storage mapping 
        @param collection: collection address
        @return bool that sepcifies if collection is from Company (true) or not (false)  */
    function getCollections(address collection) external view returns (bool);

    /** @notice reads stakingCollections storage mapping 
        @param collection: collection address
        @return bool that sepcifies if staking collection is from Company (true) or not (false)  */
    function getStakingCollections(
        address collection
    ) external view returns (bool);

    /** @notice gets the address of the current implementation smart contract 
        @return address of the current implementation contract */
    function getImplementation() external returns (address);

    /** @notice reads creators storage mapping
        @param caller: address to check if is allowed creator
        @return Creator struct with creator info */
    function getCreator(address caller) external view returns (Creator memory);
}
