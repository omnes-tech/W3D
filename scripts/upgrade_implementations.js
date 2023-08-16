const { ethers } = require("hardhat");
const hre = require("hardhat");
const contracts = require("../ABIs/Contracts.json")
const proxies = contracts["Proxies"]
const { saveABIs, verifyContracts, saveImplementationAddress } = require("./utils")

const name = "Crowdfund"
const saveABI = true
const saveAddress = true
const verify = true
const useGasPrice = true
let gasPrice

const proxyTypeObj = {
    "ERC721Art": "Beacon",
    "Crowdfund": "Beacon",
    "ERC721CreatorsPRO": "Beacon",
    "ERC1155Tickets_Art": "Beacon",
    "Management": "UUPS",
    "CRPReward": "UUPS",
    "CRPStaking": "Beacon"
}
const proxyType = {
    "Beacon": "admin",
    "UUPS": "proxy"
}

async function main() {
    const network = hre.network.name

    const proxyContracts = {
        "Beacon": await ethers.getContractFactory("UpgradeableBeacon"),
        "UUPS": await ethers.getContractFactory("ERC1967Proxy")
    }

    const block = await ethers.provider.getBlock("latest")
    const gasLimit = block.gasLimit.sub(1)

    console.log(`Deploying implementation of ${name}`)
    if (useGasPrice) {
        gasPrice = (await ethers.provider.getGasPrice()).add(ethers.utils.parseUnits("30", "gwei"))
    } else {
        gasPrice = await ethers.provider.getGasPrice()
    }
    const Implementation = await ethers.getContractFactory(name)
    const implementation = await Implementation.deploy({ gasLimit, gasPrice })
    console.log(`Tx Hash: ${implementation.deployTransaction.hash}`)
    await implementation.deployed()
    console.log(`Implementation deployed at ${implementation.address}\n`)

    console.log(`Upgrading proxy of ${name}`)
    const proxyAddress = proxies[name][network][proxyType[proxyTypeObj[name]]]
    console.log(`Proxy address: ${proxyAddress}`)
    const Proxy = proxyContracts[proxyTypeObj[name]]
    const proxy = proxyTypeObj[name] === "Beacon" ?
        await ethers.getContractAt(Proxy.interface, proxyAddress) :
        Implementation.attach(proxyAddress)

    if (useGasPrice) {
        gasPrice = (await ethers.provider.getGasPrice()).add(ethers.utils.parseUnits("30", "gwei"))
    } else {
        gasPrice = await ethers.provider.getGasPrice()
    }
    const tx = await proxy.upgradeTo(implementation.address, { gasLimit, gasPrice })
    console.log(`Tx Hash: ${tx.hash}`)
    await tx.wait()
    console.log("Proxy upgraded\n")

    if (verify) {
        await verifyContracts([implementation], [[]], [name])
    }

    if (saveABI) {
        saveABIs([implementation], [name])
    }

    if (saveAddress) {
        saveImplementationAddress([implementation], [name])
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});