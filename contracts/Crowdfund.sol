// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/** @author Omnes Blockchain team (@EWCunha, @Afonsodalvi and @G-Deps)
    @title ERC721 contract for crowdfunds from allowed artists/content creators */

/// -----------------------------------------------------------------------
/// Imports
/// -----------------------------------------------------------------------

///@dev inhouse implemented smart contracts and interfaces.
import {ICrowdfund, IERC721Acompany, IManagement} from "./interfaces/ICrowdfund.sol";

///@dev security settings.
import {SecurityUpgradeable, OwnableUpgradeable} from "./SecurityUpgradeable.sol";

/// -----------------------------------------------------------------------
/// Contract
/// -----------------------------------------------------------------------

contract Crowdfund is ICrowdfund, SecurityUpgradeable {
    /// -----------------------------------------------------------------------
    /// Storage variables
    /// -----------------------------------------------------------------------

    // fund settings
    uint256 internal s_minSoldRate; // over 10000
    uint256 internal s_dueDate;
    uint256 internal s_nextInvestId; // 0 is for invalid invest ID
    mapping(address /* investor */ => uint256[] /* investIds */)
        internal s_investIdsPerInvestor;
    mapping(QuotaClass /* class_ */ => QuotaInfos /* infos */)
        internal s_quotaInfos;
    mapping(uint256 /* investId */ => InvestIdInfos /* infos */)
        internal s_investIdInfos;

    // donation
    uint256 internal s_donationFee; // over 10000
    address internal s_donationReceiver;

    // investments made per coin
    mapping(address /*investor*/ => mapping(IManagement.Coin /* coin */ => uint256 /* amount */))
        internal s_paymentsPerCoin;

    // IERC721Acompany contract
    IERC721Acompany internal s_collection;

    // constants
    uint256 internal constant MIN_SOLD_RATE = 6700; //over 10000
    //Art. 5º, III CVM88 --minimum target value must be equal to or greater than 2/3 (two thirds) of the target value maximum;
    uint256 internal constant MAX_SOLD_RATE = 10000;
    uint256 internal constant RATIO_DENOMINATOR = 10000;
    uint256 internal constant W3DFUNDING_ROYALTY_FEE = 900; // royalty to W3DFUNDING = 9% (over 10000)
    uint256 internal constant SEVEN_DAYS = 0 days; ///@dev change to 7 days
    uint256 internal constant SIX_MONTH = 6 * 31 days; //Art. 3º, I CVM88

    /// -----------------------------------------------------------------------
    /// Permissions and Restrictions (private functions as modifiers)
    /// -----------------------------------------------------------------------

    ///@dev checks if the caller has still shares/is an investor
    function _checkIfInvestor(address _investor) internal view virtual {
        if (!(s_investIdsPerInvestor[_investor].length > 0)) {
            revert Crowdfund__CallerNotInvestor();
        }
    }

    ///@dev checks if minimum goal/objective is reached
    function _checkIfMinGoalReached() internal view virtual {
        uint256 soldQuotaAmount = s_quotaInfos[QuotaClass.LOW].bought +
            s_quotaInfos[QuotaClass.REGULAR].bought +
            s_quotaInfos[QuotaClass.HIGH].bought;
        uint256 maxQuotasAmount = s_quotaInfos[QuotaClass.LOW].amount +
            s_quotaInfos[QuotaClass.REGULAR].amount +
            s_quotaInfos[QuotaClass.HIGH].amount;
        if (
            (soldQuotaAmount * RATIO_DENOMINATOR) / maxQuotasAmount <
            s_minSoldRate
        ) {
            revert Crowdfund__MinGoalNotReached();
        }
    }

    ///@dev checks if crowdfund is still ongoing
    function _checkIfCrowdfundOngoing() internal view virtual {
        if (!(block.timestamp < s_dueDate)) {
            revert Crowdfund__PastDue();
        }
    }

    /// -----------------------------------------------------------------------
    /// Receive function
    /// -----------------------------------------------------------------------

    receive() external payable {}

    /// -----------------------------------------------------------------------
    /// Initialization
    /// -----------------------------------------------------------------------

    /// @dev initializer modifier added.
    /// @inheritdoc ICrowdfund
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
    ) external virtual override(ICrowdfund) initializer {
        if (amountLowQuota + amountRegQuota + amountHighQuota == 0) {
            revert Crowdfund__MaxSupplyIs0();
        }
        if (minSoldRate < MIN_SOLD_RATE || minSoldRate > MAX_SOLD_RATE) {
            revert Crowdfund__InvalidMinSoldRate();
        }
        if (crowdfundDuration > SIX_MONTH) {
            revert Crowdfund__DurationLongerThanAllowed();
        }

        // checking collection address
        s_collection = IERC721Acompany(collection);

        if (
            msg.sender !=
            address(
                SecurityUpgradeable(address(s_collection)).getManagement()
            ) ||
            s_collection.getMaxSupply() !=
            amountLowQuota + amountRegQuota + amountHighQuota ||
            s_collection.getPricePerCoin(IManagement.Coin.ETH_COIN) !=
            type(uint256).max ||
            s_collection.getPricePerCoin(IManagement.Coin.USD_TOKEN) !=
            type(uint256).max ||
            s_collection.getPricePerCoin(IManagement.Coin.CREATORS_TOKEN) !=
            type(uint256).max
        ) {
            revert Crowdfund__InvalidCollection();
        }

        _SecurityUpgradeable_init(
            OwnableUpgradeable(collection).owner(),
            msg.sender
        );

        s_quotaInfos[QuotaClass.LOW].amount = amountLowQuota;
        s_quotaInfos[QuotaClass.REGULAR].amount = amountRegQuota;
        s_quotaInfos[QuotaClass.HIGH].amount = amountHighQuota;

        s_quotaInfos[QuotaClass.LOW].values = valuesLowQuota;
        s_quotaInfos[QuotaClass.REGULAR].values = valuesRegQuota;
        s_quotaInfos[QuotaClass.HIGH].values = valuesHighQuota;

        s_quotaInfos[QuotaClass.REGULAR].nextTokenId = amountLowQuota;
        s_quotaInfos[QuotaClass.HIGH].nextTokenId =
            amountLowQuota +
            amountRegQuota;

        // s_donationReceiver = donationReceiver;
        // s_donationFee = donationFee;
        s_minSoldRate = minSoldRate;

        s_dueDate = block.timestamp + crowdfundDuration;
        s_nextInvestId = 1;
    }

    /// -----------------------------------------------------------------------
    /// Implemented functions
    /// -----------------------------------------------------------------------

    /** @dev whenNotPaused and nonReentrant third parties modifiers added. Function won't work if 
    creator/collection has been corrupted. It will revert if either the due date has been reached or if
    there is no more quotas available */
    /// @inheritdoc ICrowdfund
    function invest(
        uint256 amountOfLowQuota,
        uint256 amountOfRegularQuota,
        uint256 amountOfHighQuota,
        IManagement.Coin coin
    ) external payable virtual override(ICrowdfund) {
        _whenNotPaused();
        _nonReentrant();
        _notCorrupted();
        _checkIfCrowdfundOngoing();
        _onlyValidCoin(coin);

        uint256 totalPayment = _invest(
            msg.sender,
            msg.sender,
            amountOfLowQuota,
            amountOfRegularQuota,
            amountOfHighQuota,
            coin
        );

        emit Invested(
            msg.sender,
            s_nextInvestId - 1,
            amountOfLowQuota,
            amountOfRegularQuota,
            amountOfHighQuota,
            totalPayment,
            coin
        );
    }

    /** @dev whenNotPaused and nonReentrant third parties modifiers added. Only authorized parties 
    can call this function. It will revert if either the due date has been reached or if
    there is no more quotas available */
    /// @inheritdoc ICrowdfund
    function investForAddress(
        address investor,
        uint256 amountOfLowQuota,
        uint256 amountOfRegularQuota,
        uint256 amountOfHighQuota,
        IManagement.Coin coin
    ) public payable virtual override(ICrowdfund) {
        _whenNotPaused();
        _nonReentrant();
        _onlyAuthorized();
        _checkIfCrowdfundOngoing();
        _onlyValidCoin(coin);

        uint256 totalPayment = _invest(
            investor,
            msg.sender,
            amountOfLowQuota,
            amountOfRegularQuota,
            amountOfHighQuota,
            coin
        );

        emit Invested(
            investor,
            s_nextInvestId - 1,
            amountOfLowQuota,
            amountOfRegularQuota,
            amountOfHighQuota,
            totalPayment,
            coin
        );
    }

    /** @dev whenNotPaused and nonReentrant third parties modifiers added. Function won't work if 
    creator/collection has been corrupted. It will revert if either the due date has been reached or if
    there is no more quotas available */
    /// @inheritdoc ICrowdfund
    function donate(
        uint256 amount,
        IManagement.Coin coin
    ) external payable virtual override(ICrowdfund) {
        _whenNotPaused();
        _nonReentrant();
        _notCorrupted();
        _checkIfCrowdfundOngoing();
        _onlyValidCoin(coin);

        _donate(msg.sender, msg.sender, amount, coin);

        emit DonationTransferred(msg.sender, amount, coin);
    }

    /** @dev whenNotPaused and nonReentrant third parties modifiers added. Only authorized parties 
    can call this function. It will revert if either the due date has been reached or if
    there is no more quotas available */
    /// @inheritdoc ICrowdfund
    function donateForAddress(
        address donor,
        uint256 amount,
        IManagement.Coin coin
    ) public payable virtual override(ICrowdfund) {
        _whenNotPaused();
        _nonReentrant();
        _onlyAuthorized();
        _checkIfCrowdfundOngoing();
        _onlyValidCoin(coin);

        _donate(donor, msg.sender, amount, coin);

        emit DonationTransferred(donor, amount, coin);
    }

    /** @dev whenNotPaused and nonReentrant third parties modifiers added. Only investors will be able to
    refund. If the invest ID is not in the refund period or the minimum sold rate is reached, it will be disconsiderd.
    If creator/collection has been corrupted, the refund will continue without the checks previously explained.  */
    /// @inheritdoc ICrowdfund
    function refundAll() external virtual override(ICrowdfund) {
        _whenNotPaused();
        _nonReentrant();
        _checkIfInvestor(msg.sender);

        uint256 soldQuotaAmount = s_quotaInfos[QuotaClass.LOW].bought +
            s_quotaInfos[QuotaClass.REGULAR].bought +
            s_quotaInfos[QuotaClass.HIGH].bought;
        uint256 maxQuotasAmount = s_quotaInfos[QuotaClass.LOW].amount +
            s_quotaInfos[QuotaClass.REGULAR].amount +
            s_quotaInfos[QuotaClass.HIGH].amount;

        bool isCorrupted = s_management.getIsCorrupted(owner());
        if (
            !isCorrupted &&
            (!((soldQuotaAmount * RATIO_DENOMINATOR) / maxQuotasAmount <
                s_minSoldRate) || block.timestamp < s_dueDate)
        ) {
            revert Crowdfund__RefundNotPossible();
        }

        (
            uint256[] memory amountPerCoin,
            uint256[] memory investIdsRefunded
        ) = _refundAll(
                msg.sender,
                isCorrupted,
                (soldQuotaAmount * RATIO_DENOMINATOR) / maxQuotasAmount <
                    s_minSoldRate &&
                    !(block.timestamp < s_dueDate)
            );

        emit RefundedAll(
            msg.sender,
            amountPerCoin[0],
            amountPerCoin[1],
            amountPerCoin[2],
            investIdsRefunded
        );
    }

    /** @dev whenNotPaused and nonReentrant third parties modifiers added. Only investors can refund.
    It will revert if either the 7 days period has past or the min rate of sold quotas has been reached (if not corrupted).
    If corrupted, investors can refund at any time. */
    /// @inheritdoc ICrowdfund
    function refundWithInvestId(
        uint256 investId
    ) external virtual override(ICrowdfund) {
        _whenNotPaused();
        _nonReentrant();
        _checkIfInvestor(msg.sender);

        if (s_investIdInfos[investId].investor != msg.sender) {
            revert Crowdfund__NotInvestIdOwner();
        }

        uint256 soldQuotaAmount = s_quotaInfos[QuotaClass.LOW].bought +
            s_quotaInfos[QuotaClass.REGULAR].bought +
            s_quotaInfos[QuotaClass.HIGH].bought;
        uint256 maxQuotasAmount = s_quotaInfos[QuotaClass.LOW].amount +
            s_quotaInfos[QuotaClass.REGULAR].amount +
            s_quotaInfos[QuotaClass.HIGH].amount;

        (bool success, uint256 amount, IManagement.Coin coin) = _refund(
            msg.sender,
            investId,
            s_management.getIsCorrupted(owner()),
            (soldQuotaAmount * RATIO_DENOMINATOR) / maxQuotasAmount <
                s_minSoldRate &&
                !(block.timestamp < s_dueDate)
        );

        if (!success) {
            revert Crowdfund__RefundNotPossible();
        }

        emit RefundedInvestId(msg.sender, investId, amount, coin);
    }

    /** @dev whenNotPaused and nonReentrant third parties modifiers added. Only investors can be refunded. */
    /// @inheritdoc ICrowdfund
    function refundToAddress(
        address investor
    ) external virtual override(ICrowdfund) {
        _nonReentrant();
        _onlyAuthorized();
        _checkIfInvestor(investor);

        (
            uint256[] memory amountPerCoin,
            uint256[] memory investIdsRefunded
        ) = _refundAll(investor, true, true);

        emit RefundedAllToAddress(
            msg.sender,
            investor,
            amountPerCoin[0],
            amountPerCoin[1],
            amountPerCoin[2],
            investIdsRefunded
        );
    }

    /** @dev whenNotPaused and nonReentrant third parties modifiers added. Function won't work if 
    creator/collection has been corrupted. Only creator/owner can execute function. It will revert if the min 
    rate of sold quotas has been reached. */
    /// @inheritdoc ICrowdfund
    function withdrawFund() external virtual override(ICrowdfund) {
        _whenNotPaused();
        _nonReentrant();
        _onlyAuthorized();
        _checkIfMinGoalReached();

        address multisig = s_management.getMultiSig();
        uint256[] memory amounts = new uint256[](3);
        //uint256[] memory donationAmounts = new uint256[](3);
        for (uint256 ii = 1; ii < 4; ++ii) {
            IManagement.Coin coin = IManagement.Coin(ii - 1);
            uint256 coinBalance = coin == IManagement.Coin.ETH_COIN
                ? address(this).balance
                : s_management.getTokenContract(coin).balanceOf(address(this));

            if (coinBalance == 0) {
                continue;
            }

            // uint256 donationAmount = (coinBalance * s_donationFee) /
            //     RATIO_DENOMINATOR;
            uint256 W3DFUNDINGRoyalty = (coinBalance *
                W3DFUNDING_ROYALTY_FEE) / RATIO_DENOMINATOR;
            // uint256 amount = s_donationReceiver != address(0)
            //     ? coinBalance - donationAmount - W3DFUNDINGRoyalty
                /*:*/ uint256 amount = coinBalance - W3DFUNDINGRoyalty;

            // if (s_donationReceiver != address(0)) {
            //     _executeTransfer(
            //         donationAmount,
            //         coin,
            //         address(this),
            //         s_donationReceiver
            //     );
            // }
            _executeTransfer(W3DFUNDINGRoyalty, coin, address(this), multisig);
            _executeTransfer(amount, coin, address(this), owner());

            amounts[ii - 1] = amount;
            //donationAmounts[ii - 1] = donationAmount;
        }

        emit CreatorWithdrawed(amounts[0], amounts[1], amounts[2]);
        // emit DonationSent(
        //     s_donationReceiver,
        //     donationAmounts[0],
        //     donationAmounts[1],
        //     donationAmounts[2]
        // );
    }

    /** @dev function to be used by the creator. Same rules for the mint public function (below) */
    /// @inheritdoc ICrowdfund
    function mint() external virtual override(ICrowdfund) {
        mint(msg.sender);
    }

    /** @dev whenNotPaused and nonReentrant third parties modifiers added. Function won't work if 
    creator/collection has been corrupted. It will revert if array of invest IDs for a given investor
    address is empty. Once minted, the list of invest IDs per investor and the list of token IDs per 
    invest ID are deleted.  */
    /// @inheritdoc ICrowdfund
    function mint(address investor) public virtual override(ICrowdfund) {
        _whenNotPaused();
        _nonReentrant();
        _notCorrupted();
        _checkIfMinGoalReached();

        uint256[] memory investIds = s_investIdsPerInvestor[investor];
        if (investIds.length == 0) {
            revert Crowdfund__NoMoreTokensToMint();
        }

        uint256[] memory tokenAmounts = new uint256[](3);
        bool deleteInvestIds = true;
        unchecked {
            for (uint256 jj; jj < investIds.length; ++jj) {
                InvestIdInfos memory investIdInfos = s_investIdInfos[
                    investIds[jj]
                ];
                if (
                    block.timestamp < investIdInfos.sevenDaysPeriod &&
                    (investIdInfos.lowQuotaAmount > 0 ||
                        investIdInfos.regQuotaAmount > 0 ||
                        investIdInfos.highQuotaAmount > 0)
                ) {
                    deleteInvestIds = false;
                    continue;
                }

                tokenAmounts[0] += investIdInfos.lowQuotaAmount;
                tokenAmounts[1] += investIdInfos.regQuotaAmount;
                tokenAmounts[2] += investIdInfos.highQuotaAmount;

                delete s_investIdInfos[investIds[jj]];
            }
        }

        if (deleteInvestIds) {
            delete s_investIdsPerInvestor[investor];
        }

        uint256[] memory nextTokenIds = new uint256[](3);
        nextTokenIds[0] = s_quotaInfos[QuotaClass.LOW].nextTokenId;
        nextTokenIds[1] = s_quotaInfos[QuotaClass.REGULAR].nextTokenId;
        nextTokenIds[2] = s_quotaInfos[QuotaClass.HIGH].nextTokenId;

        s_quotaInfos[QuotaClass.LOW].nextTokenId += tokenAmounts[0];
        s_quotaInfos[QuotaClass.REGULAR].nextTokenId += tokenAmounts[1];
        s_quotaInfos[QuotaClass.HIGH].nextTokenId += tokenAmounts[2];

        uint256[] memory tokenIds = new uint256[](
            tokenAmounts[0] + tokenAmounts[1] + tokenAmounts[2]
        );
        uint8[] memory classes = new uint8[](tokenIds.length);

        unchecked {
            uint256 kk;
            for (uint8 ii; ii < 3; ++ii) {
                for (uint256 jj; jj < tokenAmounts[ii]; ++jj) {
                    tokenIds[kk] = nextTokenIds[ii] + jj;
                    classes[kk] = ii;
                    ++kk;
                }
            }
        }

        s_collection.mintForCrowdfund(tokenIds, classes, investor);

        emit InvestorMinted(investor, msg.sender);
    }

    /// -----------------------------------------------------------------------
    /// Setter functions
    /// -----------------------------------------------------------------------

    // --- Pause and Unpause functions ---

    /** @dev Function won't work if creator/collection has been corrupted. Only authorized addresses 
    are allowed to execute this function. */
    /// @inheritdoc SecurityUpgradeable
    function pause() public virtual override(SecurityUpgradeable) {
        _onlyAuthorized();

        SecurityUpgradeable.pause();
        s_collection.pause();
    }

    /** @dev Function won't work if creator/collection has been corrupted. Only authorized addresses 
    are allowed to execute this function. */
    /// @inheritdoc SecurityUpgradeable
    function unpause() public virtual override(SecurityUpgradeable) {
        _onlyAuthorized();

        SecurityUpgradeable.unpause();
        s_collection.unpause();
    }

    /// -----------------------------------------------------------------------
    /// Internal functions
    /// -----------------------------------------------------------------------

    /** @dev executes all the transfers
        @param amount: amount to be transferred
        @param coin: coin of transfer
        @param from: the address from which the transfer should be executed
        @param to: the recipient of the transfer */
    function _executeTransfer(
        uint256 amount,
        IManagement.Coin coin,
        address from,
        address to
    ) internal virtual {
        if (coin != IManagement.Coin.ETH_COIN) {
            _transferERC20To(coin, from, to, amount);
        } else {
            if (from == address(this)) {
                _transferTo(to, amount);
            } else {
                if (msg.value < amount) {
                    revert Crowdfund__NotEnoughValueSent();
                } else if (msg.value > amount) {
                    uint256 aboveValue = msg.value - amount;
                    _transferTo(from, aboveValue);
                }
            }
        }
    }

    /** @dev performs refund of a given invest ID for a given user
        @param user: user address
        @param investId: ID of the investment to be refunded
        @param isCorrupted: specifies if owner is corrupted (true) or not (false)
        @param flexTagNotReachedAndDueDateReached: specifies if flextag was not reached and crowdfund has past due date (true) or not (false)
        @return bool that specifies if process was successful (true) or not (false), amount of payment refunded, and the coin of refund */
    function _refund(
        address user,
        uint256 investId,
        bool isCorrupted,
        bool flexTagNotReachedAndDueDateReached
    ) internal virtual returns (bool, uint256, IManagement.Coin) {
        if (
            !isCorrupted &&
            !(block.timestamp < s_investIdInfos[investId].sevenDaysPeriod) &&
            !flexTagNotReachedAndDueDateReached
        ) {
            return (false, 0, IManagement.Coin(0));
        }

        uint256[] storage p_investIds = s_investIdsPerInvestor[user];
        uint256 last_index = p_investIds.length - 1;

        p_investIds[s_investIdInfos[investId].index] = p_investIds[last_index];
        s_investIdInfos[p_investIds[last_index]].index = s_investIdInfos[
            investId
        ].index;
        p_investIds.pop();

        s_quotaInfos[QuotaClass.LOW].bought -= s_investIdInfos[investId]
            .lowQuotaAmount;
        s_quotaInfos[QuotaClass.REGULAR].bought -= s_investIdInfos[investId]
            .regQuotaAmount;
        s_quotaInfos[QuotaClass.HIGH].bought -= s_investIdInfos[investId]
            .highQuotaAmount;
        uint256 amount = s_investIdInfos[investId].totalPayment;
        IManagement.Coin coin = s_investIdInfos[investId].coin;
        delete s_investIdInfos[investId];

        s_paymentsPerCoin[user][coin] -= amount;
        _executeTransfer(amount, coin, address(this), user);

        return (true, amount, coin);
    }

    /** @dev performs refund of all investments for given investor user
        @param user: user address
        @param isCorrupted: specifies if owner is corrupted (true) or not (false)
        @param flexTagNotReachedAndDueDateReached: specifies if flextag was not reached and crowdfund has past due date (true) or not (false)
        @return uint256[3] array of payments per coin and uint256[] array invest IDs refunded */
    function _refundAll(
        address user,
        bool isCorrupted,
        bool flexTagNotReachedAndDueDateReached
    ) internal virtual returns (uint256[] memory, uint256[] memory) {
        uint256[] memory m_investIds = s_investIdsPerInvestor[user];
        uint256[] memory investIdsRefunded = new uint256[](m_investIds.length);
        uint256[] memory amountPerCoin = new uint256[](3);
        unchecked {
            uint256 jj;
            for (uint256 ii; ii < m_investIds.length; ++ii) {
                (bool success, uint256 amount, IManagement.Coin coin) = _refund(
                    user,
                    m_investIds[ii],
                    isCorrupted,
                    flexTagNotReachedAndDueDateReached
                );
                if (!success) {
                    continue;
                }

                amountPerCoin[uint8(coin)] += amount;
                investIdsRefunded[jj] = m_investIds[ii];
                ++jj;
            }
        }

        return (amountPerCoin, investIdsRefunded);
    }

    /** @dev performs every invest computation
        @param investor: investor's address
        @param paymentFrom: address from which the payment will be transferred
        @param amountOfLowQuota: amount of low quotas to be bought
        @param amountOfRegularQuota: amount of regular quotas to be bought
        @param amountOfHighQuota: amount of high quotas to be bought
        @param coin: coin of transfer
        @return uint256 value for the total amount paid */
    function _invest(
        address investor,
        address paymentFrom,
        uint256 amountOfLowQuota,
        uint256 amountOfRegularQuota,
        uint256 amountOfHighQuota,
        IManagement.Coin coin
    ) internal virtual returns (uint256) {
        if (
            s_quotaInfos[QuotaClass.LOW].bought + amountOfLowQuota >
            s_quotaInfos[QuotaClass.LOW].amount
        ) {
            revert Crowdfund__LowQuotaMaxAmountReached();
        }
        if (
            s_quotaInfos[QuotaClass.REGULAR].bought + amountOfRegularQuota >
            s_quotaInfos[QuotaClass.REGULAR].amount
        ) {
            revert Crowdfund__RegQuotaMaxAmountReached();
        }
        if (
            s_quotaInfos[QuotaClass.HIGH].bought + amountOfHighQuota >
            s_quotaInfos[QuotaClass.HIGH].amount
        ) {
            revert Crowdfund__HighQuotaMaxAmountReached();
        }

        uint256 totalPayment = amountOfLowQuota *
            s_quotaInfos[QuotaClass.LOW].values[uint8(coin)] +
            amountOfRegularQuota *
            s_quotaInfos[QuotaClass.REGULAR].values[uint8(coin)] +
            amountOfHighQuota *
            s_quotaInfos[QuotaClass.HIGH].values[uint8(coin)];

        _executeTransfer(totalPayment, coin, paymentFrom, address(this));

        unchecked {
            uint256 nextInvestId = s_nextInvestId;
            s_investIdInfos[nextInvestId].index = s_investIdsPerInvestor[
                investor
            ].length;
            s_investIdInfos[nextInvestId].investor = investor;
            s_investIdInfos[nextInvestId].totalPayment = totalPayment;
            s_investIdInfos[nextInvestId].coin = coin;
            s_investIdInfos[nextInvestId].sevenDaysPeriod =
                block.timestamp +
                SEVEN_DAYS;
            s_investIdInfos[nextInvestId].lowQuotaAmount = amountOfLowQuota;
            s_investIdInfos[nextInvestId].regQuotaAmount = amountOfRegularQuota;
            s_investIdInfos[nextInvestId].highQuotaAmount = amountOfHighQuota;
            s_investIdsPerInvestor[investor].push(nextInvestId);

            s_quotaInfos[QuotaClass.LOW].bought += amountOfLowQuota;
            s_quotaInfos[QuotaClass.REGULAR].bought += amountOfRegularQuota;
            s_quotaInfos[QuotaClass.HIGH].bought += amountOfHighQuota;

            s_paymentsPerCoin[investor][coin] += totalPayment;

            ++s_nextInvestId;
        }

        return totalPayment;
    }

    /** @dev performs every donation computation
        @param donor: donor's address
        @param paymentFrom: address from which the payment will be transferred
        @param amount: donation amount
        @param coin: coin/token for donation */
    function _donate(
        address donor,
        address paymentFrom,
        uint256 amount,
        IManagement.Coin coin
    ) internal virtual {
        if (coin == IManagement.Coin.ETH_COIN) {
            amount = msg.value;
        }

        _executeTransfer(amount, coin, paymentFrom, address(this));

        unchecked {
            uint256 nextInvestId = s_nextInvestId;
            s_investIdInfos[nextInvestId].index = s_investIdsPerInvestor[donor]
                .length;
            s_investIdInfos[nextInvestId].investor = donor;
            s_investIdInfos[nextInvestId].totalPayment = amount;
            s_investIdInfos[nextInvestId].coin = coin;
            s_investIdInfos[nextInvestId].sevenDaysPeriod =
                block.timestamp +
                SEVEN_DAYS;
            s_investIdsPerInvestor[donor].push(nextInvestId);

            s_paymentsPerCoin[donor][coin] += amount;

            ++s_nextInvestId;
        }
    }

    /// -----------------------------------------------------------------------
    /// Getter functions
    /// -----------------------------------------------------------------------

    /// @inheritdoc ICrowdfund
    function getMinSoldRate()
        external
        view
        virtual
        override(ICrowdfund)
        returns (uint256)
    {
        return s_minSoldRate;
    }

    /// @inheritdoc ICrowdfund
    function getDueDate()
        external
        view
        virtual
        override(ICrowdfund)
        returns (uint256)
    {
        return s_dueDate;
    }

    /// @inheritdoc ICrowdfund
    function getNextInvestId()
        external
        view
        virtual
        override(ICrowdfund)
        returns (uint256)
    {
        return s_nextInvestId;
    }

    /// @inheritdoc ICrowdfund
    function getInvestIdsPerInvestor(
        address investor,
        uint256 index
    ) external view virtual override(ICrowdfund) returns (uint256) {
        return s_investIdsPerInvestor[investor][index];
    }

    /// @inheritdoc ICrowdfund
    function getDonationFee()
        external
        view
        virtual
        override(ICrowdfund)
        returns (uint256)
    {
        return s_donationFee;
    }

    /// @inheritdoc ICrowdfund
    function getDonationReceiver()
        external
        view
        virtual
        override(ICrowdfund)
        returns (address)
    {
        return s_donationReceiver;
    }

    /// @inheritdoc ICrowdfund
    function getPaymentsPerCoin(
        address investor,
        IManagement.Coin coin
    ) external view virtual override(ICrowdfund) returns (uint256) {
        return s_paymentsPerCoin[investor][coin];
    }

    /// @inheritdoc ICrowdfund
    function getCollection()
        external
        view
        virtual
        override(ICrowdfund)
        returns (IERC721Acompany)
    {
        return s_collection;
    }

    /// @inheritdoc ICrowdfund
    function getAllInvestIdsPerInvestor(
        address investor
    ) external view virtual override(ICrowdfund) returns (uint256[] memory) {
        return s_investIdsPerInvestor[investor];
    }

    /// @inheritdoc ICrowdfund
    function getQuotaInfos(
        QuotaClass class_
    ) external view virtual override(ICrowdfund) returns (QuotaInfos memory) {
        return s_quotaInfos[class_];
    }

    /// @inheritdoc ICrowdfund
    function getInvestIdInfos(
        uint256 investId
    )
        external
        view
        virtual
        override(ICrowdfund)
        returns (InvestIdInfos memory)
    {
        return s_investIdInfos[investId];
    }

    /// -----------------------------------------------------------------------
    /// Storage space for upgrades
    /// -----------------------------------------------------------------------

    uint256[44] private __gap;
}
