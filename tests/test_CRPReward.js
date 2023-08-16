const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("CRPReward", () => {
    const creatorsRoyalty = 200
    const erc20Name = "USDT"
    const erc20Symbol = "USDT"
    const erc20Decimals = 6

    const CreatorsCoinName = "USDT"
    const CreatorsCoinSymbol = "USDT"
    const CreatorsCoinDecimals = 18

    const timeUnit = 60 * 60 * 24
    const rewardsPerUnitTime = ethers.utils.parseEther("0.05")

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
            reward: rewardImplementation
        }

        const accounts = await ethers.getSigners()

        const management = managementProxy
        const artCollection = beaconAdminArt
        const fundCollection = beaconAdminFund
        const creatorsCollection = beaconAdminCreators
        const reward = rewardProxy
        const staking = beaconAdminStak

        const [owner, creator] = accounts

        const allowCreator = await managementProxy.setCreator(creator.address, true)
        await allowCreator.wait()

        const newCol = await managementProxy.connect(creator).newArtCollection(
            "Bla",
            "BLA",
            100,
            ethers.utils.parseEther("0.5"),
            ethers.utils.parseEther("0.5"),
            ethers.utils.parseEther("0.5"),
            "bla.com",
            200,
            creator.address
        )

        const receipt = await newCol.wait()
        const event = receipt.events.filter(evt => evt?.event)
        const rightEvent = event.filter(evt => evt.args.collection)
        const collectionAddress = rightEvent[0].args.collection

        const collection = await ethers.getContractAt("contracts/ERC721Art.sol:ERC721Art", collectionAddress)

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
            collection
        }
    }

    describe("initialize", () => {
        it("Should initialize contract successfully", async () => {
            const { management } = await loadFixture(testSetup)

            const Reward = await ethers.getContractFactory("CRPReward")
            const UUPS = await ethers.getContractFactory("ERC1967Proxy")
            const abi = ["function initialize(address _management, uint256 _timeUnit, uint256 _rewardsPerUnitTime, uint256[3] calldata _interacPoints)"]
            const function_name = "initialize"
            const constructor_args = [
                management.address,
                60 * 60 * 24,
                ethers.utils.parseEther("0.5"),
                [2, 1, 1]
            ]

            const iface = new ethers.utils.Interface(abi)
            const data = iface.encodeFunctionData(function_name, constructor_args)

            const rewardImplementation = await Reward.deploy()
            await rewardImplementation.deployed()
            const uups = await UUPS.deploy(rewardImplementation.address, data)
            const receipt = await uups.deployed()
            const rewardProxy = Reward.attach(uups.address)

            const blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp

            const managementAddress = await rewardProxy.management()
            const user = await rewardProxy.usersArray(0)
            const rewardCond = await rewardProxy.getCurrentRewardCondition()
            const intPMint = await rewardProxy.interacPoints(0)
            const intPST = await rewardProxy.interacPoints(1)
            const intPRT = await rewardProxy.interacPoints(2)

            expect(managementAddress).to.equal(management.address)
            expect(user).to.equal(ethers.constants.AddressZero)
            expect(rewardCond.timeUnit.toNumber()).to.equal(60 * 60 * 24)
            expect(rewardCond.rewardsPerUnitTime).to.equal(ethers.utils.parseEther("0.5"))
            expect(rewardCond.startTimestamp).to.equal(blockTimestamp)
            expect(intPMint.toNumber()).to.equal(2)
            expect(intPST.toNumber()).to.equal(1)
            expect(intPRT.toNumber()).to.equal(1)
        })

        it("Should NOT initialize once it is already initialized", async () => {
            const { reward } = await loadFixture(testSetup)

            await expect(reward.initialize(
                ethers.constants.AddressZero,
                0,
                0,
                [0, 0, 0]
            )).to.be.revertedWith("Initializable: contract is already initialized")
        })
    })

    describe("increasePoints", () => {
        it("Should increase points", async () => {
            const { accounts, collection, reward } = await loadFixture(testSetup)
            const acc1 = accounts[10]

            await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [collection.address] });
            const signer = await ethers.getSigner(collection.address)
            const balanceHexString = ethers.utils.hexValue(ethers.utils.parseEther("10000"))
            await hre.network.provider.send("hardhat_setBalance", [
                signer.address,
                balanceHexString,
            ]);

            let tx = await reward.connect(signer).increasePoints(acc1.address, 0, 0)
            let receipt = await tx.wait()
            let blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp

            let user = await reward.getUser(acc1.address)

            expect(user.index.toNumber()).to.equal(1)
            expect(user.score.toNumber()).to.equal(0)
            expect(user.points.toNumber()).to.equal(2)
            expect(user.timeOfLastUpdate).to.equal(blockTimestamp)
            expect(user.unclaimedRewards.toNumber()).to.equal(0)
            expect(user.conditionIdOflastUpdate.toNumber()).to.equal(0)
            expect(user.collections).to.have.same.members([ethers.constants.AddressZero, collection.address])

            tx = await reward.connect(signer).increasePoints(acc1.address, 0, 1)
            receipt = await tx.wait()
            blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp

            user = await reward.getUser(acc1.address)

            expect(user.index.toNumber()).to.equal(0)
            expect(user.score.toNumber()).to.equal(0)
            expect(user.points.toNumber()).to.equal(0)
            expect(user.timeOfLastUpdate).to.equal(blockTimestamp)
            expect(user.unclaimedRewards.toNumber()).to.equal(2)
            expect(user.conditionIdOflastUpdate.toNumber()).to.equal(0)
            expect(user.collections).to.be.an("array").to.have.same.members([ethers.constants.AddressZero])

            await reward.connect(signer).increasePoints(acc1.address, 0, 0)
        })

        it("Should NOT increase points if invalid interaction is given", async () => {
            const { accounts, collection, reward } = await loadFixture(testSetup)
            const acc1 = accounts[10]

            await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [collection.address] });
            const signer = await ethers.getSigner(collection.address)
            const balanceHexString = ethers.utils.hexValue(ethers.utils.parseEther("10000"))
            await hre.network.provider.send("hardhat_setBalance", [
                signer.address,
                balanceHexString,
            ]);

            await expect(reward.connect(signer).increasePoints(acc1.address, 0, 3))
                .to.be.revertedWithCustomError(reward, "CRPRewardInvalidInteraction")
        })

        it("Should NOT increase points if caller is not CreatorsPRO ERC721Art contract", async () => {
            const { artCollection, reward, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[10]

            await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [artCollection.address] });
            const signer = await ethers.getSigner(artCollection.address)
            const balanceHexString = ethers.utils.hexValue(ethers.utils.parseEther("10000"))
            await hre.network.provider.send("hardhat_setBalance", [
                signer.address,
                balanceHexString,
            ]);

            await expect(reward.connect(signer).increasePoints(
                acc1.address, 0, 1
            )).to.be.revertedWithCustomError(reward, "CRPRewardNotAllowedCollectionAddress")
        })

        it("Should NOT increase points if contract paused", async () => {
            const { accounts, reward, collection } = await loadFixture(testSetup)
            const acc1 = accounts[10]

            let tx = await reward.pause()
            await tx.wait()

            await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [collection.address] });
            const signer = await ethers.getSigner(collection.address)
            const balanceHexString = ethers.utils.hexValue(ethers.utils.parseEther("10000"))
            await hre.network.provider.send("hardhat_setBalance", [
                signer.address,
                balanceHexString,
            ]);

            await expect(reward.connect(signer).increasePoints(
                acc1.address, 0, 1
            )).to.be.revertedWith("Pausable: paused")
        })
    })

    describe("removeToken", () => {
        it("Should remove token", async () => {
            const { accounts, collection, reward } = await loadFixture(testSetup)
            const acc1 = accounts[10]

            await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [collection.address] });
            const signer = await ethers.getSigner(collection.address)
            const balanceHexString = ethers.utils.hexValue(ethers.utils.parseEther("10000"))
            await hre.network.provider.send("hardhat_setBalance", [
                signer.address,
                balanceHexString,
            ]);

            let tx = await reward.connect(signer).increasePoints(acc1.address, 0, 0)
            await tx.wait()
            tx = await reward.connect(signer).increasePoints(acc1.address, 1, 0)
            await tx.wait()

            tx = await reward.connect(signer).removeToken(acc1.address, 0, true)
            let receipt = await tx.wait()
            let blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp

            let user = await reward.getUser(acc1.address)

            expect(user.timeOfLastUpdate).to.equal(blockTimestamp)
            expect(user.collections).to.have.same.members([ethers.constants.AddressZero, collection.address])

            tx = await reward.connect(signer).removeToken(acc1.address, 1, false)
            receipt = await tx.wait()
            blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp

            user = await reward.getUser(acc1.address)

            expect(user.timeOfLastUpdate).to.equal(blockTimestamp)
            expect(user.collections).to.have.same.members([ethers.constants.AddressZero])
        })

        it("Should NOT remove token if caller is not CreatorsPRO ERC721Art contract", async () => {
            const { accounts, reward } = await loadFixture(testSetup)
            const acc1 = accounts[10]

            await expect(reward.removeToken(acc1.address, 0, true))
                .to.be.revertedWithCustomError(reward, "CRPRewardNotAllowedCollectionAddress")
        })

        it("Should NOT remove token if contract paused", async () => {
            const { accounts, collection, reward } = await loadFixture(testSetup)
            const acc1 = accounts[10]

            await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [collection.address] });
            const signer = await ethers.getSigner(collection.address)
            const balanceHexString = ethers.utils.hexValue(ethers.utils.parseEther("10000"))
            await hre.network.provider.send("hardhat_setBalance", [
                signer.address,
                balanceHexString,
            ]);

            let tx = await reward.connect(signer).increasePoints(acc1.address, 0, 0)
            await tx.wait()

            tx = await reward.pause()
            await tx.wait()

            await expect(reward.connect(signer).removeToken(acc1.address, 0, true))
                .to.be.revertedWith("Pausable: paused")
        })
    })

    describe("depositRewardTokens", () => {
        it("Should deposit reward tokens", async () => {
            const { accounts, reward, creatorsCoin } = await loadFixture(testSetup)
            const manager = accounts[0]

            let tx = await creatorsCoin.mint(manager.address, ethers.utils.parseEther("10000"))
            await tx.wait()
            tx = await creatorsCoin.connect(manager).approve(reward.address, ethers.utils.parseEther("10000"))
            await tx.wait()

            const balanceManagerBefore = await creatorsCoin.balanceOf(manager.address)
            const balanceRewardBefore = await creatorsCoin.balanceOf(reward.address)

            tx = await reward.depositRewardTokens(manager.address, ethers.utils.parseEther("1000"))
            await tx.wait()

            const balanceManagerAfter = await creatorsCoin.balanceOf(manager.address)
            const balanceRewardAfter = await creatorsCoin.balanceOf(reward.address)

            expect(balanceManagerBefore).to.equal(ethers.utils.parseEther("10000"))
            expect(balanceRewardBefore.toNumber()).to.equal(0)
            expect(balanceManagerAfter).to.equal(ethers.utils.parseEther("9000"))
            expect(balanceRewardAfter).to.equal(ethers.utils.parseEther("1000"))
        })

        it("Should NOT deposit reward tokens if caller is not manager", async () => {
            const { accounts, reward, creatorsCoin } = await loadFixture(testSetup)
            const acc1 = accounts[10]

            let tx = await creatorsCoin.mint(acc1.address, ethers.utils.parseEther("10000"))
            await tx.wait()
            tx = await creatorsCoin.connect(acc1).approve(reward.address, ethers.utils.parseEther("10000"))
            await tx.wait()

            await expect(reward.connect(acc1).depositRewardTokens(acc1.address, ethers.utils.parseEther("1000")))
                .to.be.revertedWithCustomError(reward, "CRPRewardNotAllowed")
        })

        it("Should NOT deposit reward tokens if contract paused", async () => {
            const { accounts, reward, creatorsCoin } = await loadFixture(testSetup)
            const manager = accounts[0]

            let tx = await creatorsCoin.mint(manager.address, ethers.utils.parseEther("10000"))
            await tx.wait()
            tx = await creatorsCoin.connect(manager).approve(reward.address, ethers.utils.parseEther("10000"))
            await tx.wait()

            tx = await reward.pause()
            await tx.wait()

            await expect(reward.depositRewardTokens(manager.address, ethers.utils.parseEther("1000")))
                .to.be.revertedWith("Pausable: paused")
        })
    })

    describe("claimRewards", () => {
        it("Should claim rewards", async () => {
            const { accounts, collection, reward, creatorsCoin } = await loadFixture(testSetup)
            const acc1 = accounts[10]

            let tx = await reward.setHashObject(collection.address, [0, 1, 2], [1, 1, 1], [1, 1, 1])
            await tx.wait()
            tx = await creatorsCoin.mint(reward.address, ethers.utils.parseEther("1000"))
            await tx.wait()

            await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [collection.address] });
            const signer = await ethers.getSigner(collection.address)
            const balanceHexString = ethers.utils.hexValue(ethers.utils.parseEther("10000"))
            await hre.network.provider.send("hardhat_setBalance", [
                signer.address,
                balanceHexString,
            ]);

            tx = await reward.connect(signer).increasePoints(acc1.address, 0, 0)
            await tx.wait()
            tx = await reward.connect(signer).increasePoints(acc1.address, 1, 0)
            await tx.wait()

            const THIRTY_DAYS_IN_SECS = 30 * 24 * 60 * 60;
            const unlockTime = (await time.latest()) + THIRTY_DAYS_IN_SECS;
            await time.increaseTo(unlockTime);

            tx = await reward.connect(acc1).claimRewards()
            const receipt = await tx.wait()
            const event = receipt.events.filter(evt => evt?.event)
            const rightEvent = event.filter(evt => evt.args.amount)
            const rewarded = rightEvent[0].args.amount

            const acc1Balance = await creatorsCoin.balanceOf(acc1.address)
            const user = await reward.getUserUpdated(acc1.address)

            expect(acc1Balance).to.equal(rewarded)
            expect(user.unclaimedRewards.toNumber()).to.equal(0)
        })

        it("Should NOT claim rewards if unclaimed is 0", async () => {
            const { accounts, collection, reward, creatorsCoin } = await loadFixture(testSetup)
            const acc1 = accounts[10]

            let tx = await reward.setHashObject(collection.address, [0, 1, 2], [1, 1, 1], [1, 1, 1])
            await tx.wait()
            tx = await creatorsCoin.mint(reward.address, ethers.utils.parseEther("1000"))
            await tx.wait()

            await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [collection.address] });
            const signer = await ethers.getSigner(collection.address)
            const balanceHexString = ethers.utils.hexValue(ethers.utils.parseEther("10000"))
            await hre.network.provider.send("hardhat_setBalance", [
                signer.address,
                balanceHexString,
            ]);

            tx = await reward.connect(signer).increasePoints(acc1.address, 0, 0)
            await tx.wait()
            tx = await reward.connect(signer).increasePoints(acc1.address, 1, 0)
            await tx.wait()

            const THIRTY_DAYS_IN_SECS = 30 * 24 * 60 * 60;
            const unlockTime = (await time.latest()) + THIRTY_DAYS_IN_SECS;
            await time.increaseTo(unlockTime);

            tx = await reward.connect(signer).increasePoints(acc1.address, 0, 1)
            await tx.wait()
            tx = await reward.connect(signer).increasePoints(acc1.address, 1, 1)
            await tx.wait()

            tx = await reward.connect(acc1).claimRewards()
            await tx.wait()
            await expect(reward.connect(acc1).claimRewards())
                .to.be.revertedWithCustomError(reward, "CRPRewardNoRewards")
        })

        it("Should NOT claim rewards if contract paused", async () => {
            const { accounts, collection, reward, creatorsCoin } = await loadFixture(testSetup)
            const acc1 = accounts[10]

            let tx = await reward.setHashObject(collection.address, [0, 1, 2], [1, 1, 1], [1, 1, 1])
            await tx.wait()
            tx = await creatorsCoin.mint(reward.address, ethers.utils.parseEther("1000"))
            await tx.wait()

            await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [collection.address] });
            const signer = await ethers.getSigner(collection.address)
            const balanceHexString = ethers.utils.hexValue(ethers.utils.parseEther("10000"))
            await hre.network.provider.send("hardhat_setBalance", [
                signer.address,
                balanceHexString,
            ]);

            tx = await reward.connect(signer).increasePoints(acc1.address, 0, 0)
            await tx.wait()
            tx = await reward.connect(signer).increasePoints(acc1.address, 1, 0)
            await tx.wait()

            const THIRTY_DAYS_IN_SECS = 30 * 24 * 60 * 60;
            const unlockTime = (await time.latest()) + THIRTY_DAYS_IN_SECS;
            await time.increaseTo(unlockTime);

            tx = await reward.pause()
            await tx.wait()
            await expect(reward.connect(acc1).claimRewards())
                .to.be.revertedWith("Pausable: paused")
        })
    })

    describe("Setter functions", () => {
        describe("setHashObject", () => {
            it("Should set hash object", async () => {
                const { collection, reward } = await loadFixture(testSetup)

                let tx = await reward.setHashObject(collection.address, [0, 1, 2, 3], [1, 2, 3, 4], [2, 3, 4, 5])
                await tx.wait()

                const hashObject = await reward.getHashObject(collection.address, 2)

                expect(hashObject[0].toNumber()).to.equal(3)
                expect(hashObject[1].toNumber()).to.equal(4)
            })

            it("Should set hash object and update user score", async () => {
                const { collection, reward, accounts } = await loadFixture(testSetup)
                const acc1 = accounts[10]

                let tx = await collection.connect(acc1).mint(0, 0, 0, { value: ethers.utils.parseEther("10") })
                await tx.wait()

                await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [collection.address] });
                const signer = await ethers.getSigner(collection.address)
                const balanceHexString = ethers.utils.hexValue(ethers.utils.parseEther("10000"))
                await hre.network.provider.send("hardhat_setBalance", [
                    signer.address,
                    balanceHexString,
                ]);

                tx = await reward.connect(signer).increasePoints(acc1.address, 0, 0)
                await tx.wait()

                tx = await reward.setHashObject(collection.address, [0, 1, 2, 3], [1, 2, 3, 4], [2, 3, 4, 5])
                await tx.wait()

                const hashObject = await reward.getHashObject(collection.address, 2)
                const user = await reward.getUser(acc1.address)

                expect(hashObject[0].toNumber()).to.equal(3)
                expect(hashObject[1].toNumber()).to.equal(4)
                expect(user.score.toNumber()).to.equal(1)
            })

            it("Should NOT set hash object if arrays haven't same length", async () => {
                const { collection, reward } = await loadFixture(testSetup)

                await expect(reward.setHashObject(collection.address, [0, 1, 3], [1, 2, 3, 4], [2, 3, 4, 5]))
                    .to.be.revertedWithCustomError(reward, "CRPRewardInputArraysNotSameLength")
                await expect(reward.setHashObject(collection.address, [0, 1, 2, 3], [1, 3, 4], [2, 3, 4, 5]))
                    .to.be.revertedWithCustomError(reward, "CRPRewardInputArraysNotSameLength")
                await expect(reward.setHashObject(collection.address, [0, 1, 2, 3], [1, 2, 3, 4], [2, 3, 4]))
                    .to.be.revertedWithCustomError(reward, "CRPRewardInputArraysNotSameLength")
            })

            it("Should NOT set hash object if caller not manager", async () => {
                const { collection, reward, accounts } = await loadFixture(testSetup)
                const acc1 = accounts[10]

                await expect(reward.connect(acc1).setHashObject(collection.address, [0, 1, 2, 3], [1, 2, 3, 4], [2, 3, 4, 5]))
                    .to.be.revertedWithCustomError(reward, "CRPRewardNotAllowed")
            })

            it("Should NOT set hash object if contract paused", async () => {
                const { collection, reward } = await loadFixture(testSetup)

                let tx = await reward.pause()
                await tx.wait()

                await expect(reward.setHashObject(collection.address, [0, 1, 2, 3], [1, 2, 3, 4], [2, 3, 4, 5]))
                    .to.be.revertedWith("Pausable: paused")
            })
        })

        describe("setRewardCondition", () => {
            it("Should set new reward condition", async () => {
                const { reward } = await loadFixture(testSetup)

                let tx = await reward.setRewardCondition(100, ethers.utils.parseEther("1"))
                await tx.wait()

                let rewardCondition = await reward.getCurrentRewardCondition()

                expect(rewardCondition.timeUnit.toNumber()).to.equal(100)
                expect(rewardCondition.rewardsPerUnitTime).to.equal(ethers.utils.parseEther("1"))

                tx = await reward.setRewardCondition(110, ethers.utils.parseEther("0.1"))
                await tx.wait()

                rewardCondition = await reward.getCurrentRewardCondition()

                expect(rewardCondition.timeUnit.toNumber()).to.equal(110)
                expect(rewardCondition.rewardsPerUnitTime).to.equal(ethers.utils.parseEther("0.1"))
            })

            it("Should NOT set new reward condition if time unit is 0", async () => {
                const { reward } = await loadFixture(testSetup)

                await expect(reward.setRewardCondition(0, ethers.utils.parseEther("1")))
                    .to.be.revertedWithCustomError(reward, "CRPRewardTimeUnitZero")
            })

            it("Should NOT set new reward condition if caller not manager", async () => {
                const { reward, accounts } = await loadFixture(testSetup)
                const acc1 = accounts[10]

                await expect(reward.connect(acc1).setRewardCondition(100, ethers.utils.parseEther("1")))
                    .to.be.revertedWithCustomError(reward, "CRPRewardNotAllowed")
            })

            it("Should NOT set new reward condition if contract paused", async () => {
                const { reward } = await loadFixture(testSetup)

                let tx = await reward.pause()
                await tx.wait()

                await expect(reward.setRewardCondition(100, ethers.utils.parseEther("1")))
                    .to.be.revertedWith("Pausable: paused")
            })
        })
    })

    describe("upgradeTo", () => {
        it("Should upgrade contract", async () => {
            const { reward } = await loadFixture(testSetup)

            const Reward = await ethers.getContractFactory("CRPReward")
            const rewardImplementation = await Reward.deploy()
            await rewardImplementation.deployed()

            const tx = await reward.upgradeTo(rewardImplementation.address)
            await tx.wait()

            const newAddress = await reward.getImplementation()

            expect(newAddress).to.equal(rewardImplementation.address)
        })

        it("Should NOT upgrade contrat if caller is not manager", async () => {
            const { reward, accounts } = await loadFixture(testSetup)
            const [manager, acc] = accounts
            const Reward = await ethers.getContractFactory("CRPReward")
            const rewardImplementation = await Reward.deploy()
            await rewardImplementation.deployed()

            await expect(reward.connect(acc).upgradeTo(rewardImplementation.address))
                .to.be.revertedWithCustomError(reward, "CRPRewardNotAllowed")
        })
    })

    describe("pause", () => {
        it("Should pause contract", async () => {
            const { reward } = await loadFixture(testSetup)

            const pausedBefore = await reward.paused()

            const tx = await reward.pause()
            await tx.wait()

            const pausedAfter = await reward.paused()

            expect(pausedBefore).to.equal(false)
            expect(pausedAfter).to.equal(true)
        })

        it("Should NOT pause contract if caller is not manager", async () => {
            const { reward, accounts } = await loadFixture(testSetup)
            const acc = accounts[2]

            const pausedBefore = await reward.paused()

            expect(pausedBefore).to.equal(false)
            await expect(reward.connect(acc).pause())
                .to.be.revertedWithCustomError(reward, "CRPRewardNotAllowed")
        })
    })

    describe("unpause", () => {
        it("Should unpause contract", async () => {
            const { reward } = await loadFixture(testSetup)

            tx = await reward.pause()
            await tx.wait()

            const pausedBefore = await reward.paused()

            tx = await reward.unpause()
            await tx.wait()

            const pausedAfter = await reward.paused()

            expect(pausedBefore).to.equal(true)
            expect(pausedAfter).to.equal(false)
        })

        it("Should NOT unpause contract if caller is not manager", async () => {
            const { reward, accounts } = await loadFixture(testSetup)
            const acc = accounts[2]

            const tx = await reward.pause()
            await tx.wait()

            const pausedBefore = await reward.paused()

            expect(pausedBefore).to.equal(true)
            await expect(reward.connect(acc).unpause())
                .to.be.revertedWithCustomError(reward, "CRPRewardNotAllowed")
        })
    })

    describe("Getter functions", () => {
        describe("getImplementation", () => {
            it("Should get the implementation contract address", async () => {
                const { reward, implementations } = await loadFixture(testSetup)

                const newAddress = await reward.getImplementation()

                expect(newAddress).to.equal(implementations.reward.address)
            })
        })

        describe("getHashObject", () => {
            it("Should get hash object", async () => {
                const { collection, reward } = await loadFixture(testSetup)

                let tx = await reward.setHashObject(collection.address, [0, 1, 2, 3], [1, 2, 3, 4], [2, 3, 4, 5])
                await tx.wait()

                const hashObject = await reward.getHashObject(collection.address, 2)

                expect(hashObject[0].toNumber()).to.equal(3)
                expect(hashObject[1].toNumber()).to.equal(4)
            })
        })

        describe("getTokenInfo", () => {
            it("Should get token info", async () => {
                const { collection, reward } = await loadFixture(testSetup)

                let tx = await reward.setHashObject(collection.address, [0, 1, 2, 3], [1, 2, 3, 4], [2, 3, 4, 5])
                await tx.wait()

                const tokenInfo = await reward.getTokenInfo(collection.address, 1)

                expect(tokenInfo.index.toNumber()).to.equal(0)
                expect(tokenInfo.hashpower.toNumber()).to.equal(2)
                expect(tokenInfo.characteristId.toNumber()).to.equal(3)
            })
        })

        describe("getUser", () => {
            it("Should get user infos", async () => {
                const { collection, reward, accounts } = await loadFixture(testSetup)
                const acc1 = accounts[10]

                await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [collection.address] });
                const signer = await ethers.getSigner(collection.address)
                const balanceHexString = ethers.utils.hexValue(ethers.utils.parseEther("10000"))
                await hre.network.provider.send("hardhat_setBalance", [
                    signer.address,
                    balanceHexString,
                ]);

                let tx = await reward.connect(signer).increasePoints(acc1.address, 0, 0)
                const receipt = await tx.wait()
                const blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp

                const user = await reward.getUser(acc1.address)

                expect(user.index.toNumber()).to.equal(1)
                expect(user.score.toNumber()).to.equal(0)
                expect(user.points.toNumber()).to.equal(2)
                expect(user.timeOfLastUpdate.toNumber()).to.equal(blockTimestamp)
                expect(user.unclaimedRewards.toNumber()).to.equal(0)
                expect(user.conditionIdOflastUpdate.toNumber()).to.equal(0)
                expect(user.collections).to.have.same.members([ethers.constants.AddressZero, collection.address])
            })
        })

        describe("getUserUpdated", () => {
            it("Should get user info (updated)", async () => {
                const { collection, reward, accounts } = await loadFixture(testSetup)
                const acc1 = accounts[10]

                await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [collection.address] });
                const signer = await ethers.getSigner(collection.address)
                const balanceHexString = ethers.utils.hexValue(ethers.utils.parseEther("10000"))
                await hre.network.provider.send("hardhat_setBalance", [
                    signer.address,
                    balanceHexString,
                ]);

                let tx = await reward.connect(signer).increasePoints(acc1.address, 0, 0)
                await tx.wait()

                const THIRTY_DAYS_IN_SECS = 30 * 24 * 60 * 60;
                const unlockTime = (await time.latest()) + THIRTY_DAYS_IN_SECS;
                await time.increaseTo(unlockTime);

                const timestamp = await time.latest();
                const user = await reward.getUserUpdated(acc1.address)

                expect(user.index.toNumber()).to.equal(1)
                expect(user.score.toNumber()).to.equal(0)
                expect(user.points.toNumber()).to.equal(2)
                expect(user.timeOfLastUpdate.toNumber()).to.equal(timestamp)
                expect(user.unclaimedRewards.toNumber()).not.to.equal(0)
                expect(user.conditionIdOflastUpdate.toNumber()).to.equal(0)
                expect(user.collections).to.have.same.members([ethers.constants.AddressZero, collection.address])
            })
        })

        describe("getCurrentRewardCondition", () => {
            it("Should get current reward condition", async () => {
                const { reward } = await loadFixture(testSetup)

                let tx = await reward.setRewardCondition(100, ethers.utils.parseEther("1"))
                const receipt = await tx.wait()
                const blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp

                const currRewardCondition = await reward.getCurrentRewardCondition()

                expect(currRewardCondition.timeUnit.toNumber()).to.equal(100)
                expect(currRewardCondition.rewardsPerUnitTime).to.equal(ethers.utils.parseEther("1"))
                expect(currRewardCondition.startTimestamp.toNumber()).to.equal(blockTimestamp)
                expect(currRewardCondition.endTimestamp.toNumber()).to.equal(0)
            })
        })

        describe("getRewardCondition", () => {
            it("Should get reward condition", async () => {
                const { reward } = await loadFixture(testSetup)

                let tx = await reward.setRewardCondition(100, ethers.utils.parseEther("1"))
                const receipt = await tx.wait()
                const blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp

                const nextCondId = (await reward.nextConditionId()).toNumber() - 1

                const currRewardCondition = await reward.getRewardCondition(nextCondId)

                expect(currRewardCondition.timeUnit.toNumber()).to.equal(100)
                expect(currRewardCondition.rewardsPerUnitTime).to.equal(ethers.utils.parseEther("1"))
                expect(currRewardCondition.startTimestamp.toNumber()).to.equal(blockTimestamp)
                expect(currRewardCondition.endTimestamp.toNumber()).to.equal(0)
            })
        })

        describe("getAllTokenIdsPerUser", () => {
            it("Should get all token IDs from given user", async () => {
                const { collection, reward, accounts } = await loadFixture(testSetup)
                const acc1 = accounts[10]

                await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [collection.address] });
                const signer = await ethers.getSigner(collection.address)
                const balanceHexString = ethers.utils.hexValue(ethers.utils.parseEther("10000"))
                await hre.network.provider.send("hardhat_setBalance", [
                    signer.address,
                    balanceHexString,
                ]);

                let tx = await reward.connect(signer).increasePoints(acc1.address, 0, 0)
                await tx.wait()
                tx = await reward.connect(signer).increasePoints(acc1.address, 1, 0)
                await tx.wait()
                tx = await reward.connect(signer).increasePoints(acc1.address, 10, 0)
                await tx.wait()

                const userTokenIdsBN = await reward.getAllTokenIdsPerUser(acc1.address, collection.address)
                const userTokenIds = userTokenIdsBN.map(elem => elem.toNumber())

                expect(userTokenIds).to.have.same.members([0, 0, 1, 10])
            })
        })
    })
})