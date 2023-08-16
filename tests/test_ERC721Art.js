const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { replaceTokenAddress, replaceTokenAddressBytecode, USDTtokenContract } = require("../scripts/utils")
const hre = require("hardhat")
const lastDeploy = require("../scripts/last_deploy.json")

const originalAddress = USDTtokenContract[lastDeploy["lastNetwork"]]
let lastUSDCAddress = originalAddress
let ERC721ArtChanged = false

describe("ERC721Art", () => {
  const erc20Name = "USDT"
  const erc20Symbol = "USDT"
  const erc20Decimals = 6

  const collectionName = "MyNFT"
  const collectionSymbol = "MNFT"
  const mintPrice = ethers.utils.parseEther("1")
  const uri = "https://example.com/my-token/"
  const creatorsRoyalty = 200
  const artistRoyalty = 200

  // after(() => {
  //   if (ERC721ArtChanged) {
  //     if (hre.__SOLIDITY_COVERAGE_RUNNING) {
  //       replaceTokenAddressBytecode("ERC721Art", originalAddress, undefined, lastUSDCAddress)
  //     } else {
  //       replaceTokenAddress("ERC721Art", originalAddress, undefined, lastUSDCAddress)
  //     }
  //   }
  //   ERC721ArtChanged = false
  // })

  async function testSetup(maxSupply, withUSDC = false) {
    let erc20
    if (withUSDC) {
      const ERC20 = await ethers.getContractFactory("MockUSDToken")
      erc20 = await ERC20.deploy(erc20Name, erc20Symbol, erc20Decimals)
      await erc20.deployed()

      // if (hre.__SOLIDITY_COVERAGE_RUNNING) {
      //   // await hre.run("clean")
      //   // await hre.run("compile", { quiet: true, force: true, verbose: false })
      //   replaceTokenAddressBytecode("ERC721Art", erc20.address, undefined, lastUSDCAddress)
      // } else {
      //   replaceTokenAddress("ERC721Art", erc20.address, undefined, lastUSDCAddress)
      //   // await hre.run("clean")
      //   await hre.run("compile", { quiet: true, force: true, verbose: false })
      // }
      // lastUSDCAddress = erc20.address
      // ERC721ArtChanged = true
    }

    const Management = await ethers.getContractFactory("Management")
    const ArtCollection = await ethers.getContractFactory("ERC721Art")
    const FundCollection = await ethers.getContractFactory("Crowdfund")
    const MultiSig = await ethers.getContractFactory("MockMultiSig")
    const Reward = await ethers.getContractFactory("CRPReward")

    const Beacon = await ethers.getContractFactory("UpgradeableBeacon")
    const UUPS = await ethers.getContractFactory("ERC1967Proxy")

    const artCollectionImplementation = await ArtCollection.deploy()
    await artCollectionImplementation.deployed()
    const fundCollectionImplementation = await FundCollection.deploy()
    await fundCollectionImplementation.deployed()
    const beaconAdminArt = await Beacon.deploy(artCollectionImplementation.address)
    await beaconAdminArt.deployed()
    const beaconAdminFund = await Beacon.deploy(fundCollectionImplementation.address)
    await beaconAdminFund.deployed()
    const multiSig = await MultiSig.deploy()
    await multiSig.deployed()
    const managementImplementation = await Management.deploy()
    await managementImplementation.deployed()

    let abi = ["function initialize(address _beaconAdminArt, address _beaconAdminFund, address _beaconAdminCreators, address _creatorsCoin, address _erc20USD, address _multiSig, uint256 _fee)"]
    let function_name = "initialize"
    let constructor_args = [
      beaconAdminArt.address,
      beaconAdminFund.address,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
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

    const [owner, creator] = accounts

    const allowCreator = await managementProxy.setCreator(creator.address, true)
    await allowCreator.wait()

    const newCol = await managementProxy.connect(creator).newArtCollection(
      collectionName,
      collectionSymbol,
      maxSupply,
      mintPrice,
      mintPrice,
      mintPrice,
      uri,
      artistRoyalty,
      creator.address
    )

    const receipt = await newCol.wait()
    const event = receipt.events.filter(evt => evt?.event)
    const rightEvent = event.filter(evt => evt.args.collection)
    const collectionAddress = rightEvent[0].args.collection

    const collection = await ethers.getContractAt("contracts/ERC721Art.sol:ERC721Art", collectionAddress)
    const management = managementProxy
    const reward = rewardProxy

    const tokenIds = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const hashpowers = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
    const characteristIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    tx = await rewardProxy.setHashObject(collection.address, tokenIds, hashpowers, characteristIds)
    await tx.wait()

    if (withUSDC) {
      // let tx = await management.setTokenContract(1, erc20.address)
      // await tx.wait()

      const tokenAmount = ethers.utils.parseEther("5")
      for (let ii = 0; ii < 6; ii++) {
        const tx = await erc20.mint(accounts[ii].address, tokenAmount)
        await tx.wait()

        const tx2 = await erc20.connect(accounts[ii]).approve(collection.address, tokenAmount)
        await tx2.wait()

        const tx3 = await erc20.connect(accounts[ii]).approve(beaconAdminArt.address, tokenAmount)
        await tx3.wait()
      }
    }

    return { management, collection, multiSig, accounts, erc20, reward }
  }

  const testSetup_maxSupply_0 = async () => testSetup(0)
  const testSetup_maxSupply_0_USDC = async () => testSetup(0, true)
  const testSetup_maxSupply_NOT_0 = async () => testSetup(5)
  const testSetup_maxSupply_NOT_0_USDC = async () => testSetup(5, true)

  describe("Initialization", () => {
    it("Should be initialized successfully", async () => {
      const { management, collection, accounts } = await loadFixture(testSetup_maxSupply_0)
      const owner = accounts[1]

      const name = await collection.name()
      const symbol = await collection.symbol()
      const collectionOwner = await collection.owner()
      const managementAddress = await collection.management()
      const maxSupply = await collection.maxSupply()
      const price = await collection.pricePerCoin(0)
      const baseURI = await collection.baseURI()
      const [receiver, royaltyAmount] = await collection.royaltyInfo(0, mintPrice)

      expect(name).to.equal(collectionName)
      expect(symbol).to.equal(collectionSymbol)
      expect(collectionOwner).to.equal(owner.address)
      expect(managementAddress).to.equal(management.address)
      expect(maxSupply.toNumber()).to.equal(0)
      expect(price).to.equal(mintPrice)
      expect(baseURI).to.equal(uri)
      expect(receiver).to.equal(owner.address)
      expect(royaltyAmount).to.equal(ethers.utils.parseEther((artistRoyalty / 10000).toString()))
    })

    it("Should NOT initialize once it is already initialized", async () => {
      const { collection, accounts } = await loadFixture(testSetup_maxSupply_0)
      const deployer = accounts[0]

      await expect(collection.initialize(
        collectionName,
        collectionSymbol,
        deployer.address,
        0,
        mintPrice,
        mintPrice,
        mintPrice,
        uri,
        artistRoyalty
      )).to.be.revertedWith("Initializable: contract is already initialized")
    })
  })

  describe("mint", () => {
    describe("ETH/MATIC", () => {
      const coinId = 0

      it("should mint a new NFT", async () => {
        const { multiSig, collection, accounts, reward } = await loadFixture(testSetup_maxSupply_0)
        const [creator, acc] = [accounts[1], accounts[2]]

        const multiSigBalanceBefore = await ethers.provider.getBalance(multiSig.address)
        const creatorBalanceBefore = await ethers.provider.getBalance(creator.address)

        tx = await collection.connect(acc).mint(0, coinId, 0, { value: mintPrice.add(ethers.utils.parseEther("1")) })
        await tx.wait()

        const collectionBalance = await ethers.provider.getBalance(collection.address)
        const multiSigBalanceAfter = await ethers.provider.getBalance(multiSig.address)
        const creatorBalanceAfter = await ethers.provider.getBalance(creator.address)
        const score = (await reward.getUser(acc.address)).score

        // Check the token URI
        const tokenURI = await collection.tokenURI(0);
        expect(tokenURI).to.equal(uri + "0.json");

        const balance = await collection.balanceOf(acc.address)
        expect(balance.toNumber()).to.equal(1)

        const owner1 = await collection.ownerOf(0)
        expect(owner1).to.equal(acc.address)

        expect(collectionBalance).to.equal(ethers.utils.parseEther("0"))
        expect(multiSigBalanceAfter).to.equal(multiSigBalanceBefore.add(ethers.utils.parseEther("0.02")))
        expect(creatorBalanceAfter).to.equal(creatorBalanceBefore.add(ethers.utils.parseEther("0.98")))
        // expect(score.toNumber()).to.equal(1)
      });

      it("Should NOT mint new NFT if wrong amount of ETH is sent", async () => {
        const { collection, accounts } = await loadFixture(testSetup_maxSupply_0)
        const deployer = accounts[0]

        await expect(collection.connect(deployer).mint(0, coinId, 0, { value: ethers.utils.parseEther("0.1") }))
          .to.be.revertedWithCustomError(collection, "ERC721ArtNotEnoughValueOrAllowance")
      })

      it("Should NOT mint new NFT if tokenId exceeds maxSupply", async () => {
        const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
        const acc = accounts[2]

        await expect(collection.connect(acc).mint(5, 0, 0, { value: mintPrice }))
          .to.be.revertedWithCustomError(collection, "ERC721ArtMaxSupplyReached")
      })

      it("Should NOT mint new NFT if contract is paused", async () => {
        const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
        const [owner, acc] = [accounts[1], accounts[2]]

        const tx = await collection.connect(owner).pause()
        await tx.wait()

        await expect(collection.connect(acc).mint(2, coinId, 0, { value: mintPrice }))
          .to.be.revertedWith("Pausable: paused")
      })

      it("Should NOT mint a new NFT if contract/creator is corrupted", async () => {
        const { management, collection, accounts } = await loadFixture(testSetup_maxSupply_0)
        const [creator, acc] = [accounts[1], accounts[2]]

        const tx = await management.setCorrupted(creator.address, true)
        await tx.wait()

        await expect(collection.connect(acc).mint(0, coinId, 0, { value: mintPrice }))
          .to.be.revertedWithCustomError(collection, "ERC721ArtCollectionOrCreatorCorrupted")
      })

      it("should NOT mint a new NFT if crowdfund is set", async () => {
        const { management, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
        const creator = accounts[1]

        const ArtCollection = await ethers.getContractFactory("ERC721Art")
        const artCollection = await ArtCollection.deploy()
        await artCollection.deployed()

        const FundCollection = await ethers.getContractFactory("Crowdfund")
        const fundCollection = await FundCollection.deploy()
        await fundCollection.deployed()

        const cfLowQuotaValue = [ethers.utils.parseEther("0.1"), ethers.utils.parseEther("0.11"), ethers.utils.parseEther("0.12")]
        const cfRegQuotaValue = [ethers.utils.parseEther("0.5"), ethers.utils.parseEther("0.51"), ethers.utils.parseEther("0.52")]
        const cfHighQuotaValue = [ethers.utils.parseEther("1"), ethers.utils.parseEther("1.1"), ethers.utils.parseEther("1.2")]

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

        const tx_initializeArt = await artCollection.connect(signer).initialize(
          "bla", "BLA", creator.address, lowQuotaAm + regQuotaAm + highQuotaAm,
          ethers.constants.MaxUint256, ethers.constants.MaxUint256, ethers.constants.MaxUint256,
          "bla.com", 200
        )
        await tx_initializeArt.wait()

        const tx = await fundCollection.connect(signer).initialize(
          cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue,
          lowQuotaAm, regQuotaAm, highQuotaAm,
          ethers.constants.AddressZero, 0, 2500,
          artCollection.address
        )
        await tx.wait()

        const tx2 = await artCollection.connect(signer).setCrowdfund(fundCollection.address)
        await tx2.wait()

        await expect(artCollection.mint(3, 0, 0))
          .to.be.revertedWithCustomError(artCollection, "ERC721ArtCollectionForFund")
      });
    })

    describe("ERC20 token", () => {
      const coinId = 1

      it("should mint a new NFT", async () => {
        const { multiSig, collection, accounts, erc20, reward } = await loadFixture(testSetup_maxSupply_0_USDC)
        const [creator, acc] = [accounts[1], accounts[2]]

        const multiSigBalanceBefore = await erc20.balanceOf(multiSig.address)
        const creatorBalanceBefore = await erc20.balanceOf(creator.address)

        tx = await collection.connect(acc).mint(0, coinId, 0)
        await tx.wait()

        const collectionBalance = await erc20.balanceOf(collection.address)
        const multiSigBalanceAfter = await erc20.balanceOf(multiSig.address)
        const creatorBalanceAfter = await erc20.balanceOf(creator.address)
        const score = (await reward.getUser(acc.address)).score

        // Check the token URI
        const tokenURI = await collection.tokenURI(0);
        expect(tokenURI).to.equal(uri + "0.json");

        const balance = await collection.balanceOf(acc.address)
        expect(balance.toNumber()).to.equal(1)

        const owner1 = await collection.ownerOf(0)
        expect(owner1).to.equal(acc.address)

        expect(collectionBalance).to.equal(ethers.utils.parseEther("0"))
        expect(multiSigBalanceAfter).to.equal(multiSigBalanceBefore.add(ethers.utils.parseEther("0.02")))
        expect(creatorBalanceAfter).to.equal(creatorBalanceBefore.add(ethers.utils.parseEther("0.98")))
        // expect(score.toNumber()).to.equal(1)
      });

      it("Should NOT mint new NFT if not enough balance", async () => {
        const { collection, accounts, erc20 } = await loadFixture(testSetup_maxSupply_0_USDC)
        const acc = accounts[2]

        const tx = await erc20.connect(acc).approve(collection.address, ethers.utils.parseEther("0.5"))
        await tx.wait()

        await expect(collection.connect(acc).mint(0, coinId, 0))
          .to.be.revertedWithCustomError(collection, "ERC721ArtNotEnoughValueOrAllowance")
      })
    })
  })

  describe("mintToAddress", () => {
    it("Should mint a new NFT to the given address", async () => {
      const { management, collection, accounts, reward } = await loadFixture(testSetup_maxSupply_0)
      const [creator, acc] = [accounts[1], accounts[2]]

      // by manager
      tx = await collection.mintToAddress(acc.address, 0)
      await tx.wait()

      let score = (await reward.getUser(acc.address)).score
      // expect(score.toNumber()).to.equal(1)

      const tokenURI = await collection.tokenURI(0);
      expect(tokenURI).to.equal(uri + "0.json");

      const balance = await collection.balanceOf(acc.address)
      expect(balance.toNumber()).to.equal(1)

      const owner1 = await collection.ownerOf(0)
      expect(owner1).to.equal(acc.address)

      // by creator
      tx = await collection.connect(creator).mintToAddress(acc.address, 1)
      await tx.wait()

      score = (await reward.getUser(acc.address)).score
      // expect(score.toNumber()).to.equal(2)

      const tokenURIByCreator = await collection.tokenURI(1);
      expect(tokenURIByCreator).to.equal(uri + "1.json");

      const balanceByCreator = await collection.balanceOf(acc.address)
      expect(balanceByCreator.toNumber()).to.equal(2)

      const ownerByCreator = await collection.ownerOf(1)
      expect(ownerByCreator).to.equal(acc.address)
    });

    it("Should NOT mint a new NFT to the given address if contract paused", async () => {
      const { collection, accounts } = await loadFixture(testSetup_maxSupply_0)
      const acc1 = accounts[2]

      const tx = await collection.pause()
      await tx.wait()

      await expect(collection.mintToAddress(acc1.address, 0))
        .to.be.revertedWith("Pausable: paused")
    });

    it("Should NOT mint a new NFT to the given address if tokenId exceeds maxSupply", async () => {
      const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const acc1 = accounts[2]

      for (let ii = 0; ii < 5; ii++) {
        const tx = await collection.mintToAddress(acc1.address, ii)
        await tx.wait()
      }

      await expect(collection.mintToAddress(acc1.address, 5))
        .to.be.revertedWithCustomError(collection, "ERC721ArtMaxSupplyReached")
    });

    it("Should NOT mint a new NFT to the given address if caller not manager/creator", async () => {
      const { collection, accounts } = await loadFixture(testSetup_maxSupply_0)
      const [acc1, acc2] = [accounts[2], accounts[3]]

      await expect(collection.connect(acc1).mintToAddress(acc2.address, 0))
        .to.be.revertedWithCustomError(collection, "ERC721ArtNotAllowed")
    });
  })

  describe("mintForCrowdfund", () => {
    const cfLowQuotaValue = [ethers.utils.parseEther("0.1"), ethers.utils.parseEther("0.11"), ethers.utils.parseEther("0.12")]
    const cfRegQuotaValue = [ethers.utils.parseEther("0.5"), ethers.utils.parseEther("0.51"), ethers.utils.parseEther("0.52")]
    const cfHighQuotaValue = [ethers.utils.parseEther("1"), ethers.utils.parseEther("1.1"), ethers.utils.parseEther("1.2")]

    it("Should mint NFTs for the crowdfund investor", async () => {
      const { management, accounts, reward } = await loadFixture(testSetup_maxSupply_NOT_0)
      const [creator, acc1] = [accounts[1], accounts[2]]

      const lowQuotaAm = 5
      const regQuotaAm = 2
      const highQuotaAm = 1

      const allowCreator = await management.setCreator(creator.address, true)
      await allowCreator.wait()
      const newCol = await management.connect(creator).newCrowdfund(
        "MyNFT", "MNFT", "https://example.com/my-token/", 200, creator.address,
        [cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue,
          lowQuotaAm, regQuotaAm, highQuotaAm, accounts[10].address, 200, 3000]
      )
      const receipt = await newCol.wait()
      const event = receipt.events.filter(evt => evt?.event)
      const rightEvent = event.filter(evt => evt.args.fundCollection || evt.args.artCollection)
      const fundCollectionAddress = rightEvent[0].args.fundCollection
      const newCrowdfund = await ethers.getContractAt("contracts/Crowdfund.sol:Crowdfund", fundCollectionAddress)
      const artCollectionAddress = rightEvent[0].args.artCollection
      const newArtCollection = await ethers.getContractAt("contracts/ERC721Art.sol:ERC721Art", artCollectionAddress)

      let tx = await reward.setHashObject(
        newArtCollection.address, [0, 1, 2, 3, 4, 5, 6, 7], [1, 1, 1, 1, 1, 1, 1, 1], [1, 2, 3, 4, 5, 6, 7, 8]
      )
      await tx.wait()

      const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
        .add(cfRegQuotaValue[0].mul(regQuotaAm))
        .add(cfHighQuotaValue[0].mul(highQuotaAm))

      tx = await newCrowdfund.connect(acc1)
        .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
      await tx.wait()

      tx = await newCrowdfund.connect(acc1).mint(acc1.address)
      await tx.wait()

      const balance = await newArtCollection.balanceOf(acc1.address)
      const score = (await reward.getUser(acc1.address)).score

      expect(balance.toNumber()).to.equal(lowQuotaAm + regQuotaAm + highQuotaAm)
      // expect(score.toNumber()).to.equal(lowQuotaAm + regQuotaAm + highQuotaAm)
    })

    it("Should NOT mint NFTs for the crowdfund investor if crowdfund address is not set", async () => {
      const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const [creator, acc1] = [accounts[1], accounts[2]]

      const tokenIds = [0, 1, 2, 3, 4]
      const scores = [1, 1, 1, 1, 1]

      await expect(collection.mintForCrowdfund(tokenIds, scores, acc1.address))
        .to.be.revertedWithCustomError(collection, "ERC721ArtCollectionForFund")
    })

    it("Should NOT mint NFTs for the crowdfund investor if caller is not crowdfund contract", async () => {
      const { management, accounts, reward } = await loadFixture(testSetup_maxSupply_NOT_0)
      const [creator, acc1] = [accounts[1], accounts[2]]

      const lowQuotaAm = 5
      const regQuotaAm = 2
      const highQuotaAm = 1

      const allowCreator = await management.setCreator(creator.address, true)
      await allowCreator.wait()
      const newCol = await management.connect(creator).newCrowdfund(
        "MyNFT", "MNFT", "https://example.com/my-token/", 200, creator.address,
        [cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue,
          lowQuotaAm, regQuotaAm, highQuotaAm, accounts[10].address, 200, 3000]
      )
      const receipt = await newCol.wait()
      const event = receipt.events.filter(evt => evt?.event)
      const rightEvent = event.filter(evt => evt.args.fundCollection || evt.args.artCollection)
      const fundCollectionAddress = rightEvent[0].args.fundCollection
      const newCrowdfund = await ethers.getContractAt("contracts/Crowdfund.sol:Crowdfund", fundCollectionAddress)
      const artCollectionAddress = rightEvent[0].args.artCollection
      const newArtCollection = await ethers.getContractAt("contracts/ERC721Art.sol:ERC721Art", artCollectionAddress)

      const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
        .add(cfRegQuotaValue[0].mul(regQuotaAm))
        .add(cfHighQuotaValue[0].mul(highQuotaAm))

      let tx = await newCrowdfund.connect(acc1)
        .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
      await tx.wait()

      const tokenIds = [0, 1, 2, 3, 4]
      const scores = [1, 1, 1, 1, 1]

      tx = await reward.setHashObject(newArtCollection.address, [0, 1, 2, 3, 4], [1, 1, 1, 1, 1], [1, 2, 3, 4, 5])
      await tx.wait()

      await expect(newArtCollection.connect(acc1).mintForCrowdfund(tokenIds, scores, acc1.address))
        .to.be.revertedWithCustomError(newArtCollection, "ERC721ArtCallerNotCrowdfund")
    })

    it("Should NOT mint NFTs for the crowdfund investor if token ID exceeds maxSupply", async () => {
      const { management, accounts, reward } = await loadFixture(testSetup_maxSupply_NOT_0)
      const [creator, acc1] = [accounts[1], accounts[2]]

      const lowQuotaAm = 5
      const regQuotaAm = 2
      const highQuotaAm = 1

      const allowCreator = await management.setCreator(creator.address, true)
      await allowCreator.wait()
      const newCol = await management.connect(creator).newCrowdfund(
        "MyNFT", "MNFT", "https://example.com/my-token/", 200, creator.address,
        [cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue,
          lowQuotaAm, regQuotaAm, highQuotaAm, accounts[10].address, 200, 3000]
      )
      const receipt = await newCol.wait()
      const event = receipt.events.filter(evt => evt?.event)
      const rightEvent = event.filter(evt => evt.args.fundCollection || evt.args.artCollection)
      const fundCollectionAddress = rightEvent[0].args.fundCollection
      const newCrowdfund = await ethers.getContractAt("contracts/Crowdfund.sol:Crowdfund", fundCollectionAddress)
      const artCollectionAddress = rightEvent[0].args.artCollection
      const newArtCollection = await ethers.getContractAt("contracts/ERC721Art.sol:ERC721Art", artCollectionAddress)

      const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
        .add(cfRegQuotaValue[0].mul(regQuotaAm))
        .add(cfHighQuotaValue[0].mul(highQuotaAm))

      let tx = await newCrowdfund.connect(acc1)
        .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
      await tx.wait()

      const tokenId = [0, 1, 2, 3, 4, lowQuotaAm + regQuotaAm + highQuotaAm + 1]
      const scores = [1, 1, 1, 1, 1, 1]

      tx = await reward.setHashObject(newArtCollection.address, [0, 1, 2, 3, 4], [1, 1, 1, 1, 1], [1, 2, 3, 4, 5])
      await tx.wait()

      await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [newCrowdfund.address] });
      const signer = await ethers.getSigner(newCrowdfund.address)
      await expect(newArtCollection.connect(signer).mintForCrowdfund(tokenId, scores, acc1.address))
        .to.be.revertedWithCustomError(newArtCollection, "ERC721ArtMaxSupplyReached")
    })

    it("Should NOT mint NFTs for the crowdfund investor if contract paused", async () => {
      const { management, accounts, reward } = await loadFixture(testSetup_maxSupply_NOT_0)
      const [creator, acc1] = [accounts[1], accounts[2]]

      const lowQuotaAm = 5
      const regQuotaAm = 2
      const highQuotaAm = 1

      const allowCreator = await management.setCreator(creator.address, true)
      await allowCreator.wait()
      const newCol = await management.connect(creator).newCrowdfund(
        "MyNFT", "MNFT", "https://example.com/my-token/", 200, creator.address,
        [cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue,
          lowQuotaAm, regQuotaAm, highQuotaAm, accounts[10].address, 200, 3000]
      )
      const receipt = await newCol.wait()
      const event = receipt.events.filter(evt => evt?.event)
      const rightEvent = event.filter(evt => evt.args.fundCollection || evt.args.artCollection)
      const fundCollectionAddress = rightEvent[0].args.fundCollection
      const newCrowdfund = await ethers.getContractAt("contracts/Crowdfund.sol:Crowdfund", fundCollectionAddress)
      const artCollectionAddress = rightEvent[0].args.artCollection
      const newArtCollection = await ethers.getContractAt("contracts/ERC721Art.sol:ERC721Art", artCollectionAddress)

      const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
        .add(cfRegQuotaValue[0].mul(regQuotaAm))
        .add(cfHighQuotaValue[0].mul(highQuotaAm))

      let tx = await newCrowdfund.connect(acc1)
        .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
      await tx.wait()

      tx = await reward.setHashObject(newArtCollection.address, [0, 1, 2, 3, 4], [1, 1, 1, 1, 1], [1, 2, 3, 4, 5])
      await tx.wait()

      await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [newCrowdfund.address] });
      const signer = await ethers.getSigner(newCrowdfund.address)
      const tx_pause = await newArtCollection.connect(signer).pause()
      await tx_pause.wait()

      const tokenId = [0, 1, 2, 3, 4]
      const scores = [1, 1, 1, 1, 1]
      await expect(newArtCollection.connect(signer).mintForCrowdfund(tokenId, scores, acc1.address))
        .to.be.revertedWith("Pausable: paused")
    })

    it("Should NOT mint NFTs for the crowdfund investor if contract/creator is corrupted", async () => {
      const { management, accounts, reward } = await loadFixture(testSetup_maxSupply_NOT_0)
      const [creator, acc1] = [accounts[1], accounts[2]]

      const lowQuotaAm = 5
      const regQuotaAm = 2
      const highQuotaAm = 1

      const allowCreator = await management.setCreator(creator.address, true)
      await allowCreator.wait()
      const newCol = await management.connect(creator).newCrowdfund(
        "MyNFT", "MNFT", "https://example.com/my-token/", 200, creator.address,
        [cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue,
          lowQuotaAm, regQuotaAm, highQuotaAm, accounts[10].address, 200, 3000]
      )
      const receipt = await newCol.wait()
      const event = receipt.events.filter(evt => evt?.event)
      const rightEvent = event.filter(evt => evt.args.fundCollection || evt.args.artCollection)
      const fundCollectionAddress = rightEvent[0].args.fundCollection
      const newCrowdfund = await ethers.getContractAt("contracts/Crowdfund.sol:Crowdfund", fundCollectionAddress)
      const artCollectionAddress = rightEvent[0].args.artCollection
      const newArtCollection = await ethers.getContractAt("contracts/ERC721Art.sol:ERC721Art", artCollectionAddress)

      const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
        .add(cfRegQuotaValue[0].mul(regQuotaAm))
        .add(cfHighQuotaValue[0].mul(highQuotaAm))

      let tx = await newCrowdfund.connect(acc1)
        .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
      await tx.wait()

      const tx_corr = await management.setCorrupted(creator.address, true)
      await tx_corr.wait()

      await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [newCrowdfund.address] });
      const signer = await ethers.getSigner(newCrowdfund.address)

      const tokenId = [0, 1, 2, 3, 4]
      const scores = [1, 1, 1, 1, 1]

      tx = await reward.setHashObject(newArtCollection.address, [0, 1, 2, 3, 4], [1, 1, 1, 1, 1], [1, 2, 3, 4, 5])
      await tx.wait()

      await expect(newArtCollection.connect(signer).mintForCrowdfund(tokenId, scores, acc1.address))
        .to.be.revertedWithCustomError(newArtCollection, "ERC721ArtCollectionOrCreatorCorrupted")
    })

    it("Should NOT mint NFTs for the crowdfund investor if scores and tokenIds arrays have not the same length", async () => {
      const { management, accounts, reward } = await loadFixture(testSetup_maxSupply_NOT_0)
      const [creator, acc1] = [accounts[1], accounts[2]]

      const lowQuotaAm = 5
      const regQuotaAm = 2
      const highQuotaAm = 1

      const allowCreator = await management.setCreator(creator.address, true)
      await allowCreator.wait()
      const newCol = await management.connect(creator).newCrowdfund(
        "MyNFT", "MNFT", "https://example.com/my-token/", 200, creator.address,
        [cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue,
          lowQuotaAm, regQuotaAm, highQuotaAm, accounts[10].address, 200, 3000]
      )
      const receipt = await newCol.wait()
      const event = receipt.events.filter(evt => evt?.event)
      const rightEvent = event.filter(evt => evt.args.fundCollection || evt.args.artCollection)
      const fundCollectionAddress = rightEvent[0].args.fundCollection
      const newCrowdfund = await ethers.getContractAt("contracts/Crowdfund.sol:Crowdfund", fundCollectionAddress)
      const artCollectionAddress = rightEvent[0].args.artCollection
      const newArtCollection = await ethers.getContractAt("contracts/ERC721Art.sol:ERC721Art", artCollectionAddress)

      const totalPayment = cfLowQuotaValue[0].mul(lowQuotaAm)
        .add(cfRegQuotaValue[0].mul(regQuotaAm))
        .add(cfHighQuotaValue[0].mul(highQuotaAm))

      let tx = await newCrowdfund.connect(acc1)
        .invest(lowQuotaAm, regQuotaAm, highQuotaAm, 0, { value: totalPayment })
      await tx.wait()

      await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [newCrowdfund.address] });
      const signer = await ethers.getSigner(newCrowdfund.address)

      const tokenId = [0, 1, 2, 3, 4]
      const scores = [1, 1, 1, 1, 1, 1]

      tx = await reward.setHashObject(newArtCollection.address, [0, 1, 2, 3, 4], [1, 1, 1, 1, 1], [1, 2, 3, 4, 5])
      await tx.wait()

      await expect(newArtCollection.connect(signer).mintForCrowdfund(tokenId, scores, acc1.address))
        .to.be.revertedWithCustomError(newArtCollection, "ERC721ArtArraysDoNotMatch")
    })
  })

  describe("burn", () => {
    it("Should burn token", async () => {
      const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const [creator, acc] = [accounts[1], accounts[2]]

      tx = await collection.connect(acc).mint(0, 0, 0, { value: mintPrice })
      await tx.wait()
      tx = await collection.connect(acc).mint(1, 0, 0, { value: mintPrice })
      await tx.wait()

      tx = await collection.connect(creator).burn(0)
      await tx.wait()

      const balanceOf = await collection.balanceOf(acc.address)
      expect(balanceOf.toNumber()).to.equal(1)

      await expect(collection.ownerOf(0))
        .to.be.revertedWith("ERC721: invalid token ID")
    })

    it("Should burn token by managers if contract/creator is corrupted", async () => {
      const { management, collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const [creator, acc] = [accounts[1], accounts[2]]

      tx = await collection.connect(acc).mint(0, 0, 0, { value: mintPrice })
      await tx.wait()
      tx = await collection.connect(acc).mint(1, 0, 0, { value: mintPrice })
      await tx.wait()

      tx = await management.setCorrupted(creator.address, true)
      await tx.wait()

      tx = await collection.burn(0)
      await tx.wait()

      const balanceOf = await collection.balanceOf(acc.address)
      expect(balanceOf.toNumber()).to.equal(1)

      await expect(collection.ownerOf(0))
        .to.be.revertedWith("ERC721: invalid token ID")
    })

    it("Should NOT burn token if caller is not creator", async () => {
      const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const acc = accounts[2]

      tx = await collection.connect(acc).mint(0, 0, 0, { value: mintPrice })
      await tx.wait()

      await expect(collection.connect(acc).burn(0))
        .to.be.revertedWithCustomError(collection, "ERC721ArtNotAllowed")
    })

    it("Should NOT burn token if tokenId doesn't exist", async () => {
      const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const [creator, acc] = [accounts[1], accounts[2]]

      tx = await collection.connect(acc).mint(0, 0, 0, { value: mintPrice })
      await tx.wait()

      await expect(collection.connect(creator).burn(1))
        .to.be.revertedWith("ERC721: invalid token ID")
    })

    it("Should NOT burn token if contract paused", async () => {
      const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const [creator, acc] = [accounts[1], accounts[2]]

      tx = await collection.connect(acc).mint(0, 0, 0, { value: mintPrice })
      await tx.wait()

      tx = await collection.pause()
      await tx.wait()

      await expect(collection.connect(creator).burn(1))
        .to.be.revertedWith("Pausable: paused")
    })

    it("Should NOT burn token when contract/creator is corrupted if caller is not manager", async () => {
      const { management, collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const [creator, acc] = [accounts[1], accounts[2]]

      let tx = await collection.connect(acc).mint(0, 0, 0, { value: mintPrice })
      await tx.wait()
      tx = await collection.connect(acc).mint(1, 0, 0, { value: mintPrice })
      await tx.wait()

      tx = await management.setCorrupted(creator.address, true)
      await tx.wait()

      await expect(collection.connect(creator).burn(0))
        .to.be.revertedWithCustomError(collection, "ERC721ArtNotAllowed")
    })
  })

  describe("creatorsProSafeTransferFrom", () => {
    describe("ETH/MATIC", () => {
      const coinId = 0

      it("Should transfer NFT from owner to another user", async () => {
        const { collection, accounts, multiSig } = await loadFixture(testSetup_maxSupply_NOT_0)
        const [owner, acc1, acc2] = [accounts[1], accounts[2], accounts[3]]

        let tx = await collection.connect(acc1).mint(0, coinId, 0, { value: mintPrice })
        await tx.wait()
        tx = await collection.connect(acc1).setTokenPrice(0, mintPrice, 0)
        await tx.wait()

        const ownerBalanceBefore = await ethers.provider.getBalance(owner.address)

        const tx_transfer = await collection.connect(acc1).creatorsProSafeTransferFrom(
          acc1.address,
          acc2.address,
          0,
          coinId,
          { value: mintPrice.add(ethers.utils.parseEther("1")) }
        )
        await tx_transfer.wait()

        const balanceOf_accounts_2 = await collection.balanceOf(acc1.address)
        const balanceOf_accounts_3 = await collection.balanceOf(acc2.address)

        const ownerBalanceAfter = await ethers.provider.getBalance(owner.address)
        const multiSigBalance = await ethers.provider.getBalance(multiSig.address)

        expect(balanceOf_accounts_2.toNumber()).to.equal(0)
        expect(balanceOf_accounts_3.toNumber()).to.equal(1)
        expect(multiSigBalance).to.equal(mintPrice.mul(2 * creatorsRoyalty).div(10000))
        expect(ownerBalanceAfter).to.equal(ownerBalanceBefore.add(mintPrice.mul(artistRoyalty).div(10000)))
      })

      it("Should transfer NFT from owner by operator to another user", async () => {
        const { collection, accounts, multiSig } = await loadFixture(testSetup_maxSupply_NOT_0)
        const [deployer, owner, acc1, acc2] = [accounts[0], accounts[1], accounts[2], accounts[3]]

        let tx = await collection.connect(acc1).mint(0, coinId, 0, { value: mintPrice })
        await tx.wait()

        const tx2 = await collection.connect(acc1).setTokenPrice(0, mintPrice, 0)
        await tx2.wait()

        const tx_approval = await collection.connect(accounts[2]).approve(deployer.address, 0)
        await tx_approval.wait()

        const ownerBalanceBefore = await ethers.provider.getBalance(owner.address)

        const tx_transfer = await collection.connect(deployer).creatorsProSafeTransferFrom(
          acc1.address,
          acc2.address,
          0,
          coinId,
          { value: mintPrice }
        )
        await tx_transfer.wait()

        const balanceOf_accounts_2 = await collection.balanceOf(acc1.address)
        const balanceOf_accounts_3 = await collection.balanceOf(acc2.address)

        const multiSigBalance = await ethers.provider.getBalance(multiSig.address)
        const ownerBalanceAfter = await ethers.provider.getBalance(owner.address)

        expect(balanceOf_accounts_2.toNumber()).to.equal(0)
        expect(balanceOf_accounts_3.toNumber()).to.equal(1)
        expect(multiSigBalance).to.equal(mintPrice.mul(2 * creatorsRoyalty).div(10000))
        expect(ownerBalanceAfter).to.equal(ownerBalanceBefore.add(mintPrice.mul(artistRoyalty).div(10000)))
      })

      it("Should transfer NFT from owner to another user if 30 days has passed from last transfer", async () => {
        const { collection, accounts, multiSig } = await loadFixture(testSetup_maxSupply_NOT_0)
        const [acc1, acc2] = [accounts[2], accounts[3]]


        const tx1 = await collection.connect(acc1).mint(0, coinId, 0, { value: mintPrice })
        await tx1.wait()
        const tx2 = await collection.connect(acc1).mint(1, coinId, 0, { value: mintPrice })
        await tx2.wait()
        const tx3 = await collection.connect(acc1).setTokenPrice(0, mintPrice, 0)
        await tx3.wait()

        const tx_transfer1 = await collection.connect(acc1).creatorsProSafeTransferFrom(
          acc1.address,
          acc2.address,
          0,
          coinId,
          { value: mintPrice }
        )
        await tx_transfer1.wait()

        const THIRTY_DAYS_IN_SECS = 30 * 24 * 60 * 60;
        const unlockTime = (await time.latest()) + THIRTY_DAYS_IN_SECS;
        await time.increaseTo(unlockTime);

        const tx4 = await collection.connect(acc2).setTokenPrice(0, mintPrice, 0)
        await tx4.wait()

        const tx_transfer2 = await collection.connect(acc2).creatorsProSafeTransferFrom(
          acc2.address,
          acc1.address,
          0,
          coinId,
          { value: mintPrice }
        )
        await tx_transfer2.wait()

        const balanceOf_accounts_1 = await collection.balanceOf(acc1.address)
        const balanceOf_accounts_2 = await collection.balanceOf(acc2.address)

        const multiSigBalance = await ethers.provider.getBalance(multiSig.address);

        expect(balanceOf_accounts_1.toNumber()).to.equal(2)
        expect(balanceOf_accounts_2.toNumber()).to.equal(0)
        expect(multiSigBalance).to.equal(mintPrice.mul(4 * creatorsRoyalty).div(10000))
      })

      it("Should NOT transfer NFT if caller is not operator", async () => {
        const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
        const [deployer, acc1, acc2] = [accounts[0], accounts[2], accounts[3]]

        let tx = await collection.connect(acc1).mint(0, coinId, 0, { value: mintPrice })
        await tx.wait()
        const tx2 = await collection.connect(acc1).setTokenPrice(0, mintPrice, 0)
        await tx2.wait()

        await expect(collection.connect(deployer).creatorsProSafeTransferFrom(
          acc1.address,
          acc2.address,
          0,
          coinId,
          { value: mintPrice }
        )).to.be.revertedWith("ERC721: caller is not token owner or approved")
      })

      it("Should NOT transfer NFT from owner to another user if 30 days has NOT passed from last transfer", async () => {
        const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
        const [acc1, acc2] = [accounts[2], accounts[3]]

        let tx = await collection.connect(acc1).mint(0, coinId, 0, { value: mintPrice })
        await tx.wait()
        const tx2 = await collection.connect(acc1).setTokenPrice(0, mintPrice, 0)
        await tx2.wait()

        const tx_transfer1 = await collection.connect(acc1).creatorsProSafeTransferFrom(
          acc1.address,
          acc2.address,
          0,
          coinId,
          { value: mintPrice }
        )
        await tx_transfer1.wait()

        const tx3 = await collection.connect(acc2).setTokenPrice(0, mintPrice, 0)
        await tx3.wait()

        await expect(collection.connect(acc2).creatorsProSafeTransferFrom(
          acc2.address, acc1.address, 0, coinId, { value: mintPrice }
        )).to.be.revertedWithCustomError(collection, "ERC721ArtTransferDeadlineOngoing")
      })

      it("Should NOT transfer NFT if contract paused", async () => {
        const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
        const [creator, acc1, acc2] = [accounts[1], accounts[2], accounts[3]]

        let tx = await collection.connect(acc1).mint(0, coinId, 0, { value: mintPrice })
        await tx.wait()
        const tx2 = await collection.connect(acc1).setTokenPrice(0, mintPrice, 0)
        await tx2.wait()

        const tx3 = await collection.connect(creator).pause()
        await tx3.wait()

        await expect(collection.connect(acc1).creatorsProSafeTransferFrom(
          acc1.address, acc2.address, 0, coinId, { value: mintPrice }
        )).to.be.revertedWith("Pausable: paused")
      })

      it("Should NOT transfer NFT if value sent isn't enough", async () => {
        const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
        const [acc1, acc2] = [accounts[2], accounts[3]]

        let tx = await collection.connect(acc1).mint(0, coinId, 0, { value: mintPrice })
        await tx.wait()
        const tx2 = await collection.connect(acc1).setTokenPrice(0, mintPrice, 0)
        await tx2.wait()

        await expect(collection.connect(acc1).creatorsProSafeTransferFrom(
          acc1.address, acc2.address, 0, coinId, { value: ethers.utils.parseEther("0.5") }
        )).to.be.revertedWithCustomError(collection, "ERC721ArtNotEnoughValueOrAllowance")
      })

      it("Should NOT transfer NFT from owner to another user if contract/creator is corrupted", async () => {
        const { management, collection, accounts } = await loadFixture(testSetup_maxSupply_0)
        const [creator, acc1, acc2] = [accounts[1], accounts[2], accounts[3]]

        const tx1 = await collection.connect(acc1).mint(0, coinId, 0, { value: mintPrice })
        await tx1.wait()
        const tx2 = await collection.connect(acc1).mint(1, coinId, 0, { value: mintPrice })
        await tx2.wait()

        const tx3 = await management.setCorrupted(creator.address, true)
        await tx3.wait()

        await expect(collection.connect(acc2).creatorsProSafeTransferFrom(
          acc2.address, acc1.address, 0, coinId, { value: mintPrice }
        )).to.be.revertedWithCustomError(collection, "ERC721ArtCollectionOrCreatorCorrupted")
      });
    })

    describe("ERC20 token", () => {
      const coinId = 1

      it("Should transfer NFT from owner to another user", async () => {
        const { collection, accounts, multiSig, erc20 } = await loadFixture(testSetup_maxSupply_NOT_0_USDC)
        const [owner, acc1, acc2] = [accounts[1], accounts[2], accounts[3]]


        let tx = await collection.connect(acc1).mint(0, coinId, 0, { value: mintPrice })
        await tx.wait()
        const tx2 = await collection.connect(acc1).setTokenPrice(0, mintPrice, 1)
        await tx2.wait()

        const ownerBalanceBefore = await erc20.balanceOf(owner.address)

        const tx_transfer = await collection.connect(acc1).creatorsProSafeTransferFrom(
          acc1.address,
          acc2.address,
          0,
          coinId,
          { value: mintPrice }
        )
        await tx_transfer.wait()

        const balanceOf_accounts_2 = await collection.balanceOf(acc1.address)
        const balanceOf_accounts_3 = await collection.balanceOf(acc2.address)

        const ownerBalanceAfter = await erc20.balanceOf(owner.address)
        const multiSigBalance = await erc20.balanceOf(multiSig.address)

        expect(balanceOf_accounts_2.toNumber()).to.equal(0)
        expect(balanceOf_accounts_3.toNumber()).to.equal(1)
        expect(multiSigBalance).to.equal(mintPrice.mul(2 * creatorsRoyalty).div(10000))
        expect(ownerBalanceAfter).to.equal(ownerBalanceBefore.add(mintPrice.mul(artistRoyalty).div(10000)))
      })

      it("Should NOT transfer NFT if not enough balance", async () => {
        const { collection, accounts, erc20 } = await loadFixture(testSetup_maxSupply_NOT_0_USDC)
        const [operator, acc1, acc2] = [accounts[0], accounts[2], accounts[3]]

        tx = await collection.connect(acc1).setApprovalForAll(operator.address, true)
        await tx.wait()

        const tx2 = await collection.connect(acc1).mint(0, coinId, 0, { value: mintPrice })
        await tx2.wait()

        const tx3 = await erc20.connect(acc1).approve(collection.address, ethers.utils.parseEther("0.5"))
        await tx3.wait()

        const tx4 = await collection.connect(acc1).setTokenPrice(0, mintPrice, 1)
        await tx4.wait()

        await expect(collection.creatorsProSafeTransferFrom(
          acc1.address, acc2.address, 0, coinId
        )).to.be.revertedWithCustomError(collection, "ERC721ArtNotEnoughValueOrAllowance")
      })
    })
  })

  describe("setPrice", () => {
    it("Should set new price", async () => {
      const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const owner = accounts[1]

      const priceBeforeETH = await collection.pricePerCoin(0)
      const priceBeforeUSDT = await collection.pricePerCoin(1)
      const priceBeforeCreatorsPRO = await collection.pricePerCoin(2)

      const tx = await collection.connect(owner).setPrice(ethers.utils.parseEther("2"), 0)
      await tx.wait()
      const tx2 = await collection.connect(owner).setPrice(ethers.utils.parseEther("2"), 1)
      await tx2.wait()
      const tx3 = await collection.connect(owner).setPrice(ethers.utils.parseEther("2"), 2)
      await tx3.wait()

      const priceAfterETH = await collection.pricePerCoin(0)
      const priceAfterUSDT = await collection.pricePerCoin(1)
      const priceAfterCreatorsPRO = await collection.pricePerCoin(2)

      expect(priceBeforeETH).to.equal(ethers.utils.parseEther("1"))
      expect(priceAfterETH).to.equal(ethers.utils.parseEther("2"))
      expect(priceBeforeUSDT).to.equal(ethers.utils.parseEther("1"))
      expect(priceAfterUSDT).to.equal(ethers.utils.parseEther("2"))
      expect(priceBeforeCreatorsPRO).to.equal(ethers.utils.parseEther("1"))
      expect(priceAfterCreatorsPRO).to.equal(ethers.utils.parseEther("2"))
    })

    it("Should NOT set new price if caller is not owner", async () => {
      const { collection } = await loadFixture(testSetup_maxSupply_NOT_0)

      const priceBefore = await collection.pricePerCoin(0)

      expect(priceBefore).to.equal(ethers.utils.parseEther("1"))
      await expect(collection.setPrice(ethers.utils.parseEther("2"), 0))
        .to.be.revertedWith("Ownable: caller is not the owner")
    })

    it("Should NOT set new price if contract paused", async () => {
      const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const creator = accounts[1]

      const priceBefore = await collection.pricePerCoin(0)
      const tx = await collection.pause()
      await tx.wait()

      expect(priceBefore).to.equal(ethers.utils.parseEther("1"))
      await expect(collection.connect(creator).setPrice(ethers.utils.parseEther("2"), 0))
        .to.be.revertedWith("Pausable: paused")
    })

    it("Should NOT set new price if contract/creator is corrupted", async () => {
      const { management, collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)

      const priceBefore = await collection.pricePerCoin(0)
      const tx = await management.setCorrupted(accounts[1].address, true)
      await tx.wait()

      expect(priceBefore).to.equal(ethers.utils.parseEther("1"))
      await expect(collection.connect(accounts[1]).setPrice(ethers.utils.parseEther("2"), 0))
        .to.be.revertedWithCustomError(collection, "ERC721ArtCollectionOrCreatorCorrupted")
    })
  })

  describe("setTokenPrice", () => {
    it("Should set new price for given token ID", async () => {
      const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const acc1 = accounts[2]

      const tx = await collection.connect(acc1).mint(0, 0, 0, { value: mintPrice })
      await tx.wait()

      const priceBefore = await collection.tokenPrice(0, 0)

      const tx2 = await collection.connect(acc1).setTokenPrice(0, ethers.utils.parseEther("2"), 0)
      await tx2.wait()

      const priceAfter = await collection.tokenPrice(0, 0)

      expect(priceBefore).to.equal(ethers.constants.MaxUint256)
      expect(priceAfter).to.equal(ethers.utils.parseEther("2"))
    })

    it("Should NOT set new price for given token ID if caller is not token owner", async () => {
      const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const acc1 = accounts[1]

      const tx = await collection.connect(acc1).mint(0, 0, 0, { value: mintPrice })
      await tx.wait()

      const priceBefore = await collection.tokenPrice(0, 0)

      expect(priceBefore).to.equal(ethers.constants.MaxUint256)
      await expect(collection.setTokenPrice(0, ethers.utils.parseEther("1"), 0))
        .to.be.revertedWithCustomError(collection, "ERC721ArtNotTokenOwner")
    })

    it("Should NOT set new price for given token ID if contract paused", async () => {
      const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const acc1 = accounts[1]

      const tx = await collection.connect(acc1).mint(0, 0, 0, { value: mintPrice })
      await tx.wait()

      const priceBefore = await collection.tokenPrice(0, 0)

      const tx2 = await collection.pause()
      await tx2.wait()

      expect(priceBefore).to.equal(ethers.constants.MaxUint256)
      await expect(collection.connect(acc1).setTokenPrice(0, ethers.utils.parseEther("1"), 0))
        .to.be.revertedWith("Pausable: paused")
    })

    it("Should NOT set new price for given token ID if contract/creator is corrupted", async () => {
      const { management, collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const [creator, acc1] = [accounts[1], accounts[2]]

      const tx = await collection.connect(acc1).mint(0, 0, 0, { value: mintPrice })
      await tx.wait()

      const priceBefore = await collection.tokenPrice(0, 0)

      const tx2 = await management.setCorrupted(creator.address, true)
      await tx2.wait()

      expect(priceBefore).to.equal(ethers.constants.MaxUint256)
      await expect(collection.connect(acc1).setTokenPrice(0, ethers.utils.parseEther("1"), 0))
        .to.be.revertedWithCustomError(collection, "ERC721ArtCollectionOrCreatorCorrupted")
    })
  })

  describe("setBaseURI", () => {
    it("Should set new base URI", async () => {
      const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const creator = accounts[1]

      const tx = await collection.connect(creator).setBaseURI("https://example.com/new-base-uri-creator/")
      await tx.wait()

      const newBaseURICreator = await collection.baseURI()

      const tx2 = await collection.setBaseURI("https://example.com/new-base-uri-manager/")
      await tx2.wait()

      const newBaseURIManager = await collection.baseURI()

      expect(newBaseURICreator).to.equal("https://example.com/new-base-uri-creator/")
      expect(newBaseURIManager).to.equal("https://example.com/new-base-uri-manager/")
    })

    it("Should set new base URI by managers if contract/creator is corrupted", async () => {
      const { management, collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)

      const tx1 = await management.setCorrupted(accounts[1].address, true)
      await tx1.wait()

      const tx2 = await collection.setBaseURI("https://example.com/new-base-uri-manager/")
      await tx2.wait()

      const newBaseURIManager = await collection.baseURI()

      expect(newBaseURIManager).to.equal("https://example.com/new-base-uri-manager/")
    })

    it("Should NOT set new base URI if caller is not collection manager/creator", async () => {
      const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const acc = accounts[2]

      await expect(collection.connect(acc).setBaseURI("https://example.com/new-base-uri/"))
        .to.be.revertedWithCustomError(collection, "ERC721ArtNotAllowed")
    })

    it("Should NOT set new base URI when contract/creator is corrupted if caller not manager", async () => {
      const { management, collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const acc = accounts[2]

      const tx = await management.setCorrupted(accounts[1].address, true)
      await tx.wait()

      await expect(collection.connect(acc).setBaseURI("https://example.com/new-base-uri/"))
        .to.be.revertedWithCustomError(collection, "ERC721ArtNotAllowed")
    })

    it("Should NOT set new base URI if contract paused", async () => {
      const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const acc = accounts[2]

      const tx = await collection.pause()
      await tx.wait()

      await expect(collection.setBaseURI("https://example.com/new-base-uri/"))
        .to.be.revertedWith("Pausable: paused")
    })
  })

  describe("setRoyalty", () => {
    it("Should set new royalty", async () => {
      const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const [creator, acc] = [accounts[1], accounts[2]]

      const royaltyBefore = await collection.getRoyalty()

      const tx2 = await collection.connect(creator).setRoyalty(300)
      await tx2.wait()

      const royaltyAfter = await collection.getRoyalty()

      expect(royaltyBefore[0]).to.equal(creator.address)
      expect(royaltyBefore[1].toNumber()).to.equal(200)
      expect(royaltyAfter[0]).to.equal(creator.address)
      expect(royaltyAfter[1].toNumber()).to.equal(300)
    })

    it("Should NOT set new royalty if caller is not creator", async () => {
      const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const acc = accounts[2]

      await expect(collection.connect(acc).setRoyalty(300))
        .to.be.revertedWith("Ownable: caller is not the owner")
    })

    it("Should NOT set new royalty if contract paused", async () => {
      const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const creator = accounts[1]

      const tx = await collection.pause()
      await tx.wait()

      await expect(collection.connect(creator).setRoyalty(300))
        .to.be.revertedWith("Pausable: paused")
    })

    it("Should NOT set new royalty if contract/creator is corrupted", async () => {
      const { management, collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const creator = accounts[1]

      const tx = await management.setCorrupted(creator.address, true)
      await tx.wait()

      await expect(collection.connect(creator).setRoyalty(300))
        .to.be.revertedWithCustomError(collection, "ERC721ArtCollectionOrCreatorCorrupted")
    })
  })

  describe("setCrowdfund", () => {
    const cfLowQuotaValue = [ethers.utils.parseEther("0.1"), ethers.utils.parseEther("0.11"), ethers.utils.parseEther("0.12")]
    const cfRegQuotaValue = [ethers.utils.parseEther("0.5"), ethers.utils.parseEther("0.51"), ethers.utils.parseEther("0.52")]
    const cfHighQuotaValue = [ethers.utils.parseEther("1"), ethers.utils.parseEther("1.1"), ethers.utils.parseEther("1.2")]

    it("Should set art collection for crowdfund", async () => {
      const { management, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const creator = accounts[1]

      const ArtCollection = await ethers.getContractFactory("ERC721Art")
      const artCollection = await ArtCollection.deploy()
      await artCollection.deployed()

      const FundCollection = await ethers.getContractFactory("Crowdfund")
      const fundCollection = await FundCollection.deploy()
      await fundCollection.deployed()

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

      const tx_initializeArt = await artCollection.connect(signer).initialize(
        "bla", "BLA", creator.address, lowQuotaAm + regQuotaAm + highQuotaAm,
        ethers.constants.MaxUint256, ethers.constants.MaxUint256, ethers.constants.MaxUint256,
        "bla.com", 200
      )
      await tx_initializeArt.wait()

      const tx = await fundCollection.connect(signer).initialize(
        cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue,
        lowQuotaAm, regQuotaAm, highQuotaAm,
        ethers.constants.AddressZero, 0, 2500,
        artCollection.address
      )
      await tx.wait()

      const tx2 = await artCollection.connect(signer).setCrowdfund(fundCollection.address)
      await tx2.wait()

      const crowdfund = await artCollection.crowdfund()

      expect(crowdfund).to.equal(fundCollection.address)
    })

    it("Should NOT set art collection for crowdfund if caller is not Management contract", async () => {
      const { management, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const creator = accounts[1]

      const ArtCollection = await ethers.getContractFactory("ERC721Art")
      const artCollection = await ArtCollection.deploy()
      await artCollection.deployed()

      const FundCollection = await ethers.getContractFactory("Crowdfund")
      const fundCollection = await FundCollection.deploy()
      await fundCollection.deployed()

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

      const tx_initializeArt = await artCollection.connect(signer).initialize(
        "bla", "BLA", creator.address, lowQuotaAm + regQuotaAm + highQuotaAm,
        ethers.constants.MaxUint256, ethers.constants.MaxUint256, ethers.constants.MaxUint256,
        "bla.com", 200
      )
      await tx_initializeArt.wait()

      const tx = await fundCollection.connect(signer).initialize(
        cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue,
        lowQuotaAm, regQuotaAm, highQuotaAm,
        ethers.constants.AddressZero, 0, 2500,
        artCollection.address
      )
      await tx.wait()

      await expect(artCollection.setCrowdfund(fundCollection.address))
        .to.be.revertedWithCustomError(artCollection, "ERC721ArtNotAllowed")
    })

    it("Should NOT set art collection for crowdfund if already set", async () => {
      const { management, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const creator = accounts[1]

      const ArtCollection = await ethers.getContractFactory("ERC721Art")
      const artCollection = await ArtCollection.deploy()
      await artCollection.deployed()

      const FundCollection = await ethers.getContractFactory("Crowdfund")
      const fundCollection = await FundCollection.deploy()
      await fundCollection.deployed()

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

      const tx_initializeArt = await artCollection.connect(signer).initialize(
        "bla", "BLA", creator.address, lowQuotaAm + regQuotaAm + highQuotaAm,
        ethers.constants.MaxUint256, ethers.constants.MaxUint256, ethers.constants.MaxUint256,
        "bla.com", 200
      )
      await tx_initializeArt.wait()

      const tx = await fundCollection.connect(signer).initialize(
        cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue,
        lowQuotaAm, regQuotaAm, highQuotaAm,
        ethers.constants.AddressZero, 0, 2500,
        artCollection.address
      )
      await tx.wait()

      const tx2 = await artCollection.connect(signer).setCrowdfund(fundCollection.address)
      await tx2.wait()

      await expect(artCollection.connect(signer).setCrowdfund(fundCollection.address))
        .to.be.revertedWithCustomError(artCollection, "ERC721ArtCrodFundIsSet")
    })

    it("Should NOT set art collection for crowdfund if crowdfund address is invalid", async () => {
      const { management, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const [creator, acc1] = [accounts[1], accounts[2]]

      let artCollection

      let artCollectionFalse
      let fundCollectionFalse

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

      fundCollectionFalse = await FundCollection.deploy()
      await fundCollectionFalse.deployed()

      tx = await artCollectionFalse.connect(signerFalse).initialize(
        "bla", "BLA", creator.address, lowQuotaAm + regQuotaAm + highQuotaAm,
        ethers.constants.MaxUint256, ethers.constants.MaxUint256, ethers.constants.MaxUint256,
        "bla.com", 200
      )
      await tx.wait()

      tx = await fundCollectionFalse.connect(signerFalse).initialize(
        cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue,
        lowQuotaAm, regQuotaAm, highQuotaAm,
        ethers.constants.AddressZero, 0, 2500,
        artCollectionFalse.address
      )
      await tx.wait()

      artCollection = await ArtCollection.deploy()
      await artCollection.deployed()
      tx = await artCollection.connect(signer).initialize(
        "bla", "BLA", creator.address, lowQuotaAm + regQuotaAm + highQuotaAm,
        ethers.constants.MaxUint256, ethers.constants.MaxUint256, ethers.constants.MaxUint256,
        "bla.com", 200
      )
      await tx.wait()

      let managementAddressFalse = await fundCollectionFalse.management()
      let managementAddressTrue = await artCollection.management()

      expect(managementAddressFalse).not.to.equal(managementAddressTrue)
      await expect(artCollection.connect(signer).setCrowdfund(fundCollectionFalse.address))
        .to.be.revertedWithCustomError(artCollection, "ERC721ArtInvalidCrowdFund")

      // Different owners

      artCollectionFalse = await ArtCollection.deploy()
      await artCollectionFalse.deployed()

      fundCollectionFalse = await FundCollection.deploy()
      await fundCollectionFalse.deployed()

      tx = await artCollectionFalse.connect(signer).initialize(
        "bla", "BLA", acc1.address, lowQuotaAm + regQuotaAm + highQuotaAm,
        ethers.constants.MaxUint256, ethers.constants.MaxUint256, ethers.constants.MaxUint256,
        "bla.com", 200
      )
      await tx.wait()

      tx = await fundCollectionFalse.connect(signer).initialize(
        cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue,
        lowQuotaAm, regQuotaAm, highQuotaAm,
        ethers.constants.AddressZero, 0, 2500,
        artCollectionFalse.address
      )
      await tx.wait()

      artCollection = await ArtCollection.deploy()
      await artCollection.deployed()
      tx = await artCollection.connect(signer).initialize(
        "bla", "BLA", creator.address, lowQuotaAm + regQuotaAm + highQuotaAm,
        ethers.constants.MaxUint256, ethers.constants.MaxUint256, ethers.constants.MaxUint256,
        "bla.com", 200
      )
      await tx.wait()

      managementAddressFalse = await fundCollectionFalse.management()
      let ownerFalse = await fundCollectionFalse.owner()
      managementAddressTrue = await artCollection.management()
      let owerTrue = await artCollection.owner()

      expect(managementAddressFalse).to.equal(managementAddressTrue)
      expect(ownerFalse).not.to.equal(owerTrue)
      await expect(artCollection.connect(signer).setCrowdfund(fundCollectionFalse.address))
        .to.be.revertedWithCustomError(artCollection, "ERC721ArtInvalidCrowdFund")

      // maxSupply != Crowdfund.maxQuotasAmount

      artCollectionFalse = await ArtCollection.deploy()
      await artCollectionFalse.deployed()

      fundCollectionFalse = await FundCollection.deploy()
      await fundCollectionFalse.deployed()

      tx = await artCollectionFalse.connect(signer).initialize(
        "bla", "BLA", creator.address, lowQuotaAm + regQuotaAm + highQuotaAm,
        ethers.constants.MaxUint256, ethers.constants.MaxUint256, ethers.constants.MaxUint256,
        "bla.com", 200
      )
      await tx.wait()

      tx = await fundCollectionFalse.connect(signer).initialize(
        cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue,
        lowQuotaAm, regQuotaAm, highQuotaAm,
        ethers.constants.AddressZero, 0, 2500,
        artCollectionFalse.address
      )
      await tx.wait()

      artCollection = await ArtCollection.deploy()
      await artCollection.deployed()
      tx = await artCollection.connect(signer).initialize(
        "bla", "BLA", creator.address, lowQuotaAm + regQuotaAm + highQuotaAm + 1,
        ethers.constants.MaxUint256, ethers.constants.MaxUint256, ethers.constants.MaxUint256,
        "bla.com", 200
      )
      await tx.wait()

      managementAddressFalse = await fundCollectionFalse.management()
      ownerFalse = await fundCollectionFalse.owner()
      let maxQuotasAmountLowObj = await fundCollectionFalse.getQuotaInfos(0)
      let maxQuotasAmountRegObj = await fundCollectionFalse.getQuotaInfos(1)
      let maxQuotasAmountHighObj = await fundCollectionFalse.getQuotaInfos(2)
      let maxQuotasAmount = maxQuotasAmountLowObj.amount.add(maxQuotasAmountRegObj.amount).add(maxQuotasAmountHighObj.amount)
      managementAddressTrue = await artCollection.management()
      owerTrue = await artCollection.owner()
      let maxSupply = await artCollection.maxSupply()

      expect(managementAddressFalse).to.equal(managementAddressTrue)
      expect(ownerFalse).to.equal(owerTrue)
      expect(maxQuotasAmount).not.to.equal(maxSupply)
      await expect(artCollection.connect(signer).setCrowdfund(fundCollectionFalse.address))
        .to.be.revertedWithCustomError(artCollection, "ERC721ArtInvalidCrowdFund")

      // Different collection addresses

      artCollectionFalse = await ArtCollection.deploy()
      await artCollectionFalse.deployed()

      fundCollectionFalse = await FundCollection.deploy()
      await fundCollectionFalse.deployed()

      tx = await artCollectionFalse.connect(signer).initialize(
        "bla", "BLA", creator.address, lowQuotaAm + regQuotaAm + highQuotaAm,
        ethers.constants.MaxUint256, ethers.constants.MaxUint256, ethers.constants.MaxUint256,
        "bla.com", 200
      )
      await tx.wait()

      tx = await fundCollectionFalse.connect(signer).initialize(
        cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue,
        lowQuotaAm, regQuotaAm, highQuotaAm,
        ethers.constants.AddressZero, 0, 2500,
        artCollectionFalse.address
      )
      await tx.wait()

      artCollection = await ArtCollection.deploy()
      await artCollection.deployed()
      tx = await artCollection.connect(signer).initialize(
        "bla", "BLA", creator.address, lowQuotaAm + regQuotaAm + highQuotaAm,
        ethers.constants.MaxUint256, ethers.constants.MaxUint256, ethers.constants.MaxUint256,
        "bla.com", 200
      )
      await tx.wait()

      managementAddressFalse = await fundCollectionFalse.management()
      ownerFalse = await fundCollectionFalse.owner()
      maxQuotasAmountLowObj = await fundCollectionFalse.getQuotaInfos(0)
      maxQuotasAmountRegObj = await fundCollectionFalse.getQuotaInfos(1)
      maxQuotasAmountHighObj = await fundCollectionFalse.getQuotaInfos(2)
      maxQuotasAmount = maxQuotasAmountLowObj.amount.add(maxQuotasAmountRegObj.amount).add(maxQuotasAmountHighObj.amount)
      const collectionAddressFalse = await fundCollectionFalse.collection()
      managementAddressTrue = await artCollection.management()
      owerTrue = await artCollection.owner()
      maxSupply = await artCollection.maxSupply()

      expect(managementAddressFalse).to.equal(managementAddressTrue)
      expect(ownerFalse).to.equal(owerTrue)
      expect(maxQuotasAmount).to.equal(maxSupply)
      expect(collectionAddressFalse).not.to.equal(artCollection.address)
      await expect(artCollection.connect(signer).setCrowdfund(fundCollectionFalse.address))
        .to.be.revertedWithCustomError(artCollection, "ERC721ArtInvalidCrowdFund")
    })

    it("Should NOT set art collection for crowdfund if contract paused", async () => {
      const { management, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const creator = accounts[1]

      const ArtCollection = await ethers.getContractFactory("ERC721Art")
      const artCollection = await ArtCollection.deploy()
      await artCollection.deployed()

      const FundCollection = await ethers.getContractFactory("Crowdfund")
      const fundCollection = await FundCollection.deploy()
      await fundCollection.deployed()

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

      const tx_initializeArt = await artCollection.connect(signer).initialize(
        "bla", "BLA", creator.address, lowQuotaAm + regQuotaAm + highQuotaAm,
        ethers.constants.MaxUint256, ethers.constants.MaxUint256, ethers.constants.MaxUint256,
        "bla.com", 200
      )
      await tx_initializeArt.wait()

      const tx = await fundCollection.connect(signer).initialize(
        cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue,
        lowQuotaAm, regQuotaAm, highQuotaAm,
        ethers.constants.AddressZero, 0, 2500,
        artCollection.address
      )
      await tx.wait()

      const tx2 = await artCollection.pause()
      await tx2.wait()

      await expect(artCollection.connect(signer).setCrowdfund(fundCollection.address))
        .to.be.revertedWith("Pausable: paused")
    })
  })

  describe("setMaxDiscount", () => {
    it("Should set new max discount", async () => {
      const { collection, accounts, erc20 } = await loadFixture(testSetup_maxSupply_NOT_0_USDC)
      const owner = accounts[1]

      const maxDiscountBeforeETH = await collection.maxDiscount(ethers.constants.AddressZero)
      const maxDiscountBeforeUSDT = await collection.maxDiscount(erc20.address)

      let tx = await collection.connect(owner).setMaxDiscount(ethers.constants.AddressZero, ethers.utils.parseEther("2"))
      await tx.wait()
      tx = await collection.connect(owner).setMaxDiscount(erc20.address, ethers.utils.parseEther("2"))
      await tx.wait()

      const maxDiscountAfterETH = await collection.maxDiscount(ethers.constants.AddressZero)
      const maxDiscountAfterUSDT = await collection.maxDiscount(erc20.address)

      expect(maxDiscountBeforeETH).to.equal(ethers.utils.parseEther("0"))
      expect(maxDiscountAfterETH).to.equal(ethers.utils.parseEther("2"))
      expect(maxDiscountBeforeUSDT).to.equal(ethers.utils.parseEther("0"))
      expect(maxDiscountAfterUSDT).to.equal(ethers.utils.parseEther("2"))
    })

    it("Should NOT set new max discount if caller is not owner", async () => {
      const { collection } = await loadFixture(testSetup_maxSupply_NOT_0)

      const maxDiscountBefore = await collection.maxDiscount(ethers.constants.AddressZero)

      expect(maxDiscountBefore).to.equal(ethers.utils.parseEther("0"))
      await expect(collection.setMaxDiscount(ethers.constants.AddressZero, ethers.utils.parseEther("2")))
        .to.be.revertedWith("Ownable: caller is not the owner")
    })

    it("Should NOT set new max discount if contract paused", async () => {
      const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const creator = accounts[1]

      const maxDiscountBefore = await collection.maxDiscount(ethers.constants.AddressZero)
      const tx = await collection.pause()
      await tx.wait()

      expect(maxDiscountBefore).to.equal(ethers.utils.parseEther("0"))
      await expect(collection.connect(creator).setMaxDiscount(ethers.constants.AddressZero, ethers.utils.parseEther("2")))
        .to.be.revertedWith("Pausable: paused")
    })

    it("Should NOT set new max discount if contract/creator is corrupted", async () => {
      const { management, collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)

      const maxDiscountBefore = await collection.maxDiscount(ethers.constants.AddressZero)
      const tx = await management.setCorrupted(accounts[1].address, true)
      await tx.wait()

      expect(maxDiscountBefore).to.equal(ethers.utils.parseEther("0"))
      await expect(collection.connect(accounts[1]).setMaxDiscount(ethers.constants.AddressZero, ethers.utils.parseEther("2")))
        .to.be.revertedWithCustomError(collection, "ERC721ArtCollectionOrCreatorCorrupted")
    })
  })

  describe("setCoreSFT", () => {
    it("Should set new SFT address", async () => {
      const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)

      const coreSFTBefore = await collection.coreSFT()

      let tx = await collection.setCoreSFT(accounts[10].address)
      await tx.wait()

      const coreSFTAfter = await collection.coreSFT()

      expect(coreSFTBefore).to.equal(ethers.constants.AddressZero)
      expect(coreSFTAfter).to.equal(accounts[10].address)
    })

    it("Should NOT set new SFT address if creator corrupted", async () => {
      const { management, collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const creator = accounts[1]

      let tx = await management.setCorrupted(creator.address, true)
      await tx.wait()

      await expect(collection.setCoreSFT(accounts[10].address))
        .to.be.revertedWithCustomError(collection, "ERC721ArtCollectionOrCreatorCorrupted")
    })

    it("Should NOT set new SFT address if caller not owner or manager", async () => {
      const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const acc1 = accounts[5]

      await expect(collection.connect(acc1).setCoreSFT(accounts[10].address))
        .to.be.revertedWithCustomError(collection, "ERC721ArtNotAllowed")
    })

    it("Should NOT set new SFT address if contract paused", async () => {
      const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)

      let tx = await collection.pause()
      await tx.wait()

      await expect(collection.setCoreSFT(accounts[10].address))
        .to.be.revertedWith("Pausable: paused")
    })
  })

  describe("price", () => {
    it("Should read pricePerCoin storage mapping by giving ERC20 address", async () => {
      const { management, accounts, erc20 } = await loadFixture(testSetup_maxSupply_NOT_0_USDC)

      await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [management.address] });
      const signer = await ethers.getSigner(management.address)
      const balanceHexString = ethers.utils.hexValue(ethers.utils.parseEther("10000"))
      await hre.network.provider.send("hardhat_setBalance", [
        signer.address,
        balanceHexString,
      ]);

      const ArtCollection = await ethers.getContractFactory("ERC721Art")
      const artCollection = await ArtCollection.deploy()
      await artCollection.deployed()

      const tx_initializeArt = await artCollection.connect(signer).initialize(
        "bla", "BLA", accounts[1].address, 10,
        ethers.utils.parseEther("1"), ethers.utils.parseEther("2"), ethers.constants.MaxUint256,
        "bla.com", 200
      )
      await tx_initializeArt.wait()

      let tx = await management.setTokenContract(2, accounts[10].address)
      await tx.wait()

      const priceERC20 = await artCollection.price(erc20.address)
      const priceETH = await artCollection.price(ethers.constants.AddressZero)
      const priceCreatorsToken = await artCollection.price(accounts[10].address)

      expect(priceERC20).to.equal(ethers.utils.parseEther("2"))
      expect(priceCreatorsToken).to.equal(ethers.constants.MaxUint256)
      expect(priceETH).to.equal(ethers.utils.parseEther("1"))
    })

    it("Should NOT read pricePerCoin storage mapping if input address is invalid", async () => {
      const { management, accounts } = await loadFixture(testSetup_maxSupply_NOT_0_USDC)

      await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [management.address] });
      const signer = await ethers.getSigner(management.address)
      const balanceHexString = ethers.utils.hexValue(ethers.utils.parseEther("10000"))
      await hre.network.provider.send("hardhat_setBalance", [
        signer.address,
        balanceHexString,
      ]);

      const ArtCollection = await ethers.getContractFactory("ERC721Art")
      const artCollection = await ArtCollection.deploy()
      await artCollection.deployed()

      const tx_initializeArt = await artCollection.connect(signer).initialize(
        "bla", "BLA", accounts[1].address, 10,
        ethers.utils.parseEther("1"), ethers.utils.parseEther("2"), ethers.constants.MaxUint256,
        "bla.com", 200
      )
      await tx_initializeArt.wait()

      await expect(artCollection.price(accounts[10].address))
        .to.be.revertedWithCustomError(artCollection, "ERC721ArtInvalidAddress")
    })
  })

  describe("pause", () => {
    it("Should pause contract", async () => {
      const { management, collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const creator = accounts[1]

      // contract not corrupted
      const pausedBeforeCreator = await collection.paused()

      const tx = await collection.connect(creator).pause()
      await tx.wait()

      const pausedAfterCreator = await collection.paused()

      const tx2 = await collection.connect(creator).unpause()
      await tx2.wait()

      const pausedBeforeManager = await collection.paused()

      const tx3 = await collection.pause()
      await tx3.wait()

      const pausedAfterManager = await collection.paused()

      // contract corrupted 
      const tx4 = await collection.unpause()
      await tx4.wait()

      const pausedCorruptedBefore = await collection.paused()

      const tx5 = await management.setCorrupted(creator.address, true)
      await tx5.wait()

      const tx6 = await collection.pause()
      await tx6.wait()

      const pausedCorruptedAfter = await collection.paused()

      expect(pausedBeforeCreator).to.equal(false)
      expect(pausedAfterCreator).to.equal(true)
      expect(pausedBeforeManager).to.equal(false)
      expect(pausedAfterManager).to.equal(true)
      expect(pausedCorruptedBefore).to.equal(false)
      expect(pausedCorruptedAfter).to.equal(true)
    })

    it("Should pause contract when crowdfunding", async () => {
      const { management, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const creator = accounts[1]

      const ArtCollection = await ethers.getContractFactory("ERC721Art")
      const artCollection = await ArtCollection.deploy()
      await artCollection.deployed()

      const FundCollection = await ethers.getContractFactory("Crowdfund")
      const fundCollection = await FundCollection.deploy()
      await fundCollection.deployed()

      const cfLowQuotaValue = [ethers.utils.parseEther("0.1"), ethers.utils.parseEther("0.11"), ethers.utils.parseEther("0.12")]
      const cfRegQuotaValue = [ethers.utils.parseEther("0.5"), ethers.utils.parseEther("0.51"), ethers.utils.parseEther("0.52")]
      const cfHighQuotaValue = [ethers.utils.parseEther("1"), ethers.utils.parseEther("1.1"), ethers.utils.parseEther("1.2")]

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

      const tx_initializeArt = await artCollection.connect(signer).initialize(
        "bla", "BLA", creator.address, lowQuotaAm + regQuotaAm + highQuotaAm,
        ethers.constants.MaxUint256, ethers.constants.MaxUint256, ethers.constants.MaxUint256,
        "bla.com", 200
      )
      await tx_initializeArt.wait()

      const tx = await fundCollection.connect(signer).initialize(
        cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue,
        lowQuotaAm, regQuotaAm, highQuotaAm,
        ethers.constants.AddressZero, 0, 2500,
        artCollection.address
      )
      await tx.wait()

      const tx2 = await artCollection.connect(signer).setCrowdfund(fundCollection.address)
      await tx2.wait()

      const pausedBefore = await artCollection.paused()

      const tx3 = await fundCollection.pause()
      await tx3.wait()

      const pausedAfter = await artCollection.paused()

      expect(pausedBefore).to.equal(false)
      expect(pausedAfter).to.equal(true)
    })

    it("Should NOT pause contract if caller is not manager/creator", async () => {
      const { management, collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const acc = accounts[2]

      const pausedBefore = await collection.paused()

      const tx = await management.setCorrupted(accounts[1].address, true)
      await tx.wait()

      expect(pausedBefore).to.equal(false)
      await expect(collection.connect(acc).pause())
        .to.be.revertedWithCustomError(collection, "ERC721ArtNotAllowed")
    })

    it("Should NOT pause contract if caller is not manager when contract/creator is corrupted", async () => {
      const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const acc = accounts[2]

      const pausedBefore = await collection.paused()

      expect(pausedBefore).to.equal(false)
      await expect(collection.connect(acc).pause())
        .to.be.revertedWithCustomError(collection, "ERC721ArtNotAllowed")
    })

    it("Should NOT pause contract when crowdfunding if caller is not crowdfund contract", async () => {
      const { management, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const creator = accounts[1]

      const ArtCollection = await ethers.getContractFactory("ERC721Art")
      const artCollection = await ArtCollection.deploy()
      await artCollection.deployed()

      const FundCollection = await ethers.getContractFactory("Crowdfund")
      const fundCollection = await FundCollection.deploy()
      await fundCollection.deployed()

      const cfLowQuotaValue = [ethers.utils.parseEther("0.1"), ethers.utils.parseEther("0.11"), ethers.utils.parseEther("0.12")]
      const cfRegQuotaValue = [ethers.utils.parseEther("0.5"), ethers.utils.parseEther("0.51"), ethers.utils.parseEther("0.52")]
      const cfHighQuotaValue = [ethers.utils.parseEther("1"), ethers.utils.parseEther("1.1"), ethers.utils.parseEther("1.2")]

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

      const tx_initializeArt = await artCollection.connect(signer).initialize(
        "bla", "BLA", creator.address, lowQuotaAm + regQuotaAm + highQuotaAm,
        ethers.constants.MaxUint256, ethers.constants.MaxUint256, ethers.constants.MaxUint256,
        "bla.com", 200
      )
      await tx_initializeArt.wait()

      const tx = await fundCollection.connect(signer).initialize(
        cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue,
        lowQuotaAm, regQuotaAm, highQuotaAm,
        ethers.constants.AddressZero, 0, 2500,
        artCollection.address
      )
      await tx.wait()

      const tx2 = await artCollection.connect(signer).setCrowdfund(fundCollection.address)
      await tx2.wait()

      await expect(artCollection.pause())
        .to.be.revertedWithCustomError(artCollection, "ERC721ArtNotAllowed")
    })
  })

  describe("unpause", () => {
    it("Should unpause contract", async () => {
      const { management, collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const creator = accounts[1]

      // contract not corrupted

      let tx = await collection.connect(creator).pause()
      await tx.wait()

      const pausedBeforeCreator = await collection.paused()

      tx = await collection.connect(creator).unpause()
      await tx.wait()

      const pausedAfterCreator = await collection.paused()

      tx = await collection.pause()
      await tx.wait()

      const pausedBeforeManager = await collection.paused()

      tx = await collection.unpause()
      await tx.wait()

      const pausedAfterManager = await collection.paused()

      // contract corrupted
      tx = await collection.pause()
      await tx.wait()

      const pausedBeforeCorrupted = await collection.paused()

      tx = await management.setCorrupted(creator.address, true)
      await tx.wait()

      tx = await collection.unpause()
      await tx.wait()

      const pausedAfterCorrupted = await collection.paused()

      expect(pausedBeforeCreator).to.equal(true)
      expect(pausedAfterCreator).to.equal(false)
      expect(pausedBeforeManager).to.equal(true)
      expect(pausedAfterManager).to.equal(false)
      expect(pausedBeforeCorrupted).to.equal(true)
      expect(pausedAfterCorrupted).to.equal(false)
    })

    it("Should unpause contract when crowdfunding", async () => {
      const { management, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const creator = accounts[1]

      const ArtCollection = await ethers.getContractFactory("ERC721Art")
      const artCollection = await ArtCollection.deploy()
      await artCollection.deployed()

      const FundCollection = await ethers.getContractFactory("Crowdfund")
      const fundCollection = await FundCollection.deploy()
      await fundCollection.deployed()

      const cfLowQuotaValue = [ethers.utils.parseEther("0.1"), ethers.utils.parseEther("0.11"), ethers.utils.parseEther("0.12")]
      const cfRegQuotaValue = [ethers.utils.parseEther("0.5"), ethers.utils.parseEther("0.51"), ethers.utils.parseEther("0.52")]
      const cfHighQuotaValue = [ethers.utils.parseEther("1"), ethers.utils.parseEther("1.1"), ethers.utils.parseEther("1.2")]

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

      const tx_initializeArt = await artCollection.connect(signer).initialize(
        "bla", "BLA", creator.address, lowQuotaAm + regQuotaAm + highQuotaAm,
        ethers.constants.MaxUint256, ethers.constants.MaxUint256, ethers.constants.MaxUint256,
        "bla.com", 200
      )
      await tx_initializeArt.wait()

      let tx = await fundCollection.connect(signer).initialize(
        cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue,
        lowQuotaAm, regQuotaAm, highQuotaAm,
        ethers.constants.AddressZero, 0, 2500,
        artCollection.address
      )
      await tx.wait()

      tx = await artCollection.connect(signer).setCrowdfund(fundCollection.address)
      await tx.wait()

      tx = await fundCollection.pause()
      await tx.wait()

      const pausedBefore = await artCollection.paused()

      tx = await fundCollection.unpause()
      await tx.wait()

      const pausedAfter = await artCollection.paused()

      expect(pausedBefore).to.equal(true)
      expect(pausedAfter).to.equal(false)
    })

    it("Should NOT unpause contract if caller is not owner", async () => {
      const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const acc = accounts[2]

      const tx = await collection.pause()
      await tx.wait()

      const pausedBefore = await collection.paused()

      expect(pausedBefore).to.equal(true)
      await expect(collection.connect(acc).unpause())
        .to.be.revertedWithCustomError(collection, "ERC721ArtNotAllowed")
    })

    it("Should NOT unpause contract if caller is not manager when contract/creator is corrupted", async () => {
      const { management, collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const acc = accounts[2]

      let tx = await collection.pause()
      await tx.wait()

      tx = await management.setCorrupted(accounts[1].address, true)
      await tx.wait()

      const pausedBefore = await collection.paused()

      expect(pausedBefore).to.equal(true)
      await expect(collection.connect(acc).unpause())
        .to.be.revertedWithCustomError(collection, "ERC721ArtNotAllowed")
    })

    it("Should NOT unpause contract when crowdfunding if caller is not crowdfund contract", async () => {
      const { management, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const creator = accounts[1]

      const ArtCollection = await ethers.getContractFactory("ERC721Art")
      const artCollection = await ArtCollection.deploy()
      await artCollection.deployed()

      const FundCollection = await ethers.getContractFactory("Crowdfund")
      const fundCollection = await FundCollection.deploy()
      await fundCollection.deployed()

      const cfLowQuotaValue = [ethers.utils.parseEther("0.1"), ethers.utils.parseEther("0.11"), ethers.utils.parseEther("0.12")]
      const cfRegQuotaValue = [ethers.utils.parseEther("0.5"), ethers.utils.parseEther("0.51"), ethers.utils.parseEther("0.52")]
      const cfHighQuotaValue = [ethers.utils.parseEther("1"), ethers.utils.parseEther("1.1"), ethers.utils.parseEther("1.2")]

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

      const tx_initializeArt = await artCollection.connect(signer).initialize(
        "bla", "BLA", creator.address, lowQuotaAm + regQuotaAm + highQuotaAm,
        ethers.constants.MaxUint256, ethers.constants.MaxUint256, ethers.constants.MaxUint256,
        "bla.com", 200
      )
      await tx_initializeArt.wait()

      let tx = await fundCollection.connect(signer).initialize(
        cfLowQuotaValue, cfRegQuotaValue, cfHighQuotaValue,
        lowQuotaAm, regQuotaAm, highQuotaAm,
        ethers.constants.AddressZero, 0, 2500,
        artCollection.address
      )
      await tx.wait()

      tx = await artCollection.connect(signer).setCrowdfund(fundCollection.address)
      await tx.wait()

      tx = await fundCollection.pause()
      await tx.wait()

      await expect(artCollection.unpause())
        .to.be.revertedWithCustomError(artCollection, "ERC721ArtNotAllowed")
    })
  })

  describe("withdrawToAddress", () => {
    it("Should withdraw to given address", async () => {
      const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const acc1 = accounts[3]

      const amountInEtherStr = "1.5"
      const amountInEther = ethers.utils.parseEther(amountInEtherStr)
      let tx = {
        to: collection.address,
        // Convert currency unit from ether to wei
        value: amountInEther
      }

      await acc1.sendTransaction(tx)

      const balaceBefore = await ethers.provider.getBalance(acc1.address)

      tx = await collection.withdrawToAddress(acc1.address, amountInEther)
      await tx.wait()

      const balaceAfter = await ethers.provider.getBalance(acc1.address)

      expect(balaceAfter.sub(balaceBefore)).to.equal(amountInEther)
    })

    it("Should NOT withdraw to given address if caller not manager", async () => {
      const { collection, accounts } = await loadFixture(testSetup_maxSupply_NOT_0)
      const acc1 = accounts[3]

      const amountInEtherStr = "1.5"
      const amountInEther = ethers.utils.parseEther(amountInEtherStr)
      let tx = {
        to: collection.address,
        // Convert currency unit from ether to wei
        value: amountInEther
      }

      await acc1.sendTransaction(tx)

      await expect(collection.connect(acc1).withdrawToAddress(acc1.address, amountInEther))
        .to.be.revertedWithCustomError(collection, "ERC721ArtNotAllowed")
    })
  })

  describe("tokenURI", () => {
    it("Should return the token URI of given token ID", async () => {
      const { collection } = await loadFixture(testSetup_maxSupply_NOT_0)

      const tx = await collection.mint(0, 0, 0, { value: mintPrice })
      await tx.wait()
      const tx2 = await collection.mint(1, 0, 0, { value: mintPrice })
      await tx2.wait()

      const tokenURI = await collection.tokenURI(1)

      expect(tokenURI).to.equal("https://example.com/my-token/1.json")
    })
  })

  describe("supportsInterface", () => {
    it("Should return if the give interface ID is supported by the contract", async () => {
      const { collection } = await loadFixture(testSetup_maxSupply_NOT_0)

      const support_1 = await collection.supportsInterface("0x01ffc9a7")
      const support_2 = await collection.supportsInterface("0x80ac58cd")
      const support_3 = await collection.supportsInterface("0x5b5e139f")
      const support_4 = await collection.supportsInterface("0x2a55205a")
      const support_5 = await collection.supportsInterface(ethers.utils.formatBytes32String("0x01ffc9a7").slice(0, 10))

      expect(support_1).to.equal(true)
      expect(support_2).to.equal(true)
      expect(support_3).to.equal(true)
      expect(support_4).to.equal(true)
      expect(support_5).to.equal(false)
    })
  })

  // describe("Replication from Sepolia", () => {
  //   it("Should work", async () => {
  //     const { management, accounts, erc20 } = await loadFixture(testSetup_maxSupply_NOT_0_USDC)
  //     const acc1 = accounts[10]

  //     const name = "asdf"
  //     const symbol = "asf"
  //     const maxSupply = 200
  //     const priceETH = 1
  //     const priceUSD = 1
  //     const priceCreatorsCoin = 1
  //     const baseURI = "dfgh"
  //     const royalty = 200

  //     let tx = await management.setCreator(acc1.address, true)
  //     await tx.wait()

  //     tx = await management.setTokenContract(1, erc20.address)
  //     await tx.wait()

  //     tx = await management.setTokenContract(2, erc20.address)
  //     await tx.wait()

  //     tx = await management.connect(acc1)
  //       .newArtCollection(name, symbol, maxSupply, priceETH, priceUSD, priceCreatorsCoin, baseURI, royalty)

  //     const receipt = await tx.wait()
  //     const event = receipt.events.filter(evt => evt?.event)
  //     const rightEvent = event.filter(evt => evt.args.collection)
  //     const collectionAddress = rightEvent[0].args.collection

  //     const collection = await ethers.getContractAt("contracts/ERC721Art.sol:ERC721Art", collectionAddress)

  //     tx = await erc20.mint(acc1.address, ethers.utils.parseEther("10"))
  //     await tx.wait()

  //     tx = await erc20.connect(acc1).approve(collection.address, ethers.utils.parseEther("10"))
  //     await tx.wait()

  //     console.log("here1")
  //     tx = await collection.connect(acc1).setPrice(2, 1)
  //     await tx.wait()

  //     console.log("here2")

  //     tx = await collection.connect(acc1).mint(0, 1, { value: 0 })
  //     await tx.wait()

  //     console.log("here3")
  //   })
  // })
});
