const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("CRPStaking", () => {
    const creatorsRoyalty = 200
    const erc20Name = "USDT"
    const erc20Symbol = "USDT"
    const erc20Decimals = 6

    const CreatorsCoinName = "USDT"
    const CreatorsCoinSymbol = "USDT"
    const CreatorsCoinDecimals = 18

    const timeUnit = 60 * 60 * 24
    const rewardsPerUnitTime = ethers.utils.parseEther("0.05")

    const timeUnitStaking = 60 * 60 * 24 * 15
    const rewardsPerUnitTimeStaking = [ethers.utils.parseEther("0.01"), ethers.utils.parseEther("0.05"), ethers.utils.parseEther("0.1")]

    // collection settings
    const collectionName = "MyNFT"
    const collectionSymbol = "MNFT"
    const collectionBaseURI = "https://example.com/my-token/"
    const collectionRoyalty = 200

    // crowdfunding settings
    const cfLowQuotaValue = [ethers.utils.parseEther("0.1"), ethers.utils.parseEther("0.11"), ethers.utils.parseEther("0.12")]
    const cfRegQuotaValue = [ethers.utils.parseEther("0.5"), ethers.utils.parseEther("0.51"), ethers.utils.parseEther("0.52")]
    const cfHighQuotaValue = [ethers.utils.parseEther("1"), ethers.utils.parseEther("1.1"), ethers.utils.parseEther("1.2")]
    const cfLowQuotaAmount = 100
    const cfRegQuotaAmount = 50
    const cfHighQuotaAmount = 10
    const cfDonationFee = 200
    const cfMinSoldRate = 2500

    async function testSetup() {
        const Management = await ethers.getContractFactory("Management")
        const ArtCollection = await ethers.getContractFactory("ERC721Art")
        const FundCollection = await ethers.getContractFactory("Crowdfund")
        const MultiSig = await ethers.getContractFactory("MockMultiSig")
        const CreatorsCoin = await ethers.getContractFactory("MockUSDToken")
        const ERC20 = await ethers.getContractFactory("MockUSDToken")
        const Reward = await ethers.getContractFactory("CRPReward")
        const Staking = await ethers.getContractFactory("CRPStaking")

        const Beacon = await ethers.getContractFactory("UpgradeableBeacon")
        const UUPS = await ethers.getContractFactory("ERC1967Proxy")

        const artCollectionImplementation = await ArtCollection.deploy()
        await artCollectionImplementation.deployed()
        const beaconAdminArt = await Beacon.deploy(artCollectionImplementation.address)
        await beaconAdminArt.deployed()

        const creatorsCollectionImplementation = await ArtCollection.deploy()
        await creatorsCollectionImplementation.deployed()
        const beaconAdminCreators = await Beacon.deploy(creatorsCollectionImplementation.address)
        await beaconAdminCreators.deployed()

        const fundCollectionImplementation = await FundCollection.deploy()
        await fundCollectionImplementation.deployed()
        const beaconAdminFund = await Beacon.deploy(fundCollectionImplementation.address)
        await beaconAdminFund.deployed()

        const stakingImplementation = await Staking.deploy()
        await stakingImplementation.deployed()
        const beaconAdminStak = await Beacon.deploy(stakingImplementation.address)
        await beaconAdminStak.deployed()

        const multiSig = await MultiSig.deploy()
        await multiSig.deployed()

        const creatorsCoin = await CreatorsCoin.deploy(CreatorsCoinName, CreatorsCoinSymbol, CreatorsCoinDecimals)
        await creatorsCoin.deployed()

        const erc20 = await ERC20.deploy(erc20Name, erc20Symbol, erc20Decimals)
        await erc20.deployed()

        const managementImplementation = await Management.deploy()
        await managementImplementation.deployed()

        let abi = ["function initialize(address _beaconAdminArt, address _beaconAdminFund, address _beaconAdminCreators, address _creatorsCoin, address _erc20USD, address _multiSig, uint256 _fee)"]
        let function_name = "initialize"
        let constructor_args = [
            beaconAdminArt.address,
            beaconAdminFund.address,
            beaconAdminCreators.address,
            creatorsCoin.address,
            erc20.address,
            multiSig.address,
            creatorsRoyalty
        ]

        let iface = new ethers.utils.Interface(abi)
        let data = iface.encodeFunctionData(function_name, constructor_args)

        let uups = await UUPS.deploy(managementImplementation.address, data)
        await uups.deployed()
        const managementProxy = Management.attach(uups.address)

        let tx = await managementProxy.setBeaconAdminStaking(beaconAdminStak.address)
        await tx.wait()

        const accounts = await ethers.getSigners()
        const management = managementProxy

        const allowCreator = await management.setCreator(accounts[1].address, true)
        await allowCreator.wait()
        const newCol = await management.connect(accounts[1]).newCrowdfund(
            collectionName, collectionSymbol, collectionBaseURI, collectionRoyalty, accounts[1].address,
            [cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue, cfLowQuotaAmount, cfRegQuotaAmount,
                cfHighQuotaAmount, accounts[10].address, cfDonationFee, cfMinSoldRate]
        )
        let receipt = await newCol.wait()
        let event = receipt.events.filter(evt => evt?.event)
        let rightEvent = event.filter(evt => evt.args.fundCollection || evt.args.artCollection)
        const fundCollectionAddress = rightEvent[0].args.fundCollection
        const fundCollectionCreated = await ethers.getContractAt("contracts/Crowdfund.sol:Crowdfund", fundCollectionAddress)
        const artCollectionAddress = rightEvent[0].args.artCollection
        const artCollectionCreated = await ethers.getContractAt("contracts/ERC721Art.sol:ERC721Art", artCollectionAddress)

        tx = await management.connect(accounts[1]).newCRPStaking(
            artCollectionCreated.address, timeUnitStaking, rewardsPerUnitTimeStaking, accounts[1].address)
        receipt = await tx.wait()
        const blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp
        event = receipt.events.filter(evt => evt?.event)
        rightEvent = event.filter(evt => evt.args.staking)
        const stakingAddress = rightEvent[0].args.staking
        const stakingCreated = await ethers.getContractAt("contracts/CRPStaking.sol:CRPStaking", stakingAddress)

        abi = ["function initialize(address _management, uint256 _timeUnit, uint256 _rewardsPerUnitTime, uint256[3] calldata _interacPoints)"]
        function_name = "initialize"
        constructor_args = [
            managementProxy.address,
            timeUnit,
            rewardsPerUnitTime,
            [2, 1, 1]
        ]

        iface = new ethers.utils.Interface(abi)
        data = iface.encodeFunctionData(function_name, constructor_args)

        const rewardImplementation = await Reward.deploy()
        await rewardImplementation.deployed()
        uups = await UUPS.deploy(rewardImplementation.address, data)
        await uups.deployed()
        const rewardProxy = Reward.attach(uups.address)

        tx = await managementProxy.setProxyReward(rewardProxy.address)
        await tx.wait()

        const implementations = {
            management: managementImplementation,
            artCollection: artCollectionImplementation,
            creatorsCollection: creatorsCollectionImplementation,
            fundCollection: fundCollectionImplementation,
            reward: rewardImplementation,
            staking: stakingImplementation
        }

        const artCollection = artCollectionCreated
        const fundCollection = fundCollectionCreated
        const creatorsCollection = beaconAdminCreators
        const reward = rewardProxy
        const staking = stakingCreated

        return {
            management,
            artCollection,
            fundCollection,
            creatorsCollection,
            creatorsCoin,
            multiSig,
            accounts,
            implementations,
            reward,
            staking,
            erc20,
            blockTimestamp
        }
    }

    describe("initialize", () => {
        it("Should be initialized successfully", async () => {
            const { staking, artCollection, blockTimestamp } = await loadFixture(testSetup)

            const stakingToken = await staking.stakingToken()
            const stakingCondition = await staking.getCurrentStakingCondition()

            expect(stakingToken).to.equal(artCollection.address)
            expect(stakingCondition.timeUnit.toNumber()).to.equal(timeUnitStaking)
            expect(stakingCondition.rewardsPerUnitTime[0]).to.equal(rewardsPerUnitTimeStaking[0])
            expect(stakingCondition.rewardsPerUnitTime[1]).to.equal(rewardsPerUnitTimeStaking[1])
            expect(stakingCondition.rewardsPerUnitTime[2]).to.equal(rewardsPerUnitTimeStaking[2])
            expect(stakingCondition.startTimestamp.toNumber()).to.equal(blockTimestamp)
            expect(stakingCondition.endTimestamp.toNumber()).to.equal(0)
        })

        it("Should NOT initialize once it is already initialized", async () => {
            const { staking } = await loadFixture(testSetup)

            await expect(staking.initialize(
                ethers.constants.AddressZero,
                0,
                [0, 0, 0]
            )).to.be.revertedWith("Initializable: contract is already initialized")
        })

        it("Should NOT initialize if staking address is address(0)", async () => {
            const Staking = await ethers.getContractFactory("CRPStaking")
            const staking = await Staking.deploy()
            await staking.deployed()

            await expect(staking.initialize(
                ethers.constants.AddressZero,
                0,
                [0, 0, 0]
            )).to.be.revertedWithCustomError(staking, "CRPStakingTokenAddressZero")
        })

        it("Should NOT initialize if staking address is not crowdfunded", async () => {
            const Staking = await ethers.getContractFactory("CRPStaking")
            const staking = await Staking.deploy()
            await staking.deployed()

            const ArtCollection = await ethers.getContractFactory("ERC721Art")
            const artCollection = await ArtCollection.deploy()
            await artCollection.deployed()

            await expect(staking.initialize(
                artCollection.address,
                0,
                [0, 0, 0]
            )).to.be.revertedWithCustomError(staking, "CRPStakingNotCrowdfundingToken")
        })
    })

    describe("stake", () => {
        it("Should stake NFT", async () => {
            const { staking, fundCollection, artCollection, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAmount = 100
            const regQuotaAmount = 10
            const highQuotaAmount = 2

            const valueAmount = cfLowQuotaValue[0].mul(lowQuotaAmount)
                .add(cfRegQuotaValue[0].mul(regQuotaAmount))
                .add(cfHighQuotaValue[0].mul(highQuotaAmount))

            let tx = await fundCollection.connect(acc1)
                .invest(lowQuotaAmount, regQuotaAmount, highQuotaAmount, 0, { value: valueAmount })
            await tx.wait()

            const unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 10
            await time.increaseTo(unlockTime);

            tx = await fundCollection.connect(acc1).mint(acc1.address)
            await tx.wait()

            tx = await artCollection.connect(acc1).setApprovalForAll(staking.address, true)
            await tx.wait()

            tx = await staking.connect(acc1).stake([0, 1])
            await tx.wait()

            let stakerStruct = await staking.getStaker(acc1.address)
            expect(stakerStruct.unclaimedRewards.toNumber()).to.equal(0)

            tx = await staking.connect(acc1).stake([2, 3, 101, 151])
            await tx.wait()
            tx = await staking.connect(acc1).withdraw([0, 1, 2, 3])
            await tx.wait()
            tx = await staking.connect(acc1).stake([0])
            await tx.wait()
            tx = await staking.connect(acc1).withdraw([0, 101])
            await tx.wait()
            tx = await staking.connect(acc1).stake([0, 1, 2, 3, 101])
            const receipt = await tx.wait()
            const blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp

            const staker = await staking.stakersArray(0)
            stakerStruct = await staking.getStaker(acc1.address)

            const isIndexed0 = await staking.isIndexed(0)
            const isIndexed1 = await staking.isIndexed(1)
            const isIndexed2 = await staking.isIndexed(2)
            const isIndexed3 = await staking.isIndexed(3)
            const isIndexed101 = await staking.isIndexed(101)
            const isIndexed151 = await staking.isIndexed(151)
            const isIndexed6 = await staking.isIndexed(6)

            expect(staker).to.equal(acc1.address)
            expect(stakerStruct.amountStaked[0].toNumber()).to.equal(4)
            expect(stakerStruct.amountStaked[1].toNumber()).to.equal(1)
            expect(stakerStruct.amountStaked[2].toNumber()).to.equal(1)
            expect(stakerStruct.timeOfLastUpdate.toNumber()).to.equal(blockTimestamp)
            expect(stakerStruct.unclaimedRewards.toNumber()).not.to.equal(0)
            expect(stakerStruct.conditionIdOflastUpdate.toNumber()).to.equal(0)
            expect(isIndexed0).to.equal(true)
            expect(isIndexed1).to.equal(true)
            expect(isIndexed2).to.equal(true)
            expect(isIndexed3).to.equal(true)
            expect(isIndexed101).to.equal(true)
            expect(isIndexed151).to.equal(true)
            expect(isIndexed6).to.equal(false)
        })

        it("Should NOT stake NFT if array is empty", async () => {
            const { staking, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            await expect(staking.connect(acc1).stake([]))
                .to.be.revertedWithCustomError(staking, "CRPStakingNoTokensGiven")
        })

        it("Should NOT stake NFT if caller is not NFT owner", async () => {
            const { staking, fundCollection, artCollection, accounts } = await loadFixture(testSetup)
            const [acc1, acc2] = [accounts[2], accounts[3]]

            let lowQuotaAmount = 100
            let regQuotaAmount = 10
            let highQuotaAmount = 2

            let valueAmount = cfLowQuotaValue[0].mul(lowQuotaAmount)
                .add(cfRegQuotaValue[0].mul(regQuotaAmount))
                .add(cfHighQuotaValue[0].mul(highQuotaAmount))

            let tx = await fundCollection.connect(acc1)
                .invest(lowQuotaAmount, regQuotaAmount, highQuotaAmount, 0, { value: valueAmount })
            await tx.wait()

            lowQuotaAmount = 0
            regQuotaAmount = 20
            highQuotaAmount = 0

            valueAmount = cfLowQuotaValue[0].mul(lowQuotaAmount)
                .add(cfRegQuotaValue[0].mul(regQuotaAmount))
                .add(cfHighQuotaValue[0].mul(highQuotaAmount))

            tx = await fundCollection.connect(acc2)
                .invest(lowQuotaAmount, regQuotaAmount, highQuotaAmount, 0, { value: valueAmount })
            await tx.wait()

            const unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 10
            await time.increaseTo(unlockTime);

            tx = await fundCollection.connect(acc1).mint(acc1.address)
            await tx.wait()

            tx = await fundCollection.connect(acc2).mint(acc2.address)
            await tx.wait()

            tx = await artCollection.connect(acc1).setApprovalForAll(staking.address, true)
            await tx.wait()

            await expect(staking.connect(acc1).stake([0, 1, 2, 3, 4, 5, 121]))
                .to.be.revertedWithCustomError(staking, "CRPStakingNotTokenOwnerOrApproved")
        })

        it("Should NOT stake NFT if contract paused", async () => {
            const { staking, fundCollection, artCollection, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAmount = 100
            const regQuotaAmount = 10
            const highQuotaAmount = 2

            const valueAmount = cfLowQuotaValue[0].mul(lowQuotaAmount)
                .add(cfRegQuotaValue[0].mul(regQuotaAmount))
                .add(cfHighQuotaValue[0].mul(highQuotaAmount))

            let tx = await fundCollection.connect(acc1)
                .invest(lowQuotaAmount, regQuotaAmount, highQuotaAmount, 0, { value: valueAmount })
            await tx.wait()

            const unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 10
            await time.increaseTo(unlockTime);

            tx = await fundCollection.connect(acc1).mint(acc1.address)
            await tx.wait()

            tx = await artCollection.connect(acc1).setApprovalForAll(staking.address, true)
            await tx.wait()

            tx = await staking.pause()
            await tx.wait()

            await expect(staking.connect(acc1).stake([0, 1, 2, 3, 4, 5]))
                .to.be.revertedWith("Pausable: paused")
        })
    })

    describe("withdraw", () => {
        it("Should withdraw staked NFTs", async () => {
            const { staking, fundCollection, artCollection, accounts } = await loadFixture(testSetup)
            const [acc1, acc2] = [accounts[2], accounts[3]]

            const lowQuotaAmount = 100
            const regQuotaAmount = 10
            const highQuotaAmount = 2

            const valueAmount = cfLowQuotaValue[0].mul(lowQuotaAmount)
                .add(cfRegQuotaValue[0].mul(regQuotaAmount))
                .add(cfHighQuotaValue[0].mul(highQuotaAmount))

            let tx = await fundCollection.connect(acc1)
                .invest(lowQuotaAmount, regQuotaAmount, highQuotaAmount, 0, { value: valueAmount })
            await tx.wait()

            tx = await fundCollection.connect(acc2)
                .invest(0, 10, 2, 0, { value: valueAmount })
            await tx.wait()

            const unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 10
            await time.increaseTo(unlockTime);

            tx = await fundCollection.connect(acc1).mint(acc1.address)
            await tx.wait()

            tx = await fundCollection.connect(acc2).mint(acc2.address)
            await tx.wait()

            tx = await artCollection.connect(acc1).setApprovalForAll(staking.address, true)
            await tx.wait()

            tx = await artCollection.connect(acc2).setApprovalForAll(staking.address, true)
            await tx.wait()

            tx = await staking.connect(acc1).stake([0, 1, 101, 151, 4, 5])
            await tx.wait()

            tx = await staking.connect(acc2).stake([111, 112])
            await tx.wait()

            tx = await staking.connect(acc2).withdraw([111, 112])
            await tx.wait()

            tx = await staking.connect(acc1).withdraw([1, 101, 151, 5])
            const receipt = await tx.wait()
            const blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp

            const staker = await staking.stakersArray(0)
            const stakerStruct = await staking.getStaker(acc1.address)

            const isIndexed0 = await staking.isIndexed(0)
            const isIndexed1 = await staking.isIndexed(1)
            const isIndexed101 = await staking.isIndexed(101)
            const isIndexed151 = await staking.isIndexed(151)
            const isIndexed4 = await staking.isIndexed(4)
            const isIndexed5 = await staking.isIndexed(5)
            const isIndexed6 = await staking.isIndexed(6)

            expect(staker).to.equal(acc1.address)
            expect(stakerStruct.amountStaked[0].toNumber()).to.equal(2)
            expect(stakerStruct.amountStaked[1].toNumber()).to.equal(0)
            expect(stakerStruct.amountStaked[2].toNumber()).to.equal(0)
            expect(stakerStruct.timeOfLastUpdate.toNumber()).to.equal(blockTimestamp)
            expect(stakerStruct.unclaimedRewards.toNumber()).not.to.equal(0)
            expect(stakerStruct.conditionIdOflastUpdate.toNumber()).to.equal(0)
            expect(isIndexed0).to.equal(true)
            expect(isIndexed1).to.equal(true)
            expect(isIndexed101).to.equal(true)
            expect(isIndexed151).to.equal(true)
            expect(isIndexed4).to.equal(true)
            expect(isIndexed5).to.equal(true)
            expect(isIndexed6).to.equal(false)
        })

        it("Should NOT withdraw staked NFTs if array is empty", async () => {
            const { staking, fundCollection, artCollection, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAmount = 100
            const regQuotaAmount = 10
            const highQuotaAmount = 2

            const valueAmount = cfLowQuotaValue[0].mul(lowQuotaAmount)
                .add(cfRegQuotaValue[0].mul(regQuotaAmount))
                .add(cfHighQuotaValue[0].mul(highQuotaAmount))

            let tx = await fundCollection.connect(acc1)
                .invest(lowQuotaAmount, regQuotaAmount, highQuotaAmount, 0, { value: valueAmount })
            await tx.wait()

            const unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 10
            await time.increaseTo(unlockTime);

            tx = await fundCollection.connect(acc1).mint(acc1.address)
            await tx.wait()

            tx = await artCollection.connect(acc1).setApprovalForAll(staking.address, true)
            await tx.wait()

            tx = await staking.connect(acc1).stake([0, 1, 2, 3, 4, 5])
            await tx.wait()

            await expect(staking.connect(acc1).withdraw([]))
                .to.be.revertedWithCustomError(staking, "CRPStakingNoTokensGiven")
        })

        it("Should NOT withdraw staked NFTs if array is larger than amount staked", async () => {
            const { staking, fundCollection, artCollection, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAmount = 100
            const regQuotaAmount = 10
            const highQuotaAmount = 2

            const valueAmount = cfLowQuotaValue[0].mul(lowQuotaAmount)
                .add(cfRegQuotaValue[0].mul(regQuotaAmount))
                .add(cfHighQuotaValue[0].mul(highQuotaAmount))

            let tx = await fundCollection.connect(acc1)
                .invest(lowQuotaAmount, regQuotaAmount, highQuotaAmount, 0, { value: valueAmount })
            await tx.wait()

            const unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 10
            await time.increaseTo(unlockTime);

            tx = await fundCollection.connect(acc1).mint(acc1.address)
            await tx.wait()

            tx = await artCollection.connect(acc1).setApprovalForAll(staking.address, true)
            await tx.wait()

            tx = await staking.connect(acc1).stake([0, 1, 2, 3, 4, 5])
            await tx.wait()

            await expect(staking.connect(acc1).withdraw([0, 1, 2, 3, 4, 5, 6]))
                .to.be.revertedWithCustomError(staking, "CRPStakingWithdrawingMoreThanStaked")
        })

        it("Should NOT withdraw staked NFTs if token is not from staker", async () => {
            const { staking, fundCollection, artCollection, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAmount = 100
            const regQuotaAmount = 10
            const highQuotaAmount = 2

            const valueAmount = cfLowQuotaValue[0].mul(lowQuotaAmount)
                .add(cfRegQuotaValue[0].mul(regQuotaAmount))
                .add(cfHighQuotaValue[0].mul(highQuotaAmount))

            let tx = await fundCollection.connect(acc1)
                .invest(lowQuotaAmount, regQuotaAmount, highQuotaAmount, 0, { value: valueAmount })
            await tx.wait()

            const unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 10
            await time.increaseTo(unlockTime);

            tx = await fundCollection.connect(acc1).mint(acc1.address)
            await tx.wait()

            tx = await artCollection.connect(acc1).setApprovalForAll(staking.address, true)
            await tx.wait()

            tx = await staking.connect(acc1).stake([0, 1, 2, 3, 4, 5])
            await tx.wait()

            await expect(staking.connect(acc1).withdraw([0, 1, 2, 3, 4, 6]))
                .to.be.revertedWithCustomError(staking, "CRPStakingNotTokenStaker")
        })

        it("Should NOT withdraw staked NFTs if contract paused", async () => {
            const { staking, fundCollection, artCollection, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAmount = 100
            const regQuotaAmount = 10
            const highQuotaAmount = 2

            const valueAmount = cfLowQuotaValue[0].mul(lowQuotaAmount)
                .add(cfRegQuotaValue[0].mul(regQuotaAmount))
                .add(cfHighQuotaValue[0].mul(highQuotaAmount))

            let tx = await fundCollection.connect(acc1)
                .invest(lowQuotaAmount, regQuotaAmount, highQuotaAmount, 0, { value: valueAmount })
            await tx.wait()

            const unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 10
            await time.increaseTo(unlockTime);

            tx = await fundCollection.connect(acc1).mint(acc1.address)
            await tx.wait()

            tx = await artCollection.connect(acc1).setApprovalForAll(staking.address, true)
            await tx.wait()

            tx = await staking.connect(acc1).stake([0, 1, 2, 3, 4, 5])
            await tx.wait()

            tx = await staking.pause()
            await tx.wait()

            await expect(staking.connect(acc1).withdraw([0, 1]))
                .to.be.revertedWith("Pausable: paused")
        })
    })

    describe("withdrawToAddress", () => {
        it("Should withdraw staked NFTs to fiven address", async () => {
            const { staking, fundCollection, artCollection, accounts } = await loadFixture(testSetup)
            const [creator, acc1] = [accounts[1], accounts[2]]

            const lowQuotaAmount = 100
            const regQuotaAmount = 10
            const highQuotaAmount = 2

            const valueAmount = cfLowQuotaValue[0].mul(lowQuotaAmount)
                .add(cfRegQuotaValue[0].mul(regQuotaAmount))
                .add(cfHighQuotaValue[0].mul(highQuotaAmount))

            let tx = await fundCollection.connect(acc1)
                .invest(lowQuotaAmount, regQuotaAmount, highQuotaAmount, 0, { value: valueAmount })
            await tx.wait()

            const unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 10
            await time.increaseTo(unlockTime);

            tx = await fundCollection.connect(acc1).mint(acc1.address)
            await tx.wait()

            tx = await artCollection.connect(acc1).setApprovalForAll(staking.address, true)
            await tx.wait()

            tx = await staking.connect(acc1).stake([0, 1, 101, 151, 4, 5])
            await tx.wait()

            tx = await staking.withdrawToAddress(acc1.address, [1, 101, 151])
            await tx.wait()
            tx = await staking.connect(creator).withdrawToAddress(acc1.address, [5])
            const receipt = await tx.wait()
            const blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp

            const staker = await staking.stakersArray(0)
            const stakerStruct = await staking.getStaker(acc1.address)

            const isIndexed0 = await staking.isIndexed(0)
            const isIndexed1 = await staking.isIndexed(1)
            const isIndexed101 = await staking.isIndexed(101)
            const isIndexed151 = await staking.isIndexed(151)
            const isIndexed4 = await staking.isIndexed(4)
            const isIndexed5 = await staking.isIndexed(5)
            const isIndexed6 = await staking.isIndexed(6)

            expect(staker).to.equal(acc1.address)
            expect(stakerStruct.amountStaked[0].toNumber()).to.equal(2)
            expect(stakerStruct.amountStaked[1].toNumber()).to.equal(0)
            expect(stakerStruct.amountStaked[2].toNumber()).to.equal(0)
            expect(stakerStruct.timeOfLastUpdate.toNumber()).to.equal(blockTimestamp)
            expect(stakerStruct.unclaimedRewards.toNumber()).not.to.equal(0)
            expect(stakerStruct.conditionIdOflastUpdate.toNumber()).to.equal(0)
            expect(isIndexed0).to.equal(true)
            expect(isIndexed1).to.equal(true)
            expect(isIndexed101).to.equal(true)
            expect(isIndexed151).to.equal(true)
            expect(isIndexed4).to.equal(true)
            expect(isIndexed5).to.equal(true)
            expect(isIndexed6).to.equal(false)
        })

        it("Should withdraw staked NFTs to fiven address if caller is manager when corrupted", async () => {
            const { management, staking, fundCollection, artCollection, accounts } = await loadFixture(testSetup)
            const [creator, acc1] = [accounts[1], accounts[2]]

            const lowQuotaAmount = 100
            const regQuotaAmount = 10
            const highQuotaAmount = 2

            const valueAmount = cfLowQuotaValue[0].mul(lowQuotaAmount)
                .add(cfRegQuotaValue[0].mul(regQuotaAmount))
                .add(cfHighQuotaValue[0].mul(highQuotaAmount))

            let tx = await fundCollection.connect(acc1)
                .invest(lowQuotaAmount, regQuotaAmount, highQuotaAmount, 0, { value: valueAmount })
            await tx.wait()

            const unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 10
            await time.increaseTo(unlockTime);

            tx = await fundCollection.connect(acc1).mint(acc1.address)
            await tx.wait()

            tx = await artCollection.connect(acc1).setApprovalForAll(staking.address, true)
            await tx.wait()

            tx = await staking.connect(acc1).stake([0, 1, 101, 151, 4, 5])
            await tx.wait()

            tx = await management.setCorrupted(creator.address, true)
            await tx.wait()

            tx = await staking.withdrawToAddress(acc1.address, [1, 101, 151, 5])
            const receipt = await tx.wait()
            const blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp

            const staker = await staking.stakersArray(0)
            const stakerStruct = await staking.getStaker(acc1.address)

            const isIndexed0 = await staking.isIndexed(0)
            const isIndexed1 = await staking.isIndexed(1)
            const isIndexed101 = await staking.isIndexed(101)
            const isIndexed151 = await staking.isIndexed(151)
            const isIndexed4 = await staking.isIndexed(4)
            const isIndexed5 = await staking.isIndexed(5)
            const isIndexed6 = await staking.isIndexed(6)

            expect(staker).to.equal(acc1.address)
            expect(stakerStruct.amountStaked[0].toNumber()).to.equal(2)
            expect(stakerStruct.amountStaked[1].toNumber()).to.equal(0)
            expect(stakerStruct.amountStaked[2].toNumber()).to.equal(0)
            expect(stakerStruct.timeOfLastUpdate.toNumber()).to.equal(blockTimestamp)
            expect(stakerStruct.unclaimedRewards.toNumber()).not.to.equal(0)
            expect(stakerStruct.conditionIdOflastUpdate.toNumber()).to.equal(0)
            expect(isIndexed0).to.equal(true)
            expect(isIndexed1).to.equal(true)
            expect(isIndexed101).to.equal(true)
            expect(isIndexed151).to.equal(true)
            expect(isIndexed4).to.equal(true)
            expect(isIndexed5).to.equal(true)
            expect(isIndexed6).to.equal(false)
        })

        it("Should NOT withdraw staked NFTs for given address if array is empty", async () => {
            const { staking, fundCollection, artCollection, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAmount = 100
            const regQuotaAmount = 10
            const highQuotaAmount = 2

            const valueAmount = cfLowQuotaValue[0].mul(lowQuotaAmount)
                .add(cfRegQuotaValue[0].mul(regQuotaAmount))
                .add(cfHighQuotaValue[0].mul(highQuotaAmount))

            let tx = await fundCollection.connect(acc1)
                .invest(lowQuotaAmount, regQuotaAmount, highQuotaAmount, 0, { value: valueAmount })
            await tx.wait()

            const unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 10
            await time.increaseTo(unlockTime);

            tx = await fundCollection.connect(acc1).mint(acc1.address)
            await tx.wait()

            tx = await artCollection.connect(acc1).setApprovalForAll(staking.address, true)
            await tx.wait()

            tx = await staking.connect(acc1).stake([0, 1, 2, 3, 4, 5])
            await tx.wait()

            await expect(staking.withdrawToAddress(acc1.address, []))
                .to.be.revertedWithCustomError(staking, "CRPStakingNoTokensGiven")
        })

        it("Should NOT withdraw staked NFTs to given address if array is larger than amount staked", async () => {
            const { staking, fundCollection, artCollection, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAmount = 100
            const regQuotaAmount = 10
            const highQuotaAmount = 2

            const valueAmount = cfLowQuotaValue[0].mul(lowQuotaAmount)
                .add(cfRegQuotaValue[0].mul(regQuotaAmount))
                .add(cfHighQuotaValue[0].mul(highQuotaAmount))

            let tx = await fundCollection.connect(acc1)
                .invest(lowQuotaAmount, regQuotaAmount, highQuotaAmount, 0, { value: valueAmount })
            await tx.wait()

            const unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 10
            await time.increaseTo(unlockTime);

            tx = await fundCollection.connect(acc1).mint(acc1.address)
            await tx.wait()

            tx = await artCollection.connect(acc1).setApprovalForAll(staking.address, true)
            await tx.wait()

            tx = await staking.connect(acc1).stake([0, 1, 2, 3, 4, 5])
            await tx.wait()

            await expect(staking.withdrawToAddress(acc1.address, [0, 1, 2, 3, 4, 5, 6]))
                .to.be.revertedWithCustomError(staking, "CRPStakingWithdrawingMoreThanStaked")
        })

        it("Should NOT withdraw staked NFTs for given address if token is not from staker", async () => {
            const { staking, fundCollection, artCollection, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAmount = 100
            const regQuotaAmount = 10
            const highQuotaAmount = 2

            const valueAmount = cfLowQuotaValue[0].mul(lowQuotaAmount)
                .add(cfRegQuotaValue[0].mul(regQuotaAmount))
                .add(cfHighQuotaValue[0].mul(highQuotaAmount))

            let tx = await fundCollection.connect(acc1)
                .invest(lowQuotaAmount, regQuotaAmount, highQuotaAmount, 0, { value: valueAmount })
            await tx.wait()

            const unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 10
            await time.increaseTo(unlockTime);

            tx = await fundCollection.connect(acc1).mint(acc1.address)
            await tx.wait()

            tx = await artCollection.connect(acc1).setApprovalForAll(staking.address, true)
            await tx.wait()

            tx = await staking.connect(acc1).stake([0, 1, 2, 3, 4, 5])
            await tx.wait()

            await expect(staking.withdrawToAddress(acc1.address, [0, 1, 2, 3, 4, 6]))
                .to.be.revertedWithCustomError(staking, "CRPStakingNotTokenStaker")
        })

        it("Should NOT withdraw staked NFTs to given address if caller not manager/creator", async () => {
            const { management, staking, fundCollection, artCollection, accounts } = await loadFixture(testSetup)
            const [creator, acc1, acc2] = [accounts[1], accounts[2], accounts[3]]

            const lowQuotaAmount = 100
            const regQuotaAmount = 10
            const highQuotaAmount = 2

            const valueAmount = cfLowQuotaValue[0].mul(lowQuotaAmount)
                .add(cfRegQuotaValue[0].mul(regQuotaAmount))
                .add(cfHighQuotaValue[0].mul(highQuotaAmount))

            let tx = await fundCollection.connect(acc1)
                .invest(lowQuotaAmount, regQuotaAmount, highQuotaAmount, 0, { value: valueAmount })
            await tx.wait()

            const unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 10
            await time.increaseTo(unlockTime);

            tx = await fundCollection.connect(acc1).mint(acc1.address)
            await tx.wait()

            tx = await artCollection.connect(acc1).setApprovalForAll(staking.address, true)
            await tx.wait()

            tx = await staking.connect(acc1).stake([0, 1, 2, 3, 4, 5])
            await tx.wait()

            await expect(staking.connect(acc2).withdrawToAddress(acc1.address, [0, 1]))
                .to.be.revertedWithCustomError(staking, "CRPStakingNotAllowed")

            tx = await management.setCorrupted(creator.address, true)
            await tx.wait()

            await expect(staking.connect(acc2).withdrawToAddress(acc1.address, [0, 1]))
                .to.be.revertedWithCustomError(staking, "CRPStakingNotAllowed")
        })
    })

    describe("claimRewards", () => {
        it("Should claim rewards", async () => {
            const { staking, fundCollection, artCollection, accounts, creatorsCoin, multiSig } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAmount = 100
            const regQuotaAmount = 10
            const highQuotaAmount = 2

            const valueAmount = cfLowQuotaValue[0].mul(lowQuotaAmount)
                .add(cfRegQuotaValue[0].mul(regQuotaAmount))
                .add(cfHighQuotaValue[0].mul(highQuotaAmount))

            let tx = await fundCollection.connect(acc1)
                .invest(lowQuotaAmount, regQuotaAmount, highQuotaAmount, 0, { value: valueAmount })
            await tx.wait()

            let unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 10
            await time.increaseTo(unlockTime);

            tx = await fundCollection.connect(acc1).mint(acc1.address)
            await tx.wait()

            tx = await artCollection.connect(acc1).setApprovalForAll(staking.address, true)
            await tx.wait()

            tx = await staking.connect(acc1).stake([0, 1, 2, 3, 4, 5])
            await tx.wait()

            unlockTime = (await time.latest()) + 2 * 24 * 60 * 60
            await time.increaseTo(unlockTime);

            tx = await creatorsCoin.mint(staking.address, valueAmount)
            await tx.wait()

            const balanceBefore = await creatorsCoin.balanceOf(acc1.address)
            const balanceBeforeMultiSig = await creatorsCoin.balanceOf(multiSig.address)

            tx = await staking.connect(acc1).claimRewards()
            const receipt = await tx.wait()
            const blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp

            const balanceAfter = await creatorsCoin.balanceOf(acc1.address)
            const balanceAfterMultiSig = await creatorsCoin.balanceOf(multiSig.address)
            const staker = await staking.getStaker(acc1.address)

            expect(balanceAfter).to.be.greaterThan(balanceBefore)
            expect(balanceAfterMultiSig).to.be.greaterThan(balanceBeforeMultiSig)
            expect(staker.timeOfLastUpdate.toNumber()).to.equal(blockTimestamp)
        })

        it("Should NOT claim rewards if reward is 0", async () => {
            const { staking, fundCollection, artCollection, accounts, creatorsCoin } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAmount = 100
            const regQuotaAmount = 10
            const highQuotaAmount = 2

            const valueAmount = cfLowQuotaValue[0].mul(lowQuotaAmount)
                .add(cfRegQuotaValue[0].mul(regQuotaAmount))
                .add(cfHighQuotaValue[0].mul(highQuotaAmount))

            let tx = await fundCollection.connect(acc1)
                .invest(lowQuotaAmount, regQuotaAmount, highQuotaAmount, 0, { value: valueAmount })
            await tx.wait()

            let unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 10
            await time.increaseTo(unlockTime);

            tx = await fundCollection.connect(acc1).mint(acc1.address)
            await tx.wait()

            tx = await artCollection.connect(acc1).setApprovalForAll(staking.address, true)
            await tx.wait()

            tx = await staking.connect(acc1).stake([0, 1, 2, 3, 4, 5])
            await tx.wait()

            unlockTime = (await time.latest()) + 2 * 24 * 60 * 60
            await time.increaseTo(unlockTime);

            tx = await staking.connect(acc1).withdraw([0, 1, 2, 3, 4, 5])
            await tx.wait()

            tx = await creatorsCoin.mint(staking.address, valueAmount)
            await tx.wait()

            tx = await staking.connect(acc1).claimRewards()
            await tx.wait()

            await expect(staking.connect(acc1).claimRewards())
                .to.be.revertedWithCustomError(staking, "CRPStakingNoRewards")
        })

        it("Should NOT claim rewards if contract paused", async () => {
            const { staking, fundCollection, artCollection, accounts, creatorsCoin } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAmount = 100
            const regQuotaAmount = 10
            const highQuotaAmount = 2

            const valueAmount = cfLowQuotaValue[0].mul(lowQuotaAmount)
                .add(cfRegQuotaValue[0].mul(regQuotaAmount))
                .add(cfHighQuotaValue[0].mul(highQuotaAmount))

            let tx = await fundCollection.connect(acc1)
                .invest(lowQuotaAmount, regQuotaAmount, highQuotaAmount, 0, { value: valueAmount })
            await tx.wait()

            let unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 10
            await time.increaseTo(unlockTime);

            tx = await fundCollection.connect(acc1).mint(acc1.address)
            await tx.wait()

            tx = await artCollection.connect(acc1).setApprovalForAll(staking.address, true)
            await tx.wait()

            tx = await staking.connect(acc1).stake([0, 1, 2, 3, 4, 5])
            await tx.wait()

            unlockTime = (await time.latest()) + 2 * 24 * 60 * 60
            await time.increaseTo(unlockTime);

            tx = await creatorsCoin.mint(staking.address, valueAmount)
            await tx.wait()

            tx = await staking.pause()
            await tx.wait()

            await expect(staking.connect(acc1).claimRewards())
                .to.be.revertedWith("Pausable: paused")
        })
    })

    describe("depositRewardTokens", () => {
        it("Should deposit reward tokens", async () => {
            const { staking, accounts, creatorsCoin } = await loadFixture(testSetup)
            const manager = accounts[0]

            let tx = await creatorsCoin.mint(manager.address, ethers.utils.parseEther("1000"))
            await tx.wait()

            tx = await creatorsCoin.approve(staking.address, ethers.utils.parseEther("1000"))
            await tx.wait()

            const balanceBefore = await creatorsCoin.balanceOf(staking.address)

            tx = await staking.depositRewardTokens(manager.address, ethers.utils.parseEther("1000"))
            await tx.wait()

            const balanceAfter = await creatorsCoin.balanceOf(staking.address)

            expect(balanceBefore.toNumber()).to.equal(0)
            expect(balanceAfter).to.equal(ethers.utils.parseEther("1000"))
        })

        it("Should NOT deposit reward tokens if caller is not manager", async () => {
            const { staking, accounts, creatorsCoin } = await loadFixture(testSetup)
            const [manager, acc1] = [accounts[0], accounts[2]]

            let tx = await creatorsCoin.mint(manager.address, ethers.utils.parseEther("1000"))
            await tx.wait()

            tx = await creatorsCoin.approve(staking.address, ethers.utils.parseEther("1000"))
            await tx.wait()

            await expect(staking.connect(acc1).depositRewardTokens(manager.address, ethers.utils.parseEther("1000")))
                .to.be.revertedWithCustomError(staking, "CRPStakingNotAllowed")
        })

        it("Should NOT deposit reward tokens if contract paused", async () => {
            const { staking, accounts, creatorsCoin } = await loadFixture(testSetup)
            const manager = accounts[0]

            let tx = await creatorsCoin.mint(manager.address, ethers.utils.parseEther("1000"))
            await tx.wait()

            tx = await creatorsCoin.approve(staking.address, ethers.utils.parseEther("1000"))
            await tx.wait()

            tx = await staking.pause()
            await tx.wait()

            await expect(staking.depositRewardTokens(manager.address, ethers.utils.parseEther("1000")))
                .to.be.revertedWith("Pausable: paused")
        })
    })

    describe("splitUSD", () => {
        it("Should deposit USD tokens", async () => {
            const { staking, fundCollection, artCollection, accounts, erc20 } = await loadFixture(testSetup)
            const [manager, acc1] = [accounts[0], accounts[2]]

            const lowQuotaAmount = 100
            const regQuotaAmount = 10
            const highQuotaAmount = 2

            const valueAmount = cfLowQuotaValue[0].mul(lowQuotaAmount)
                .add(cfRegQuotaValue[0].mul(regQuotaAmount))
                .add(cfHighQuotaValue[0].mul(highQuotaAmount))

            let tx = await fundCollection.connect(acc1)
                .invest(lowQuotaAmount, regQuotaAmount, highQuotaAmount, 0, { value: valueAmount })
            await tx.wait()

            let unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 10
            await time.increaseTo(unlockTime);

            tx = await fundCollection.connect(acc1).mint(acc1.address)
            await tx.wait()

            tx = await artCollection.connect(acc1).setApprovalForAll(staking.address, true)
            await tx.wait()

            tx = await staking.connect(acc1).stake([0, 1, 2, 3, 4, 5])
            await tx.wait()

            unlockTime = (await time.latest()) + 2 * 24 * 60 * 60
            await time.increaseTo(unlockTime);

            tx = await erc20.mint(manager.address, ethers.utils.parseEther("1000"))
            await tx.wait()

            tx = await erc20.approve(staking.address, ethers.utils.parseEther("1000"))
            await tx.wait()

            const balanceBefore = await staking.unclaimedUSD(acc1.address)

            tx = await staking.splitUSD(manager.address, ethers.utils.parseEther("1000"))
            await tx.wait()

            const balanceAfter = await staking.unclaimedUSD(acc1.address)

            expect(balanceBefore.toNumber()).to.equal(0)
            expect(balanceAfter).to.equal(ethers.utils.parseEther("1000"))
        })

        it("Should NOT deposit USD tokens if caller is not manager", async () => {
            const { staking, accounts, erc20 } = await loadFixture(testSetup)
            const [manager, acc1] = [accounts[0], accounts[2]]

            let tx = await erc20.mint(manager.address, ethers.utils.parseEther("1000"))
            await tx.wait()

            tx = await erc20.approve(staking.address, ethers.utils.parseEther("1000"))
            await tx.wait()

            await expect(staking.connect(acc1).splitUSD(manager.address, ethers.utils.parseEther("1000")))
                .to.be.revertedWithCustomError(staking, "CRPStakingNotAllowed")
        })

        it("Should NOT deposit USD tokens if contract paused", async () => {
            const { staking, accounts, erc20 } = await loadFixture(testSetup)
            const manager = accounts[0]

            let tx = await erc20.mint(manager.address, ethers.utils.parseEther("1000"))
            await tx.wait()

            tx = await erc20.approve(staking.address, ethers.utils.parseEther("1000"))
            await tx.wait()

            tx = await staking.pause()
            await tx.wait()

            await expect(staking.splitUSD(manager.address, ethers.utils.parseEther("1000")))
                .to.be.revertedWith("Pausable: paused")
        })
    })

    describe("claimUSD", () => {
        it("Should claim USD", async () => {
            const { staking, fundCollection, artCollection, accounts, erc20, multiSig } = await loadFixture(testSetup)
            const [manager, acc1] = [accounts[0], accounts[2]]

            const lowQuotaAmount = 100
            const regQuotaAmount = 10
            const highQuotaAmount = 2

            const valueAmount = cfLowQuotaValue[0].mul(lowQuotaAmount)
                .add(cfRegQuotaValue[0].mul(regQuotaAmount))
                .add(cfHighQuotaValue[0].mul(highQuotaAmount))

            const USDDeposited = ethers.utils.parseEther("1000")

            const creatorsRoyaltyFee = 500
            const creatorsRoyalty = USDDeposited.mul(creatorsRoyaltyFee).div(10000)

            let tx = await fundCollection.connect(acc1)
                .invest(lowQuotaAmount, regQuotaAmount, highQuotaAmount, 0, { value: valueAmount })
            await tx.wait()

            tx = await erc20.mint(manager.address, ethers.utils.parseEther("10000"))
            await tx.wait()

            tx = await erc20.approve(staking.address, ethers.utils.parseEther("10000"))
            await tx.wait()

            let unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 10
            await time.increaseTo(unlockTime);

            tx = await fundCollection.connect(acc1).mint(acc1.address)
            await tx.wait()

            tx = await artCollection.connect(acc1).setApprovalForAll(staking.address, true)
            await tx.wait()

            tx = await staking.connect(acc1).stake([0, 1, 2, 3, 4, 5])
            await tx.wait()

            tx = await staking.splitUSD(manager.address, USDDeposited)
            await tx.wait()

            const balanceBefore = await erc20.balanceOf(acc1.address)
            const balanceMultiSigBefore = await erc20.balanceOf(multiSig.address)

            tx = await staking.connect(acc1).claimUSD()
            await tx.wait()

            const balanceAfter = await erc20.balanceOf(acc1.address)
            const balanceMultiSigAfter = await erc20.balanceOf(multiSig.address)

            expect(balanceBefore.toNumber()).to.equal(0)
            expect(balanceAfter).to.equal(USDDeposited.sub(creatorsRoyalty))
            expect(balanceMultiSigAfter).to.equal(balanceMultiSigBefore.add(creatorsRoyalty))
        })

        it("Should NOT claim USD if contract paused", async () => {
            const { staking, fundCollection, artCollection, accounts, erc20 } = await loadFixture(testSetup)
            const [manager, acc1] = [accounts[0], accounts[2]]

            const lowQuotaAmount = 100
            const regQuotaAmount = 10
            const highQuotaAmount = 2

            const valueAmount = cfLowQuotaValue[0].mul(lowQuotaAmount)
                .add(cfRegQuotaValue[0].mul(regQuotaAmount))
                .add(cfHighQuotaValue[0].mul(highQuotaAmount))

            let tx = await fundCollection.connect(acc1)
                .invest(lowQuotaAmount, regQuotaAmount, highQuotaAmount, 0, { value: valueAmount })
            await tx.wait()

            tx = await erc20.mint(manager.address, ethers.utils.parseEther("10000"))
            await tx.wait()

            let unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 10
            await time.increaseTo(unlockTime);

            tx = await fundCollection.connect(acc1).mint(acc1.address)
            await tx.wait()

            tx = await artCollection.connect(acc1).setApprovalForAll(staking.address, true)
            await tx.wait()

            tx = await staking.connect(acc1).stake([0, 1, 2, 3, 4, 5])
            await tx.wait()

            unlockTime = (await time.latest()) + 2 * 24 * 60 * 60
            await time.increaseTo(unlockTime);

            tx = await staking.pause()
            await tx.wait()

            await expect(staking.connect(acc1).claimUSD())
                .to.be.revertedWith("Pausable: paused")
        })
    })

    describe("Setter functions", () => {
        describe("setStakingCondition", () => {
            it("Should set new staking condition", async () => {
                const { staking, accounts } = await loadFixture(testSetup)
                const creator = accounts[1]

                const timeUnit1 = 16 * 24 * 60 * 60
                const timeUnit2 = 17 * 24 * 60 * 60

                const nextConditionIdBefore = await staking.nextConditionId()

                let tx = await staking.setStakingCondition(timeUnit1,
                    [ethers.utils.parseEther("1"), ethers.utils.parseEther("10"), ethers.utils.parseEther("100")]
                )
                let receipt = await tx.wait()
                let blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp

                const nextConditionIdAfter = await staking.nextConditionId()
                const currStakingCondition = await staking.getCurrentStakingCondition()
                const prevStakingCondition = await staking.getStakingCondition(nextConditionIdBefore.toNumber() - 1)

                expect(nextConditionIdBefore.toNumber()).to.equal(1)
                expect(nextConditionIdAfter.toNumber()).to.equal(2)
                expect(currStakingCondition.timeUnit.toNumber()).to.equal(timeUnit1)
                expect(currStakingCondition.rewardsPerUnitTime[0]).to.equal(ethers.utils.parseEther("1"))
                expect(currStakingCondition.rewardsPerUnitTime[1]).to.equal(ethers.utils.parseEther("10"))
                expect(currStakingCondition.rewardsPerUnitTime[2]).to.equal(ethers.utils.parseEther("100"))
                expect(currStakingCondition.startTimestamp.toNumber()).to.equal(blockTimestamp)
                expect(currStakingCondition.endTimestamp.toNumber()).to.equal(0)
                expect(prevStakingCondition.endTimestamp.toNumber()).to.equal(blockTimestamp)

                tx = await staking.connect(creator).setStakingCondition(timeUnit2,
                    [ethers.utils.parseEther("0.01"), ethers.utils.parseEther("0.1"), ethers.utils.parseEther("1")]
                )
                receipt = await tx.wait()
                blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp

                const nextConditionIdAfter2 = await staking.nextConditionId()
                const currStakingCondition2 = await staking.getCurrentStakingCondition()
                const prevStakingCondition2 = await staking.getStakingCondition(nextConditionIdAfter.toNumber() - 1)

                expect(nextConditionIdAfter2.toNumber()).to.equal(3)
                expect(currStakingCondition2.timeUnit.toNumber()).to.equal(timeUnit2)
                expect(currStakingCondition2.rewardsPerUnitTime[0]).to.equal(ethers.utils.parseEther("0.01"))
                expect(currStakingCondition2.rewardsPerUnitTime[1]).to.equal(ethers.utils.parseEther("0.1"))
                expect(currStakingCondition2.rewardsPerUnitTime[2]).to.equal(ethers.utils.parseEther("1"))
                expect(currStakingCondition2.startTimestamp.toNumber()).to.equal(blockTimestamp)
                expect(currStakingCondition2.endTimestamp.toNumber()).to.equal(0)
                expect(prevStakingCondition2.endTimestamp.toNumber()).to.equal(blockTimestamp)
            })

            it("Should set new staking condition when corrupted if caller is manager", async () => {
                const { management, staking, accounts } = await loadFixture(testSetup)
                const creator = accounts[1]

                const timeUnit = 17 * 24 * 60 * 60

                const nextConditionIdBefore = await staking.nextConditionId()

                let tx = await management.setCorrupted(creator.address, true)
                await tx.wait()

                tx = await staking.setStakingCondition(timeUnit,
                    [ethers.utils.parseEther("1"), ethers.utils.parseEther("10"), ethers.utils.parseEther("100")]
                )
                let receipt = await tx.wait()
                let blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp

                const nextConditionIdAfter = await staking.nextConditionId()
                const currStakingCondition = await staking.getCurrentStakingCondition()
                const prevStakingCondition = await staking.getStakingCondition(nextConditionIdBefore.toNumber() - 1)

                expect(nextConditionIdBefore.toNumber()).to.equal(1)
                expect(nextConditionIdAfter.toNumber()).to.equal(2)
                expect(currStakingCondition.timeUnit.toNumber()).to.equal(timeUnit)
                expect(currStakingCondition.rewardsPerUnitTime[0]).to.equal(ethers.utils.parseEther("1"))
                expect(currStakingCondition.rewardsPerUnitTime[1]).to.equal(ethers.utils.parseEther("10"))
                expect(currStakingCondition.rewardsPerUnitTime[2]).to.equal(ethers.utils.parseEther("100"))
                expect(currStakingCondition.startTimestamp.toNumber()).to.equal(blockTimestamp)
                expect(currStakingCondition.endTimestamp.toNumber()).to.equal(0)
                expect(prevStakingCondition.endTimestamp.toNumber()).to.equal(blockTimestamp)
            })

            it("Should NOT set new staking condition when corrupted if caller is not manager", async () => {
                const { management, staking, accounts } = await loadFixture(testSetup)
                const creator = accounts[1]

                let tx = await management.setCorrupted(creator.address, true)
                await tx.wait()

                await expect(staking.connect(creator).setStakingCondition(100,
                    [ethers.utils.parseEther("1"), ethers.utils.parseEther("10"), ethers.utils.parseEther("100")]
                )).to.be.revertedWithCustomError(staking, "CRPStakingNotAllowed")
            })

            it("Should NOT set new staking condition if caller is neighter manager nor creator", async () => {
                const { staking, accounts } = await loadFixture(testSetup)
                const acc1 = accounts[2]

                await expect(staking.connect(acc1).setStakingCondition(100,
                    [ethers.utils.parseEther("1"), ethers.utils.parseEther("10"), ethers.utils.parseEther("100")]
                )).to.be.revertedWithCustomError(staking, "CRPStakingNotAllowed")
            })

            it("Should NOT set new staking condition if timeUnit is 0", async () => {
                const { staking } = await loadFixture(testSetup)

                await expect(staking.setStakingCondition(0,
                    [ethers.utils.parseEther("1"), ethers.utils.parseEther("10"), ethers.utils.parseEther("100")]
                )).to.be.revertedWithCustomError(staking, "CRPStakingInvalidTimeUnit")
            })

            it("Should NOT set new staking condition if contract paused", async () => {
                const { staking } = await loadFixture(testSetup)

                let tx = await staking.pause()
                await tx.wait()

                await expect(staking.setStakingCondition(100,
                    [ethers.utils.parseEther("1"), ethers.utils.parseEther("10"), ethers.utils.parseEther("100")]
                )).to.be.revertedWith("Pausable: paused")
            })
        })
    })

    describe("pause", () => {
        it("Should pause contract", async () => {
            const { staking } = await loadFixture(testSetup)

            const pausedBefore = await staking.paused()

            const tx = await staking.pause()
            await tx.wait()

            const pausedAfter = await staking.paused()

            expect(pausedBefore).to.equal(false)
            expect(pausedAfter).to.equal(true)
        })

        it("Should NOT pause contract if caller is not manager", async () => {
            const { staking, accounts } = await loadFixture(testSetup)
            const acc = accounts[2]

            const pausedBefore = await staking.paused()

            expect(pausedBefore).to.equal(false)
            await expect(staking.connect(acc).pause())
                .to.be.revertedWithCustomError(staking, "CRPStakingNotAllowed")
        })
    })

    describe("unpause", () => {
        it("Should unpause contract", async () => {
            const { staking } = await loadFixture(testSetup)

            tx = await staking.pause()
            await tx.wait()

            const pausedBefore = await staking.paused()

            tx = await staking.unpause()
            await tx.wait()

            const pausedAfter = await staking.paused()

            expect(pausedBefore).to.equal(true)
            expect(pausedAfter).to.equal(false)
        })

        it("Should NOT unpause contract if caller is not manager", async () => {
            const { staking, accounts } = await loadFixture(testSetup)
            const acc = accounts[2]

            const tx = await staking.pause()
            await tx.wait()

            const pausedBefore = await staking.paused()

            expect(pausedBefore).to.equal(true)
            await expect(staking.connect(acc).unpause())
                .to.be.revertedWithCustomError(staking, "CRPStakingNotAllowed")
        })
    })

    describe("Getter functions", () => {
        describe("getAllStakersArray", () => {
            it("Should get the array of all stakers", async () => {
                const { staking, fundCollection, artCollection, accounts } = await loadFixture(testSetup)
                const [acc1, acc2] = [accounts[2], accounts[3]]

                let lowQuotaAmount = 100
                let regQuotaAmount = 10
                let highQuotaAmount = 2

                let valueAmount = cfLowQuotaValue[0].mul(lowQuotaAmount)
                    .add(cfRegQuotaValue[0].mul(regQuotaAmount))
                    .add(cfHighQuotaValue[0].mul(highQuotaAmount))

                let tx = await fundCollection.connect(acc1)
                    .invest(lowQuotaAmount, regQuotaAmount, highQuotaAmount, 0, { value: valueAmount })
                await tx.wait()

                lowQuotaAmount = 0
                regQuotaAmount = 30
                highQuotaAmount = 5

                valueAmount = cfLowQuotaValue[0].mul(lowQuotaAmount)
                    .add(cfRegQuotaValue[0].mul(regQuotaAmount))
                    .add(cfHighQuotaValue[0].mul(highQuotaAmount))

                tx = await fundCollection.connect(acc2)
                    .invest(lowQuotaAmount, regQuotaAmount, highQuotaAmount, 0, { value: valueAmount })
                await tx.wait()

                const unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 10
                await time.increaseTo(unlockTime);

                tx = await fundCollection.connect(acc1).mint(acc1.address)
                await tx.wait()
                tx = await fundCollection.connect(acc2).mint(acc2.address)
                await tx.wait()

                tx = await artCollection.connect(acc1).setApprovalForAll(staking.address, true)
                await tx.wait()
                tx = await artCollection.connect(acc2).setApprovalForAll(staking.address, true)
                await tx.wait()

                tx = await staking.connect(acc1).stake([0, 1])
                await tx.wait()
                tx = await staking.connect(acc2).stake([111, 112])
                await tx.wait()

                const stakersArray = await staking.getAllStakersArray()

                expect(stakersArray).to.be.an("array").to.have.same.members([acc1.address, acc2.address])
            })
        })

        describe("getAllIndexedTokens", () => {
            it("Should get all indexed token IDs", async () => {
                const { staking, fundCollection, artCollection, accounts } = await loadFixture(testSetup)
                const [acc1, acc2] = [accounts[2], accounts[3]]

                let lowQuotaAmount = 100
                let regQuotaAmount = 10
                let highQuotaAmount = 2

                let valueAmount = cfLowQuotaValue[0].mul(lowQuotaAmount)
                    .add(cfRegQuotaValue[0].mul(regQuotaAmount))
                    .add(cfHighQuotaValue[0].mul(highQuotaAmount))

                let tx = await fundCollection.connect(acc1)
                    .invest(lowQuotaAmount, regQuotaAmount, highQuotaAmount, 0, { value: valueAmount })
                await tx.wait()

                lowQuotaAmount = 0
                regQuotaAmount = 30
                highQuotaAmount = 5

                valueAmount = cfLowQuotaValue[0].mul(lowQuotaAmount)
                    .add(cfRegQuotaValue[0].mul(regQuotaAmount))
                    .add(cfHighQuotaValue[0].mul(highQuotaAmount))

                tx = await fundCollection.connect(acc2)
                    .invest(lowQuotaAmount, regQuotaAmount, highQuotaAmount, 0, { value: valueAmount })
                await tx.wait()

                const unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 10
                await time.increaseTo(unlockTime);

                tx = await fundCollection.connect(acc1).mint(acc1.address)
                await tx.wait()
                tx = await fundCollection.connect(acc2).mint(acc2.address)
                await tx.wait()

                tx = await artCollection.connect(acc1).setApprovalForAll(staking.address, true)
                await tx.wait()
                tx = await artCollection.connect(acc2).setApprovalForAll(staking.address, true)
                await tx.wait()

                tx = await staking.connect(acc1).stake([0, 1])
                await tx.wait()
                tx = await staking.connect(acc2).stake([111, 112])
                await tx.wait()

                const indexedTokensBN = await staking.getAllIndexedTokens()
                const indexedTokens = indexedTokensBN.map(elem => elem.toNumber())

                expect(indexedTokens).to.be.an("array").to.have.same.members([0, 1, 111, 112])
            })
        })

        describe("getCurrentStakingCondition", () => {
            it("Should get current staking condition", async () => {
                const { staking, blockTimestamp } = await loadFixture(testSetup)

                const currStakingCondition = await staking.getCurrentStakingCondition()

                expect(currStakingCondition.timeUnit.toNumber()).to.equal(timeUnitStaking)
                expect(currStakingCondition.rewardsPerUnitTime[0]).to.equal(rewardsPerUnitTimeStaking[0])
                expect(currStakingCondition.rewardsPerUnitTime[1]).to.equal(rewardsPerUnitTimeStaking[1])
                expect(currStakingCondition.rewardsPerUnitTime[2]).to.equal(rewardsPerUnitTimeStaking[2])
                expect(currStakingCondition.startTimestamp.toNumber()).to.equal(blockTimestamp)
                expect(currStakingCondition.endTimestamp.toNumber()).to.equal(0)
            })
        })

        describe("getStakingCondition", () => {
            it("Should get the staking condition for given condition ID", async () => {
                const { staking } = await loadFixture(testSetup)

                const timeUnit = 16 * 24 * 60 * 60

                const nextConditionIdBefore = await staking.nextConditionId()

                let tx = await staking.setStakingCondition(timeUnit,
                    [ethers.utils.parseEther("1"), ethers.utils.parseEther("10"), ethers.utils.parseEther("100")]
                )
                let receipt = await tx.wait()
                let blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp

                const stakingCondition = await staking.getStakingCondition(nextConditionIdBefore.toNumber())

                expect(stakingCondition.timeUnit.toNumber()).to.equal(timeUnit)
                expect(stakingCondition.rewardsPerUnitTime[0]).to.equal(ethers.utils.parseEther("1"))
                expect(stakingCondition.rewardsPerUnitTime[1]).to.equal(ethers.utils.parseEther("10"))
                expect(stakingCondition.rewardsPerUnitTime[2]).to.equal(ethers.utils.parseEther("100"))
                expect(stakingCondition.startTimestamp.toNumber()).to.equal(blockTimestamp)
                expect(stakingCondition.endTimestamp.toNumber()).to.equal(0)
            })
        })

        describe("getStaker", () => {
            it("Should get staker infos", async () => {
                const { staking, fundCollection, artCollection, accounts } = await loadFixture(testSetup)
                const acc1 = accounts[2]

                const lowQuotaAmount = 100
                const regQuotaAmount = 10
                const highQuotaAmount = 2

                const valueAmount = cfLowQuotaValue[0].mul(lowQuotaAmount)
                    .add(cfRegQuotaValue[0].mul(regQuotaAmount))
                    .add(cfHighQuotaValue[0].mul(highQuotaAmount))

                let tx = await fundCollection.connect(acc1)
                    .invest(lowQuotaAmount, regQuotaAmount, highQuotaAmount, 0, { value: valueAmount })
                await tx.wait()

                const unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 10
                await time.increaseTo(unlockTime);

                tx = await fundCollection.connect(acc1).mint(acc1.address)
                await tx.wait()

                tx = await artCollection.connect(acc1).setApprovalForAll(staking.address, true)
                await tx.wait()

                tx = await staking.connect(acc1).stake([0, 1])
                const receipt = await tx.wait()
                const blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp

                const stakerStruct = await staking.getStaker(acc1.address)

                expect(stakerStruct.amountStaked[0].toNumber()).to.equal(2)
                expect(stakerStruct.amountStaked[1].toNumber()).to.equal(0)
                expect(stakerStruct.amountStaked[2].toNumber()).to.equal(0)
                expect(stakerStruct.timeOfLastUpdate.toNumber()).to.equal(blockTimestamp)
                expect(stakerStruct.unclaimedRewards.toNumber()).to.equal(0)
                expect(stakerStruct.conditionIdOflastUpdate.toNumber()).to.equal(0)
            })
        })

        describe("onERC721Received", () => {
            it("Should NOT return onERC721Received selector", async () => {
                const { staking, fundCollection, artCollection, accounts } = await loadFixture(testSetup)
                const acc1 = accounts[2]

                await expect(staking.onERC721Received(
                    ethers.constants.AddressZero, ethers.constants.AddressZero, 0, "0x"
                )).to.be.revertedWithCustomError(staking, "CRPStakingDirectERC721TokenTransfer")

                const lowQuotaAmount = 100
                const regQuotaAmount = 10
                const highQuotaAmount = 2

                const valueAmount = cfLowQuotaValue[0].mul(lowQuotaAmount)
                    .add(cfRegQuotaValue[0].mul(regQuotaAmount))
                    .add(cfHighQuotaValue[0].mul(highQuotaAmount))

                let tx = await fundCollection.connect(acc1)
                    .invest(lowQuotaAmount, regQuotaAmount, highQuotaAmount, 0, { value: valueAmount })
                await tx.wait()

                const unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 10
                await time.increaseTo(unlockTime);

                tx = await fundCollection.connect(acc1).mint(acc1.address)
                await tx.wait()

                tx = await artCollection.connect(acc1).setApprovalForAll(staking.address, true)
                await tx.wait()

                await expect(artCollection.connect(acc1)['safeTransferFrom(address,address,uint256)'](
                    acc1.address, staking.address, 0
                )).to.be.revertedWithCustomError(staking, "CRPStakingDirectERC721TokenTransfer")
            })
        })
    })
})