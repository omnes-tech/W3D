const { ethers } = require("hardhat");
const hre = require("hardhat");
const { verifyContracts, saveProxiesInfo, saveABIs } = require("./utils")
const contracts = require("../Addresses.json")
const addresses = contracts["Proxies"]

const network = hre.network.name

// General settings
const verify = true
const saveProxies = true
const saveABI = true
const useGasPrice = true
const refresh = true

const contractNamesArr = ["ERC721Acompany","Management","Crowdfund"] //["ERC721Art", "Crowdfund", "ERC721CreatorsPRO", "Management", "CRPReward", "CRPStaking"]
const tokensArr = ["ERC721Acompany", "Crowdfund", "ERC721CreatorsPRO"]
const useZeroAddressForToken = [false, false, false]

// Manager initialization params
const multiSigAddress = contracts["Contracts"]["MockMultiSig"][network]
const creatorsCoinAddress = contracts["Contracts"]["CreatorsCoin"][network]
const repTokenAddress = contracts["Contracts"]["RepToken"][network]
const erc20USDAddress = contracts["Contracts"]["ERC20USD"][network]

// CRPReward initialization params
// const timeUnit = 24 * 60 * 60 * 30
// const rewardsPerUnitTime = ethers.utils.parseUnits("5", 6)
// const interacPoints = [ethers.utils.parseEther("33"), ethers.utils.parseUnits("10", 6), ethers.utils.parseUnits("5", 6)]
// const maxRewardClaim = ethers.utils.parseUnits("50000", 6)

async function main() {
    if (network !== "hardhat" && refresh) {
        await hre.run("clean");
        await hre.run("compile");
    }

    const proxyTypeObj = {
        "ERC721Acompany": "Beacon",
        "Crowdfund": "Beacon",
        "ERC721CreatorsPRO": "Beacon",
        "Management": "UUPS"
    }

    const proxyContracts = {
        "Beacon": await ethers.getContractFactory("UpgradeableBeacon"),
        "UUPS": await ethers.getContractFactory("ERC1967Proxy")
    }

    const initializerArgs = {
        "ERC721Acompany": [],
        "Crowdfund": [],
        "ERC721CreatorsPRO": [],
        "Management": []
    }

    const block = await ethers.provider.getBlock("latest")
    const gasLimit = block.gasLimit.sub(2)

    let gasPrice

    const proxiesArr = []
    const implsArr = []
    const constructorArgs = []
    const constructorArgsImpls = []
    const managementInputAddresses = []
    for (let ii = 0; ii < contractNamesArr.length; ii++) {
        if (contractNamesArr[ii] !== "Management") {
            if (useGasPrice) {
                gasPrice = (await ethers.provider.getGasPrice()).add(ethers.utils.parseUnits("30", "gwei"))
            } else {
                gasPrice = await ethers.provider.getGasPrice()
            }

            let ImpContract
            if (contractNamesArr[ii] === "ERC721CreatorsPRO") {
                ImpContract = await ethers.getContractFactory("ERC721Acompany")
            } else {
                ImpContract = await ethers.getContractFactory(contractNamesArr[ii])
            }

            console.log(`Deploying ${contractNamesArr[ii]} implementation`)
            const impContract = await ImpContract.deploy({ gasLimit, gasPrice })
            console.log(`Tx Hash: ${impContract.deployTransaction.hash}`)
            await impContract.deployed()
            console.log(`Deployed ${contractNamesArr[ii]} implementation at ${impContract.address}\n`)

            if (useGasPrice) {
                gasPrice = (await ethers.provider.getGasPrice()).add(ethers.utils.parseUnits("30", "gwei"))
            } else {
                gasPrice = await ethers.provider.getGasPrice()
            }
            console.log(`Deploying ${contractNamesArr[ii]} proxy`)
            // let proxy
            // if (proxyTypeObj[contractNamesArr[ii]] == "UUPS") {

            // } else {
            //     proxy = await proxyContracts[proxyTypeObj[contractNamesArr[ii]]].deploy(impContract.address, { gasLimit, gasPrice })
            // }
            const proxy = await proxyContracts[proxyTypeObj[contractNamesArr[ii]]].deploy(impContract.address, { gasLimit, gasPrice })
            console.log(`Tx Hash: ${proxy.deployTransaction.hash}`)
            await proxy.deployed()
            console.log(`Deployed ${contractNamesArr[ii]} beacon admin at ${proxy.address}\n\n`)

            proxiesArr.push(proxy)
            implsArr.push(impContract)
            constructorArgs.push([impContract.address])
            constructorArgsImpls.push([])
            managementInputAddresses.push(proxy.address)
        }
    }

    let managementProxy
    if (contractNamesArr.includes("Management")) {
        while (managementInputAddresses.length < 3) {
            if (useZeroAddressForToken[managementInputAddresses.length]) {
                managementInputAddresses.push(ethers.constants.AddressZero)
            } else {
                const inputAddress = addresses[tokensArr[managementInputAddresses.length]][network]
                if (inputAddress) {
                    managementInputAddresses.push(inputAddress["admin"])
                } else {
                    managementInputAddresses.push(ethers.constants.AddressZero)
                }
            }
        }

        // console.log(managementInputAddresses)

        console.log(`Deploying Management implementation`)
        if (useGasPrice) {
            gasPrice = (await ethers.provider.getGasPrice()).add(ethers.utils.parseUnits("30", "gwei"))
        } else {
            gasPrice = await ethers.provider.getGasPrice()
        }
        const ImpContract = await ethers.getContractFactory("Management")
        const impContract = await ImpContract.deploy({ gasLimit, gasPrice })
        console.log(`Tx Hash: ${impContract.deployTransaction.hash}`)
        await impContract.deployed()
        console.log(`Deployed Management implementation at ${impContract.address}\n`)

        const abi = ["function initialize(address beaconAdminFund, address beaconAdminCompany, address erc20USD, address multiSig)"]
        const function_name = "initialize"
        const constructor_args = [
            ...managementInputAddresses,
            erc20USDAddress ? erc20USDAddress : ethers.constants.AddressZero,
            multiSigAddress ? multiSigAddress : ethers.constants.AddressZero
        ]
        const iface = new ethers.utils.Interface(abi)
        const data = iface.encodeFunctionData(function_name, constructor_args)

        console.log(`Deploying Management proxy`)
        if (useGasPrice) {
            gasPrice = (await ethers.provider.getGasPrice()).add(ethers.utils.parseUnits("30", "gwei"))
        } else {
            gasPrice = await ethers.provider.getGasPrice()
        }
        const managementUUPS = await proxyContracts["UUPS"].deploy(impContract.address, data, { gasLimit, gasPrice })
        console.log(`Tx Hash: ${managementUUPS.deployTransaction.hash}`)
        await managementUUPS.deployed()
        console.log(`Deployed Management UUPS at ${managementUUPS.address}\n\n`)

        managementProxy = ImpContract.attach(managementUUPS.address)

        let tx
        if (creatorsCoinAddress) {
            tx = await managementProxy.setTokenContract(2, creatorsCoinAddress)
            await tx.wait()
        }

        if (repTokenAddress) {
            tx = await managementProxy.setTokenContract(3, repTokenAddress)
            await tx.wait()
        }

        proxiesArr.push(managementUUPS)
        implsArr.push(impContract)
        constructorArgs.push([impContract.address, data])
        constructorArgsImpls.push([])
    }

   

    if (saveProxies) {
        saveProxiesInfo(proxiesArr, implsArr, contractNamesArr, proxyTypeObj)
    }

    if (saveABI) {
        saveABIs(implsArr, contractNamesArr)
    }

    if (verify) {
        await verifyContracts(proxiesArr, constructorArgsImpls, contractNamesArr)
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});