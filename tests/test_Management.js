const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("Management", () => {
    const creatorsRoyalty = 200

    async function deployManagement() {
        const Management = await ethers.getContractFactory("Management")
        const ArtCollection = await ethers.getContractFactory("ERC721Art")
        const FundCollection = await ethers.getContractFactory("Crowdfund")
        const MultiSig = await ethers.getContractFactory("MockMultiSig")
        const CreatorsCoin = await ethers.getContractFactory("CreatorsCoin")
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

        const creatorsCoin = await CreatorsCoin.deploy("CreatorsCoin", "CC", ethers.utils.parseEther("100000"))
        await creatorsCoin.deployed()

        const managementImplementation = await Management.deploy()
        await managementImplementation.deployed()

        const implementations = {
            management: managementImplementation,
            artCollection: artCollectionImplementation,
            creatorsCollection: creatorsCollectionImplementation,
            fundCollection: fundCollectionImplementation
        }

        let abi = ["function initialize(address _beaconAdminArt, address _beaconAdminFund, address _beaconAdminCreators, address _creatorsCoin, address _erc20USD, address _multiSig, uint256 _fee)"]
        let function_name = "initialize"
        let constructor_args = [
            beaconAdminArt.address,
            beaconAdminFund.address,
            beaconAdminCreators.address,
            creatorsCoin.address,
            ethers.constants.AddressZero,
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

        abi = ["function initialize(address _management, uint256 _timeUnit, uint256 _rewardsPerUnitTime, uint256[3] calldata _interacPoints)"]
        function_name = "initialize"
        constructor_args = [
            managementProxy.address,
            60 * 60 * 24,
            ethers.utils.parseEther("0.5"),
            [2, 1, 1]
        ]

        iface = new ethers.utils.Interface(abi)
        data = iface.encodeFunctionData(function_name, constructor_args)

        const rewardImplementation = await Reward.deploy()
        await rewardImplementation.deployed()
        uups = await UUPS.deploy(rewardImplementation.address, data)
        await uups.deployed()
        const rewardProxy = Reward.attach(uups.address)

        const accounts = await ethers.getSigners()

        const management = managementProxy
        const artCollection = beaconAdminArt
        const fundCollection = beaconAdminFund
        const creatorsCollection = beaconAdminCreators
        const reward = rewardProxy
        const staking = beaconAdminStak

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
            staking
        }
    }

    describe("initialize", () => {
        it("Should initialize contract successfully", async () => {
            const { management, artCollection, fundCollection, creatorsCollection, creatorsCoin, multiSig } = await loadFixture(deployManagement)

            const artCol = await management.beaconAdminArt()
            const fundCol = await management.beaconAdminFund()
            const creatorsCol = await management.beaconAdminCreators()
            const multiSigAddress = await management.multiSig()
            const fee = await management.fee()
            const tokenContract = await management.tokenContract(2);

            expect(artCol).to.equal(artCollection.address)
            expect(fundCol).to.equal(fundCollection.address)
            expect(creatorsCol).to.equal(creatorsCollection.address)
            expect(multiSigAddress).to.equal(multiSig.address)
            expect(fee.toNumber()).to.equal(creatorsRoyalty)
            expect(tokenContract).to.equal(creatorsCoin.address)
        })

        it("Should NOT initialize once it is already initialized", async () => {
            const { management } = await loadFixture(deployManagement)

            await expect(management.initialize(
                ethers.constants.AddressZero,
                ethers.constants.AddressZero,
                ethers.constants.AddressZero,
                ethers.constants.AddressZero,
                ethers.constants.AddressZero,
                ethers.constants.AddressZero,
                0
            )).to.be.revertedWith("Initializable: contract is already initialized")
        })
    })

    describe("Instantiate ERC721 functions", () => {
        describe("newArtCollection", () => {
            it("Should instantiate new ERC721 art collection for a creator", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const [owner, creator] = accounts

                const allowCreator = await management.setCreator(creator.address, true)
                await allowCreator.wait()
                const newCol = await management.connect(creator).newArtCollection(
                    "MyNFT", "MNFT", 0, ethers.utils.parseEther("1"), ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("1"), "https://example.com/my-token/", 10, creator.address
                )

                const receipt = await newCol.wait()
                const event = receipt.events.filter(evt => evt?.event)
                const rightEvent = event.filter(evt => evt.args.collection)
                const collectionAddress = rightEvent[0].args.collection
                const newCollection = await ethers.getContractAt("contracts/ERC721Art.sol:ERC721Art", collectionAddress)

                const name = await newCollection.name()
                const symbol = await newCollection.symbol()
                const maxSupply = await newCollection.maxSupply()
                const priceETH = await newCollection.pricePerCoin(0)
                const priceUSDT = await newCollection.pricePerCoin(1)
                const priceCreatorsCoin = await newCollection.pricePerCoin(2)
                const baseURI = await newCollection.baseURI()

                expect(name).to.equal("MyNFT")
                expect(symbol).to.equal("MNFT")
                expect(maxSupply.toNumber()).to.equal(0)
                expect(priceETH).to.equal(ethers.utils.parseEther("1"))
                expect(priceUSDT).to.equal(ethers.utils.parseEther("1"))
                expect(priceCreatorsCoin).to.equal(ethers.utils.parseEther("1"))
                expect(baseURI).to.equal("https://example.com/my-token/")
            })

            it("Should NOT instantiate new ERC721 art collection for a creator if creator is not allowed", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const [owner, creator] = accounts

                await expect(management.connect(creator).newArtCollection(
                    "MyNFT", "MNFT", 0, ethers.utils.parseEther("1"), ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("1"), "https://example.com/my-token/", 10, creator.address
                )).to.be.revertedWithCustomError(management, "ManagementNotAllowed")

                await expect(management.newArtCollection(
                    "MyNFT", "MNFT", 0, ethers.utils.parseEther("1"), ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("1"), "https://example.com/my-token/", 10, creator.address
                )).to.be.revertedWithCustomError(management, "ManagementNotAllowed")
            })

            it("Should NOT instantiate new ERC721 art collection for a creator if creator is corrupted", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const [owner, creator] = accounts

                let tx = await management.setCreator(creator.address, true)
                await tx.wait()

                tx = await management.setCorrupted(creator.address, true)
                await tx.wait()

                await expect(management.connect(creator).newArtCollection(
                    "MyNFT", "MNFT", 0, ethers.utils.parseEther("1"), ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("1"), "https://example.com/my-token/", 10, creator.address
                )).to.be.revertedWithCustomError(management, "ManagementCreatorCorrupted")
            })

            it("Should NOT instantiate new ERC721 art collection for a creator if parameters are invalid", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const [owner, creator] = accounts

                const allowCreator = await management.setCreator(creator.address, true)
                await allowCreator.wait()

                await expect(management.connect(creator).newArtCollection(
                    "MyNFT", "", 0, ethers.utils.parseEther("1"), ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("1"), "https://example.com/my-token/", 10, creator.address
                )).to.be.revertedWithCustomError(management, "ManagementInvalidSymbol")

                await expect(management.connect(creator).newArtCollection(
                    "", "", 0, ethers.utils.parseEther("1"), ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("1"), "https://example.com/my-token/", 10, creator.address
                )).to.be.revertedWithCustomError(management, "ManagementInvalidName")

                await expect(management.connect(creator).newArtCollection(
                    "", "MNFT", 0, ethers.utils.parseEther("1"), ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("1"), "https://example.com/my-token", 10, creator.address
                )).to.be.revertedWithCustomError(management, "ManagementInvalidName")
            })

            it("Should NOT instantiate new ERC721 art collection for a creator if art ERC721 beacon has zero address", async () => {
                const [owner, creator] = await ethers.getSigners()

                const Management = await ethers.getContractFactory("Management")
                const UUPS = await ethers.getContractFactory("ERC1967Proxy")
                const managementImplementation = await Management.deploy()
                await managementImplementation.deployed()

                const abi = ["function initialize(address _beaconAdminArt, address _beaconAdminFund, address _beaconAdminCreators, address _beaconAdminTickets, address _creatorsCoin, address _multiSig, uint256 _fee)"]
                const function_name = "initialize"
                const constructor_args = [
                    ethers.constants.AddressZero,
                    ethers.constants.AddressZero,
                    ethers.constants.AddressZero,
                    ethers.constants.AddressZero,
                    ethers.constants.AddressZero,
                    ethers.constants.AddressZero,
                    creatorsRoyalty
                ]

                const iface = new ethers.utils.Interface(abi)
                const data = iface.encodeFunctionData(function_name, constructor_args)

                const uups = await UUPS.deploy(managementImplementation.address, data)
                await uups.deployed()
                const management = Management.attach(uups.address)

                const allowCreator = await management.setCreator(creator.address, true)
                await allowCreator.wait()

                await expect(management.connect(creator).newArtCollection(
                    "MyNFT", "MNFT", 0, ethers.utils.parseEther("1"), ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("1"), "https://example.com/my-token/", 10, creator.address
                )).to.be.revertedWithCustomError(management, "ManagementInvalidAddress")
            })

            it("Should NOT instantiate new ERC721 art collection for a creator if contract paused", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const [owner, creator] = accounts

                const allowCreator = await management.setCreator(creator.address, true)
                await allowCreator.wait()

                const tx = await management.pause()
                await tx.wait()

                await expect(management.connect(creator).newArtCollection(
                    "MyNFT", "MNFT", 0, ethers.utils.parseEther("1"), ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("1"), "https://example.com/my-token/", 10, creator.address
                )).to.be.revertedWith("Pausable: paused")
            })
        })

        describe("newCrowdfund", () => {
            const lowQuotaValues = [ethers.utils.parseEther("0.1"), ethers.utils.parseEther("0.11"), ethers.utils.parseEther("0.12")]
            const regQuotaValues = [ethers.utils.parseEther("1"), ethers.utils.parseEther("1.1"), ethers.utils.parseEther("1.2")]
            const highQuotaValues = [ethers.utils.parseEther("3"), ethers.utils.parseEther("3.1"), ethers.utils.parseEther("3.2")]
            it("Should instantiate new ERC721 crowd fund collection for a creator", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const [owner, creator] = accounts

                const allowCreator = await management.setCreator(creator.address, true)
                await allowCreator.wait()
                const newCol = await management.connect(creator).newCrowdfund(
                    "MyNFT", "MNFT", "https://example.com/my-token/", 200, creator.address,
                    [lowQuotaValues, regQuotaValues, highQuotaValues,
                        100, 100, 100, accounts[10].address, 200, 3000]
                )
                const receipt = await newCol.wait()
                const blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp
                const event = receipt.events.filter(evt => evt?.event)
                const rightEvent = event.filter(evt => evt.args.fundCollection || evt.args.artCollection)
                const fundCollectionAddress = rightEvent[0].args.fundCollection
                const newCrowdfund = await ethers.getContractAt("contracts/Crowdfund.sol:Crowdfund", fundCollectionAddress)
                const artCollectionAddress = rightEvent[0].args.artCollection
                const newArtCollection = await ethers.getContractAt("contracts/ERC721Art.sol:ERC721Art", artCollectionAddress)

                //collection
                const name = await newArtCollection.name()
                const symbol = await newArtCollection.symbol()
                const maxSupply = await newArtCollection.maxSupply()
                const priceETH = await newArtCollection.pricePerCoin(0)
                const priceUSDT = await newArtCollection.pricePerCoin(1)
                const priceCreatorsCoin = await newArtCollection.pricePerCoin(2)
                const baseURI = await newArtCollection.baseURI()
                const crowdfund = await newArtCollection.crowdfund()

                //crowdfund
                const dueDate = await newCrowdfund.dueDate()
                const minSoldRate = await newCrowdfund.minSoldRate()
                const quotaInfosLowObj = await newCrowdfund.getQuotaInfos(0)
                const quotaInfosLow = {
                    values: quotaInfosLowObj[0],
                    amount: quotaInfosLowObj.amount.toNumber(),
                    bought: quotaInfosLowObj.bought.toNumber(),
                    nextTokenId: quotaInfosLowObj.nextTokenId.toNumber()
                }
                const quotaInfosRegObj = await newCrowdfund.getQuotaInfos(1)
                const quotaInfosReg = {
                    values: quotaInfosRegObj[0],
                    amount: quotaInfosRegObj.amount.toNumber(),
                    bought: quotaInfosRegObj.bought.toNumber(),
                    nextTokenId: quotaInfosRegObj.nextTokenId.toNumber()
                }
                const quotaInfosHighObj = await newCrowdfund.getQuotaInfos(2)
                const quotaInfosHigh = {
                    values: quotaInfosHighObj[0],
                    amount: quotaInfosHighObj.amount.toNumber(),
                    bought: quotaInfosHighObj.bought.toNumber(),
                    nextTokenId: quotaInfosHighObj.nextTokenId.toNumber()
                }
                const soldQuotaAmount = quotaInfosLow.bought + quotaInfosReg.bought + quotaInfosHigh.bought
                const donationFee = await newCrowdfund.donationFee()
                const donationReceiver = await newCrowdfund.donationReceiver()
                const artCollection = await newCrowdfund.collection()

                //collection
                expect(name).to.equal("MyNFT")
                expect(symbol).to.equal("MNFT")
                expect(maxSupply.toNumber()).to.equal(100 * 3)
                expect(priceETH).to.equal(ethers.constants.MaxUint256)
                expect(priceUSDT).to.equal(ethers.constants.MaxUint256)
                expect(priceCreatorsCoin).to.equal(ethers.constants.MaxUint256)
                expect(baseURI).to.equal("https://example.com/my-token/")
                expect(crowdfund).to.equal(fundCollectionAddress)

                //crowdfund
                expect(dueDate.toNumber()).to.equal(blockTimestamp + 6 * 30 * 24 * 60 * 60)
                expect(minSoldRate).to.equal(3000)
                expect(soldQuotaAmount).to.equal(0)
                expect(quotaInfosLow.values[0]).to.equal(lowQuotaValues[0])
                expect(quotaInfosLow.values[1]).to.equal(lowQuotaValues[1])
                expect(quotaInfosLow.values[2]).to.equal(lowQuotaValues[2])
                expect(quotaInfosReg.values[0]).to.equal(regQuotaValues[0])
                expect(quotaInfosReg.values[1]).to.equal(regQuotaValues[1])
                expect(quotaInfosReg.values[2]).to.equal(regQuotaValues[2])
                expect(quotaInfosHigh.values[0]).to.equal(highQuotaValues[0])
                expect(quotaInfosHigh.values[1]).to.equal(highQuotaValues[1])
                expect(quotaInfosHigh.values[2]).to.equal(highQuotaValues[2])
                expect(quotaInfosLow.amount).to.equal(100)
                expect(quotaInfosReg.amount).to.equal(100)
                expect(quotaInfosHigh.amount).to.equal(100)
                expect(donationFee.toNumber()).to.equal(200)
                expect(donationReceiver).to.equal(accounts[10].address)
                expect(artCollection).to.equal(artCollectionAddress)
            })

            it("Should NOT instantiate new ERC721 crowd fund collection for a creator if minSold rate is not between 2500 an 10000", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const [owner, creator] = accounts

                const FundCollection = await ethers.getContractFactory("Crowdfund")

                const allowCreator = await management.setCreator(creator.address, true)
                await allowCreator.wait()
                await expect(management.connect(creator).newCrowdfund(
                    "MyNFT", "MNFT", "https://example.com/my-token/", 200, creator.address,
                    [lowQuotaValues, regQuotaValues, highQuotaValues,
                        100, 100, 100, accounts[10].address, 200, 200]
                ))
                    .to.be.revertedWithCustomError(FundCollection, "CrowdfundInvalidMinSoldRate")
                await expect(management.connect(creator).newCrowdfund(
                    "MyNFT", "MNFT", "https://example.com/my-token/", 200, creator.address,
                    [lowQuotaValues, regQuotaValues, highQuotaValues,
                        100, 100, 100, accounts[10].address, 200, 20000]
                ))
                    .to.be.revertedWithCustomError(FundCollection, "CrowdfundInvalidMinSoldRate")
            })

            it("Should NOT instantiate new ERC721 crowd fund collection for a creator if creator is not allowed", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const [owner, creator] = accounts

                await expect(management.connect(creator).newCrowdfund(
                    "MyNFT", "MNFT", "https://example.com/my-token/", 200, creator.address,
                    [lowQuotaValues, regQuotaValues, highQuotaValues,
                        100, 100, 100, accounts[10].address, 200, 2500]
                )).to.be.revertedWithCustomError(management, "ManagementNotAllowed")

                await expect(management.newCrowdfund(
                    "MyNFT", "MNFT", "https://example.com/my-token/", 200, creator.address,
                    [lowQuotaValues, regQuotaValues, highQuotaValues,
                        100, 100, 100, accounts[10].address, 200, 2500]
                )).to.be.revertedWithCustomError(management, "ManagementNotAllowed")
            })

            it("Should NOT instantiate new ERC721 crowd fund collection for a creator if creator is corrupted", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const [owner, creator] = accounts

                let tx = await management.setCreator(creator.address, true)
                await tx.wait()

                tx = await management.setCorrupted(creator.address, true)
                await tx.wait()

                await expect(management.connect(creator).newCrowdfund(
                    "MyNFT", "MNFT", "https://example.com/my-token/", 200, creator.address,
                    [lowQuotaValues, regQuotaValues, highQuotaValues,
                        100, 100, 100, accounts[10].address, 200, 2500]
                )).to.be.revertedWithCustomError(management, "ManagementCreatorCorrupted")
            })

            it("Should NOT instantiate new ERC721 crowd fund collection for a creator if parameters are invalid", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const [owner, creator] = accounts

                const allowCreator = await management.setCreator(creator.address, true)
                await allowCreator.wait()

                await expect(management.connect(creator).newCrowdfund(
                    "MyNFT", "", "https://example.com/my-token/", 200, creator.address,
                    [lowQuotaValues, regQuotaValues, highQuotaValues,
                        100, 100, 100, accounts[10].address, 200, 2500]
                )).to.be.revertedWithCustomError(management, "ManagementInvalidSymbol")

                await expect(management.connect(creator).newCrowdfund(
                    "", "", "https://example.com/my-token/", 200, creator.address,
                    [lowQuotaValues, regQuotaValues, highQuotaValues,
                        100, 100, 100, accounts[10].address, 200, 2500]
                )).to.be.revertedWithCustomError(management, "ManagementInvalidName")

                await expect(management.connect(creator).newCrowdfund(
                    "", "MNFT", "https://example.com/my-token/", 200, creator.address,
                    [lowQuotaValues, regQuotaValues, highQuotaValues,
                        100, 100, 100, accounts[10].address, 200, 2500]
                )).to.be.revertedWithCustomError(management, "ManagementInvalidName")
            })

            it("Should NOT instantiate new ERC721 crowd fund collection for a creator if fund ERC721 beacon has zero address", async () => {
                const [owner, creator, acc] = await ethers.getSigners()

                const Management = await ethers.getContractFactory("Management")
                const UUPS = await ethers.getContractFactory("ERC1967Proxy")
                const managementImplementation = await Management.deploy()
                await managementImplementation.deployed()

                const abi = ["function initialize(address _beaconAdminArt, address _beaconAdminFund, address _beaconAdminCreators, address _beaconAdminTickets, address _creatorsCoin, address _multiSig, uint256 _fee)"]
                const function_name = "initialize"
                const constructor_args = [
                    ethers.constants.AddressZero,
                    ethers.constants.AddressZero,
                    ethers.constants.AddressZero,
                    ethers.constants.AddressZero,
                    ethers.constants.AddressZero,
                    ethers.constants.AddressZero,
                    creatorsRoyalty
                ]

                const iface = new ethers.utils.Interface(abi)
                const data = iface.encodeFunctionData(function_name, constructor_args)

                const uups = await UUPS.deploy(managementImplementation.address, data)
                await uups.deployed()
                const management = Management.attach(uups.address)

                const allowCreator = await management.setCreator(creator.address, true)
                await allowCreator.wait()

                await expect(management.connect(creator).newCrowdfund(
                    "MyNFT", "MNFT", "https://example.com/my-token/", 200, creator.address,
                    [lowQuotaValues, regQuotaValues, highQuotaValues,
                        100, 100, 100, acc.address, 200, 2500]
                )).to.be.revertedWithCustomError(management, "ManagementInvalidAddress")
            })

            it("Should NOT instantiate new ERC721 crowd fund collection for a creator if max supply is 0", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const [owner, creator] = accounts

                const allowCreator = await management.setCreator(creator.address, true)
                await allowCreator.wait()

                await expect(management.connect(creator).newCrowdfund(
                    "MyNFT", "MNFT", "https://example.com/my-token/", 200, creator.address,
                    [lowQuotaValues, regQuotaValues, highQuotaValues,
                        0, 0, 0, accounts[10].address, 200, 2500]
                )).to.be.revertedWithCustomError(management, "ManagementFundMaxSupplyIs0")
            })

            it("Should NOT instantiate new ERC721 crowd fund collection for a creator if contract paused", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const [owner, creator] = accounts

                const allowCreator = await management.setCreator(creator.address, true)
                await allowCreator.wait()

                const tx = await management.pause()
                await tx.wait()

                await expect(management.connect(creator).newCrowdfund(
                    "MyNFT", "MNFT", "https://example.com/my-token/", 200, creator.address,
                    [lowQuotaValues, regQuotaValues, highQuotaValues,
                        0, 0, 0, accounts[10].address, 200, 2500]
                )).to.be.revertedWith("Pausable: paused")
            })
        })

        describe("newCreatorsCollection", () => {
            it("Should instantiate new ERC721 art collection for CreatorsPRO", async () => {
                const { management } = await loadFixture(deployManagement)

                const newCol = await management.newCreatorsCollection(
                    "MyNFT", "MNFT", 0, ethers.utils.parseEther("1"), ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("1"), "https://example.com/my-token/"
                )
                const receipt = await newCol.wait()
                const event = receipt.events.filter(evt => evt?.event)
                const rightEvent = event.filter(evt => evt.args.collection)
                const collectionAddress = rightEvent[0].args.collection
                const newCollection = await ethers.getContractAt("contracts/ERC721Art.sol:ERC721Art", collectionAddress)

                const name = await newCollection.name()
                const symbol = await newCollection.symbol()
                const maxSupply = await newCollection.maxSupply()
                const priceETH = await newCollection.pricePerCoin(0)
                const priceUSDT = await newCollection.pricePerCoin(1)
                const priceCreatorsCoin = await newCollection.pricePerCoin(2)
                const baseURI = await newCollection.baseURI()

                expect(name).to.equal("MyNFT")
                expect(symbol).to.equal("MNFT")
                expect(maxSupply.toNumber()).to.equal(0)
                expect(priceETH).to.equal(ethers.utils.parseEther("1"))
                expect(priceUSDT).to.equal(ethers.utils.parseEther("1"))
                expect(priceCreatorsCoin).to.equal(ethers.utils.parseEther("1"))
                expect(baseURI).to.equal("https://example.com/my-token/")
            })

            it("Should NOT instantiate new ERC721 art collection for CreatorsPRO if address is not allowed", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const [owner, acc] = accounts

                await expect(management.connect(acc).newCreatorsCollection(
                    "MyNFT", "MNFT", 0, ethers.utils.parseEther("1"), ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("1"), "https://example.com/my-token/"
                )).to.be.revertedWithCustomError(management, "ManagementNotAllowed")
            })

            it("Should NOT instantiate new ERC721 art collection for CreatorsPRO if parameters are invalid", async () => {
                const { management } = await loadFixture(deployManagement)

                await expect(management.newCreatorsCollection(
                    "MyNFT", "", 0, ethers.utils.parseEther("1"), ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("1"), "https://example.com/my-token/"
                )).to.be.revertedWithCustomError(management, "ManagementInvalidSymbol")

                await expect(management.newCreatorsCollection(
                    "", "", 0, ethers.utils.parseEther("1"), ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("1"), "https://example.com/my-token/"
                )).to.be.revertedWithCustomError(management, "ManagementInvalidName")

                await expect(management.newCreatorsCollection(
                    "", "MNFT", 0, ethers.utils.parseEther("1"), ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("1"), "https://example.com/my-token/"
                )).to.be.revertedWithCustomError(management, "ManagementInvalidName")
            })

            it("Should NOT instantiate new ERC721 art collection for CreatorsPRO if art ERC721 beacon has zero address", async () => {
                const Management = await ethers.getContractFactory("Management")
                const UUPS = await ethers.getContractFactory("ERC1967Proxy")
                const managementImplementation = await Management.deploy()
                await managementImplementation.deployed()

                const abi = ["function initialize(address _beaconAdminArt, address _beaconAdminFund, address _beaconAdminCreators, address _beaconAdminTickets, address _creatorsCoin, address _multiSig, uint256 _fee)"]
                const function_name = "initialize"
                const constructor_args = [
                    ethers.constants.AddressZero,
                    ethers.constants.AddressZero,
                    ethers.constants.AddressZero,
                    ethers.constants.AddressZero,
                    ethers.constants.AddressZero,
                    ethers.constants.AddressZero,
                    creatorsRoyalty
                ]

                const iface = new ethers.utils.Interface(abi)
                const data = iface.encodeFunctionData(function_name, constructor_args)

                const uups = await UUPS.deploy(managementImplementation.address, data)
                await uups.deployed()
                const management = Management.attach(uups.address)

                await expect(management.newCreatorsCollection(
                    "MyNFT", "MNFT", 0, ethers.utils.parseEther("1"), ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("1"), "https://example.com/my-token/"
                )).to.be.revertedWithCustomError(management, "ManagementInvalidAddress")
            })

            it("Should NOT instantiate new ERC721 art collection for CreatorsPRO if contract paused", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const [owner, creator] = accounts

                const allowCreator = await management.setCreator(creator.address, true)
                await allowCreator.wait()

                const tx = await management.pause()
                await tx.wait()

                await expect(management.newCreatorsCollection(
                    "", "MNFT", 0, ethers.utils.parseEther("1"), ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("1"), "https://example.com/my-token/"
                )).to.be.revertedWith("Pausable: paused")
            })
        })
    })

    describe("newCRPStaking", () => {
        const lowQuotaValues = [ethers.utils.parseEther("0.1"), ethers.utils.parseEther("0.11"), ethers.utils.parseEther("0.12")]
        const regQuotaValues = [ethers.utils.parseEther("1"), ethers.utils.parseEther("1.1"), ethers.utils.parseEther("1.2")]
        const highQuotaValues = [ethers.utils.parseEther("3"), ethers.utils.parseEther("3.1"), ethers.utils.parseEther("3.2")]
        it("Should create new staking contract", async () => {
            const { management, accounts } = await loadFixture(deployManagement)
            const [owner, creator] = accounts

            const timeUnit = 18 * 24 * 60 * 60

            let tx = await management.setCreator(creator.address, true)
            await tx.wait()

            let allowCreator = await management.setCreator(creator.address, true)
            await allowCreator.wait()
            let newCol = await management.connect(creator).newCrowdfund(
                "MyNFT", "MNFT", "https://example.com/my-token/", 200, creator.address,
                [lowQuotaValues, regQuotaValues, highQuotaValues,
                    100, 100, 100, accounts[10].address, 200, 3000]
            )
            let receipt = await newCol.wait()
            let event = receipt.events.filter(evt => evt?.event)
            let rightEvent = event.filter(evt => evt.args.fundCollection || evt.args.artCollection)
            let artCollectionAddress = rightEvent[0].args.artCollection
            let newArtCollection = await ethers.getContractAt("contracts/ERC721Art.sol:ERC721Art", artCollectionAddress)

            newCol = await management.connect(creator).newCRPStaking(newArtCollection.address, timeUnit,
                [ethers.utils.parseEther("0.1"), ethers.utils.parseEther("0.2"), ethers.utils.parseEther("0.5")], creator.address
            )

            receipt = await newCol.wait()
            event = receipt.events.filter(evt => evt?.event)
            rightEvent = event.filter(evt => evt.args.staking)
            let collectionAddress = rightEvent[0].args.staking
            let newCollection = await ethers.getContractAt("contracts/CRPStaking.sol:CRPStaking", collectionAddress)

            const stakingToken = await newCollection.stakingToken()
            const stakingManagement = await newCollection.management()
            const stakingCondition = await newCollection.getStakingCondition(0)

            expect(stakingToken).to.equal(newArtCollection.address)
            expect(stakingManagement).to.equal(management.address)
            expect(stakingCondition.timeUnit.toNumber()).to.equal(timeUnit)
            expect(stakingCondition.rewardsPerUnitTime[0]).to.equal(ethers.utils.parseEther("0.1"))
            expect(stakingCondition.rewardsPerUnitTime[1]).to.equal(ethers.utils.parseEther("0.2"))
            expect(stakingCondition.rewardsPerUnitTime[2]).to.equal(ethers.utils.parseEther("0.5"))
        })

        it("Should NOT create new staking contract if caller is not ERC721Art owner", async () => {
            const { management, accounts } = await loadFixture(deployManagement)
            const [owner, creator, acc1] = accounts

            let tx = await management.setCreator(creator.address, true)
            await tx.wait()

            tx = await management.connect(creator).newArtCollection(
                "MyNFT", "MNFT", 0, ethers.utils.parseEther("1"), ethers.utils.parseEther("1"),
                ethers.utils.parseEther("1"), "https://example.com/my-token/", 10, creator.address
            )

            let receipt = await tx.wait()
            let event = receipt.events.filter(evt => evt?.event)
            let rightEvent = event.filter(evt => evt.args.collection)
            let collectionAddress = rightEvent[0].args.collection
            let newCollection = await ethers.getContractAt("contracts/ERC721Art.sol:ERC721Art", collectionAddress)

            tx = await management.setCreator(acc1.address, true)
            await tx.wait()

            await expect(management.connect(acc1).newCRPStaking(newCollection.address, 24 * 60 * 60,
                [ethers.utils.parseEther("0.1"), ethers.utils.parseEther("0.2"), ethers.utils.parseEther("0.5")], acc1.address
            )).to.be.revertedWithCustomError(management, "ManagementNotCollectionCreator")
        })

        it("Should NOT create new staking contract if collection is not from CreatorsPRO", async () => {
            const { management, accounts } = await loadFixture(deployManagement)
            const [owner, creator] = accounts

            const ArtCollection = await ethers.getContractFactory("ERC721Art")
            const artCollection = await ArtCollection.deploy()
            await artCollection.deployed()

            let tx = await management.setCreator(creator.address, true)
            await tx.wait()

            await expect(management.connect(creator).newCRPStaking(artCollection.address, 24 * 60 * 60,
                [ethers.utils.parseEther("0.1"), ethers.utils.parseEther("0.2"), ethers.utils.parseEther("0.5")], creator.address
            )).to.be.revertedWithCustomError(management, "ManagementInvalidCollection")
        })

        it("Should NOT create new staking contract if creator is corrupted", async () => {
            const { management, accounts } = await loadFixture(deployManagement)
            const [owner, creator] = accounts

            let tx = await management.setCreator(creator.address, true)
            await tx.wait()

            tx = await management.connect(creator).newArtCollection(
                "MyNFT", "MNFT", 0, ethers.utils.parseEther("1"), ethers.utils.parseEther("1"),
                ethers.utils.parseEther("1"), "https://example.com/my-token/", 10, creator.address
            )

            let receipt = await tx.wait()
            let event = receipt.events.filter(evt => evt?.event)
            let rightEvent = event.filter(evt => evt.args.collection)
            let collectionAddress = rightEvent[0].args.collection
            let newCollection = await ethers.getContractAt("contracts/ERC721Art.sol:ERC721Art", collectionAddress)

            tx = await management.setCorrupted(creator.address, true)
            await tx.wait()

            await expect(management.connect(creator).newCRPStaking(newCollection.address, 24 * 60 * 60,
                [ethers.utils.parseEther("0.1"), ethers.utils.parseEther("0.2"), ethers.utils.parseEther("0.5")], creator.address
            )).to.be.revertedWithCustomError(management, "ManagementCreatorCorrupted")
        })

        it("Should NOT create new staking contract if not staking beacon is set", async () => {
            const { management, accounts, artCollection } = await loadFixture(deployManagement)
            const [owner, creator] = accounts

            const UUPS = await ethers.getContractFactory("ERC1967Proxy")
            const Management = await ethers.getContractFactory("Management")
            const managementImplementation = await Management.deploy()
            await managementImplementation.deployed()

            let abi = ["function initialize(address _beaconAdminArt, address _beaconAdminFund, address _beaconAdminCreators, address _creatorsCoin, address _erc20USD, address _multiSig, uint256 _fee)"]
            let function_name = "initialize"
            let constructor_args = [
                artCollection.address,
                ethers.constants.AddressZero,
                ethers.constants.AddressZero,
                ethers.constants.AddressZero,
                ethers.constants.AddressZero,
                ethers.constants.AddressZero,
                creatorsRoyalty
            ]

            let iface = new ethers.utils.Interface(abi)
            let data = iface.encodeFunctionData(function_name, constructor_args)

            let uups = await UUPS.deploy(managementImplementation.address, data)
            await uups.deployed()
            const managementProxy = Management.attach(uups.address)

            let tx = await managementProxy.setCreator(creator.address, true)
            await tx.wait()

            tx = await managementProxy.connect(creator).newArtCollection(
                "MyNFT", "MNFT", 0, ethers.utils.parseEther("1"), ethers.utils.parseEther("1"),
                ethers.utils.parseEther("1"), "https://example.com/my-token/", 10, creator.address
            )

            let receipt = await tx.wait()
            let event = receipt.events.filter(evt => evt?.event)
            let rightEvent = event.filter(evt => evt.args.collection)
            let collectionAddress = rightEvent[0].args.collection
            let newCollection = await ethers.getContractAt("contracts/ERC721Art.sol:ERC721Art", collectionAddress)

            await expect(managementProxy.connect(creator).newCRPStaking(newCollection.address, 24 * 60 * 60,
                [ethers.utils.parseEther("0.1"), ethers.utils.parseEther("0.2"), ethers.utils.parseEther("0.5")], creator.address
            )).to.be.revertedWithCustomError(management, "ManagementInvalidAddress")
        })

        it("Should NOT create new staking contract if caller is not allowed creator", async () => {
            const { management, accounts } = await loadFixture(deployManagement)
            const [owner, creator] = accounts

            let tx = await management.setCreator(creator.address, true)
            await tx.wait()

            tx = await management.connect(creator).newArtCollection(
                "MyNFT", "MNFT", 0, ethers.utils.parseEther("1"), ethers.utils.parseEther("1"),
                ethers.utils.parseEther("1"), "https://example.com/my-token/", 10, creator.address
            )

            let receipt = await tx.wait()
            let event = receipt.events.filter(evt => evt?.event)
            let rightEvent = event.filter(evt => evt.args.collection)
            let collectionAddress = rightEvent[0].args.collection
            let newCollection = await ethers.getContractAt("contracts/ERC721Art.sol:ERC721Art", collectionAddress)

            tx = await management.setCreator(creator.address, false)
            await tx.wait()

            await expect(management.connect(creator).newCRPStaking(newCollection.address, 24 * 60 * 60,
                [ethers.utils.parseEther("0.1"), ethers.utils.parseEther("0.2"), ethers.utils.parseEther("0.5")], creator.address
            )).to.be.revertedWithCustomError(management, "ManagementNotAllowed")

            await expect(management.newCRPStaking(newCollection.address, 24 * 60 * 60,
                [ethers.utils.parseEther("0.1"), ethers.utils.parseEther("0.2"), ethers.utils.parseEther("0.5")], creator.address
            )).to.be.revertedWithCustomError(management, "ManagementNotAllowed")
        })

        it("Should NOT create new staking contract if contract paused", async () => {
            const { management, accounts } = await loadFixture(deployManagement)
            const [owner, creator] = accounts

            let tx = await management.setCreator(creator.address, true)
            await tx.wait()

            tx = await management.connect(creator).newArtCollection(
                "MyNFT", "MNFT", 0, ethers.utils.parseEther("1"), ethers.utils.parseEther("1"),
                ethers.utils.parseEther("1"), "https://example.com/my-token/", 10, creator.address
            )

            let receipt = await tx.wait()
            let event = receipt.events.filter(evt => evt?.event)
            let rightEvent = event.filter(evt => evt.args.collection)
            let collectionAddress = rightEvent[0].args.collection
            let newCollection = await ethers.getContractAt("contracts/ERC721Art.sol:ERC721Art", collectionAddress)

            tx = await management.pause()
            await tx.wait()

            await expect(management.connect(creator).newCRPStaking(newCollection.address, 24 * 60 * 60,
                [ethers.utils.parseEther("0.1"), ethers.utils.parseEther("0.2"), ethers.utils.parseEther("0.5")], creator.address
            )).to.be.revertedWith("Pausable: paused")
        })
    })

    describe("Setter functions", () => {
        describe("setCreator", () => {
            it("Should set creator permission", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const [manager, creator] = accounts

                const creatorAllowedBefore = await management.creators(creator.address)
                const tx = await management.setCreator(creator.address, true)
                await tx.wait()
                const creatorAllowedAfter = await management.creators(creator.address)

                expect(creatorAllowedBefore.isAllowed).to.equal(false)
                expect(creatorAllowedAfter.isAllowed).to.equal(true)
            })

            it("Should NOT set creator permission if caller is not manager", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const [manager, acc] = accounts

                expect(management.connect(acc).setCreator(acc.address, true))
                    .to.revertedWithCustomError(management, "ManagementNotAllowed")
            })

            it("Should NOT set creator permission if given address is invalid", async () => {
                const { management } = await loadFixture(deployManagement)

                expect(management.setCreator(ethers.constants.AddressZero, true))
                    .to.revertedWithCustomError(management, "ManagementInvalidAddress")
            })

            it("Should NOT set creator permission if contract paused", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const [owner, creator] = accounts

                const tx = await management.pause()
                await tx.wait()

                await expect(management.setCreator(creator.address, true))
                    .to.be.revertedWith("Pausable: paused")
            })
        })

        describe("setManager", () => {
            it("Should set manager permission", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const [manager, newManager] = accounts

                const managerBefore = await management.managers(newManager.address)
                const tx = await management.setManager(newManager.address, true)
                await tx.wait()
                const managerAfter = await management.managers(newManager.address)

                expect(managerBefore).to.equal(false)
                expect(managerAfter).to.equal(true)
            })

            it("Should NOT set manager permission if caller is not manager", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const [manager, acc] = accounts

                expect(management.connect(acc).setManager(acc.address, true))
                    .to.revertedWithCustomError(management, "ManagementNotAllowed")
            })

            it("Should NOT set manager permission if given address is invalid", async () => {
                const { management } = await loadFixture(deployManagement)

                expect(management.setManager(ethers.constants.AddressZero, true))
                    .to.revertedWithCustomError(management, "ManagementInvalidAddress")
            })

            it("Should NOT set manager permission if contract paused", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const [owner, manager] = accounts

                const tx = await management.pause()
                await tx.wait()

                await expect(management.setManager(manager.address, true))
                    .to.be.revertedWith("Pausable: paused")
            })
        })

        describe("setBeaconAdminArt", () => {
            it("Should set new art beacon address", async () => {
                const { management, artCollection } = await loadFixture(deployManagement)

                const ArtCollection = await ethers.getContractFactory("ERC721Art")
                const newArtBeacon = await upgrades.deployBeacon(ArtCollection);
                await newArtBeacon.deployed()

                const artBeaconBefore = await management.beaconAdminArt()
                const tx = await management.setBeaconAdminArt(newArtBeacon.address)
                await tx.wait()
                const artBeaconAfter = await management.beaconAdminArt()

                expect(artBeaconBefore).to.equal(artCollection.address)
                expect(artBeaconAfter).to.equal(newArtBeacon.address)
            })

            it("Should NOT set new art beacon address if caller is not manager", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const [manager, acc] = accounts

                const ArtCollection = await ethers.getContractFactory("ERC721Art")
                const newArtBeacon = await upgrades.deployBeacon(ArtCollection);
                await newArtBeacon.deployed()

                expect(management.connect(acc).setBeaconAdminArt(newArtBeacon.address))
                    .to.revertedWithCustomError(management, "ManagementNotAllowed")
            })

            it("Should NOT set new art beacon address if given address is invalid", async () => {
                const { management } = await loadFixture(deployManagement)

                expect(management.setBeaconAdminArt(ethers.constants.AddressZero))
                    .to.revertedWithCustomError(management, "ManagementInvalidAddress")
            })

            it("Should NOT set new art beacon address if contract paused", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const beacon = accounts[10]

                const tx = await management.pause()
                await tx.wait()

                await expect(management.setBeaconAdminArt(beacon.address))
                    .to.be.revertedWith("Pausable: paused")
            })
        })

        describe("setBeaconAdminFund", () => {
            it("Should set new crowd fund beacon address", async () => {
                const { management, fundCollection } = await loadFixture(deployManagement)

                const FundCollection = await ethers.getContractFactory("Crowdfund")
                const newFundBeacon = await upgrades.deployBeacon(FundCollection);
                await newFundBeacon.deployed()

                const fundBeaconBefore = await management.beaconAdminFund()
                const tx = await management.setBeaconAdminFund(newFundBeacon.address)
                await tx.wait()
                const fundBeaconAfter = await management.beaconAdminFund()

                expect(fundBeaconBefore).to.equal(fundCollection.address)
                expect(fundBeaconAfter).to.equal(newFundBeacon.address)
            })

            it("Should NOT set new crowd fund beacon address if caller is not manager", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const [manager, acc] = accounts

                const FundCollection = await ethers.getContractFactory("Crowdfund")
                const newFundBeacon = await upgrades.deployBeacon(FundCollection);
                await newFundBeacon.deployed()

                expect(management.connect(acc).setBeaconAdminFund(newFundBeacon.address))
                    .to.revertedWithCustomError(management, "ManagementNotAllowed")
            })

            it("Should NOT set new crowd fund beacon address if given address is invalid", async () => {
                const { management } = await loadFixture(deployManagement)

                expect(management.setBeaconAdminFund(ethers.constants.AddressZero))
                    .to.revertedWithCustomError(management, "ManagementInvalidAddress")
            })

            it("Should NOT set new crowd fund beacon address if contract paused", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const beacon = accounts[10]

                const tx = await management.pause()
                await tx.wait()

                await expect(management.setBeaconAdminFund(beacon.address))
                    .to.be.revertedWith("Pausable: paused")
            })
        })

        describe("setBeaconAdminCreators", () => {
            it("Should set new CreatorsPRO art beacon address", async () => {
                const { management, creatorsCollection } = await loadFixture(deployManagement)

                const CreatorsCollection = await ethers.getContractFactory("ERC721Art")
                const newCreatorsBeacon = await upgrades.deployBeacon(CreatorsCollection);
                await newCreatorsBeacon.deployed()

                const creatorsBeaconBefore = await management.beaconAdminCreators()
                const tx = await management.setBeaconAdminCreators(newCreatorsBeacon.address)
                await tx.wait()
                const creatorsBeaconAfter = await management.beaconAdminCreators()

                expect(creatorsBeaconBefore).to.equal(creatorsCollection.address)
                expect(creatorsBeaconAfter).to.equal(newCreatorsBeacon.address)
            })

            it("Should NOT set new CreatorsPRO art beacon address if caller is not manager", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const [manager, acc] = accounts

                const CreatorsCollection = await ethers.getContractFactory("ERC721Art")
                const newCreatorsBeacon = await upgrades.deployBeacon(CreatorsCollection);
                await newCreatorsBeacon.deployed()

                expect(management.connect(acc).setBeaconAdminCreators(newCreatorsBeacon.address))
                    .to.revertedWithCustomError(management, "ManagementNotAllowed")
            })

            it("Should NOT set new CreatorsPRO art beacon address if given address is invalid", async () => {
                const { management } = await loadFixture(deployManagement)

                expect(management.setBeaconAdminCreators(ethers.constants.AddressZero))
                    .to.revertedWithCustomError(management, "ManagementInvalidAddress")
            })

            it("Should NOT set new CreatorsPRO art beacon address if contract paused", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const beacon = accounts[10]

                const tx = await management.pause()
                await tx.wait()

                await expect(management.setBeaconAdminCreators(beacon.address))
                    .to.be.revertedWith("Pausable: paused")
            })
        })

        describe("setMultiSig", () => {
            it("Should set new multisig wallet address", async () => {
                const { management, multiSig } = await loadFixture(deployManagement)

                const MultiSig = await ethers.getContractFactory("MockMultiSig")
                const newMultiSig = await MultiSig.deploy()
                await newMultiSig.deployed()

                const reserveBefore = await management.multiSig()
                const tx = await management.setMultiSig(newMultiSig.address)
                await tx.wait()
                const reserveAfter = await management.multiSig()

                expect(reserveBefore).to.equal(multiSig.address)
                expect(reserveAfter).to.equal(newMultiSig.address)
            })

            it("Should NOT set new reserve address if caller is not manager", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const [manager, acc] = accounts

                const MultiSig = await ethers.getContractFactory("MockMultiSig")
                const newMultiSig = await MultiSig.deploy()
                await newMultiSig.deployed()

                expect(management.connect(acc).setMultiSig(newMultiSig.address))
                    .to.revertedWithCustomError(management, "ManagementNotAllowed")
            })

            it("Should NOT set new reserve address if given address is invalid", async () => {
                const { management } = await loadFixture(deployManagement)

                expect(management.setMultiSig(ethers.constants.AddressZero))
                    .to.revertedWithCustomError(management, "ManagementInvalidAddress")
            })

            it("Should NOT set new reserve address if contract paused", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const multisg = accounts[10]

                const tx = await management.pause()
                await tx.wait()

                await expect(management.setMultiSig(multisg.address))
                    .to.be.revertedWith("Pausable: paused")
            })
        })

        describe("setFee", () => {
            it("Should set new fee value", async () => {
                const { management } = await loadFixture(deployManagement)

                const feeBefore = await management.fee()
                const tx = await management.setFee(50)
                await tx.wait()
                const feeAfter = await management.fee()

                expect(feeBefore.toNumber()).to.equal(200)
                expect(feeAfter.toNumber()).to.equal(50)
            })

            it("Should NOT set new fee value if caller is not manager", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const [manager, acc] = accounts

                expect(management.connect(acc).setFee(50))
                    .to.revertedWithCustomError(management, "ManagementNotAllowed")
            })

            it("Should NOT set new fee value if contract paused", async () => {
                const { management } = await loadFixture(deployManagement)

                const tx = await management.pause()
                await tx.wait()

                await expect(management.setFee(50))
                    .to.be.revertedWith("Pausable: paused")
            })
        })

        describe("setCreatorsCoinContract", () => {
            it("Should set new CreatorsCoin address", async () => {
                const { management, creatorsCoin } = await loadFixture(deployManagement)

                const CreatorsCoin = await ethers.getContractFactory("CreatorsCoin")
                const newCreatorsCoin = await CreatorsCoin.deploy("CreatorsCoin", "CC", ethers.utils.parseEther("1"))
                await newCreatorsCoin.deployed()

                const creatorsCoinBefore = await management.tokenContract(2)
                const tx = await management.setTokenContract(2, newCreatorsCoin.address)
                await tx.wait()
                const creatorsCoinAfter = await management.tokenContract(2)

                expect(creatorsCoinBefore).to.equal(creatorsCoin.address)
                expect(creatorsCoinAfter).to.equal(newCreatorsCoin.address)
            })

            it("Should NOT set new CreatorsCoin address if caller is not manager", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const [manager, acc] = accounts

                const CreatorsCoin = await ethers.getContractFactory("CreatorsCoin")
                const newCreatorsCoin = await CreatorsCoin.deploy("CreatorsCoin", "CC", ethers.utils.parseEther("1"))
                await newCreatorsCoin.deployed()

                expect(management.connect(acc).setTokenContract(2, newCreatorsCoin.address))
                    .to.revertedWithCustomError(management, "ManagementNotAllowed")
            })

            it("Should NOT set new CreatorsCoin address if given address is invalid", async () => {
                const { management } = await loadFixture(deployManagement)

                expect(management.setTokenContract(2, ethers.constants.AddressZero))
                    .to.revertedWithCustomError(management, "ManagementInvalidAddress")
            })

            it("Should NOT set new CreatorsCoin address if contract paused", async () => {
                const { management, accounts } = await loadFixture(deployManagement)
                const coin = accounts[10]

                const tx = await management.pause()
                await tx.wait()

                await expect(management.setTokenContract(2, coin.address))
                    .to.be.revertedWith("Pausable: paused")
            })
        })
    })

    describe("upgradeTo", () => {
        it("Should upgrade contract", async () => {
            const { management } = await loadFixture(deployManagement)

            const Management = await ethers.getContractFactory("Management")
            const managementImplementation = await Management.deploy()
            await managementImplementation.deployed()

            const tx = await management.upgradeTo(managementImplementation.address)
            await tx.wait()

            const newAddress = await management.getImplementation()

            expect(newAddress).to.equal(managementImplementation.address)
        })

        it("Should NOT upgrade contrat if caller is not manager", async () => {
            const { management, accounts } = await loadFixture(deployManagement)
            const [manager, acc] = accounts
            const Management = await ethers.getContractFactory("Management")
            const managementImplementation = await Management.deploy()
            await managementImplementation.deployed()

            await expect(management.connect(acc).upgradeTo(managementImplementation.address))
                .to.be.revertedWithCustomError(management, "ManagementNotAllowed")
        })
    })

    describe("setTokenContract", () => {
        it("Should set new token contract", async () => {
            const { management } = await loadFixture(deployManagement)

            const ERC20 = await ethers.getContractFactory("MockUSDToken")
            const erc20 = await ERC20.deploy("USDT", "USDT", 18)
            await erc20.deployed()

            const addressBefore = await management.tokenContract(1)

            let tx = await management.setTokenContract(1, erc20.address)
            await tx.wait()

            const addressAfter = await management.tokenContract(1)

            expect(addressBefore).to.equal(ethers.constants.AddressZero)
            expect(addressAfter).to.equal(erc20.address)
        })

        it("Should NOT set new token contract if caller is not manager", async () => {
            const { management, accounts } = await loadFixture(deployManagement)
            const acc1 = accounts[2]

            const ERC20 = await ethers.getContractFactory("MockUSDToken")
            const erc20 = await ERC20.deploy("USDT", "USDT", 18)
            await erc20.deployed()

            const addressBefore = await management.tokenContract(1)

            expect(addressBefore).to.equal(ethers.constants.AddressZero)
            await expect(management.connect(acc1).setTokenContract(1, erc20.address))
                .to.be.revertedWithCustomError(management, "ManagementNotAllowed")
        })

        it("Should NOT set new token contract if given address is invalid", async () => {
            const { management } = await loadFixture(deployManagement)

            const addressBefore = await management.tokenContract(1)

            expect(addressBefore).to.equal(ethers.constants.AddressZero)
            await expect(management.setTokenContract(1, ethers.constants.AddressZero))
                .to.be.revertedWithCustomError(management, "ManagementInvalidAddress")
        })

        it("Should NOT set new token contract for ETH/MATIC", async () => {
            const { management, accounts } = await loadFixture(deployManagement)

            const addressBefore = await management.tokenContract(1)

            expect(addressBefore).to.equal(ethers.constants.AddressZero)
            await expect(management.setTokenContract(0, accounts[10].address))
                .to.be.revertedWithCustomError(management, "ManagementCannotSetAddressForETH")
        })

        it("Should NOT set new token contract if contract paused", async () => {
            const { management } = await loadFixture(deployManagement)

            const ERC20 = await ethers.getContractFactory("MockUSDToken")
            const erc20 = await ERC20.deploy("USDT", "USDT", 18)
            await erc20.deployed()

            let tx = await management.pause()
            await tx.wait()

            const addressBefore = await management.tokenContract(1)

            expect(addressBefore).to.equal(ethers.constants.AddressZero)
            await expect(management.setTokenContract(1, erc20.address))
                .to.be.revertedWith("Pausable: paused")
        })
    })

    describe("setCorrupted", () => {
        it("Should set creator as corrupted", async () => {
            const { management, accounts } = await loadFixture(deployManagement)

            let tx = await management.setCreator(accounts[10].address, true)
            await tx.wait()

            const isCorruptedBefore = await management.isCorrupted(accounts[10].address)

            tx = await management.setCorrupted(accounts[10].address, true)
            await tx.wait()

            const isCorruptedAfter = await management.isCorrupted(accounts[10].address)

            expect(isCorruptedBefore).to.equal(false)
            expect(isCorruptedAfter).to.equal(true)
        })

        it("Should NOT set creator as corrupted if not a creator", async () => {
            const { management, accounts } = await loadFixture(deployManagement)

            const isCorruptedBefore = await management.isCorrupted(accounts[10].address)

            expect(isCorruptedBefore).to.equal(false)
            await expect(management.setCorrupted(accounts[10].address, true))
                .to.be.revertedWithCustomError(management, "ManagementAddressNotCreator")
        })

        it("Should NOT set creator as corrupted if address is invalid", async () => {
            const { management, accounts } = await loadFixture(deployManagement)

            const isCorruptedBefore = await management.isCorrupted(accounts[10].address)

            expect(isCorruptedBefore).to.equal(false)
            await expect(management.setCorrupted(ethers.constants.AddressZero, true))
                .to.be.revertedWithCustomError(management, "ManagementInvalidAddress")
        })

        it("Should NOT set creator as corrupted if caller not manager", async () => {
            const { management, accounts } = await loadFixture(deployManagement)

            let tx = await management.setCreator(accounts[10].address, true)
            await tx.wait()

            const isCorruptedBefore = await management.isCorrupted(accounts[10].address)

            expect(isCorruptedBefore).to.equal(false)
            await expect(management.connect(accounts[5]).setCorrupted(accounts[10].address, true))
                .to.be.revertedWithCustomError(management, "ManagementNotAllowed")
        })

        it("Should NOT set creator as corrupted if contract paused", async () => {
            const { management, accounts } = await loadFixture(deployManagement)

            let tx = await management.setCreator(accounts[10].address, true)
            await tx.wait()

            const isCorruptedBefore = await management.isCorrupted(accounts[10].address)

            tx = await management.pause()
            await tx.wait()

            expect(isCorruptedBefore).to.equal(false)
            await expect(management.setCorrupted(accounts[10].address, true))
                .to.be.revertedWith("Pausable: paused")
        })


    })

    describe("setBeaconAdminStaking", () => {
        it("Should set new staking beacon address", async () => {
            const { management, staking } = await loadFixture(deployManagement)

            const Beacon = await ethers.getContractFactory("UpgradeableBeacon")
            const Staking = await ethers.getContractFactory("CRPStaking")
            const stakingImplementation = await Staking.deploy()
            await stakingImplementation.deployed()
            const beaconAdminStak = await Beacon.deploy(stakingImplementation.address)
            await beaconAdminStak.deployed()

            const stakingBeaconBefore = await management.beaconAdminStaking()
            const tx = await management.setBeaconAdminStaking(beaconAdminStak.address)
            await tx.wait()
            const stakingBeaconAfter = await management.beaconAdminStaking()

            expect(stakingBeaconBefore).to.equal(staking.address)
            expect(stakingBeaconAfter).to.equal(beaconAdminStak.address)
        })

        it("Should NOT set new staking beacon address if caller is not manager", async () => {
            const { management, accounts } = await loadFixture(deployManagement)
            const [manager, acc] = accounts

            const Beacon = await ethers.getContractFactory("UpgradeableBeacon")
            const Staking = await ethers.getContractFactory("CRPStaking")
            const stakingImplementation = await Staking.deploy()
            await stakingImplementation.deployed()
            const beaconAdminStak = await Beacon.deploy(stakingImplementation.address)
            await beaconAdminStak.deployed()

            expect(management.connect(acc).setBeaconAdminStaking(beaconAdminStak.address))
                .to.revertedWithCustomError(management, "ManagementNotAllowed")
        })

        it("Should NOT set new staking beacon address if given address is invalid", async () => {
            const { management } = await loadFixture(deployManagement)

            expect(management.setBeaconAdminStaking(ethers.constants.AddressZero))
                .to.revertedWithCustomError(management, "ManagementInvalidAddress")
        })

        it("Should NOT set new staking beacon address if contract paused", async () => {
            const { management, accounts } = await loadFixture(deployManagement)
            const beacon = accounts[10]

            const tx = await management.pause()
            await tx.wait()

            await expect(management.setBeaconAdminStaking(beacon.address))
                .to.be.revertedWith("Pausable: paused")
        })
    })

    describe("setProxyReward", () => {
        it("Should set new reward proxy address", async () => {
            const { management, reward } = await loadFixture(deployManagement)

            const rewardProxyBefore = await management.proxyReward()
            const tx = await management.setProxyReward(reward.address)
            await tx.wait()
            const rewardProxyAfter = await management.proxyReward()

            expect(rewardProxyBefore).to.equal(ethers.constants.AddressZero)
            expect(rewardProxyAfter).to.equal(reward.address)
        })

        it("Should NOT set new reward proxy address if caller is not manager", async () => {
            const { management, accounts, reward } = await loadFixture(deployManagement)
            const [manager, acc] = accounts

            expect(management.connect(acc).setProxyReward(reward.address))
                .to.revertedWithCustomError(management, "ManagementNotAllowed")
        })

        it("Should NOT set new reward proxy address if given address is invalid", async () => {
            const { management } = await loadFixture(deployManagement)

            expect(management.setProxyReward(ethers.constants.AddressZero))
                .to.revertedWithCustomError(management, "ManagementInvalidAddress")
        })

        it("Should NOT set new reward proxy address if contract paused", async () => {
            const { management, reward } = await loadFixture(deployManagement)

            const tx = await management.pause()
            await tx.wait()

            await expect(management.setProxyReward(reward.address))
                .to.be.revertedWith("Pausable: paused")
        })
    })

    describe("setCollections", () => {
        it("Should set CreatorsPRO collection", async () => {
            const { management, artCollection } = await loadFixture(deployManagement)

            const colOwner = await artCollection.owner()
            let tx = await management.setCreator(colOwner, true)
            await tx.wait()

            const colBefore = await management.collections(artCollection.address)
            tx = await management.setCollections(artCollection.address, true)
            await tx.wait()
            const colAfter = await management.collections(artCollection.address)

            expect(colBefore).to.equal(false)
            expect(colAfter).to.equal(true)
        })

        it("Should NOT set CreatorsPRO collection if caller is not manager", async () => {
            const { management, accounts, artCollection } = await loadFixture(deployManagement)
            const [manager, acc] = accounts

            expect(management.connect(acc).setCollections(artCollection.address, false))
                .to.revertedWithCustomError(management, "ManagementNotAllowed")
        })

        it("Should NOT set CreatorsPRO collection if contract paused", async () => {
            const { management, artCollection } = await loadFixture(deployManagement)

            const tx = await management.pause()
            await tx.wait()

            await expect(management.setCollections(artCollection.address, false))
                .to.be.revertedWith("Pausable: paused")
        })

        it("Should NOT set CreatorsPRO collection if address is not contract", async () => {
            const { management, accounts } = await loadFixture(deployManagement)

            await expect(management.setCollections(accounts[10].address, false))
                .to.revertedWithCustomError(management, "ManagementInvalidAddress")
        })

        it("Should NOT set CreatorsPRO collection if owner is not allowed", async () => {
            const { management, artCollection } = await loadFixture(deployManagement)

            await expect(management.setCollections(artCollection.address, true))
                .to.revertedWithCustomError(management, "ManagementInvalidAddress")
        })
    })

    describe("pause", () => {
        it("Should pause contract", async () => {
            const { management } = await loadFixture(deployManagement)

            const pausedBefore = await management.paused()

            const tx = await management.pause()
            await tx.wait()

            const pausedAfter = await management.paused()

            expect(pausedBefore).to.equal(false)
            expect(pausedAfter).to.equal(true)
        })

        it("Should NOT pause contract if caller is not manager", async () => {
            const { management, accounts } = await loadFixture(deployManagement)
            const acc = accounts[2]

            const pausedBefore = await management.paused()

            expect(pausedBefore).to.equal(false)
            await expect(management.connect(acc).pause())
                .to.be.revertedWithCustomError(management, "ManagementNotAllowed")
        })
    })

    describe("unpause", () => {
        it("Should unpause contract", async () => {
            const { management } = await loadFixture(deployManagement)

            tx = await management.pause()
            await tx.wait()

            const pausedBefore = await management.paused()

            tx = await management.unpause()
            await tx.wait()

            const pausedAfter = await management.paused()

            expect(pausedBefore).to.equal(true)
            expect(pausedAfter).to.equal(false)
        })

        it("Should NOT unpause contract if caller is not manager", async () => {
            const { management, accounts } = await loadFixture(deployManagement)
            const acc = accounts[2]

            const tx = await management.pause()
            await tx.wait()

            const pausedBefore = await management.paused()

            expect(pausedBefore).to.equal(true)
            await expect(management.connect(acc).unpause())
                .to.be.revertedWithCustomError(management, "ManagementNotAllowed")
        })
    })

    describe("getImplementation", () => {
        it("Should get the implementation contract address", async () => {
            const { management, implementations } = await loadFixture(deployManagement)

            const newAddress = await management.getImplementation()

            expect(newAddress).to.equal(implementations.management.address)
        })
    })
})