// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/** @author Omnes Blockchain team (@EWCunha, @Afonsodalvi and @G-Deps)
    @title Interface for the ERC721 contract for crowdfunds from allowed 
    artists/content creators */

/// -----------------------------------------------------------------------
/// Imports
/// -----------------------------------------------------------------------

import {IERC721Acompany} from "./IERC721Acompany.sol";
import {IManagement} from "./IManagement.sol";

/// -----------------------------------------------------------------------
/// Interface
/// -----------------------------------------------------------------------

interface ICrowdfund {
    /// -----------------------------------------------------------------------
    /// Errors
    /// -----------------------------------------------------------------------

    ///@dev error for when the crowdfund has past due data
    error Crowdfund__PastDue();

    ///@dev error for when the caller is not an investor
    error Crowdfund__CallerNotInvestor();

    ///@dev error for when low class quota maximum amount has reached
    error Crowdfund__LowQuotaMaxAmountReached();

    ///@dev error for when regular class quota maximum amount has reached
    error Crowdfund__RegQuotaMaxAmountReached();

    ///@dev error for when low high quota maximum amount has reached
    error Crowdfund__HighQuotaMaxAmountReached();

    ///@dev error for when minimum fund goal is not reached
    error Crowdfund__MinGoalNotReached();

    ///@dev error for when not enough ETH value is sent
    error Crowdfund__NotEnoughValueSent();

    ///@dev error for when the resulting max supply is 0
    error Crowdfund__MaxSupplyIs0();

    ///@dev error for when the caller has no more tokens to mint
    error Crowdfund__NoMoreTokensToMint();

    ///@dev error for when the caller is not invest ID owner
    error Crowdfund__NotInvestIdOwner();

    ///@dev error for when an invalid collection address is given
    error Crowdfund__InvalidCollection();

    ///@dev error for when refund is not possible
    error Crowdfund__RefundNotPossible();

    ///@dev error for when an invalid minimum sold rate is given
    error Crowdfund__InvalidMinSoldRate();

    ///@dev error for when the duration for the crowdfund exceeds allowed
    error Crowdfund__DurationLongerThanAllowed();

    /// -----------------------------------------------------------------------
    /// Type declarations (structs and enums)
    /// -----------------------------------------------------------------------

    /** @dev enum to specify the quota class 
        @param LOW: low class
        @param REGULAR: regular class
        @param HIGH: high class */
    enum QuotaClass {
        LOW,
        REGULAR,
        HIGH
    }

    /** @dev struct with important informations of an invest ID 
        @param index: invest ID index in investIdsPerInvestor array
        @param totalPayment: total amount paid in the investment
        @param sevenDaysPeriod: 7 seven days period end timestamp
        @param coin: coin used for the investment
        @param lowQuotaAmount: low class quota amount bought 
        @param regQuotaAmount: regular class quota amount bought 
        @param highQuotaAmount: high class quota amount bought */
    struct InvestIdInfos {
        uint256 index;
        uint256 totalPayment;
        uint256 sevenDaysPeriod;
        IManagement.Coin coin;
        address investor;
        uint256 lowQuotaAmount;
        uint256 regQuotaAmount;
        uint256 highQuotaAmount;
    }

    /** @dev struct with important information about each quota 
        @param values: array of price values for each coin. Array order: [ETH, US dollar token, CreatorsPRO token]
        @param amount: total amount
        @param bough: amount of bought quotas
        @param nextTokenId: next token ID for the current quota */
    struct QuotaInfos {
        uint256[3] values;
        uint256 amount;
        uint256 bought;
        uint256 nextTokenId;
    }

    /// -----------------------------------------------------------------------
    /// Events
    /// -----------------------------------------------------------------------

    /** @dev event for when shares are bought 
        @param investor: investor's address
        @param investId: ID of the investment
        @param lowQuotaAmount: amount of low class quota
        @param regQuotaAmount: amount of regular class quota
        @param highQuotaAmount: amount of high class quota
        @param totalPayment: amount of shares bought 
        @param coin: coin of investment */
    event Invested(
        address indexed investor,
        uint256 indexed investId,
        uint256 lowQuotaAmount,
        uint256 regQuotaAmount,
        uint256 highQuotaAmount,
        uint256 totalPayment,
        IManagement.Coin coin
    );

    /** @dev event for when an investor withdraws investment 
        @param investor: investor's address 
        @param investId: ID of investment 
        @param amount: amount to be withdrawed
        @param coin: coin of withdrawal */
    event RefundedInvestId(
        address indexed investor,
        uint256 indexed investId,
        uint256 amount,
        IManagement.Coin coin
    );

    /** @dev event for when investor refunds his/her whole investment at once
        @param investor: investor's address 
        @param ETHAmount: amount refunded in ETH/MATIC
        @param USDAmount: amount refunded in USD 
        @param CreatorsCoinAmount: amount refunded in CreatorsCoin 
        @param investIdsRefunded: array of refunded invest IDs */
    event RefundedAll(
        address indexed investor,
        uint256 ETHAmount,
        uint256 USDAmount,
        uint256 CreatorsCoinAmount,
        uint256[] investIdsRefunded
    );

    /** @dev event for when the crowdfund creator withdraws funds 
        @param ETHAmount: amount withdrawed in ETH/MATIC
        @param USDAmount: amount withdrawed in USD
        @param CreatorsCoinAmount: amount withdrawed in CreatorsCoin */
    event CreatorWithdrawed(
        uint256 ETHAmount,
        uint256 USDAmount,
        uint256 CreatorsCoinAmount
    );

    /** @dev event for when the donantion is sent
        @param _donationReceiver: receiver address of the donation
        @param ETHAmount: amount donated in ETH
        @param USDAmount: amount donated in USD
        @param CreatorsCoinAmount: amount donated in CreatorsCoin */
    event DonationSent(
        address indexed _donationReceiver,
        uint256 ETHAmount,
        uint256 USDAmount,
        uint256 CreatorsCoinAmount
    );

    /** @dev event for when an investor has minted his/her tokens
        @param investor: address of investor 
        @param caller: function's caller address */
    event InvestorMinted(address indexed investor, address indexed caller);

    /** @dev event for when a donation is made
        @param caller: function caller address
        @param amount: donation amount
        @param coin: coin of donation */
    event DonationTransferred(
        address indexed caller,
        uint256 amount,
        IManagement.Coin coin
    );

    /** @dev event for when a manager refunds all quotas to given investor address 
        @param manager: manager address that called the function
        @param investor: investor address
        @param ETHAmount: amount refunded in ETH/MATIC
        @param USDAmount: amount refunded in USD 
        @param CreatorsCoinAmount: amount refunded in CreatorsCoin 
        @param investIdsRefunded: array of refunded invest IDs */
    event RefundedAllToAddress(
        address indexed manager,
        address indexed investor,
        uint256 ETHAmount,
        uint256 USDAmount,
        uint256 CreatorsCoinAmount,
        uint256[] investIdsRefunded
    );

    /// -----------------------------------------------------------------------
    /// Functions
    /// -----------------------------------------------------------------------

    // --- Implemented functions ---

    /** @notice initializes this contract.
        @param valuesLowQuota: array of values for low quota
        @param valuesRegQuota: array of values for regular quota
        @param valuesHighQuota: array of values for high quota 
        @param amountLowQuota: amount for low quota 
        @param amountRegQuota: amount for regular quota 
        @param amountHighQuota: amount for high quota 
        @param minSoldRate: minimum rate for sold quotas 
        @param crowdfundDuration: duration of the crowdfund, in seconds
        @param collection: ERC721Art collection address */
    function initialize(
        uint256[3] memory valuesLowQuota,
        uint256[3] memory valuesRegQuota,
        uint256[3] memory valuesHighQuota,
        uint256 amountLowQuota,
        uint256 amountRegQuota,
        uint256 amountHighQuota,
        /*address donationReceiver,*/
        /*uint256 donationFee,*/
        uint256 minSoldRate,
        uint256 crowdfundDuration,
        address collection
    ) external;

    /** @notice buys the given amount of shares in the given coin/token. Payable function.
        @param amountOfLowQuota: amount of low quotas to be bought
        @param amountOfRegularQuota: amount of regular quotas to be bought
        @param amountOfHighQuota: amount of high quotas to be bought
        @param coin: coin of transfer */
    function invest(
        uint256 amountOfLowQuota,
        uint256 amountOfRegularQuota,
        uint256 amountOfHighQuota,
        IManagement.Coin coin
    ) external payable;

    /** @notice buys the given amount of shares in the given coin/token for given address. Payable function.
        @param amountOfLowQuota: amount of low quotas to be bought
        @param amountOfRegularQuota: amount of regular quotas to be bought
        @param amountOfHighQuota: amount of high quotas to be bought 
        @param coin: coin of transfer */
    function investForAddress(
        address investor,
        uint256 amountOfLowQuota,
        uint256 amountOfRegularQuota,
        uint256 amountOfHighQuota,
        IManagement.Coin coin
    ) external payable;

    /** @notice donates the given amount of the given to the crowdfund (will not get ERC721 tokens as reward) 
        @param amount: donation amount
        @param coin: coin/token for donation */
    function donate(uint256 amount, IManagement.Coin coin) external payable;

    /** @notice donates the given amount to the crowdfund (will not get ERC721 tokens as reward) for the given address
        @param donor: donor's address
        @param amount: donation amount
        @param coin: coin/token for donation */
    function donateForAddress(
        address donor,
        uint256 amount,
        IManagement.Coin coin
    ) external payable;

    /** @notice withdraws the fund invested to the calling investor address */
    function refundAll() external;

    /** @notice withdraws the fund invested for the given invest ID to the calling investor address 
        @param investId: ID of the investment */
    function refundWithInvestId(uint256 investId) external;

    /** @notice refunds all quotas to the given investor address
        @param investor: investor address */
    function refundToAddress(address investor) external;

    /** @notice withdraws fund to the calling collection's creator wallet address */
    function withdrawFund() external;

    /** @notice mints token IDs for an investor */
    function mint() external;

    /** @notice mints token IDs for an investor 
        @param investor: investor's address */
    function mint(address investor) external;

    // --- From storage variables ---

    /** @notice reads minSoldRate public storage variable 
        @return uint256 value for the minimum rate of sold quotas */
    function getMinSoldRate() external view returns (uint256);

    /** @notice reads dueDate public storage variable 
        @return uint256 value for the crowdfunding due date timestamp */
    function getDueDate() external view returns (uint256);

    /** @notice reads nextInvestId public storage variable 
        @return uint256 value for the next investment ID */
    function getNextInvestId() external view returns (uint256);

    /** @notice reads investIdsPerInvestor public storage mapping
        @param investor: address of the investor
        @param index: array index
        @return uint256 value for the investment ID  */
    function getInvestIdsPerInvestor(
        address investor,
        uint256 index
    ) external view returns (uint256);

    /** @notice reads donationFee public storage variable 
        @return uint256 value for fee of donation (over 10000) */
    function getDonationFee() external view returns (uint256);

    /** @notice reads donationReceiver public storage variable 
        @return address of the donation receiver */
    function getDonationReceiver() external view returns (address);

    /** @notice reads paymentsPerCoin public storage mapping
        @param investor: address of the investor
        @param coin: coin of transfer
        @return uint256 value for amount deposited from the given investor, of the given coin  */
    function getPaymentsPerCoin(
        address investor,
        IManagement.Coin coin
    ) external view returns (uint256);

    /** @notice reads collection public storage variable 
        @return IERC721Acompany instance of ERC721Acompany interface */
    function getCollection() external view returns (IERC721Acompany);

    /** @notice reads the investIdsPerInvestor public storage mapping 
        @param investor: address of the investor 
        @return uint256 array of invest IDs */
    function getAllInvestIdsPerInvestor(
        address investor
    ) external view returns (uint256[] memory);

    /** @notice reads the quotaInfos public storage mapping 
        @param class_: QuotaClass class of quota 
        @return QuotaInfos struct of information about the given quota class */
    function getQuotaInfos(
        QuotaClass class_
    ) external view returns (QuotaInfos memory);

    /** @notice reads the investIdInfos public storage mapping 
        @param investId: ID of the investment
        @return all information of the given invest ID */
    function getInvestIdInfos(
        uint256 investId
    ) external view returns (InvestIdInfos memory);
}
