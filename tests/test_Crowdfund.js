const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { USDTtokenContract } = require("../scripts/utils")
const hre = require("hardhat")
const lastDeploy = require("../scripts/last_deploy.json")

const originalAddress = USDTtokenContract[lastDeploy["lastNetwork"]]
let lastERC20Address = originalAddress
let ERC721ArtChanged = false

describe("Crowdfund", () => {
    const creatorsRoyalty = 200

    const erc20Name = "USDT"
    const erc20Symbol = "USDT"
    const erc20Decimals = 6

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

    // after(() => {
    //     if (ERC721ArtChanged) {
    //         if (hre.__SOLIDITY_COVERAGE_RUNNING) {
    //             replaceTokenAddressBytecode("ERC721Art", originalAddress, undefined, lastERC20Address)
    //         } else {
    //             replaceTokenAddress("ERC721Art", originalAddress, undefined, lastERC20Address)
    //         }
    //     }
    //     ERC721ArtChanged = false
    // })

    async function testSetup(withERC20 = false) {
        let erc20
        if (withERC20) {
            const ERC20 = await ethers.getContractFactory("MockUSDToken")
            erc20 = await ERC20.deploy(erc20Name, erc20Symbol, erc20Decimals)
            erc20.deployed()

            // if (hre.__SOLIDITY_COVERAGE_RUNNING) {
            //     // await hre.run("clean")
            //     // await hre.run("compile", { quiet: true, force: true, verbose: false })
            //     replaceTokenAddressBytecode("ERC721Art", erc20.address, undefined, lastERC20Address)
            // } else {
            //     replaceTokenAddress("ERC721Art", erc20.address, undefined, lastERC20Address)
            //     // await hre.run("clean")
            //     await hre.run("compile", { quiet: true, force: true, verbose: false })
            // }
            // lastERC20Address = erc20.address
            // ERC721ArtChanged = true
        }

        const Management = await ethers.getContractFactory("Management")
        const ArtCollection = await ethers.getContractFactory("ERC721Art")
        const FundCollection = await ethers.getContractFactory("Crowdfund")
        const MultiSig = await ethers.getContractFactory("MockMultiSig")
        const CreatorsCoin = await ethers.getContractFactory("CreatorsCoin")
        const Reward = await ethers.getContractFactory("CRPReward")

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

        const multiSig = await MultiSig.deploy()
        await multiSig.deployed()

        const creatorsCoin = await CreatorsCoin.deploy("CreatorsCoin", "CC", ethers.utils.parseEther("1"))
        await creatorsCoin.deployed()

        const managementImplementation = await Management.deploy()
        await managementImplementation.deployed()

        let abi = ["function initialize(address _beaconAdminArt, address _beaconAdminFund, address _beaconAdminCreators, address _creatorsCoin, address _erc20USD, address _multiSig, uint256 _fee)"]
        let function_name = "initialize"
        let constructor_args = [
            beaconAdminArt.address,
            beaconAdminFund.address,
            beaconAdminCreators.address,
            creatorsCoin.address,
            erc20 ? erc20.address : ethers.constants.AddressZero,
            multiSig.address,
            creatorsRoyalty
        ]

        let iface = new ethers.utils.Interface(abi)
        let data = iface.encodeFunctionData(function_name, constructor_args)

        let uups = await UUPS.deploy(managementImplementation.address, data)
        await uups.deployed()
        const managementProxy = Management.attach(uups.address)

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
        let tx = await managementProxy.setProxyReward(rewardProxy.address)
        await tx.wait()

        const accounts = await ethers.getSigners()

        const management = managementProxy
        const artCollection = beaconAdminArt
        const fundCollection = beaconAdminFund
        const creatorsCollection = beaconAdminCreators

        const allowCreator = await management.setCreator(accounts[1].address, true)
        await allowCreator.wait()
        const newCol = await management.connect(accounts[1]).newCrowdfund(
            collectionName, collectionSymbol, collectionBaseURI, collectionRoyalty, accounts[1].address,
            [cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue, cfLowQuotaAmount, cfRegQuotaAmount,
                cfHighQuotaAmount, accounts[10].address, cfDonationFee, cfMinSoldRate]
        )
        const receipt = await newCol.wait()
        const blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp
        const event = receipt.events.filter(evt => evt?.event)
        const rightEvent = event.filter(evt => evt.args.fundCollection || evt.args.artCollection)
        const fundCollectionAddress = rightEvent[0].args.fundCollection
        const fundCollectionCreated = await ethers.getContractAt("contracts/Crowdfund.sol:Crowdfund", fundCollectionAddress)
        const artCollectionAddress = rightEvent[0].args.artCollection
        const artCollectionCreated = await ethers.getContractAt("contracts/ERC721Art.sol:ERC721Art", artCollectionAddress)

        let tokenIds = []
        let hashpowers = []
        let characteristIds = []
        for (let ii = 0; ii < 200; ii++) {
            tokenIds.push(ii)
            hashpowers.push(1)
            characteristIds.push(ii + 1)
        }

        tx = await rewardProxy.setHashObject(artCollectionCreated.address, tokenIds, hashpowers, characteristIds)
        await tx.wait()

        const reward = rewardProxy

        if (withERC20) {
            // let tx = await management.setTokenContract(1, erc20.address)
            // await tx.wait()

            const tokenAmount = ethers.utils.parseEther("5")
            for (let ii = 0; ii < 6; ii++) {
                const tx = await erc20.mint(accounts[ii].address, tokenAmount)
                await tx.wait()

                const tx2 = await erc20.connect(accounts[ii]).approve(fundCollectionCreated.address, tokenAmount)
                await tx2.wait()

                const tx3 = await erc20.connect(accounts[ii]).approve(artCollectionCreated.address, tokenAmount)
                await tx3.wait()

                const tx4 = await erc20.connect(accounts[ii]).approve(beaconAdminFund.address, tokenAmount)
                await tx4.wait()
            }
        }

        const balanceHexString = ethers.utils.hexValue(ethers.utils.parseEther("10000"))
        for (let ii = 0; ii < 11; ii++) {
            await hre.network.provider.send("hardhat_setBalance", [
                accounts[ii].address,
                balanceHexString,
            ]);
        }

        return {
            management,
            artCollection,
            fundCollection,
            creatorsCollection,
            creatorsCoin,
            multiSig,
            accounts,
            fundCollectionCreated,
            artCollectionCreated,
            blockTimestamp,
            erc20,
            reward
        }
    }

    const testSetup_withERC20 = async () => testSetup(true)

    describe("initialize", () => {
        it("Should be initialized successfully", async () => {
            const { fundCollectionCreated, artCollectionCreated, accounts, blockTimestamp } = await loadFixture(testSetup)

            //collection
            const name = await artCollectionCreated.name()
            const symbol = await artCollectionCreated.symbol()
            const maxSupply = await artCollectionCreated.maxSupply()
            const priceETH = await artCollectionCreated.pricePerCoin(0)
            const priceUSDT = await artCollectionCreated.pricePerCoin(1)
            const priceCreatorsCoin = await artCollectionCreated.pricePerCoin(2)
            const baseURI = await artCollectionCreated.baseURI()
            const royalty = await artCollectionCreated.getRoyalty()
            const crowdfund = await artCollectionCreated.crowdfund()

            //crowdfund
            const dueDate = await fundCollectionCreated.dueDate()
            const minSoldRate = await fundCollectionCreated.minSoldRate()
            const quotaInfosLowObj = await fundCollectionCreated.getQuotaInfos(0)
            const quotaInfosLow = {
                values: quotaInfosLowObj[0],
                amount: quotaInfosLowObj.amount.toNumber(),
                bought: quotaInfosLowObj.bought.toNumber(),
                nextTokenId: quotaInfosLowObj.nextTokenId.toNumber()
            }
            const quotaInfosRegObj = await fundCollectionCreated.getQuotaInfos(1)
            const quotaInfosReg = {
                values: quotaInfosRegObj[0],
                amount: quotaInfosRegObj.amount.toNumber(),
                bought: quotaInfosRegObj.bought.toNumber(),
                nextTokenId: quotaInfosRegObj.nextTokenId.toNumber()
            }
            const quotaInfosHighObj = await fundCollectionCreated.getQuotaInfos(2)
            const quotaInfosHigh = {
                values: quotaInfosHighObj[0],
                amount: quotaInfosHighObj.amount.toNumber(),
                bought: quotaInfosHighObj.bought.toNumber(),
                nextTokenId: quotaInfosHighObj.nextTokenId.toNumber()
            }
            const soldQuotaAmount = quotaInfosLow.bought + quotaInfosReg.bought + quotaInfosHigh.bought
            const donationFee = await fundCollectionCreated.donationFee()
            const donationReceiver = await fundCollectionCreated.donationReceiver()
            const nextInvestId = await fundCollectionCreated.nextInvestId()
            const collection = await fundCollectionCreated.collection()

            //collection
            expect(name).to.equal(collectionName)
            expect(symbol).to.equal(collectionSymbol)
            expect(maxSupply.toNumber()).to.equal(cfLowQuotaAmount + cfRegQuotaAmount + cfHighQuotaAmount)
            expect(priceETH).to.equal(ethers.constants.MaxUint256)
            expect(priceUSDT).to.equal(ethers.constants.MaxUint256)
            expect(priceCreatorsCoin).to.equal(ethers.constants.MaxUint256)
            expect(baseURI).to.equal(collectionBaseURI)
            expect(royalty[0]).to.equal(accounts[1].address)
            expect(royalty[1].toNumber()).to.equal(collectionRoyalty)
            expect(crowdfund).to.equal(fundCollectionCreated.address)

            //crowdfund
            expect(dueDate.toNumber()).to.equal(blockTimestamp + 6 * 30 * 24 * 60 * 60)
            expect(minSoldRate.toNumber()).to.equal(cfMinSoldRate)
            expect(soldQuotaAmount).to.equal(0)
            expect(quotaInfosLow.values[0]).to.equal(cfLowQuotaValue[0])
            expect(quotaInfosLow.values[1]).to.equal(cfLowQuotaValue[1])
            expect(quotaInfosLow.values[2]).to.equal(cfLowQuotaValue[2])
            expect(quotaInfosReg.values[0]).to.equal(cfRegQuotaValue[0])
            expect(quotaInfosReg.values[1]).to.equal(cfRegQuotaValue[1])
            expect(quotaInfosReg.values[2]).to.equal(cfRegQuotaValue[2])
            expect(quotaInfosHigh.values[0]).to.equal(cfHighQuotaValue[0])
            expect(quotaInfosHigh.values[1]).to.equal(cfHighQuotaValue[1])
            expect(quotaInfosHigh.values[2]).to.equal(cfHighQuotaValue[2])
            expect(quotaInfosLow.amount).to.equal(cfLowQuotaAmount)
            expect(quotaInfosReg.amount).to.equal(cfRegQuotaAmount)
            expect(quotaInfosHigh.amount).to.equal(cfHighQuotaAmount)
            expect(donationFee.toNumber()).to.equal(cfDonationFee)
            expect(donationReceiver).to.equal(accounts[10].address)
            expect(quotaInfosLow.nextTokenId).to.equal(0)
            expect(quotaInfosReg.nextTokenId).to.equal(cfLowQuotaAmount)
            expect(quotaInfosHigh.nextTokenId).to.equal(cfLowQuotaAmount + cfRegQuotaAmount)
            expect(nextInvestId.toNumber()).to.equal(1)
            expect(collection).to.equal(artCollectionCreated.address)
        })

        it("Should NOT initialize once it is already initialized", async () => {
            const { fundCollectionCreated, artCollectionCreated, accounts } = await loadFixture(testSetup)
            const creator = accounts[1]

            await expect(fundCollectionCreated.initialize(
                cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue,
                100, 100, 100, accounts[10].address, 200, 2500,
                artCollectionCreated.address
            )).to.be.revertedWith("Initializable: contract is already initialized")
        })

        it("Should NOT initialize if resulting max supply is 0", async () => {
            const { artCollectionCreated, accounts } = await loadFixture(testSetup)
            const FundCollection = await ethers.getContractFactory("Crowdfund")
            const fundCollection = await FundCollection.deploy()
            await fundCollection.deployed()

            await expect(fundCollection.initialize(
                cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue,
                0, 0, 0, accounts[10].address, 200, 2500,
                artCollectionCreated.address
            )).to.be.revertedWithCustomError(fundCollection, "CrowdfundMaxSupplyIs0")
        })

        it("Should NOT initialize if an invalid collection address is given", async () => {
            const { management, accounts, artCollection } = await loadFixture(testSetup)
            const [creator, acc1] = [accounts[1], accounts[2]]

            let fundCollection

            let artCollectionFalse

            let tx

            const ArtCollection = await ethers.getContractFactory("ERC721Art")
            const FundCollection = await ethers.getContractFactory("Crowdfund")

            const lowQuotaAm = 3
            const regQuotaAm = 2
            const highQuotaAm = 0

            await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [management.address] });
            const signer = await ethers.getSigner(management.address)
            const balanceHexString = ethers.utils.hexValue(ethers.utils.parseEther("10000"))
            await hre.network.provider.send("hardhat_setBalance", [
                signer.address,
                balanceHexString,
            ]);

            // Different Management contracts

            const Management = await ethers.getContractFactory("Management")
            const managementFalse = await Management.deploy()
            await managementFalse.deployed()
            tx = await managementFalse.initialize(
                ethers.constants.AddressZero,
                ethers.constants.AddressZero,
                ethers.constants.AddressZero,
                ethers.constants.AddressZero,
                ethers.constants.AddressZero,
                ethers.constants.AddressZero,
                200
            )
            await tx.wait()

            await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [managementFalse.address] });
            const signerFalse = await ethers.getSigner(managementFalse.address)
            await hre.network.provider.send("hardhat_setBalance", [
                signerFalse.address,
                balanceHexString,
            ]);

            artCollectionFalse = await ArtCollection.deploy()
            await artCollectionFalse.deployed()

            fundCollection = await FundCollection.deploy()
            await fundCollection.deployed()

            tx = await artCollectionFalse.connect(signerFalse).initialize(
                "bla", "BLA", creator.address, lowQuotaAm + regQuotaAm + highQuotaAm,
                ethers.constants.MaxUint256, ethers.constants.MaxUint256, ethers.constants.MaxUint256,
                "bla.com", 200
            )
            await tx.wait()

            await expect(fundCollection.connect(signer).initialize(
                cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue,
                lowQuotaAm, regQuotaAm, highQuotaAm,
                ethers.constants.AddressZero, 0, 2500,
                artCollectionFalse.address
            )).to.be.revertedWithCustomError(fundCollection, "CrowdfundInvalidCollection")

            // maxSupply != Crowdfund.maxQuotasAmount

            artCollectionFalse = await ArtCollection.deploy()
            await artCollectionFalse.deployed()

            fundCollection = await FundCollection.deploy()
            await fundCollection.deployed()

            tx = await artCollectionFalse.connect(signer).initialize(
                "bla", "BLA", creator.address, lowQuotaAm + regQuotaAm + highQuotaAm + 1,
                ethers.constants.MaxUint256, ethers.constants.MaxUint256, ethers.constants.MaxUint256,
                "bla.com", 200
            )
            await tx.wait()

            await expect(fundCollection.connect(signer).initialize(
                cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue,
                lowQuotaAm, regQuotaAm, highQuotaAm,
                ethers.constants.AddressZero, 0, 2500,
                artCollectionFalse.address
            )).to.be.revertedWithCustomError(fundCollection, "CrowdfundInvalidCollection")

            // ETH/MATIC price is not max uint256

            artCollectionFalse = await ArtCollection.deploy()
            await artCollectionFalse.deployed()

            fundCollection = await FundCollection.deploy()
            await fundCollection.deployed()

            tx = await artCollectionFalse.connect(signer).initialize(
                "bla", "BLA", creator.address, lowQuotaAm + regQuotaAm + highQuotaAm,
                ethers.utils.parseEther("1"), ethers.constants.MaxUint256, ethers.constants.MaxUint256,
                "bla.com", 200
            )
            await tx.wait()

            await expect(fundCollection.connect(signer).initialize(
                cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue,
                lowQuotaAm, regQuotaAm, highQuotaAm,
                ethers.constants.AddressZero, 0, 2500,
                artCollectionFalse.address
            )).to.be.revertedWithCustomError(fundCollection, "CrowdfundInvalidCollection")

            // USDT price is not max uint256

            artCollectionFalse = await ArtCollection.deploy()
            await artCollectionFalse.deployed()

            fundCollection = await FundCollection.deploy()
            await fundCollection.deployed()

            tx = await artCollectionFalse.connect(signer).initialize(
                "bla", "BLA", creator.address, lowQuotaAm + regQuotaAm + highQuotaAm,
                ethers.constants.MaxUint256, ethers.utils.parseEther("1"), ethers.constants.MaxUint256,
                "bla.com", 200
            )
            await tx.wait()

            await expect(fundCollection.connect(signer).initialize(
                cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue,
                lowQuotaAm, regQuotaAm, highQuotaAm,
                ethers.constants.AddressZero, 0, 2500,
                artCollectionFalse.address
            )).to.be.revertedWithCustomError(fundCollection, "CrowdfundInvalidCollection")

            // CreatorsCoin price is not max uint256

            artCollectionFalse = await ArtCollection.deploy()
            await artCollectionFalse.deployed()

            fundCollection = await FundCollection.deploy()
            await fundCollection.deployed()

            tx = await artCollectionFalse.connect(signer).initialize(
                "bla", "BLA", creator.address, lowQuotaAm + regQuotaAm + highQuotaAm,
                ethers.constants.MaxUint256, ethers.constants.MaxUint256, ethers.utils.parseEther("1"),
                "bla.com", 200
            )
            await tx.wait()

            await expect(fundCollection.connect(signer).initialize(
                cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue,
                lowQuotaAm, regQuotaAm, highQuotaAm,
                ethers.constants.AddressZero, 0, 2500,
                artCollectionFalse.address
            )).to.be.revertedWithCustomError(fundCollection, "CrowdfundInvalidCollection")
        })

        it("Should NOT initialize if minSoldRate is lower than 2500 or higher than 10000", async () => {
            const { artCollectionCreated, accounts } = await loadFixture(testSetup)
            const FundCollection = await ethers.getContractFactory("Crowdfund")
            const fundCollection = await FundCollection.deploy()
            await fundCollection.deployed()

            await expect(fundCollection.initialize(
                cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue,
                100, 100, 100, accounts[10].address, 200, 2000,
                artCollectionCreated.address
            )).to.be.revertedWithCustomError(fundCollection, "CrowdfundInvalidMinSoldRate")
            await expect(fundCollection.initialize(
                cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue,
                100, 100, 100, accounts[10].address, 200, 20000,
                artCollectionCreated.address
            )).to.be.revertedWithCustomError(fundCollection, "CrowdfundInvalidMinSoldRate")
        })
    })

    describe("invest", () => {
        it("Should invest in crowdfunding (ETH/MATIC)", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAm = 10
            const regQuotaAm = 5
            const highQuotaAm = 1
            const coin = 0 // ETH/MATIC

            //before
            const accBalanceBefore = await ethers.provider.getBalance(acc1.address)
            let quotaInfosLowObj = await fundCollectionCreated.getQuotaInfos(0)
            const quotaInfosLowBefore = {
                value: quotaInfosLowObj.value,
                amount: quotaInfosLowObj.amount.toNumber(),
                bought: quotaInfosLowObj.bought.toNumber(),
                nextTokenId: quotaInfosLowObj.nextTokenId.toNumber()
            }
            let quotaInfosRegObj = await fundCollectionCreated.getQuotaInfos(1)
            const quotaInfosRegBefore = {
                value: quotaInfosRegObj.value,
                amount: quotaInfosRegObj.amount.toNumber(),
                bought: quotaInfosRegObj.bought.toNumber(),
                nextTokenId: quotaInfosRegObj.nextTokenId.toNumber()
            }
            let quotaInfosHighObj = await fundCollectionCreated.getQuotaInfos(2)
            const quotaInfosHighBefore = {
                value: quotaInfosHighObj.value,
                amount: quotaInfosHighObj.amount.toNumber(),
                bought: quotaInfosHighObj.bought.toNumber(),
                nextTokenId: quotaInfosHighObj.nextTokenId.toNumber()
            }
            const soldQuotaAmountBefore = quotaInfosLowBefore.bought + quotaInfosRegBefore.bought + quotaInfosHighBefore.bought
            const nextInvestIdBefore = await fundCollectionCreated.nextInvestId()
            const paymentsPerCoinBefore = await fundCollectionCreated.paymentsPerCoin(acc1.address, coin)
            const investIdsPerInvestorBefore = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            let investIdInfosObj = await fundCollectionCreated.getInvestIdInfos(nextInvestIdBefore)
            const investIdInfosBefore = {
                index: investIdInfosObj.index.toNumber(),
                totalPayment: investIdInfosObj.totalPayment.toNumber(),
                sevenDaysPeriod: investIdInfosObj.sevenDaysPeriod.toNumber(),
                coin: investIdInfosObj.coin,
                investor: investIdInfosObj.investor,
                lowQuotaAmount: investIdInfosObj.lowQuotaAmount.toNumber(),
                regQuotaAmount: investIdInfosObj.regQuotaAmount.toNumber(),
                highQuotaAmount: investIdInfosObj.highQuotaAmount.toNumber()
            }

            const totalPayment = cfLowQuotaValue[coin].mul(lowQuotaAm)
                .add(cfRegQuotaValue[coin].mul(regQuotaAm))
                .add(cfHighQuotaValue[coin].mul(highQuotaAm))

            const tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, coin, { value: totalPayment.add(ethers.utils.parseEther("1")) })
            const receipt = await tx.wait()

            const gasValue = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            //after
            const accBalanceAfter = await ethers.provider.getBalance(acc1.address)
            quotaInfosLowObj = await fundCollectionCreated.getQuotaInfos(0)
            const quotaInfosLowAfter = {
                value: quotaInfosLowObj.value,
                amount: quotaInfosLowObj.amount.toNumber(),
                bought: quotaInfosLowObj.bought.toNumber(),
                nextTokenId: quotaInfosLowObj.nextTokenId.toNumber()
            }
            quotaInfosRegObj = await fundCollectionCreated.getQuotaInfos(1)
            const quotaInfosRegAfter = {
                value: quotaInfosRegObj.value,
                amount: quotaInfosRegObj.amount.toNumber(),
                bought: quotaInfosRegObj.bought.toNumber(),
                nextTokenId: quotaInfosRegObj.nextTokenId.toNumber()
            }
            quotaInfosHighObj = await fundCollectionCreated.getQuotaInfos(2)
            const quotaInfosHighAfter = {
                value: quotaInfosHighObj.value,
                amount: quotaInfosHighObj.amount.toNumber(),
                bought: quotaInfosHighObj.bought.toNumber(),
                nextTokenId: quotaInfosHighObj.nextTokenId.toNumber()
            }
            const soldQuotaAmountAfter = quotaInfosLowAfter.bought + quotaInfosRegAfter.bought + quotaInfosHighAfter.bought
            const nextInvestIdAfter = await fundCollectionCreated.nextInvestId()
            const paymentsPerCoinAfter = await fundCollectionCreated.paymentsPerCoin(acc1.address, coin)
            const investIdsPerInvestorAfterBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            investIdInfosObj = await fundCollectionCreated.getInvestIdInfos(nextInvestIdBefore)
            const investIdInfosAfter = {
                index: investIdInfosObj.index.toNumber(),
                totalPayment: investIdInfosObj.totalPayment,
                sevenDaysPeriod: investIdInfosObj.sevenDaysPeriod.toNumber(),
                coin: investIdInfosObj.coin,
                investor: investIdInfosObj.investor,
                lowQuotaAmount: investIdInfosObj.lowQuotaAmount.toNumber(),
                regQuotaAmount: investIdInfosObj.regQuotaAmount.toNumber(),
                highQuotaAmount: investIdInfosObj.highQuotaAmount.toNumber()
            }
            const blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp

            const investIdsPerInvestorAfter = investIdsPerInvestorAfterBN.map(elem => elem.toNumber())

            //assertions before
            expect(accBalanceBefore).to.equal(ethers.utils.parseEther("10000"))
            expect(quotaInfosLowBefore.bought).to.equal(0)
            expect(quotaInfosRegBefore.bought).to.equal(0)
            expect(quotaInfosHighBefore.bought).to.equal(0)
            expect(soldQuotaAmountBefore).to.equal(0)
            expect(nextInvestIdBefore.toNumber()).to.equal(1)
            expect(paymentsPerCoinBefore.toNumber()).to.equal(0)
            expect(investIdInfosBefore.sevenDaysPeriod).to.equal(0)
            expect(investIdsPerInvestorBefore).to.be.an("array").that.is.empty
            expect(investIdInfosBefore.lowQuotaAmount).to.equal(0)
            expect(investIdInfosBefore.regQuotaAmount).to.equal(0)
            expect(investIdInfosBefore.highQuotaAmount).to.equal(0)
            expect(investIdInfosBefore.coin).to.equal(0)

            //assertions after
            expect(accBalanceAfter).to.equal(accBalanceBefore.sub(totalPayment.add(gasValue)))
            expect(quotaInfosLowAfter.bought).to.equal(lowQuotaAm)
            expect(quotaInfosRegAfter.bought).to.equal(regQuotaAm)
            expect(quotaInfosHighAfter.bought).to.equal(highQuotaAm)
            expect(soldQuotaAmountAfter).to.equal(lowQuotaAm + regQuotaAm + highQuotaAm)
            expect(nextInvestIdAfter.toNumber()).to.equal(nextInvestIdBefore.toNumber() + 1)
            expect(paymentsPerCoinAfter).to.equal(totalPayment)
            expect(investIdInfosAfter.sevenDaysPeriod).to.equal(blockTimestamp + 7 * 24 * 60 * 60)
            expect(investIdsPerInvestorAfter).to.have.same.members([1])
            expect(investIdInfosAfter.lowQuotaAmount).to.equal(lowQuotaAm)
            expect(investIdInfosAfter.regQuotaAmount).to.equal(regQuotaAm)
            expect(investIdInfosAfter.highQuotaAmount).to.equal(highQuotaAm)
            expect(investIdInfosAfter.coin).to.equal(coin)
        })

        it("Should invest in crowdfunding (ERC20 token)", async () => {
            const { fundCollectionCreated, accounts, erc20 } = await loadFixture(testSetup_withERC20)
            const acc1 = accounts[2]

            const lowQuotaAm = 10
            const regQuotaAm = 5
            const highQuotaAm = 1
            const coin = 1 // ERC20

            const balanceBefore = await erc20.balanceOf(acc1.address)

            const totalPayment = cfLowQuotaValue[coin].mul(lowQuotaAm)
                .add(cfRegQuotaValue[coin].mul(regQuotaAm))
                .add(cfHighQuotaValue[coin].mul(highQuotaAm))

            const tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, coin)
            await tx.wait()

            const balanceAfter = await erc20.balanceOf(acc1.address)

            expect(balanceAfter).to.equal(balanceBefore.sub(totalPayment))
        })

        it("Should NOT invest in crowdfunding if due date has past", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAm = 10
            const regQuotaAm = 5
            const highQuotaAm = 1
            const coin = 0 // ETH/MATIC

            const totalPayment = cfLowQuotaValue[coin].mul(lowQuotaAm)
                .add(cfRegQuotaValue[coin].mul(regQuotaAm))
                .add(cfHighQuotaValue[coin].mul(highQuotaAm))

            const unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60;
            await time.increaseTo(unlockTime);

            await expect(fundCollectionCreated.connect(acc1).invest(lowQuotaAm, regQuotaAm, highQuotaAm, coin, { value: totalPayment }))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundPastDue")
        })

        it("Should NOT invest in crowdfunding if there is no more quotas", async () => {
            let { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            let lowQuotaAm = cfLowQuotaAmount
            let regQuotaAm = 5
            let highQuotaAm = 1
            const coin = 0 // ETH/MATIC

            let totalPayment = cfLowQuotaValue[coin].mul(lowQuotaAm)
                .add(cfRegQuotaValue[coin].mul(regQuotaAm))
                .add(cfHighQuotaValue[coin].mul(highQuotaAm))

            let tx = await fundCollectionCreated.connect(acc1).invest(lowQuotaAm, regQuotaAm, highQuotaAm, coin, { value: totalPayment })
            await tx.wait()

            await expect(fundCollectionCreated.connect(acc1).invest(lowQuotaAm, regQuotaAm, highQuotaAm, coin, { value: totalPayment }))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundLowQuotaMaxAmountReached")

            fundCollectionCreated = (await loadFixture(testSetup)).fundCollectionCreated

            lowQuotaAm = 10
            regQuotaAm = cfRegQuotaAmount
            highQuotaAm = 1

            totalPayment = cfLowQuotaValue[coin].mul(lowQuotaAm)
                .add(cfRegQuotaValue[coin].mul(regQuotaAm))
                .add(cfHighQuotaValue[coin].mul(highQuotaAm))

            tx = await fundCollectionCreated.connect(acc1).invest(lowQuotaAm, regQuotaAm, highQuotaAm, coin, { value: totalPayment })
            await tx.wait()

            await expect(fundCollectionCreated.connect(acc1).invest(lowQuotaAm, regQuotaAm, highQuotaAm, coin, { value: totalPayment }))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundRegQuotaMaxAmountReached")

            fundCollectionCreated = (await loadFixture(testSetup)).fundCollectionCreated

            lowQuotaAm = 10
            regQuotaAm = 5
            highQuotaAm = cfHighQuotaAmount

            totalPayment = cfLowQuotaValue[coin].mul(lowQuotaAm)
                .add(cfRegQuotaValue[coin].mul(regQuotaAm))
                .add(cfHighQuotaValue[coin].mul(highQuotaAm))

            tx = await fundCollectionCreated.connect(acc1).invest(lowQuotaAm, regQuotaAm, highQuotaAm, coin, { value: totalPayment })
            await tx.wait()

            await expect(fundCollectionCreated.connect(acc1).invest(lowQuotaAm, regQuotaAm, highQuotaAm, coin, { value: totalPayment }))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundHighQuotaMaxAmountReached")
        })

        it("Should NOT invest in crowdfunding if contract paused", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAm = 10
            const regQuotaAm = 5
            const highQuotaAm = 1
            const coin = 0 // ETH/MATIC

            const totalPayment = cfLowQuotaValue[coin].mul(lowQuotaAm)
                .add(cfRegQuotaValue[coin].mul(regQuotaAm))
                .add(cfHighQuotaValue[coin].mul(highQuotaAm))

            const pausedBefore = await fundCollectionCreated.paused()

            const tx = await fundCollectionCreated.pause()
            await tx.wait()

            const pausedAfter = await fundCollectionCreated.paused()

            expect(pausedBefore).to.equal(false)
            expect(pausedAfter).to.equal(true)
            await expect(fundCollectionCreated.connect(acc1).invest(lowQuotaAm, regQuotaAm, highQuotaAm, coin, { value: totalPayment }))
                .to.be.revertedWith("Pausable: paused")
        })

        it("Should NOT invest in crowdfunding if contract/creator is corrupted", async () => {
            const { management, fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const [creator, acc1] = [accounts[1], accounts[2]]

            const lowQuotaAm = 10
            const regQuotaAm = 5
            const highQuotaAm = 1
            const coin = 0 // ETH/MATIC

            const totalPayment = cfLowQuotaValue[coin].mul(lowQuotaAm)
                .add(cfRegQuotaValue[coin].mul(regQuotaAm))
                .add(cfHighQuotaValue[coin].mul(highQuotaAm))

            const isCorruptedBefore = await management.isCorrupted(creator.address)

            const tx = await management.setCorrupted(creator.address, true)
            await tx.wait()

            const isCorruptedAfter = await management.isCorrupted(creator.address)

            expect(isCorruptedBefore).to.equal(false)
            expect(isCorruptedAfter).to.equal(true)
            await expect(fundCollectionCreated.connect(acc1).invest(lowQuotaAm, regQuotaAm, highQuotaAm, coin, { value: totalPayment }))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundCollectionOrCreatorCorrupted")
        })

        it("Should NOT invest in crowdfunding if not enough coin sent (ETH/MATIC)", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAm = 10
            const regQuotaAm = 5
            const highQuotaAm = 1
            const coin = 0 // ERC20       

            const totalPayment = cfLowQuotaValue[coin].mul(lowQuotaAm)
                .add(cfRegQuotaValue[coin].mul(regQuotaAm))
                .add(cfHighQuotaValue[coin].mul(highQuotaAm))

            await expect(fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, coin, { value: totalPayment.sub(100) }))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundNotEnoughValueSent")
        })

        it("Should NOT invest in crowdfunding if not enough coin sent (ERC20 token)", async () => {
            const { fundCollectionCreated, accounts, erc20 } = await loadFixture(testSetup_withERC20)
            const acc1 = accounts[2]

            const lowQuotaAm = 10
            const regQuotaAm = 5
            const highQuotaAm = 1
            const coin = 1 // ERC20

            const totalPayment = cfLowQuotaValue[coin].mul(lowQuotaAm)
                .add(cfRegQuotaValue[coin].mul(regQuotaAm))
                .add(cfHighQuotaValue[coin].mul(highQuotaAm))

            const tx = await erc20.connect(acc1).approve(
                fundCollectionCreated.address, totalPayment.sub(ethers.utils.parseEther("1"))
            )
            await tx.wait()

            await expect(fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, coin))
                .to.be.revertedWith("ERC20: insufficient allowance")
        })
    })

    describe("investForAddress", () => {
        it("Should invest for given address in crowdfunding (ETH/MATIC)", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const [manager, creator, acc1] = [accounts[0], accounts[1], accounts[2]]

            const lowQuotaAm = 10
            const regQuotaAm = 5
            const highQuotaAm = 1
            const coin = 0 // ETH/MATIC

            //before
            const accBalanceBeforeManager = await ethers.provider.getBalance(manager.address)
            const accBalanceBeforeCreator = await ethers.provider.getBalance(creator.address)
            let quotaInfosLowObj = await fundCollectionCreated.getQuotaInfos(0)
            const quotaInfosLowBefore = {
                value: quotaInfosLowObj.value,
                amount: quotaInfosLowObj.amount.toNumber(),
                bought: quotaInfosLowObj.bought.toNumber(),
                nextTokenId: quotaInfosLowObj.nextTokenId.toNumber()
            }
            let quotaInfosRegObj = await fundCollectionCreated.getQuotaInfos(1)
            const quotaInfosRegBefore = {
                value: quotaInfosRegObj.value,
                amount: quotaInfosRegObj.amount.toNumber(),
                bought: quotaInfosRegObj.bought.toNumber(),
                nextTokenId: quotaInfosRegObj.nextTokenId.toNumber()
            }
            let quotaInfosHighObj = await fundCollectionCreated.getQuotaInfos(2)
            const quotaInfosHighBefore = {
                value: quotaInfosHighObj.value,
                amount: quotaInfosHighObj.amount.toNumber(),
                bought: quotaInfosHighObj.bought.toNumber(),
                nextTokenId: quotaInfosHighObj.nextTokenId.toNumber()
            }
            const soldQuotaAmountBefore = quotaInfosLowBefore.bought + quotaInfosRegBefore.bought + quotaInfosHighBefore.bought
            const nextInvestIdBefore = await fundCollectionCreated.nextInvestId()
            const paymentsPerCoinBefore = await fundCollectionCreated.paymentsPerCoin(acc1.address, coin)
            const investIdsPerInvestorBefore = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            let investIdInfosObj = await fundCollectionCreated.getInvestIdInfos(nextInvestIdBefore)
            const investIdInfosBefore = {
                index: investIdInfosObj.index.toNumber(),
                totalPayment: investIdInfosObj.totalPayment.toNumber(),
                sevenDaysPeriod: investIdInfosObj.sevenDaysPeriod.toNumber(),
                coin: investIdInfosObj.coin,
                investor: investIdInfosObj.investor,
                lowQuotaAmount: investIdInfosObj.lowQuotaAmount.toNumber(),
                regQuotaAmount: investIdInfosObj.regQuotaAmount.toNumber(),
                highQuotaAmount: investIdInfosObj.highQuotaAmount.toNumber()
            }

            const totalPayment = cfLowQuotaValue[coin].mul(lowQuotaAm).add(cfRegQuotaValue[coin].mul(regQuotaAm))
                .add(cfHighQuotaValue[coin].mul(highQuotaAm))

            let tx = await fundCollectionCreated
                .investForAddress(acc1.address, lowQuotaAm, regQuotaAm, highQuotaAm, coin, { value: totalPayment.add(ethers.utils.parseEther("1")) })
            let receipt = await tx.wait()
            const gasValue1 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            //after
            const accBalanceAfterManager = await ethers.provider.getBalance(manager.address)
            quotaInfosLowObj = await fundCollectionCreated.getQuotaInfos(0)
            const quotaInfosLowAfter = {
                value: quotaInfosLowObj.value,
                amount: quotaInfosLowObj.amount.toNumber(),
                bought: quotaInfosLowObj.bought.toNumber(),
                nextTokenId: quotaInfosLowObj.nextTokenId.toNumber()
            }
            quotaInfosRegObj = await fundCollectionCreated.getQuotaInfos(1)
            const quotaInfosRegAfter = {
                value: quotaInfosRegObj.value,
                amount: quotaInfosRegObj.amount.toNumber(),
                bought: quotaInfosRegObj.bought.toNumber(),
                nextTokenId: quotaInfosRegObj.nextTokenId.toNumber()
            }
            quotaInfosHighObj = await fundCollectionCreated.getQuotaInfos(2)
            const quotaInfosHighAfter = {
                value: quotaInfosHighObj.value,
                amount: quotaInfosHighObj.amount.toNumber(),
                bought: quotaInfosHighObj.bought.toNumber(),
                nextTokenId: quotaInfosHighObj.nextTokenId.toNumber()
            }
            const soldQuotaAmountAfter = quotaInfosLowAfter.bought + quotaInfosRegAfter.bought + quotaInfosHighAfter.bought
            const nextInvestIdAfter = await fundCollectionCreated.nextInvestId()
            const paymentsPerCoinAfter = await fundCollectionCreated.paymentsPerCoin(acc1.address, coin)
            const investIdsPerInvestorAfterBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            investIdInfosObj = await fundCollectionCreated.getInvestIdInfos(nextInvestIdBefore)
            const investIdInfosAfter = {
                index: investIdInfosObj.index.toNumber(),
                totalPayment: investIdInfosObj.totalPayment,
                sevenDaysPeriod: investIdInfosObj.sevenDaysPeriod.toNumber(),
                coin: investIdInfosObj.coin,
                investor: investIdInfosObj.investor,
                lowQuotaAmount: investIdInfosObj.lowQuotaAmount.toNumber(),
                regQuotaAmount: investIdInfosObj.regQuotaAmount.toNumber(),
                highQuotaAmount: investIdInfosObj.highQuotaAmount.toNumber()
            }
            const blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp

            const investIdsPerInvestorAfter = investIdsPerInvestorAfterBN.map(elem => elem.toNumber())

            //after 2
            tx = await fundCollectionCreated.connect(creator)
                .investForAddress(acc1.address, lowQuotaAm, regQuotaAm, highQuotaAm, coin,
                    { value: totalPayment.add(ethers.utils.parseEther("1")) })
            receipt = await tx.wait()
            const gasValue2 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            const accBalanceAfterCreator = await ethers.provider.getBalance(creator.address)
            quotaInfosLowObj = await fundCollectionCreated.getQuotaInfos(0)
            const quotaInfosLowAfter2 = {
                value: quotaInfosLowObj.value,
                amount: quotaInfosLowObj.amount.toNumber(),
                bought: quotaInfosLowObj.bought.toNumber(),
                nextTokenId: quotaInfosLowObj.nextTokenId.toNumber()
            }
            quotaInfosRegObj = await fundCollectionCreated.getQuotaInfos(1)
            const quotaInfosRegAfter2 = {
                value: quotaInfosRegObj.value,
                amount: quotaInfosRegObj.amount.toNumber(),
                bought: quotaInfosRegObj.bought.toNumber(),
                nextTokenId: quotaInfosRegObj.nextTokenId.toNumber()
            }
            quotaInfosHighObj = await fundCollectionCreated.getQuotaInfos(2)
            const quotaInfosHighAfter2 = {
                value: quotaInfosHighObj.value,
                amount: quotaInfosHighObj.amount.toNumber(),
                bought: quotaInfosHighObj.bought.toNumber(),
                nextTokenId: quotaInfosHighObj.nextTokenId.toNumber()
            }
            const soldQuotaAmountAfter2 = quotaInfosLowAfter2.bought + quotaInfosRegAfter2.bought + quotaInfosHighAfter2.bought
            const nextInvestIdAfter2 = await fundCollectionCreated.nextInvestId()
            const paymentsPerCoinAfter2 = await fundCollectionCreated.paymentsPerCoin(acc1.address, coin)
            const investIdsPerInvestorAfterBN2 = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            investIdInfosObj = await fundCollectionCreated.getInvestIdInfos(nextInvestIdAfter)
            const investIdInfosAfter2 = {
                index: investIdInfosObj.index.toNumber(),
                totalPayment: investIdInfosObj.totalPayment,
                sevenDaysPeriod: investIdInfosObj.sevenDaysPeriod.toNumber(),
                coin: investIdInfosObj.coin,
                investor: investIdInfosObj.investor,
                lowQuotaAmount: investIdInfosObj.lowQuotaAmount.toNumber(),
                regQuotaAmount: investIdInfosObj.regQuotaAmount.toNumber(),
                highQuotaAmount: investIdInfosObj.highQuotaAmount.toNumber()
            }
            const blockTimestamp2 = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp

            const investIdsPerInvestorAfter2 = investIdsPerInvestorAfterBN2.map(elem => elem.toNumber())

            //assertions before
            expect(accBalanceBeforeManager).to.equal(ethers.utils.parseEther("10000"))
            expect(accBalanceBeforeCreator).to.equal(ethers.utils.parseEther("10000"))
            expect(quotaInfosLowBefore.bought).to.equal(0)
            expect(quotaInfosRegBefore.bought).to.equal(0)
            expect(quotaInfosHighBefore.bought).to.equal(0)
            expect(soldQuotaAmountBefore).to.equal(0)
            expect(nextInvestIdBefore.toNumber()).to.equal(1)
            expect(paymentsPerCoinBefore.toNumber()).to.equal(0)
            expect(investIdInfosBefore.sevenDaysPeriod).to.equal(0)
            expect(investIdsPerInvestorBefore).to.be.an("array").that.is.empty
            expect(investIdInfosBefore.lowQuotaAmount).to.equal(0)
            expect(investIdInfosBefore.regQuotaAmount).to.equal(0)
            expect(investIdInfosBefore.highQuotaAmount).to.equal(0)
            expect(investIdInfosBefore.coin).to.equal(0)

            //assertions after
            expect(accBalanceAfterManager).to.equal(accBalanceBeforeManager.sub(totalPayment.add(gasValue1)))
            expect(quotaInfosLowAfter.bought).to.equal(lowQuotaAm)
            expect(quotaInfosRegAfter.bought).to.equal(regQuotaAm)
            expect(quotaInfosHighAfter.bought).to.equal(highQuotaAm)
            expect(soldQuotaAmountAfter).to.equal(lowQuotaAm + regQuotaAm + highQuotaAm)
            expect(nextInvestIdAfter.toNumber()).to.equal(nextInvestIdBefore.toNumber() + 1)
            expect(paymentsPerCoinAfter).to.equal(totalPayment)
            expect(investIdInfosAfter.sevenDaysPeriod).to.equal(blockTimestamp + 7 * 24 * 60 * 60)
            expect(investIdsPerInvestorAfter).to.have.same.members([1])
            expect(investIdInfosAfter.lowQuotaAmount).to.equal(lowQuotaAm)
            expect(investIdInfosAfter.regQuotaAmount).to.equal(regQuotaAm)
            expect(investIdInfosAfter.highQuotaAmount).to.equal(highQuotaAm)
            expect(investIdInfosAfter.coin).to.equal(coin)

            //assertions after2
            expect(accBalanceAfterCreator).to.equal(accBalanceBeforeCreator.sub(totalPayment.add(gasValue2)))
            expect(quotaInfosLowAfter2.bought).to.equal(2 * lowQuotaAm)
            expect(quotaInfosRegAfter2.bought).to.equal(2 * regQuotaAm)
            expect(quotaInfosHighAfter2.bought).to.equal(2 * highQuotaAm)
            expect(soldQuotaAmountAfter2).to.equal(2 * (lowQuotaAm + regQuotaAm + highQuotaAm))
            expect(nextInvestIdAfter2.toNumber()).to.equal(nextInvestIdAfter.toNumber() + 1)
            expect(paymentsPerCoinAfter2).to.equal(totalPayment.mul(2))
            expect(investIdInfosAfter2.sevenDaysPeriod).to.equal(blockTimestamp2 + 7 * 24 * 60 * 60)
            expect(investIdsPerInvestorAfter2).to.have.same.members([1, 2])
            expect(investIdInfosAfter2.lowQuotaAmount).to.equal(lowQuotaAm)
            expect(investIdInfosAfter2.regQuotaAmount).to.equal(regQuotaAm)
            expect(investIdInfosAfter2.highQuotaAmount).to.equal(highQuotaAm)
            expect(investIdInfosAfter2.coin).to.equal(coin)
        })

        it("Should invest for given address in crowdfunding (ETH/MATIC) when creator corrupted if caller is manager", async () => {
            const { management, fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const [manager, creator, acc1] = [accounts[0], accounts[1], accounts[2]]

            const lowQuotaAm = 10
            const regQuotaAm = 5
            const highQuotaAm = 1
            const coin = 0 // ETH/MATIC

            //before
            const accBalanceBeforeManager = await ethers.provider.getBalance(manager.address)
            let quotaInfosLowObj = await fundCollectionCreated.getQuotaInfos(0)
            const quotaInfosLowBefore = {
                value: quotaInfosLowObj.value,
                amount: quotaInfosLowObj.amount.toNumber(),
                bought: quotaInfosLowObj.bought.toNumber(),
                nextTokenId: quotaInfosLowObj.nextTokenId.toNumber()
            }
            let quotaInfosRegObj = await fundCollectionCreated.getQuotaInfos(1)
            const quotaInfosRegBefore = {
                value: quotaInfosRegObj.value,
                amount: quotaInfosRegObj.amount.toNumber(),
                bought: quotaInfosRegObj.bought.toNumber(),
                nextTokenId: quotaInfosRegObj.nextTokenId.toNumber()
            }
            let quotaInfosHighObj = await fundCollectionCreated.getQuotaInfos(2)
            const quotaInfosHighBefore = {
                value: quotaInfosHighObj.value,
                amount: quotaInfosHighObj.amount.toNumber(),
                bought: quotaInfosHighObj.bought.toNumber(),
                nextTokenId: quotaInfosHighObj.nextTokenId.toNumber()
            }
            const soldQuotaAmountBefore = quotaInfosLowBefore.bought + quotaInfosRegBefore.bought + quotaInfosHighBefore.bought
            const nextInvestIdBefore = await fundCollectionCreated.nextInvestId()
            const paymentsPerCoinBefore = await fundCollectionCreated.paymentsPerCoin(acc1.address, coin)
            const investIdsPerInvestorBefore = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            let investIdInfosObj = await fundCollectionCreated.getInvestIdInfos(nextInvestIdBefore)
            const investIdInfosBefore = {
                index: investIdInfosObj.index.toNumber(),
                totalPayment: investIdInfosObj.totalPayment.toNumber(),
                sevenDaysPeriod: investIdInfosObj.sevenDaysPeriod.toNumber(),
                coin: investIdInfosObj.coin,
                investor: investIdInfosObj.investor,
                lowQuotaAmount: investIdInfosObj.lowQuotaAmount.toNumber(),
                regQuotaAmount: investIdInfosObj.regQuotaAmount.toNumber(),
                highQuotaAmount: investIdInfosObj.highQuotaAmount.toNumber()
            }

            const totalPayment = cfLowQuotaValue[coin].mul(lowQuotaAm)
                .add(cfRegQuotaValue[coin].mul(regQuotaAm))
                .add(cfHighQuotaValue[coin].mul(highQuotaAm))

            let tx = await management.setCorrupted(creator.address, true)
            let receipt = await tx.wait()
            const gasValue1 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            tx = await fundCollectionCreated
                .investForAddress(acc1.address, lowQuotaAm, regQuotaAm, highQuotaAm, coin, { value: totalPayment.add(ethers.utils.parseEther("1")) })
            receipt = await tx.wait()
            const gasValue2 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            const gasValue = gasValue1.add(gasValue2)

            //after
            const accBalanceAfterManager = await ethers.provider.getBalance(manager.address)
            quotaInfosLowObj = await fundCollectionCreated.getQuotaInfos(0)
            const quotaInfosLowAfter = {
                value: quotaInfosLowObj.value,
                amount: quotaInfosLowObj.amount.toNumber(),
                bought: quotaInfosLowObj.bought.toNumber(),
                nextTokenId: quotaInfosLowObj.nextTokenId.toNumber()
            }
            quotaInfosRegObj = await fundCollectionCreated.getQuotaInfos(1)
            const quotaInfosRegAfter = {
                value: quotaInfosRegObj.value,
                amount: quotaInfosRegObj.amount.toNumber(),
                bought: quotaInfosRegObj.bought.toNumber(),
                nextTokenId: quotaInfosRegObj.nextTokenId.toNumber()
            }
            quotaInfosHighObj = await fundCollectionCreated.getQuotaInfos(2)
            const quotaInfosHighAfter = {
                value: quotaInfosHighObj.value,
                amount: quotaInfosHighObj.amount.toNumber(),
                bought: quotaInfosHighObj.bought.toNumber(),
                nextTokenId: quotaInfosHighObj.nextTokenId.toNumber()
            }
            const soldQuotaAmountAfter = quotaInfosLowAfter.bought + quotaInfosRegAfter.bought + quotaInfosHighAfter.bought
            const nextInvestIdAfter = await fundCollectionCreated.nextInvestId()
            const paymentsPerCoinAfter = await fundCollectionCreated.paymentsPerCoin(acc1.address, coin)
            const investIdsPerInvestorAfterBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            investIdInfosObj = await fundCollectionCreated.getInvestIdInfos(nextInvestIdBefore)
            const investIdInfosAfter = {
                index: investIdInfosObj.index.toNumber(),
                totalPayment: investIdInfosObj.totalPayment,
                sevenDaysPeriod: investIdInfosObj.sevenDaysPeriod.toNumber(),
                coin: investIdInfosObj.coin,
                investor: investIdInfosObj.investor,
                lowQuotaAmount: investIdInfosObj.lowQuotaAmount.toNumber(),
                regQuotaAmount: investIdInfosObj.regQuotaAmount.toNumber(),
                highQuotaAmount: investIdInfosObj.highQuotaAmount.toNumber()
            }
            const blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp

            const investIdsPerInvestorAfter = investIdsPerInvestorAfterBN.map(elem => elem.toNumber())

            //assertions before
            expect(accBalanceBeforeManager).to.equal(ethers.utils.parseEther("10000"))
            expect(quotaInfosLowBefore.bought).to.equal(0)
            expect(quotaInfosRegBefore.bought).to.equal(0)
            expect(quotaInfosHighBefore.bought).to.equal(0)
            expect(soldQuotaAmountBefore).to.equal(0)
            expect(nextInvestIdBefore.toNumber()).to.equal(1)
            expect(paymentsPerCoinBefore.toNumber()).to.equal(0)
            expect(investIdInfosBefore.sevenDaysPeriod).to.equal(0)
            expect(investIdsPerInvestorBefore).to.be.an("array").that.is.empty
            expect(investIdInfosBefore.lowQuotaAmount).to.equal(0)
            expect(investIdInfosBefore.regQuotaAmount).to.equal(0)
            expect(investIdInfosBefore.highQuotaAmount).to.equal(0)
            expect(investIdInfosBefore.coin).to.equal(0)

            //assertions after
            expect(accBalanceAfterManager).to.equal(accBalanceBeforeManager.sub(totalPayment.add(gasValue)))
            expect(quotaInfosLowAfter.bought).to.equal(lowQuotaAm)
            expect(quotaInfosRegAfter.bought).to.equal(regQuotaAm)
            expect(quotaInfosHighAfter.bought).to.equal(highQuotaAm)
            expect(soldQuotaAmountAfter).to.equal(lowQuotaAm + regQuotaAm + highQuotaAm)
            expect(nextInvestIdAfter.toNumber()).to.equal(nextInvestIdBefore.toNumber() + 1)
            expect(paymentsPerCoinAfter).to.equal(totalPayment)
            expect(investIdInfosAfter.sevenDaysPeriod).to.equal(blockTimestamp + 7 * 24 * 60 * 60)
            expect(investIdsPerInvestorAfter).to.have.same.members([1])
            expect(investIdInfosAfter.lowQuotaAmount).to.equal(lowQuotaAm)
            expect(investIdInfosAfter.regQuotaAmount).to.equal(regQuotaAm)
            expect(investIdInfosAfter.highQuotaAmount).to.equal(highQuotaAm)
            expect(investIdInfosAfter.coin).to.equal(coin)
        })

        it("Should invest for given address in crowdfunding (ERC20 token)", async () => {
            const { fundCollectionCreated, accounts, erc20 } = await loadFixture(testSetup_withERC20)
            const [manager, creator, acc1] = [accounts[0], accounts[1], accounts[2]]

            const lowQuotaAm = 10
            const regQuotaAm = 5
            const highQuotaAm = 1
            const coin = 1 // ERC20

            const balanceBeforeManager = await erc20.balanceOf(manager.address)
            const balanceBeforeCreator = await erc20.balanceOf(creator.address)

            const totalPaymentManager = cfLowQuotaValue[coin].mul(lowQuotaAm)
            const totalPaymentCreator = cfRegQuotaValue[coin].mul(regQuotaAm)
                .add(cfHighQuotaValue[coin].mul(highQuotaAm))

            let tx = await fundCollectionCreated
                .investForAddress(acc1.address, lowQuotaAm, 0, 0, coin)
            await tx.wait()
            tx = await fundCollectionCreated.connect(creator)
                .investForAddress(acc1.address, 0, regQuotaAm, highQuotaAm, coin)
            await tx.wait()

            const balanceAfterManager = await erc20.balanceOf(manager.address)
            const balanceAfterCreator = await erc20.balanceOf(creator.address)

            expect(balanceAfterManager).to.equal(balanceBeforeManager.sub(totalPaymentManager))
            expect(balanceAfterCreator).to.equal(balanceBeforeCreator.sub(totalPaymentCreator))
        })

        it("Should NOT invest for given address in crowdfunding if due date has past", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAm = 10
            const regQuotaAm = 5
            const highQuotaAm = 1
            const coin = 0 // ETH/MATIC

            const totalPayment = cfLowQuotaValue[coin].mul(lowQuotaAm)
                .add(cfRegQuotaValue[coin].mul(regQuotaAm))
                .add(cfHighQuotaValue[coin].mul(highQuotaAm))

            const unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60;
            await time.increaseTo(unlockTime);

            await expect(fundCollectionCreated.investForAddress(acc1.address, lowQuotaAm, regQuotaAm, highQuotaAm, coin, { value: totalPayment }))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundPastDue")
        })

        it("Should NOT invest for given address in crowdfunding if there is no more quotas", async () => {
            let { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            let lowQuotaAm = cfLowQuotaAmount
            let regQuotaAm = 5
            let highQuotaAm = 1
            const coin = 0 // ETH/MATIC

            let totalPayment = cfLowQuotaValue[coin].mul(lowQuotaAm)
                .add(cfRegQuotaValue[coin].mul(regQuotaAm))
                .add(cfHighQuotaValue[coin].mul(highQuotaAm))

            let tx = await fundCollectionCreated.connect(acc1).invest(lowQuotaAm, regQuotaAm, highQuotaAm, coin, { value: totalPayment })
            await tx.wait()

            await expect(fundCollectionCreated.investForAddress(acc1.address, lowQuotaAm, regQuotaAm, highQuotaAm, coin, { value: totalPayment }))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundLowQuotaMaxAmountReached")

            fundCollectionCreated = (await loadFixture(testSetup)).fundCollectionCreated

            lowQuotaAm = 10
            regQuotaAm = cfRegQuotaAmount
            highQuotaAm = 1

            totalPayment = cfLowQuotaValue[coin].mul(lowQuotaAm)
                .add(cfRegQuotaValue[coin].mul(regQuotaAm))
                .add(cfHighQuotaValue[coin].mul(highQuotaAm))

            tx = await fundCollectionCreated.connect(acc1).invest(lowQuotaAm, regQuotaAm, highQuotaAm, coin, { value: totalPayment })
            await tx.wait()

            await expect(fundCollectionCreated.investForAddress(acc1.address, lowQuotaAm, regQuotaAm, highQuotaAm, coin, { value: totalPayment }))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundRegQuotaMaxAmountReached")

            fundCollectionCreated = (await loadFixture(testSetup)).fundCollectionCreated

            lowQuotaAm = 10
            regQuotaAm = 5
            highQuotaAm = cfHighQuotaAmount

            totalPayment = cfLowQuotaValue[coin].mul(lowQuotaAm)
                .add(cfRegQuotaValue[coin].mul(regQuotaAm))
                .add(cfHighQuotaValue[coin].mul(highQuotaAm))

            tx = await fundCollectionCreated.connect(acc1).invest(lowQuotaAm, regQuotaAm, highQuotaAm, coin, { value: totalPayment })
            await tx.wait()

            await expect(fundCollectionCreated.investForAddress(acc1.address, lowQuotaAm, regQuotaAm, highQuotaAm, coin, { value: totalPayment }))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundHighQuotaMaxAmountReached")
        })

        it("Should NOT invest for given address in crowdfunding if contract paused", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAm = 10
            const regQuotaAm = 5
            const highQuotaAm = 1
            const coin = 0 // ETH/MATIC

            const totalPayment = cfLowQuotaValue[coin].mul(lowQuotaAm)
                .add(cfRegQuotaValue[coin].mul(regQuotaAm))
                .add(cfHighQuotaValue[coin].mul(highQuotaAm))

            const pausedBefore = await fundCollectionCreated.paused()

            const tx = await fundCollectionCreated.pause()
            await tx.wait()

            const pausedAfter = await fundCollectionCreated.paused()

            expect(pausedBefore).to.equal(false)
            expect(pausedAfter).to.equal(true)
            await expect(fundCollectionCreated.investForAddress(acc1.address, lowQuotaAm, regQuotaAm, highQuotaAm, coin, { value: totalPayment }))
                .to.be.revertedWith("Pausable: paused")
        })

        it("Should NOT invest for given address in crowdfunding if caller is not manager when creator corrupted", async () => {
            const { management, fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const [creator, acc1] = [accounts[1], accounts[2]]

            const lowQuotaAm = 10
            const regQuotaAm = 5
            const highQuotaAm = 1
            const coin = 0 // ETH/MATIC

            const totalPayment = cfLowQuotaValue[coin].mul(lowQuotaAm)
                .add(cfRegQuotaValue[coin].mul(regQuotaAm))
                .add(cfHighQuotaValue[coin].mul(highQuotaAm))

            const isCorruptedBefore = await management.isCorrupted(creator.address)

            const tx = await management.setCorrupted(creator.address, true)
            await tx.wait()

            const isCorruptedAfter = await management.isCorrupted(creator.address)

            expect(isCorruptedBefore).to.equal(false)
            expect(isCorruptedAfter).to.equal(true)
            await expect(fundCollectionCreated.connect(acc1).investForAddress(
                acc1.address, lowQuotaAm, regQuotaAm, highQuotaAm, coin, { value: totalPayment })
            ).to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundNotAllowed")
        })

        it("Should NOT invest for given address in crowdfunding if not enough coin sent (ETH/MATIC)", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAm = 10
            const regQuotaAm = 5
            const highQuotaAm = 1
            const coin = 0 // ERC20       

            const totalPayment = cfLowQuotaValue[coin].mul(lowQuotaAm)
                .add(cfRegQuotaValue[coin].mul(regQuotaAm))
                .add(cfHighQuotaValue[coin].mul(highQuotaAm))

            await expect(fundCollectionCreated
                .investForAddress(acc1.address, lowQuotaAm, regQuotaAm, highQuotaAm, coin, { value: totalPayment.sub(100) }))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundNotEnoughValueSent")
        })

        it("Should NOT invest for given address in crowdfunding if not enough coin sent (ERC20 token)", async () => {
            const { fundCollectionCreated, accounts, erc20 } = await loadFixture(testSetup_withERC20)
            const acc1 = accounts[2]

            const lowQuotaAm = 10
            const regQuotaAm = 5
            const highQuotaAm = 1
            const coin = 1 // ERC20

            const totalPayment = cfLowQuotaValue[coin].mul(lowQuotaAm)
                .add(cfRegQuotaValue[coin].mul(regQuotaAm))
                .add(cfHighQuotaValue[coin].mul(highQuotaAm))

            const tx = await erc20.approve(
                fundCollectionCreated.address, totalPayment.sub(ethers.utils.parseEther("1"))
            )
            await tx.wait()

            await expect(fundCollectionCreated
                .investForAddress(acc1.address, lowQuotaAm, regQuotaAm, highQuotaAm, coin))
                .to.be.revertedWith("ERC20: insufficient allowance")
        })
    })

    describe("donate", () => {
        it("Should make donation", async () => {
            const { fundCollectionCreated, accounts, erc20 } = await loadFixture(testSetup_withERC20)
            const acc1 = accounts[2]
            const donation = ethers.utils.parseEther("1")

            const balanceBeforeETHAcc = await ethers.provider.getBalance(acc1.address)
            const balanceBeforeERC20Acc = await erc20.balanceOf(acc1.address)
            const balanceBeforeETHFund = await ethers.provider.getBalance(fundCollectionCreated.address)
            const balanceBeforeERC20Fund = await erc20.balanceOf(fundCollectionCreated.address)
            const balanceBeforeETHAccFund = await fundCollectionCreated.paymentsPerCoin(acc1.address, 0)
            const balanceBeforeERC20AccFund = await fundCollectionCreated.paymentsPerCoin(acc1.address, 1)
            const investIDsBeforeBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIDsBefore = investIDsBeforeBN.map(elem => elem.toNumber())

            let tx = await fundCollectionCreated.connect(acc1).donate(0, 0, { value: donation })
            const receipt1 = await tx.wait()
            const gasValue1 = receipt1.cumulativeGasUsed.mul(receipt1.effectiveGasPrice)

            tx = await fundCollectionCreated.connect(acc1).donate(donation, 0, { value: donation })
            const receipt2 = await tx.wait()
            const gasValue2 = receipt2.cumulativeGasUsed.mul(receipt2.effectiveGasPrice)

            tx = await fundCollectionCreated.connect(acc1).donate(donation, 1)
            const receipt3 = await tx.wait()
            const gasValue3 = receipt3.cumulativeGasUsed.mul(receipt3.effectiveGasPrice)

            const totalGas = gasValue1.add(gasValue2).add(gasValue3)

            const balanceAfterETHAcc = await ethers.provider.getBalance(acc1.address)
            const balanceAfterERC20Acc = await erc20.balanceOf(acc1.address)
            const balanceAfterETHFund = await ethers.provider.getBalance(fundCollectionCreated.address)
            const balanceAfterERC20Fund = await erc20.balanceOf(fundCollectionCreated.address)
            const balanceAfterETHAccFund = await fundCollectionCreated.paymentsPerCoin(acc1.address, 0)
            const balanceAfterERC20AccFund = await fundCollectionCreated.paymentsPerCoin(acc1.address, 1)
            const investIDsAfterBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIDsAfter = investIDsAfterBN.map(elem => elem.toNumber())
            const invesdIDsInfo = {
                [investIDsAfter[0]]: await fundCollectionCreated.getInvestIdInfos(investIDsAfter[0]),
                [investIDsAfter[1]]: await fundCollectionCreated.getInvestIdInfos(investIDsAfter[1]),
                [investIDsAfter[2]]: await fundCollectionCreated.getInvestIdInfos(investIDsAfter[2])
            }

            const quotasPerInvestIdLow = [
                invesdIDsInfo[investIDsAfter[0]].lowQuotaAmount.toNumber(),
                invesdIDsInfo[investIDsAfter[1]].lowQuotaAmount.toNumber(),
                invesdIDsInfo[investIDsAfter[2]].lowQuotaAmount.toNumber()
            ]
            const quotasPerInvestIdReg = [
                invesdIDsInfo[investIDsAfter[0]].regQuotaAmount.toNumber(),
                invesdIDsInfo[investIDsAfter[1]].regQuotaAmount.toNumber(),
                invesdIDsInfo[investIDsAfter[2]].regQuotaAmount.toNumber()
            ]
            const quotasPerInvestIdHigh = [
                invesdIDsInfo[investIDsAfter[0]].highQuotaAmount.toNumber(),
                invesdIDsInfo[investIDsAfter[1]].highQuotaAmount.toNumber(),
                invesdIDsInfo[investIDsAfter[2]].highQuotaAmount.toNumber()
            ]

            expect(balanceBeforeETHAcc).to.equal(ethers.utils.parseEther("10000"))
            expect(balanceAfterETHAcc).to.equal(balanceBeforeETHAcc.sub(donation).sub(donation).sub(totalGas))
            expect(balanceBeforeERC20Acc).to.equal(balanceAfterERC20Acc.add(donation))
            expect(balanceBeforeETHFund.toNumber()).to.equal(0)
            expect(balanceAfterETHFund).to.equal(donation.mul(2))
            expect(balanceBeforeERC20Fund.toNumber()).to.equal(0)
            expect(balanceAfterERC20Fund).to.equal(donation)
            expect(balanceBeforeETHAccFund.toNumber()).to.equal(0)
            expect(balanceAfterETHAccFund).to.equal(donation.mul(2))
            expect(balanceBeforeERC20AccFund.toNumber()).to.equal(0)
            expect(balanceAfterERC20AccFund).to.equal(donation)
            expect(investIDsBefore).to.be.an("array").that.is.empty
            expect(investIDsAfter).to.have.same.members([1, 2, 3])
            expect(quotasPerInvestIdLow).to.have.same.members([0, 0, 0])
            expect(quotasPerInvestIdReg).to.have.same.members([0, 0, 0])
            expect(quotasPerInvestIdHigh).to.have.same.members([0, 0, 0])
        })

        it("Should NOT make donation when contract paused", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]
            const donation = ethers.utils.parseEther("1")

            let tx = await fundCollectionCreated.pause()
            await tx.wait()

            await expect(fundCollectionCreated.connect(acc1).donate(0, 0, { value: donation }))
                .to.be.revertedWith("Pausable: paused")
        })

        it("Should NOT make donation when contract/creator is corrupted", async () => {
            const { management, fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const [creator, acc1] = [accounts[1], accounts[2]]
            const donation = ethers.utils.parseEther("1")

            let tx = await management.setCorrupted(creator.address, true)
            await tx.wait()

            await expect(fundCollectionCreated.connect(acc1).donate(0, 0, { value: donation }))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundCollectionOrCreatorCorrupted")
        })

        it("Should NOT make donation when crowdfund is past due", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]
            const donation = ethers.utils.parseEther("1")

            const unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 1;
            await time.increaseTo(unlockTime);

            await expect(fundCollectionCreated.connect(acc1).donate(0, 0, { value: donation }))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundPastDue")
        })
    })

    describe("donateForAddress", () => {
        it("Should make donation for given address", async () => {
            const { fundCollectionCreated, accounts, erc20 } = await loadFixture(testSetup_withERC20)
            const [manager, creator, acc1] = [accounts[0], accounts[1], accounts[2]]
            const donation = ethers.utils.parseEther("1")

            // Manager
            let balanceBeforeETHAcc = await ethers.provider.getBalance(manager.address)
            let balanceBeforeERC20Acc = await erc20.balanceOf(manager.address)
            let balanceBeforeETHFund = await ethers.provider.getBalance(fundCollectionCreated.address)
            let balanceBeforeERC20Fund = await erc20.balanceOf(fundCollectionCreated.address)
            let balanceBeforeETHAccFund = await fundCollectionCreated.paymentsPerCoin(acc1.address, 0)
            let balanceBeforeERC20AccFund = await fundCollectionCreated.paymentsPerCoin(acc1.address, 1)
            let investIDsBeforeBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            let investIDsBefore = investIDsBeforeBN.map(elem => elem.toNumber())

            let tx = await fundCollectionCreated.donateForAddress(acc1.address, 0, 0, { value: donation })
            let receipt1 = await tx.wait()
            let gasValue1 = receipt1.cumulativeGasUsed.mul(receipt1.effectiveGasPrice)

            tx = await fundCollectionCreated.donateForAddress(acc1.address, donation, 0, { value: donation })
            let receipt2 = await tx.wait()
            let gasValue2 = receipt2.cumulativeGasUsed.mul(receipt2.effectiveGasPrice)

            tx = await fundCollectionCreated.donateForAddress(acc1.address, donation, 1)
            let receipt3 = await tx.wait()
            let gasValue3 = receipt3.cumulativeGasUsed.mul(receipt3.effectiveGasPrice)

            let totalGas = gasValue1.add(gasValue2).add(gasValue3)

            let balanceAfterETHAcc = await ethers.provider.getBalance(manager.address)
            let balanceAfterERC20Acc = await erc20.balanceOf(manager.address)
            let balanceAfterETHFund = await ethers.provider.getBalance(fundCollectionCreated.address)
            let balanceAfterERC20Fund = await erc20.balanceOf(fundCollectionCreated.address)
            let balanceAfterETHAccFund = await fundCollectionCreated.paymentsPerCoin(acc1.address, 0)
            let balanceAfterERC20AccFund = await fundCollectionCreated.paymentsPerCoin(acc1.address, 1)
            let investIDsAfterBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            let investIDsAfter = investIDsAfterBN.map(elem => elem.toNumber())
            let invesdIDsInfo = {
                [investIDsAfter[0]]: await fundCollectionCreated.getInvestIdInfos(investIDsAfter[0]),
                [investIDsAfter[1]]: await fundCollectionCreated.getInvestIdInfos(investIDsAfter[1]),
                [investIDsAfter[2]]: await fundCollectionCreated.getInvestIdInfos(investIDsAfter[2])
            }

            let quotasPerInvestIdLow = [
                invesdIDsInfo[investIDsAfter[0]].lowQuotaAmount.toNumber(),
                invesdIDsInfo[investIDsAfter[1]].lowQuotaAmount.toNumber(),
                invesdIDsInfo[investIDsAfter[2]].lowQuotaAmount.toNumber()
            ]
            let quotasPerInvestIdReg = [
                invesdIDsInfo[investIDsAfter[0]].regQuotaAmount.toNumber(),
                invesdIDsInfo[investIDsAfter[1]].regQuotaAmount.toNumber(),
                invesdIDsInfo[investIDsAfter[2]].regQuotaAmount.toNumber()
            ]
            let quotasPerInvestIdHigh = [
                invesdIDsInfo[investIDsAfter[0]].highQuotaAmount.toNumber(),
                invesdIDsInfo[investIDsAfter[1]].highQuotaAmount.toNumber(),
                invesdIDsInfo[investIDsAfter[2]].highQuotaAmount.toNumber()
            ]

            expect(balanceBeforeETHAcc).to.equal(ethers.utils.parseEther("10000"))
            expect(balanceAfterETHAcc).to.equal(balanceBeforeETHAcc.sub(donation).sub(donation).sub(totalGas))
            expect(balanceBeforeERC20Acc).to.equal(balanceAfterERC20Acc.add(donation))
            expect(balanceBeforeETHFund.toNumber()).to.equal(0)
            expect(balanceAfterETHFund).to.equal(donation.mul(2))
            expect(balanceBeforeERC20Fund.toNumber()).to.equal(0)
            expect(balanceAfterERC20Fund).to.equal(donation)
            expect(balanceBeforeETHAccFund.toNumber()).to.equal(0)
            expect(balanceAfterETHAccFund).to.equal(donation.mul(2))
            expect(balanceBeforeERC20AccFund.toNumber()).to.equal(0)
            expect(balanceAfterERC20AccFund).to.equal(donation)
            expect(investIDsBefore).to.be.an("array").that.is.empty
            expect(investIDsAfter).to.have.same.members([1, 2, 3])
            expect(quotasPerInvestIdLow).to.have.same.members([0, 0, 0])
            expect(quotasPerInvestIdReg).to.have.same.members([0, 0, 0])
            expect(quotasPerInvestIdHigh).to.have.same.members([0, 0, 0])

            // Creator
            balanceBeforeETHAcc = await ethers.provider.getBalance(creator.address)
            balanceBeforeERC20Acc = await erc20.balanceOf(creator.address)
            balanceBeforeETHFund = await ethers.provider.getBalance(fundCollectionCreated.address)
            balanceBeforeERC20Fund = await erc20.balanceOf(fundCollectionCreated.address)
            balanceBeforeETHAccFund = await fundCollectionCreated.paymentsPerCoin(acc1.address, 0)
            balanceBeforeERC20AccFund = await fundCollectionCreated.paymentsPerCoin(acc1.address, 1)
            investIDsBeforeBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            investIDsBefore = investIDsBeforeBN.map(elem => elem.toNumber())

            tx = await fundCollectionCreated.connect(creator).donateForAddress(acc1.address, 0, 0, { value: donation })
            receipt1 = await tx.wait()
            gasValue1 = receipt1.cumulativeGasUsed.mul(receipt1.effectiveGasPrice)

            tx = await fundCollectionCreated.connect(creator).donateForAddress(acc1.address, donation, 0, { value: donation })
            receipt2 = await tx.wait()
            gasValue2 = receipt2.cumulativeGasUsed.mul(receipt2.effectiveGasPrice)

            tx = await fundCollectionCreated.connect(creator).donateForAddress(acc1.address, donation, 1)
            receipt3 = await tx.wait()
            gasValue3 = receipt3.cumulativeGasUsed.mul(receipt3.effectiveGasPrice)

            totalGas = gasValue1.add(gasValue2).add(gasValue3)

            balanceAfterETHAcc = await ethers.provider.getBalance(creator.address)
            balanceAfterERC20Acc = await erc20.balanceOf(creator.address)
            balanceAfterETHFund = await ethers.provider.getBalance(fundCollectionCreated.address)
            balanceAfterERC20Fund = await erc20.balanceOf(fundCollectionCreated.address)
            balanceAfterETHAccFund = await fundCollectionCreated.paymentsPerCoin(acc1.address, 0)
            balanceAfterERC20AccFund = await fundCollectionCreated.paymentsPerCoin(acc1.address, 1)
            investIDsAfterBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            investIDsAfter = investIDsAfterBN.map(elem => elem.toNumber())
            invesdIDsInfo = {
                [investIDsAfter[0]]: await fundCollectionCreated.getInvestIdInfos(investIDsAfter[0]),
                [investIDsAfter[1]]: await fundCollectionCreated.getInvestIdInfos(investIDsAfter[1]),
                [investIDsAfter[2]]: await fundCollectionCreated.getInvestIdInfos(investIDsAfter[2])
            }

            quotasPerInvestIdLow = [
                invesdIDsInfo[investIDsAfter[0]].lowQuotaAmount.toNumber(),
                invesdIDsInfo[investIDsAfter[1]].lowQuotaAmount.toNumber(),
                invesdIDsInfo[investIDsAfter[2]].lowQuotaAmount.toNumber()
            ]
            quotasPerInvestIdReg = [
                invesdIDsInfo[investIDsAfter[0]].regQuotaAmount.toNumber(),
                invesdIDsInfo[investIDsAfter[1]].regQuotaAmount.toNumber(),
                invesdIDsInfo[investIDsAfter[2]].regQuotaAmount.toNumber()
            ]
            quotasPerInvestIdHigh = [
                invesdIDsInfo[investIDsAfter[0]].highQuotaAmount.toNumber(),
                invesdIDsInfo[investIDsAfter[1]].highQuotaAmount.toNumber(),
                invesdIDsInfo[investIDsAfter[2]].highQuotaAmount.toNumber()
            ]

            expect(balanceBeforeETHAcc).to.equal(ethers.utils.parseEther("10000"))
            expect(balanceAfterETHAcc).to.equal(balanceBeforeETHAcc.sub(donation).sub(donation).sub(totalGas))
            expect(balanceBeforeERC20Acc).to.equal(balanceAfterERC20Acc.add(donation))
            expect(balanceBeforeETHFund).to.equal(donation.mul(2))
            expect(balanceAfterETHFund).to.equal(donation.mul(4))
            expect(balanceBeforeERC20Fund).to.equal(donation)
            expect(balanceAfterERC20Fund).to.equal(donation.mul(2))
            expect(balanceBeforeETHAccFund).to.equal(donation.mul(2))
            expect(balanceAfterETHAccFund).to.equal(donation.mul(4))
            expect(balanceBeforeERC20AccFund).to.equal(donation)
            expect(balanceAfterERC20AccFund).to.equal(donation.mul(2))
            expect(investIDsBefore).to.have.same.members([1, 2, 3])
            expect(investIDsAfter).to.have.same.members([1, 2, 3, 4, 5, 6])
            expect(quotasPerInvestIdLow).to.have.same.members([0, 0, 0])
            expect(quotasPerInvestIdReg).to.have.same.members([0, 0, 0])
            expect(quotasPerInvestIdHigh).to.have.same.members([0, 0, 0])
        })

        it("Should make donation for given address when creator corrupted if caller is manager", async () => {
            const { management, fundCollectionCreated, accounts, erc20 } = await loadFixture(testSetup_withERC20)
            const [manager, creator, acc1] = [accounts[0], accounts[1], accounts[2]]
            const donation = ethers.utils.parseEther("1")

            const balanceBeforeETHAcc = await ethers.provider.getBalance(manager.address)
            const balanceBeforeERC20Acc = await erc20.balanceOf(manager.address)
            const balanceBeforeETHFund = await ethers.provider.getBalance(fundCollectionCreated.address)
            const balanceBeforeERC20Fund = await erc20.balanceOf(fundCollectionCreated.address)
            const balanceBeforeETHAccFund = await fundCollectionCreated.paymentsPerCoin(acc1.address, 0)
            const balanceBeforeERC20AccFund = await fundCollectionCreated.paymentsPerCoin(acc1.address, 1)
            const investIDsBeforeBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIDsBefore = investIDsBeforeBN.map(elem => elem.toNumber())

            let tx = await management.setCorrupted(creator.address, true)
            let receipt = await tx.wait()
            const gasValue1 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            tx = await fundCollectionCreated.donateForAddress(acc1.address, 0, 0, { value: donation })
            receipt = await tx.wait()
            const gasValue2 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            tx = await fundCollectionCreated.donateForAddress(acc1.address, donation, 0, { value: donation })
            receipt = await tx.wait()
            const gasValue3 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            tx = await fundCollectionCreated.donateForAddress(acc1.address, donation, 1)
            receipt = await tx.wait()
            const gasValue4 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            const totalGas = gasValue1.add(gasValue2).add(gasValue3).add(gasValue4)

            const balanceAfterETHAcc = await ethers.provider.getBalance(manager.address)
            const balanceAfterERC20Acc = await erc20.balanceOf(manager.address)
            const balanceAfterETHFund = await ethers.provider.getBalance(fundCollectionCreated.address)
            const balanceAfterERC20Fund = await erc20.balanceOf(fundCollectionCreated.address)
            const balanceAfterETHAccFund = await fundCollectionCreated.paymentsPerCoin(acc1.address, 0)
            const balanceAfterERC20AccFund = await fundCollectionCreated.paymentsPerCoin(acc1.address, 1)
            const investIDsAfterBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIDsAfter = investIDsAfterBN.map(elem => elem.toNumber())
            const invesdIDsInfo = {
                [investIDsAfter[0]]: await fundCollectionCreated.getInvestIdInfos(investIDsAfter[0]),
                [investIDsAfter[1]]: await fundCollectionCreated.getInvestIdInfos(investIDsAfter[1]),
                [investIDsAfter[2]]: await fundCollectionCreated.getInvestIdInfos(investIDsAfter[2])
            }

            const quotasPerInvestIdLow = [
                invesdIDsInfo[investIDsAfter[0]].lowQuotaAmount.toNumber(),
                invesdIDsInfo[investIDsAfter[1]].lowQuotaAmount.toNumber(),
                invesdIDsInfo[investIDsAfter[2]].lowQuotaAmount.toNumber()
            ]
            const quotasPerInvestIdReg = [
                invesdIDsInfo[investIDsAfter[0]].regQuotaAmount.toNumber(),
                invesdIDsInfo[investIDsAfter[1]].regQuotaAmount.toNumber(),
                invesdIDsInfo[investIDsAfter[2]].regQuotaAmount.toNumber()
            ]
            const quotasPerInvestIdHigh = [
                invesdIDsInfo[investIDsAfter[0]].highQuotaAmount.toNumber(),
                invesdIDsInfo[investIDsAfter[1]].highQuotaAmount.toNumber(),
                invesdIDsInfo[investIDsAfter[2]].highQuotaAmount.toNumber()
            ]

            expect(balanceBeforeETHAcc).to.equal(ethers.utils.parseEther("10000"))
            expect(balanceAfterETHAcc).to.equal(balanceBeforeETHAcc.sub(donation).sub(donation).sub(totalGas))
            expect(balanceBeforeERC20Acc).to.equal(balanceAfterERC20Acc.add(donation))
            expect(balanceBeforeETHFund.toNumber()).to.equal(0)
            expect(balanceAfterETHFund).to.equal(donation.mul(2))
            expect(balanceBeforeERC20Fund.toNumber()).to.equal(0)
            expect(balanceAfterERC20Fund).to.equal(donation)
            expect(balanceBeforeETHAccFund.toNumber()).to.equal(0)
            expect(balanceAfterETHAccFund).to.equal(donation.mul(2))
            expect(balanceBeforeERC20AccFund.toNumber()).to.equal(0)
            expect(balanceAfterERC20AccFund).to.equal(donation)
            expect(investIDsBefore).to.be.an("array").that.is.empty
            expect(investIDsAfter).to.have.same.members([1, 2, 3])
            expect(quotasPerInvestIdLow).to.have.same.members([0, 0, 0])
            expect(quotasPerInvestIdReg).to.have.same.members([0, 0, 0])
            expect(quotasPerInvestIdHigh).to.have.same.members([0, 0, 0])
        })

        it("Should NOT make donation for given address when contract paused", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]
            const donation = ethers.utils.parseEther("1")

            let tx = await fundCollectionCreated.pause()
            await tx.wait()

            await expect(fundCollectionCreated.donateForAddress(acc1.address, 0, 0, { value: donation }))
                .to.be.revertedWith("Pausable: paused")
        })

        it("Should NOT make donation for given address when creator is corrupted if caller is not manager", async () => {
            const { management, fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const [creator, acc1] = [accounts[1], accounts[2]]
            const donation = ethers.utils.parseEther("1")

            let tx = await management.setCorrupted(creator.address, true)
            await tx.wait()

            await expect(fundCollectionCreated.connect(acc1).donateForAddress(acc1.address, 0, 0, { value: donation }))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundNotAllowed")
        })

        it("Should NOT make donation for given address when crowdfund is past due", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]
            const donation = ethers.utils.parseEther("1")

            const unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 1;
            await time.increaseTo(unlockTime);

            await expect(fundCollectionCreated.donateForAddress(acc1.address, 0, 0, { value: donation }))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundPastDue")
        })
    })

    describe("refundAll", () => {
        it("Should refund if crowdfund does not reach fund goal", async () => {
            const { fundCollectionCreated, accounts, erc20 } = await loadFixture(testSetup_withERC20)
            const acc1 = accounts[2]

            const lowQuotaAm = 10
            const regQuotaAm = 5
            const highQuotaAm = 1
            const donation = ethers.utils.parseEther("0.1")

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            const ERC20BalanceBefore = await erc20.balanceOf(acc1.address)
            const ETHBalanceBefore = await ethers.provider.getBalance(acc1.address)

            let tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            let receipt = await tx.wait()
            const gasValue1 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 1)
            receipt = await tx.wait()
            const gasValue2 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            receipt = await tx.wait()
            const gasValue3 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            tx = await fundCollectionCreated.connect(acc1)
                .donate(donation, 1)
            receipt = await tx.wait()
            const gasValue4 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            const investIdsPerInvestorBeforeBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIdsPerInvestorBefore = investIdsPerInvestorBeforeBN.map(elem => elem.toNumber())

            const unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 1;
            await time.increaseTo(unlockTime);

            tx = await fundCollectionCreated.connect(acc1).refundAll()
            receipt = await tx.wait()
            const gasValue5 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            const totalGasValue = gasValue1.add(gasValue2).add(gasValue3).add(gasValue4).add(gasValue5)

            const ERC20BalanceAfter = await erc20.balanceOf(acc1.address)
            const ETHBalanceAfter = await ethers.provider.getBalance(acc1.address)
            const investIdsPerInvestorAfterBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIdsPerInvestorAfter = investIdsPerInvestorAfterBN.map(elem => elem.toNumber())

            expect(investIdsPerInvestorBefore).to.have.same.members([1, 2, 3, 4])
            expect(ERC20BalanceAfter).to.equal(ERC20BalanceBefore)
            expect(ETHBalanceAfter).to.equal(ETHBalanceBefore.sub(totalGasValue))
            expect(investIdsPerInvestorAfter).to.be.an("array").that.is.empty
        })

        it("Should refund if proper invest ID", async () => {
            const { fundCollectionCreated, accounts, erc20 } = await loadFixture(testSetup_withERC20)
            const acc1 = accounts[2]

            const lowQuotaAm = 10
            const regQuotaAm = 5
            const highQuotaAm = 1
            const donation = ethers.utils.parseEther("0.1")

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            const ERC20BalanceBefore = await erc20.balanceOf(acc1.address)
            const ETHBalanceBefore = await ethers.provider.getBalance(acc1.address)

            let tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            let receipt = await tx.wait()
            const gasValue1 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 1)
            receipt = await tx.wait()
            const gasValue2 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            receipt = await tx.wait()
            const gasValue3 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            tx = await fundCollectionCreated.connect(acc1)
                .donate(donation, 1)
            receipt = await tx.wait()
            const gasValue4 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            const investIdsPerInvestorBeforeBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIdsPerInvestorBefore = investIdsPerInvestorBeforeBN.map(elem => elem.toNumber())

            tx = await fundCollectionCreated.connect(acc1).refundWithInvestId(investIdsPerInvestorBefore[0])
            receipt = await tx.wait()
            const gasValue5 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            const investIdsPerInvestorBeforeBN2 = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIdsPerInvestorBefore2 = investIdsPerInvestorBeforeBN2.map(elem => elem.toNumber())

            const unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 1;
            await time.increaseTo(unlockTime);

            tx = await fundCollectionCreated.connect(acc1).refundAll()
            receipt = await tx.wait()
            const gasValue6 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            const totalGasValue = gasValue1.add(gasValue2).add(gasValue3).add(gasValue4).add(gasValue5).add(gasValue6)

            const ERC20BalanceAfter = await erc20.balanceOf(acc1.address)
            const ETHBalanceAfter = await ethers.provider.getBalance(acc1.address)
            const investIdsPerInvestorAfterBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIdsPerInvestorAfter = investIdsPerInvestorAfterBN.map(elem => elem.toNumber())

            expect(investIdsPerInvestorBefore).to.have.same.members([1, 2, 3, 4])
            expect(investIdsPerInvestorBefore2).to.have.same.members([2, 3, 4])
            expect(ERC20BalanceAfter).to.equal(ERC20BalanceBefore)
            expect(ETHBalanceAfter).to.equal(ETHBalanceBefore.sub(totalGasValue))
            expect(investIdsPerInvestorAfter).to.be.an("array").that.is.empty
        })

        it("Should refund all if contract/creator is corrupted", async () => {
            const { management, fundCollectionCreated, accounts, erc20 } = await loadFixture(testSetup_withERC20)
            const [creator, acc1] = [accounts[1], accounts[2]]

            const lowQuotaAm = 10
            const regQuotaAm = 5
            const highQuotaAm = 1
            const donation = ethers.utils.parseEther("0.1")

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            const ERC20BalanceBefore = await erc20.balanceOf(acc1.address)
            const ETHBalanceBefore = await ethers.provider.getBalance(acc1.address)

            let tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            let receipt = await tx.wait()
            const gasValue1 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            receipt = await tx.wait()
            const gasValue2 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            const unlockTime = (await time.latest()) + 7 * 24 * 60 * 60 + 10;
            await time.increaseTo(unlockTime);

            tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 1)
            receipt = await tx.wait()
            const gasValue3 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            receipt = await tx.wait()
            const gasValue4 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            tx = await management.setCorrupted(creator.address, true)
            await tx.wait()

            const investIdsPerInvestorBeforeBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIdsPerInvestorBefore = investIdsPerInvestorBeforeBN.map(elem => elem.toNumber())

            tx = await fundCollectionCreated.connect(acc1).refundAll()
            receipt = await tx.wait()
            const gasValue5 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)
            const totalGasValue = gasValue1.add(gasValue2).add(gasValue3).add(gasValue4).add(gasValue5)

            const ERC20BalanceAfter = await erc20.balanceOf(acc1.address)
            const ETHBalanceAfter = await ethers.provider.getBalance(acc1.address)
            const investIdsPerInvestorAfterBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIdsPerInvestorAfter = investIdsPerInvestorAfterBN.map(elem => elem.toNumber())

            expect(investIdsPerInvestorBefore).to.have.same.members([1, 2, 3, 4])
            expect(ERC20BalanceAfter).to.equal(ERC20BalanceBefore)
            expect(ETHBalanceAfter).to.equal(ETHBalanceBefore.sub(totalGasValue))
            expect(investIdsPerInvestorAfter).to.be.an("array").that.is.empty
        })

        it("Should NOT refund if minimum sold rate is reached", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup_withERC20)
            const acc1 = accounts[2]

            const lowQuotaAm = cfLowQuotaAmount
            const regQuotaAm = 0
            const highQuotaAm = 0

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            const tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            await tx.wait()

            await expect(fundCollectionCreated.connect(acc1).refundAll())
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundRefundNotPossible")
        })

        it("Should NOT refund if minimum sold rate is not reached and crowdfund still on", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup_withERC20)
            const acc1 = accounts[2]

            const lowQuotaAm = 10
            const regQuotaAm = 0
            const highQuotaAm = 0

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            const tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            await tx.wait()

            await expect(fundCollectionCreated.connect(acc1).refundAll())
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundRefundNotPossible")
        })

        it("Should NOT refund if caller is not investor", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup_withERC20)
            const acc1 = accounts[2]

            await expect(fundCollectionCreated.connect(acc1).refundAll())
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundCallerNotInvestor")
        })

        it("Should NOT refund if contract paused", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup_withERC20)
            const acc1 = accounts[2]

            const lowQuotaAm = cfLowQuotaAmount
            const regQuotaAm = 0
            const highQuotaAm = 0

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            const tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            await tx.wait()

            const tx_pause = await fundCollectionCreated.pause()
            await tx_pause.wait()

            const isPaused = await fundCollectionCreated.paused()

            expect(isPaused).to.equal(true)
            await expect(fundCollectionCreated.connect(acc1).refundAll())
                .to.be.revertedWith("Pausable: paused")
        })
    })

    describe("refundWithInvestId", () => {
        it("Should refund for given invest ID if in 7 days refundable period", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAm = 10
            const regQuotaAm = 5
            const highQuotaAm = 1
            const donation = ethers.utils.parseEther("0.1")

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            const ETHBalanceBefore = await ethers.provider.getBalance(acc1.address)

            let tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            let receipt = await tx.wait()
            const gasValue1 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            receipt = await tx.wait()
            const gasValue2 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            receipt = await tx.wait()
            const gasValue3 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            const investIdsBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIds = investIdsBN.map(elem => elem.toNumber())

            tx = await fundCollectionCreated.connect(acc1).refundWithInvestId(investIds[0])
            receipt = await tx.wait()
            const gasValue4 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            const investIds2BN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIds2 = investIds2BN.map(elem => elem.toNumber())

            tx = await fundCollectionCreated.connect(acc1).refundWithInvestId(investIds[1])
            receipt = await tx.wait()
            const gasValue5 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            const investIds3BN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIds3 = investIds3BN.map(elem => elem.toNumber())

            tx = await fundCollectionCreated.connect(acc1).refundWithInvestId(investIds[2])
            receipt = await tx.wait()
            const gasValue6 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            const investIds4BN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIds4 = investIds4BN.map(elem => elem.toNumber())

            const totalGasValue = gasValue1.add(gasValue2).add(gasValue3).add(gasValue4).add(gasValue5).add(gasValue6)
            const ETHBalanceAfter = await ethers.provider.getBalance(acc1.address)

            expect(ETHBalanceAfter).to.equal(ETHBalanceBefore.sub(totalGasValue))
            expect(investIds).to.have.same.members([1, 2, 3])
            expect(investIds2).to.have.same.members([2, 3])
            expect(investIds3).to.have.same.members([3])
            expect(investIds4).to.be.an("array").that.is.empty
        })

        it("Should refund for given invest ID if contract/creator is corrupted", async () => {
            const { management, fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const [creator, acc1] = [accounts[1], accounts[2]]

            const lowQuotaAm = 50
            const regQuotaAm = 5
            const highQuotaAm = 1
            const donation = ethers.utils.parseEther("0.1")

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            const ETHBalanceBefore = await ethers.provider.getBalance(acc1.address)

            let tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            let receipt = await tx.wait()
            const gasValue1 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            receipt = await tx.wait()
            const gasValue2 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            receipt = await tx.wait()
            const gasValue3 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            const unlockTime = (await time.latest()) + 7 * 24 * 60 * 60 + 10;
            await time.increaseTo(unlockTime);

            tx = await management.setCorrupted(creator.address, true)
            await tx.wait()

            const investIdsBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIds = investIdsBN.map(elem => elem.toNumber())

            tx = await fundCollectionCreated.connect(acc1).refundWithInvestId(investIds[0])
            receipt = await tx.wait()
            const gasValue4 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            const investIds2BN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIds2 = investIds2BN.map(elem => elem.toNumber())

            tx = await fundCollectionCreated.connect(acc1).refundWithInvestId(investIds[1])
            receipt = await tx.wait()
            const gasValue5 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            const investIds3BN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIds3 = investIds3BN.map(elem => elem.toNumber())

            tx = await fundCollectionCreated.connect(acc1).refundWithInvestId(investIds[2])
            receipt = await tx.wait()
            const gasValue6 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            const investIds4BN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIds4 = investIds4BN.map(elem => elem.toNumber())

            const totalGasValue = gasValue1.add(gasValue2).add(gasValue3).add(gasValue4).add(gasValue5).add(gasValue6)
            const ETHBalanceAfter = await ethers.provider.getBalance(acc1.address)

            expect(ETHBalanceAfter).to.equal(ETHBalanceBefore.sub(totalGasValue))
            expect(investIds).to.have.same.members([1, 2, 3])
            expect(investIds2).to.have.same.members([2, 3])
            expect(investIds3).to.have.same.members([3])
            expect(investIds4).to.be.an("array").that.is.empty
        })

        it("Should refund for given invest ID if minimum goal is not yet reached", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAm = 5
            const regQuotaAm = 5
            const highQuotaAm = 1
            const donation = ethers.utils.parseEther("0.1")

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            const ETHBalanceBefore = await ethers.provider.getBalance(acc1.address)

            let tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            let receipt = await tx.wait()
            const gasValue1 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            receipt = await tx.wait()
            const gasValue2 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            receipt = await tx.wait()
            const gasValue3 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            const unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 1;
            await time.increaseTo(unlockTime);

            const investIdsBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIds = investIdsBN.map(elem => elem.toNumber())

            tx = await fundCollectionCreated.connect(acc1).refundWithInvestId(investIds[0])
            receipt = await tx.wait()
            const gasValue4 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            const investIds2BN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIds2 = investIds2BN.map(elem => elem.toNumber())

            tx = await fundCollectionCreated.connect(acc1).refundWithInvestId(investIds[1])
            receipt = await tx.wait()
            const gasValue5 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            const investIds3BN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIds3 = investIds3BN.map(elem => elem.toNumber())

            tx = await fundCollectionCreated.connect(acc1).refundWithInvestId(investIds[2])
            receipt = await tx.wait()
            const gasValue6 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            const investIds4BN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIds4 = investIds4BN.map(elem => elem.toNumber())

            const totalGasValue = gasValue1.add(gasValue2).add(gasValue3).add(gasValue4).add(gasValue5).add(gasValue6)
            const ETHBalanceAfter = await ethers.provider.getBalance(acc1.address)

            expect(ETHBalanceAfter).to.equal(ETHBalanceBefore.sub(totalGasValue))
            expect(investIds).to.have.same.members([1, 2, 3])
            expect(investIds2).to.have.same.members([2, 3])
            expect(investIds3).to.have.same.members([3])
            expect(investIds4).to.be.an("array").that.is.empty
        })

        it("Should NOT refund an already refunded invest ID", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAm = 10
            const regQuotaAm = 5
            const highQuotaAm = 1
            const donation = ethers.utils.parseEther("0.1")

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            const ETHBalanceBefore = await ethers.provider.getBalance(acc1.address)

            let tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            let receipt = await tx.wait()
            const gasValue1 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            receipt = await tx.wait()
            const gasValue2 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            receipt = await tx.wait()
            const gasValue3 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            const investIdsBeforeBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIdsBefore = investIdsBeforeBN.map(elem => elem.toNumber())

            tx = await fundCollectionCreated.connect(acc1).refundWithInvestId(investIdsBefore[0])
            receipt = await tx.wait()
            const gasValue4 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            tx = await fundCollectionCreated.connect(acc1).refundWithInvestId(investIdsBefore[2])
            receipt = await tx.wait()
            const gasValue5 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            const totalGasValue = gasValue1.add(gasValue2).add(gasValue3).add(gasValue4).add(gasValue5)
            const ETHBalanceAfter = await ethers.provider.getBalance(acc1.address)
            const investIdsAfterBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIdsAfter = investIdsAfterBN.map(elem => elem.toNumber())

            expect(ETHBalanceAfter).to.equal(ETHBalanceBefore.sub(totalPayment).sub(totalGasValue))
            expect(investIdsBefore).to.have.same.members([1, 2, 3])
            expect(investIdsAfter).to.have.same.members([2])
            await expect(fundCollectionCreated.connect(acc1).refundWithInvestId(investIdsBefore[0]))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundNotInvestIdOwner")
            await expect(fundCollectionCreated.connect(acc1).refundWithInvestId(investIdsBefore[2]))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundNotInvestIdOwner")
        })

        it("Should NOT refund if contract/creator is not corrupted, not in 7 days period and min goal is reached", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAm = 100
            const regQuotaAm = 5
            const highQuotaAm = 1
            const donation = ethers.utils.parseEther("0.1")

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            let tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            await tx.wait()

            const unlockTime = (await time.latest()) + 7 * 24 * 60 * 60 + 10;
            await time.increaseTo(unlockTime);

            const investIdsBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIds = investIdsBN.map(elem => elem.toNumber())

            await expect(fundCollectionCreated.connect(acc1).refundWithInvestId(investIds[0]))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundRefundNotPossible")
            await expect(fundCollectionCreated.connect(acc1).refundWithInvestId(investIds[1]))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundRefundNotPossible")
        })

        it("Should NOT refund if cotract is still on and min goal is not reached", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAm = 10
            const regQuotaAm = 5
            const highQuotaAm = 1
            const donation = ethers.utils.parseEther("0.1")

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            let tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            await tx.wait()

            const unlockTime = (await time.latest()) + 7 * 24 * 60 * 60 + 10;
            await time.increaseTo(unlockTime);

            const investIdsBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIds = investIdsBN.map(elem => elem.toNumber())

            await expect(fundCollectionCreated.connect(acc1).refundWithInvestId(investIds[0]))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundRefundNotPossible")
            await expect(fundCollectionCreated.connect(acc1).refundWithInvestId(investIds[1]))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundRefundNotPossible")
        })

        it("Should NOT refund if contract paused", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAm = 100
            const regQuotaAm = 5
            const highQuotaAm = 1
            const donation = ethers.utils.parseEther("0.1")

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            let tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            await tx.wait()

            const unlockTime = (await time.latest()) + 7 * 24 * 60 * 60 + 10;
            await time.increaseTo(unlockTime);

            const investIdsBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIds = investIdsBN.map(elem => elem.toNumber())

            tx = await fundCollectionCreated.pause()
            await tx.wait()

            await expect(fundCollectionCreated.connect(acc1).refundWithInvestId(investIds[0]))
                .to.be.revertedWith("Pausable: paused")
        })

        it("Should NOT refund if caller is not an investor", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const [acc1, acc2] = [accounts[2], accounts[3]]

            const lowQuotaAm = 100
            const regQuotaAm = 5
            const highQuotaAm = 1
            const donation = ethers.utils.parseEther("0.1")

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            let tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            await tx.wait()

            const unlockTime = (await time.latest()) + 7 * 24 * 60 * 60 + 10;
            await time.increaseTo(unlockTime);

            const investIdsBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIds = investIdsBN.map(elem => elem.toNumber())

            await expect(fundCollectionCreated.connect(acc2).refundWithInvestId(investIds[0]))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundCallerNotInvestor")
            await expect(fundCollectionCreated.connect(acc2).refundWithInvestId(investIds[1]))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundCallerNotInvestor")
        })
    })

    describe("refundToAddress", () => {
        it("Should be refunded when caller is manager", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAm = 100
            const regQuotaAm = 5
            const highQuotaAm = 1
            const donation = ethers.utils.parseEther("0.1")

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            let tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            await tx.wait()

            const balanceBefore = await ethers.provider.getBalance(acc1.address)
            let investIdsBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIdsBefore = investIdsBN.map(elem => elem.toNumber())

            tx = await fundCollectionCreated.refundToAddress(acc1.address)
            await tx.wait()

            const balanceAfter = await ethers.provider.getBalance(acc1.address)
            investIdsBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIdsAfter = investIdsBN.map(elem => elem.toNumber())

            expect(balanceAfter).to.equal(balanceBefore.add(totalPayment).add(donation))
            expect(investIdsBefore).to.have.same.members([1, 2])
            expect(investIdsAfter).to.be.an("array").that.is.empty
        })

        it("Should be refunded when caller is owner", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const [creator, acc1] = [accounts[1], accounts[2]]

            const lowQuotaAm = 100
            const regQuotaAm = 5
            const highQuotaAm = 1
            const donation = ethers.utils.parseEther("0.1")

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            let tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            await tx.wait()

            const balanceBefore = await ethers.provider.getBalance(acc1.address)
            let investIdsBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIdsBefore = investIdsBN.map(elem => elem.toNumber())

            tx = await fundCollectionCreated.connect(creator).refundToAddress(acc1.address)
            await tx.wait()

            const balanceAfter = await ethers.provider.getBalance(acc1.address)
            investIdsBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIdsAfter = investIdsBN.map(elem => elem.toNumber())

            expect(balanceAfter).to.equal(balanceBefore.add(totalPayment).add(donation))
            expect(investIdsBefore).to.have.same.members([1, 2])
            expect(investIdsAfter).to.be.an("array").that.is.empty
        })

        it("Should be refunded when caller is manager if creator corrupted", async () => {
            const { management, fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const [creator, acc1] = [accounts[1], accounts[2]]

            const lowQuotaAm = 100
            const regQuotaAm = 5
            const highQuotaAm = 1
            const donation = ethers.utils.parseEther("0.1")

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            let tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            await tx.wait()

            const balanceBefore = await ethers.provider.getBalance(acc1.address)
            let investIdsBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIdsBefore = investIdsBN.map(elem => elem.toNumber())

            tx = await management.setCorrupted(creator.address, true)
            await tx.wait()

            tx = await fundCollectionCreated.refundToAddress(acc1.address)
            await tx.wait()

            const balanceAfter = await ethers.provider.getBalance(acc1.address)
            investIdsBN = await fundCollectionCreated.getInvestIdsPerInvestor(acc1.address)
            const investIdsAfter = investIdsBN.map(elem => elem.toNumber())

            expect(balanceAfter).to.equal(balanceBefore.add(totalPayment).add(donation))
            expect(investIdsBefore).to.have.same.members([1, 2])
            expect(investIdsAfter).to.be.an("array").that.is.empty
        })

        it("Should NOT be refunded when caller is creator if creator corrupted", async () => {
            const { management, fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const [creator, acc1] = [accounts[1], accounts[2]]

            const lowQuotaAm = 100
            const regQuotaAm = 5
            const highQuotaAm = 1
            const donation = ethers.utils.parseEther("0.1")

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            let tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            await tx.wait()

            tx = await management.setCorrupted(creator.address, true)
            await tx.wait()

            await expect(fundCollectionCreated.connect(creator).refundToAddress(acc1.address))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundNotAllowed")
        })

        it("Should NOT be refunded when caller is neighter manager nor creator", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAm = 100
            const regQuotaAm = 5
            const highQuotaAm = 1
            const donation = ethers.utils.parseEther("0.1")

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            let tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            await tx.wait()

            await expect(fundCollectionCreated.connect(acc1).refundToAddress(acc1.address))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundNotAllowed")
        })

        it("Should NOT be refunded if given address is not an investor", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            await expect(fundCollectionCreated.refundToAddress(acc1.address))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundCallerNotInvestor")
        })
    })

    describe("withdrawFund", () => {
        it("Should withdraw funds", async () => {
            const { fundCollectionCreated, accounts, erc20, multiSig, management } = await loadFixture(testSetup_withERC20)
            const [creator, acc1, accDonation] = [accounts[1], accounts[2], accounts[10]]

            const lowQuotaAm = 15
            const regQuotaAm = 4
            const highQuotaAm = 1
            const donation = ethers.utils.parseEther("0.1")

            const totalPaymentETH = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))
            const totalPaymentERC20 = cfLowQuotaValue[1].mul(lowQuotaAm)
                .add(cfRegQuotaValue[1].mul(regQuotaAm))
                .add(cfHighQuotaValue[1].mul(highQuotaAm))
            const donationPaymentETH = totalPaymentETH.add(donation).mul(cfDonationFee).div(10000)
            const donationPaymentERC20 = totalPaymentERC20.add(donation).mul(cfDonationFee).div(10000)

            const creatorsRoyaltyFee = 900
            const creatorsRoyaltyETH = totalPaymentETH.add(donation).mul(creatorsRoyaltyFee).div(10000)
            const creatorsRoyaltyERC20 = totalPaymentERC20.add(donation).mul(creatorsRoyaltyFee).div(10000)

            let tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPaymentETH })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 1)
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1)
                .donate(donation, 1)
            await tx.wait()

            const ETHBalanceBefore = await ethers.provider.getBalance(creator.address)
            const ERC20BalanceBefore = await erc20.balanceOf(creator.address)
            const ETHBalanceDonationBefore = await ethers.provider.getBalance(accDonation.address)
            const ERC20BalanceDonationBefore = await erc20.balanceOf(accDonation.address)
            const ETHBalanceMultisigBefore = await ethers.provider.getBalance(multiSig.address)
            const ERC20BalanceMultisigBefore = await erc20.balanceOf(multiSig.address)

            tx = await fundCollectionCreated.connect(creator).withdrawFund()
            const receipt = await tx.wait()
            const gasValue = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            const ETHBalanceAfter = await ethers.provider.getBalance(creator.address)
            const ERC20BalanceAfter = await erc20.balanceOf(creator.address)
            const ETHBalanceDonationAfter = await ethers.provider.getBalance(accDonation.address)
            const ERC20BalanceDonationAfter = await erc20.balanceOf(accDonation.address)
            const ETHBalanceMultisigAfter = await ethers.provider.getBalance(multiSig.address)
            const ERC20BalanceMultisigAfter = await erc20.balanceOf(multiSig.address)

            expect(ETHBalanceBefore).to.equal(ethers.utils.parseEther("10000"))
            expect(ERC20BalanceBefore).to.equal(ethers.utils.parseEther("5"))
            expect(ETHBalanceDonationBefore).to.equal(ethers.utils.parseEther("10000"))
            expect(ERC20BalanceDonationBefore).to.equal(ethers.utils.parseEther("0"))
            expect(ETHBalanceMultisigBefore).to.equal(ethers.utils.parseEther("0"))
            expect(ERC20BalanceMultisigBefore).to.equal(ethers.utils.parseEther("0"))

            expect(ETHBalanceAfter).to.equal(ETHBalanceBefore.sub(gasValue).add(totalPaymentETH.sub(donationPaymentETH).sub(creatorsRoyaltyETH)).add(donation))
            expect(ERC20BalanceAfter).to.equal(ERC20BalanceBefore.add(totalPaymentERC20.sub(donationPaymentERC20).sub(creatorsRoyaltyERC20)).add(donation))
            expect(ETHBalanceDonationAfter).to.equal(ETHBalanceDonationBefore.add(donationPaymentETH))
            expect(ERC20BalanceDonationAfter).to.equal(ERC20BalanceDonationBefore.add(donationPaymentERC20))
            expect(ETHBalanceMultisigAfter).to.equal(ETHBalanceMultisigBefore.add(creatorsRoyaltyETH))
            expect(ERC20BalanceMultisigAfter).to.equal(ERC20BalanceDonationBefore.add(creatorsRoyaltyERC20))
        })

        it("Should withdraw funds even if there is no donation entity set", async () => {
            const { management, accounts, erc20, multiSig } = await loadFixture(testSetup_withERC20)
            const [creator, acc1, accDonation] = [accounts[1], accounts[2], accounts[10]]

            const cfLowQuotaValue = [ethers.utils.parseEther("0.01"), ethers.utils.parseEther("0.011"), ethers.utils.parseEther("0.012")]
            const cfRegQuotaValue = [ethers.utils.parseEther("0.05"), ethers.utils.parseEther("0.051"), ethers.utils.parseEther("0.052")]
            const cfHighQuotaValue = [ethers.utils.parseEther("0.1"), ethers.utils.parseEther("0.11"), ethers.utils.parseEther("0.12")]

            const lowQuotaAm = 15
            const regQuotaAm = 4
            const highQuotaAm = 1
            const donation = ethers.utils.parseEther("0.1")

            const totalPaymentETH = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))
            const totalPaymentERC20 = cfLowQuotaValue[1].mul(lowQuotaAm)
                .add(cfRegQuotaValue[1].mul(regQuotaAm))
                .add(cfHighQuotaValue[1].mul(highQuotaAm))

            const creatorsRoyaltyFee = 900
            const creatorsRoyaltyETH = totalPaymentETH.add(donation).mul(creatorsRoyaltyFee).div(10000)
            const creatorsRoyaltyERC20 = totalPaymentERC20.add(donation).mul(creatorsRoyaltyFee).div(10000)

            const ETHBalanceBefore = await ethers.provider.getBalance(creator.address)
            const ERC20BalanceBefore = await erc20.balanceOf(creator.address)
            const ETHBalanceDonationBefore = await ethers.provider.getBalance(accDonation.address)
            const ERC20BalanceDonationBefore = await erc20.balanceOf(accDonation.address)
            const ETHBalanceMultisigBefore = await ethers.provider.getBalance(multiSig.address)
            const ERC20BalanceMultisigBefore = await erc20.balanceOf(multiSig.address)

            const newCol = await management.connect(creator).newCrowdfund(
                collectionName, collectionSymbol, collectionBaseURI, collectionRoyalty, creator.address,
                [cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue, cfLowQuotaAmount, cfRegQuotaAmount,
                    cfHighQuotaAmount, ethers.constants.AddressZero, cfDonationFee, cfMinSoldRate]
            )
            const receipt_col = await newCol.wait()
            const event = receipt_col.events.filter(evt => evt?.event)
            const rightEvent = event.filter(evt => evt.args.fundCollection || evt.args.artCollection)
            const fundCollectionAddress = rightEvent[0].args.fundCollection
            const fundCollectionCreated = await ethers.getContractAt("contracts/Crowdfund.sol:Crowdfund", fundCollectionAddress)
            const gasValue1 = receipt_col.cumulativeGasUsed.mul(receipt_col.effectiveGasPrice)

            let tx = await erc20.connect(acc1).approve(fundCollectionCreated.address, ethers.utils.parseEther("100"))
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPaymentETH })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 1)
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1)
                .donate(donation, 1)
            await tx.wait()

            tx = await fundCollectionCreated.connect(creator).withdrawFund()
            const receipt = await tx.wait()
            const gasValue2 = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

            const totalGasValue = gasValue2.add(gasValue1)

            const ETHBalanceAfter = await ethers.provider.getBalance(creator.address)
            const ERC20BalanceAfter = await erc20.balanceOf(creator.address)
            const ETHBalanceDonationAfter = await ethers.provider.getBalance(accDonation.address)
            const ERC20BalanceDonationAfter = await erc20.balanceOf(accDonation.address)
            const ETHBalanceMultisigAfter = await ethers.provider.getBalance(multiSig.address)
            const ERC20BalanceMultisigAfter = await erc20.balanceOf(multiSig.address)

            expect(ETHBalanceBefore).to.equal(ethers.utils.parseEther("10000"))
            expect(ERC20BalanceBefore).to.equal(ethers.utils.parseEther("5"))
            expect(ETHBalanceDonationBefore).to.equal(ethers.utils.parseEther("10000"))
            expect(ERC20BalanceDonationBefore).to.equal(ethers.utils.parseEther("0"))
            expect(ETHBalanceMultisigBefore).to.equal(ethers.utils.parseEther("0"))
            expect(ERC20BalanceMultisigBefore).to.equal(ethers.utils.parseEther("0"))

            expect(ETHBalanceAfter).to.equal(ETHBalanceBefore.sub(totalGasValue).add(totalPaymentETH).sub(creatorsRoyaltyETH).add(donation))
            expect(ERC20BalanceAfter).to.equal(ERC20BalanceBefore.add(totalPaymentERC20).add(donation).sub(creatorsRoyaltyERC20))
            expect(ETHBalanceDonationAfter).to.equal(ETHBalanceDonationBefore)
            expect(ERC20BalanceDonationAfter).to.equal(ERC20BalanceDonationBefore)
            expect(ETHBalanceMultisigAfter).to.equal(ETHBalanceMultisigBefore.add(creatorsRoyaltyETH))
            expect(ERC20BalanceMultisigAfter).to.equal(ERC20BalanceDonationBefore.add(creatorsRoyaltyERC20))
        })

        it("Should NOT withdraw funds if minimum goal is not reached", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const [creator, acc1] = [accounts[1], accounts[2]]

            const lowQuotaAm = 10
            const regQuotaAm = 4
            const highQuotaAm = 1
            const donation = ethers.utils.parseEther("0.1")

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            let tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            await tx.wait()

            await expect(fundCollectionCreated.connect(creator).withdrawFund())
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundMinGoalNotReached")
        })

        it("Should NOT withdraw funds if contract paused", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const [creator, acc1] = [accounts[1], accounts[2]]

            const lowQuotaAm = 10
            const regQuotaAm = 4
            const highQuotaAm = 1
            const donation = ethers.utils.parseEther("0.1")

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            let tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            await tx.wait()

            tx = await fundCollectionCreated.pause()
            await tx.wait()

            await expect(fundCollectionCreated.connect(creator).withdrawFund())
                .to.be.revertedWith("Pausable: paused")
        })

        it("Should NOT withdraw funds if contract/creator is corrupted", async () => {
            const { management, fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const [creator, acc1] = [accounts[1], accounts[2]]

            const lowQuotaAm = 10
            const regQuotaAm = 4
            const highQuotaAm = 1
            const donation = ethers.utils.parseEther("0.1")

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            let tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            await tx.wait()

            tx = await management.setCorrupted(creator.address, true)
            await tx.wait()

            await expect(fundCollectionCreated.connect(creator).withdrawFund())
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundNotAllowed")
        })

        it("Should NOT withdraw funds if caller is not creator", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const [creator, acc1, acc2] = [accounts[1], accounts[2], accounts[3]]

            const lowQuotaAm = 40
            const regQuotaAm = 4
            const highQuotaAm = 1
            const donation = ethers.utils.parseEther("0.1")

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            let tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            await tx.wait()

            await expect(fundCollectionCreated.connect(acc2).withdrawFund())
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundNotAllowed")
        })
    })

    describe("mint", () => {
        it("Should mint NFTs for investor", async () => {
            const { management, fundCollectionCreated, artCollectionCreated, accounts, reward } = await loadFixture(testSetup)
            const [acc1, acc2] = [accounts[2], accounts[3]]

            let lowQuotaAm = 40
            let regQuotaAm = 4
            let highQuotaAm = 1
            let donation = ethers.utils.parseEther("0.1")

            let totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            let tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1).mint(acc1.address)
            await tx.wait()

            let balance = await artCollectionCreated.balanceOf(acc1.address)
            let ownerOfInitLow = await artCollectionCreated.ownerOf(0)
            let ownerOfEndLow = await artCollectionCreated.ownerOf(39)
            let ownerOfInitReg = await artCollectionCreated.ownerOf(100)
            let ownerOfEndReg = await artCollectionCreated.ownerOf(103)
            const ownerOfHigh = await artCollectionCreated.ownerOf(150)
            let score = (await reward.getUser(acc1.address)).score

            expect(balance.toNumber()).to.equal(lowQuotaAm + regQuotaAm + highQuotaAm)
            expect(ownerOfInitLow).to.equal(acc1.address)
            expect(ownerOfEndLow).to.equal(acc1.address)
            expect(ownerOfInitReg).to.equal(acc1.address)
            expect(ownerOfEndReg).to.equal(acc1.address)
            expect(ownerOfHigh).to.equal(acc1.address)
            // expect(score.toNumber()).to.equal(lowQuotaAm + regQuotaAm + highQuotaAm)
            await expect(artCollectionCreated.ownerOf(40))
                .to.be.revertedWith("ERC721: invalid token ID")
            await expect(artCollectionCreated.ownerOf(104))
                .to.be.revertedWith("ERC721: invalid token ID")
            await expect(artCollectionCreated.ownerOf(151))
                .to.be.revertedWith("ERC721: invalid token ID")

            lowQuotaAm = 30
            regQuotaAm = 6
            highQuotaAm = 2
            donation = ethers.utils.parseEther("0.2")

            totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            tx = await fundCollectionCreated.connect(acc2)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc2)
                .donate(0, 0, { value: donation })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc2).mint(acc2.address)
            await tx.wait()

            balance = await artCollectionCreated.balanceOf(acc2.address)
            ownerOfInitLow = await artCollectionCreated.ownerOf(40)
            ownerOfEndLow = await artCollectionCreated.ownerOf(69)
            ownerOfInitReg = await artCollectionCreated.ownerOf(104)
            ownerOfEndReg = await artCollectionCreated.ownerOf(109)
            const ownerOfInitHigh = await artCollectionCreated.ownerOf(151)
            const ownerOfEndHigh = await artCollectionCreated.ownerOf(152)
            score = (await reward.getUser(acc2.address)).score

            expect(balance.toNumber()).to.equal(lowQuotaAm + regQuotaAm + highQuotaAm)
            expect(ownerOfInitLow).to.equal(acc2.address)
            expect(ownerOfEndLow).to.equal(acc2.address)
            expect(ownerOfInitReg).to.equal(acc2.address)
            expect(ownerOfEndReg).to.equal(acc2.address)
            expect(ownerOfInitHigh).to.equal(acc2.address)
            expect(ownerOfEndHigh).to.equal(acc2.address)
            // expect(score.toNumber()).to.equal(lowQuotaAm + regQuotaAm + highQuotaAm)
            await expect(artCollectionCreated.ownerOf(70))
                .to.be.revertedWith("ERC721: invalid token ID")
            await expect(artCollectionCreated.ownerOf(110))
                .to.be.revertedWith("ERC721: invalid token ID")
            await expect(artCollectionCreated.ownerOf(153))
                .to.be.revertedWith("ERC721: invalid token ID")
        })

        it("Should mint NFTs for investor only for proper invest IDs (not 0)", async () => {
            const { fundCollectionCreated, artCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAm = 40
            const regQuotaAm = 4
            const highQuotaAm = 1
            const donation = ethers.utils.parseEther("0.1")

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            let tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1).refundWithInvestId(1)
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1).mint(acc1.address)
            await tx.wait()

            const balance = await artCollectionCreated.balanceOf(acc1.address)
            const ownerOfInitLow = await artCollectionCreated.ownerOf(0)
            const ownerOfEndLow = await artCollectionCreated.ownerOf(39)
            const ownerOfInitReg = await artCollectionCreated.ownerOf(100)
            const ownerOfEndReg = await artCollectionCreated.ownerOf(103)
            const ownerOfHigh = await artCollectionCreated.ownerOf(150)

            expect(balance.toNumber()).to.equal(lowQuotaAm + regQuotaAm + highQuotaAm)
            expect(ownerOfInitLow).to.equal(acc1.address)
            expect(ownerOfEndLow).to.equal(acc1.address)
            expect(ownerOfInitReg).to.equal(acc1.address)
            expect(ownerOfEndReg).to.equal(acc1.address)
            expect(ownerOfHigh).to.equal(acc1.address)
            await expect(artCollectionCreated.ownerOf(40))
                .to.be.revertedWith("ERC721: invalid token ID")
            await expect(artCollectionCreated.ownerOf(104))
                .to.be.revertedWith("ERC721: invalid token ID")
            await expect(artCollectionCreated.ownerOf(151))
                .to.be.revertedWith("ERC721: invalid token ID")
        })

        it("Should NOT mint NFTs for investor if there is no investments", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAm = 40
            const regQuotaAm = 4
            const highQuotaAm = 1
            const donation = ethers.utils.parseEther("0.1")

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            let tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1).mint(acc1.address)
            await tx.wait()

            await expect(fundCollectionCreated.connect(acc1).mint(acc1.address))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundNoMoreTokensToMint")
        })

        it("Should NOT mint NFTs for investor if minimum goal is not reached", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAm = 20
            const regQuotaAm = 4
            const highQuotaAm = 1
            const donation = ethers.utils.parseEther("0.1")

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            let tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            await tx.wait()

            await expect(fundCollectionCreated.connect(acc1).mint(acc1.address))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundMinGoalNotReached")
        })

        it("Should NOT mint NFTs for investor if contract paused", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            const lowQuotaAm = 20
            const regQuotaAm = 4
            const highQuotaAm = 1
            const donation = ethers.utils.parseEther("0.1")

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            let tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            await tx.wait()

            tx = await fundCollectionCreated.pause()
            await tx.wait()

            await expect(fundCollectionCreated.connect(acc1).mint(acc1.address))
                .to.be.revertedWith("Pausable: paused")
        })

        it("Should NOT mint NFTs for investor if contract/creator is corrupted", async () => {
            const { management, fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const [creator, acc1] = [accounts[1], accounts[2]]

            const lowQuotaAm = 20
            const regQuotaAm = 4
            const highQuotaAm = 1
            const donation = ethers.utils.parseEther("0.1")

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            let tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc1)
                .donate(0, 0, { value: donation })
            await tx.wait()

            tx = await management.setCorrupted(creator.address, true)
            await tx.wait()

            await expect(fundCollectionCreated.connect(acc1).mint(acc1.address))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundCollectionOrCreatorCorrupted")
        })

        it("Should NOT mint any NFT if invest ID is a donation", async () => {
            const { fundCollectionCreated, artCollectionCreated, accounts } = await loadFixture(testSetup)
            const [acc1, acc2] = [accounts[2], accounts[3]]

            const lowQuotaAm = 100
            const regQuotaAm = 4
            const highQuotaAm = 1
            const donation = ethers.utils.parseEther("0.1")

            const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
                .add(cfRegQuotaValue[0].mul(regQuotaAm))
                .add(cfHighQuotaValue[0].mul(highQuotaAm))

            let tx = await fundCollectionCreated.connect(acc1)
                .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc2)
                .donate(0, 0, { value: donation })
            await tx.wait()

            tx = await fundCollectionCreated.connect(acc2).mint(acc2.address)
            await tx.wait()

            const balance = await artCollectionCreated.balanceOf(acc1.address)

            expect(balance.toNumber()).to.equal(0)
            await expect(artCollectionCreated.ownerOf(0))
                .to.be.revertedWith("ERC721: invalid token ID")
            await expect(artCollectionCreated.ownerOf(39))
                .to.be.revertedWith("ERC721: invalid token ID")
            await expect(artCollectionCreated.ownerOf(100))
                .to.be.revertedWith("ERC721: invalid token ID")
            await expect(artCollectionCreated.ownerOf(103))
                .to.be.revertedWith("ERC721: invalid token ID")
            await expect(artCollectionCreated.ownerOf(150))
                .to.be.revertedWith("ERC721: invalid token ID")
        })
    })

    describe("withdrawToAddress", () => {
        it("Should withdraw to given address", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[3]

            const amountInEtherStr = "1.5"
            const amountInEther = ethers.utils.parseEther(amountInEtherStr)
            let tx = {
                to: fundCollectionCreated.address,
                // Convert currency unit from ether to wei
                value: amountInEther
            }

            await acc1.sendTransaction(tx)

            const balaceBefore = await ethers.provider.getBalance(acc1.address)

            tx = await fundCollectionCreated.withdrawToAddress(acc1.address, amountInEther)
            await tx.wait()

            const balaceAfter = await ethers.provider.getBalance(acc1.address)

            expect(balaceAfter.sub(balaceBefore)).to.equal(amountInEther)
        })

        it("Should NOT withdraw to given address if caller not manager", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[3]

            const amountInEtherStr = "1.5"
            const amountInEther = ethers.utils.parseEther(amountInEtherStr)
            let tx = {
                to: fundCollectionCreated.address,
                // Convert currency unit from ether to wei
                value: amountInEther
            }

            await acc1.sendTransaction(tx)

            await expect(fundCollectionCreated.connect(acc1).withdrawToAddress(acc1.address, amountInEther))
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundNotAllowed")
        })
    })

    describe("pause", () => {
        it("Should pause contract", async () => {
            const { management, fundCollectionCreated, artCollectionCreated, accounts } = await loadFixture(testSetup)
            const creator = accounts[1]

            // -- when NOT corrupted --

            const isPausedBeforeFundNotCorruptedManager = await fundCollectionCreated.paused()
            const isPausedBeforeArtNotCorruptedManager = await artCollectionCreated.paused()

            let tx = await fundCollectionCreated.pause()
            await tx.wait()

            const isPausedAfterFundNotCorruptedManager = await fundCollectionCreated.paused()
            const isPausedAfterArtNotCorruptedManager = await artCollectionCreated.paused()

            tx = await fundCollectionCreated.unpause()
            await tx.wait()

            const isPausedBeforeFundNotCorruptedCreator = await fundCollectionCreated.paused()
            const isPausedBeforeArtNotCorruptedCreator = await artCollectionCreated.paused()

            tx = await fundCollectionCreated.connect(creator).pause()
            await tx.wait()

            const isPausedAfterFundNotCorruptedCreator = await fundCollectionCreated.paused()
            const isPausedAfterArtNotCorruptedCreator = await artCollectionCreated.paused()

            tx = await fundCollectionCreated.connect(creator).unpause()
            await tx.wait()

            // -- when corrupted --

            const isPausedBeforeFundCorruptedManager = await fundCollectionCreated.paused()
            const isPausedBeforeArtCorruptedManager = await artCollectionCreated.paused()

            tx = await management.setCorrupted(creator.address, true)
            await tx.wait()

            tx = await fundCollectionCreated.pause()
            await tx.wait()

            const isPausedAfterFundCorruptedManager = await fundCollectionCreated.paused()
            const isPausedAfterArtCorruptedManager = await artCollectionCreated.paused()

            expect(isPausedBeforeFundNotCorruptedManager).to.equal(false)
            expect(isPausedBeforeArtNotCorruptedManager).to.equal(false)
            expect(isPausedAfterFundNotCorruptedManager).to.equal(true)
            expect(isPausedAfterArtNotCorruptedManager).to.equal(true)
            expect(isPausedBeforeFundNotCorruptedCreator).to.equal(false)
            expect(isPausedBeforeArtNotCorruptedCreator).to.equal(false)
            expect(isPausedAfterFundNotCorruptedCreator).to.equal(true)
            expect(isPausedAfterArtNotCorruptedCreator).to.equal(true)

            expect(isPausedBeforeFundCorruptedManager).to.equal(false)
            expect(isPausedBeforeArtCorruptedManager).to.equal(false)
            expect(isPausedAfterFundCorruptedManager).to.equal(true)
            expect(isPausedAfterArtCorruptedManager).to.equal(true)
        })

        it("Should NOT pause contract if caller is not manager/creator when not corrupted", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            await expect(fundCollectionCreated.connect(acc1).pause())
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundNotAllowed")
        })

        it("Should NOT pause contract if caller is not manager when corrupted", async () => {
            const { management, fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const creator = accounts[1]

            let tx = await management.setCorrupted(creator.address, true)
            await tx.wait()

            await expect(fundCollectionCreated.connect(creator).pause())
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundNotAllowed")
        })
    })

    describe("unpause", () => {
        it("Should unpause contract", async () => {
            const { fundCollectionCreated, artCollectionCreated, accounts } = await loadFixture(testSetup)
            const creator = accounts[1]

            let tx = await fundCollectionCreated.pause()
            await tx.wait()

            // -- when NOT corrupted --

            const isPausedBeforeFundNotCorruptedManager = await fundCollectionCreated.paused()
            const isPausedBeforeArtNotCorruptedManager = await artCollectionCreated.paused()

            tx = await fundCollectionCreated.unpause()
            await tx.wait()

            const isPausedAfterFundNotCorruptedManager = await fundCollectionCreated.paused()
            const isPausedAfterArtNotCorruptedManager = await artCollectionCreated.paused()

            tx = await fundCollectionCreated.pause()
            await tx.wait()

            const isPausedBeforeFundNotCorruptedCreator = await fundCollectionCreated.paused()
            const isPausedBeforeArtNotCorruptedCreator = await artCollectionCreated.paused()

            tx = await fundCollectionCreated.connect(creator).unpause()
            await tx.wait()

            const isPausedAfterFundNotCorruptedCreator = await fundCollectionCreated.paused()
            const isPausedAfterArtNotCorruptedCreator = await artCollectionCreated.paused()

            tx = await fundCollectionCreated.connect(creator).pause()
            await tx.wait()

            // -- when corrupted --

            const isPausedBeforeFundCorruptedManager = await fundCollectionCreated.paused()
            const isPausedBeforeArtCorruptedManager = await artCollectionCreated.paused()

            tx = await fundCollectionCreated.unpause()
            await tx.wait()

            const isPausedAfterFundCorruptedManager = await fundCollectionCreated.paused()
            const isPausedAfterArtCorruptedManager = await artCollectionCreated.paused()

            expect(isPausedBeforeFundNotCorruptedManager).to.equal(true)
            expect(isPausedBeforeArtNotCorruptedManager).to.equal(true)
            expect(isPausedAfterFundNotCorruptedManager).to.equal(false)
            expect(isPausedAfterArtNotCorruptedManager).to.equal(false)
            expect(isPausedBeforeFundNotCorruptedCreator).to.equal(true)
            expect(isPausedBeforeArtNotCorruptedCreator).to.equal(true)
            expect(isPausedAfterFundNotCorruptedCreator).to.equal(false)
            expect(isPausedAfterArtNotCorruptedCreator).to.equal(false)

            expect(isPausedBeforeFundCorruptedManager).to.equal(true)
            expect(isPausedBeforeArtCorruptedManager).to.equal(true)
            expect(isPausedAfterFundCorruptedManager).to.equal(false)
            expect(isPausedAfterArtCorruptedManager).to.equal(false)
        })

        it("Should NOT unpause contract if caller is not manager/creator when not corrupted", async () => {
            const { fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const acc1 = accounts[2]

            let tx = await fundCollectionCreated.pause()
            await tx.wait()

            await expect(fundCollectionCreated.connect(acc1).unpause())
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundNotAllowed")
        })

        it("Should NOT unpause contract if caller is not manager when corrupted", async () => {
            const { management, fundCollectionCreated, accounts } = await loadFixture(testSetup)
            const creator = accounts[1]

            let tx = await fundCollectionCreated.pause()
            await tx.wait()

            tx = await management.setCorrupted(creator.address, true)
            await tx.wait()

            await expect(fundCollectionCreated.connect(creator).unpause())
                .to.be.revertedWithCustomError(fundCollectionCreated, "CrowdfundNotAllowed")
        })
    })

    // describe("Replica from Sepolia", () => {
    //     // it("Should work", async () => {
    //     //     const { management, accounts } = await loadFixture(testSetup)
    //     //     const creator = accounts[1]

    //     //     const collectionName = "testtesttest"
    //     //     const collectionSymbol = "TT"
    //     //     const collectionBaseURI = "test.com"
    //     //     const collectionRoyalty = 600
    //     //     const cfLowQuotaValue = [1, 1, 1]
    //     //     const cfRegQuotaValue = [2, 2, 2]
    //     //     const cfHighQuotaValue = [3, 3, 3]
    //     //     const cfLowQuotaAmount = 1000
    //     //     const cfRegQuotaAmount = 300
    //     //     const cfHighQuotaAmount = 200
    //     //     const cfDonationFee = 400
    //     //     const cfMinSoldRate = 2500

    //     //     const allowCreator = await management.setCreator(creator.address, true)
    //     //     await allowCreator.wait()
    //     //     const newCol = await management.connect(accounts[1]).newCrowdfund(
    //     //         collectionName, collectionSymbol, collectionBaseURI, collectionRoyalty,
    //     //         [cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue, cfLowQuotaAmount, cfRegQuotaAmount,
    //     //             cfHighQuotaAmount, creator.address, cfDonationFee, cfMinSoldRate]
    //     //     )
    //     //     let receipt = await newCol.wait()
    //     //     const event = receipt.events.filter(evt => evt?.event)
    //     //     const rightEvent = event.filter(evt => evt.args.fundCollection || evt.args.artCollection)
    //     //     const fundCollectionAddress = rightEvent[0].args.fundCollection
    //     //     const fundCollectionCreated = await ethers.getContractAt("contracts/Crowdfund.sol:Crowdfund", fundCollectionAddress)
    //     //     const artCollectionAddress = rightEvent[0].args.artCollection
    //     //     const artCollectionCreated = await ethers.getContractAt("contracts/ERC721Art.sol:ERC721Art", artCollectionAddress)

    //     //     const lowAmount = 100
    //     //     const regAmount = 10
    //     //     const highAmount = 5
    //     //     const maticAmount = cfLowQuotaValue[0] * lowAmount + cfRegQuotaValue[0] * regAmount + cfHighQuotaValue[0] * highAmount

    //     //     let tx = await fundCollectionCreated.connect(creator)
    //     //         .invest(lowAmount, regAmount, highAmount, 0, { value: maticAmount })
    //     //     await tx.wait()

    //     //     const balanceBefore = await ethers.provider.getBalance(creator.address)

    //     //     const unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 10;
    //     //     await time.increaseTo(unlockTime);

    //     //     tx = await fundCollectionCreated.connect(creator).refundAll()
    //     //     receipt = await tx.wait()

    //     //     const gasValue = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

    //     //     const balanceAfter = (await ethers.provider.getBalance(creator.address)).add(gasValue)

    //     //     expect(balanceAfter.sub(balanceBefore).toNumber()).to.equal(maticAmount)
    //     // })

    //     it("Should work", async () => {
    //         const { management, accounts, erc20 } = await loadFixture(testSetup_withERC20)
    //         const creator = accounts[1]
    //         const receiver = accounts[10]

    //         const collectionName = "bla2"
    //         const collectionSymbol = "bla2"
    //         const collectionBaseURI = "bla.com"
    //         const collectionRoyalty = 200
    //         const cfLowQuotaValue = [1, 1, 1]
    //         const cfRegQuotaValue = [2, 2, 2]
    //         const cfHighQuotaValue = [3, 3, 3]
    //         const cfLowQuotaAmount = 10
    //         const cfRegQuotaAmount = 5
    //         const cfHighQuotaAmount = 2
    //         const cfDonationFee = 400
    //         const cfMinSoldRate = 2500

    //         let tx = await management.setTokenContract(1, erc20.address)
    //         tx = await management.setTokenContract(2, erc20.address)

    //         const allowCreator = await management.setCreator(creator.address, true)
    //         await allowCreator.wait()
    //         const newCol = await management.connect(accounts[1]).newCrowdfund(
    //             collectionName, collectionSymbol, collectionBaseURI, collectionRoyalty,
    //             [cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue, cfLowQuotaAmount, cfRegQuotaAmount,
    //                 cfHighQuotaAmount, receiver.address, cfDonationFee, cfMinSoldRate]
    //         )
    //         let receipt = await newCol.wait()
    //         const event = receipt.events.filter(evt => evt?.event)
    //         const rightEvent = event.filter(evt => evt.args.fundCollection || evt.args.artCollection)
    //         const fundCollectionAddress = rightEvent[0].args.fundCollection
    //         const fundCollectionCreated = await ethers.getContractAt("contracts/Crowdfund.sol:Crowdfund", fundCollectionAddress)
    //         const artCollectionAddress = rightEvent[0].args.artCollection
    //         const artCollectionCreated = await ethers.getContractAt("contracts/ERC721Art.sol:ERC721Art", artCollectionAddress)

    //         const lowAmount = 10
    //         const regAmount = 0
    //         const highAmount = 1
    //         const maticAmount = cfLowQuotaValue[0] * lowAmount + cfRegQuotaValue[0] * regAmount + cfHighQuotaValue[0] * highAmount

    //         tx = await fundCollectionCreated.connect(creator)
    //             .invest(lowAmount, regAmount, highAmount, 0, { value: maticAmount })
    //         await tx.wait()

    //         const balanceBefore = await ethers.provider.getBalance(creator.address)

    //         // const unlockTime = (await time.latest()) + 6 * 30 * 24 * 60 * 60 + 10;
    //         // await time.increaseTo(unlockTime);

    //         tx = await fundCollectionCreated.connect(creator).withdrawFund()
    //         receipt = await tx.wait()

    //     })
    // })
})