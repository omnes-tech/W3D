const { verifyContracts } = require("./utils")
const proxies = require("../ABIs/Proxies.json")
const hre = require("hardhat");


const contractName = "ERC721Art"
const network = hre.network.name
const beaconAdminAddress = "admin" in proxies[contractName][network] ?
    proxies[contractName][network]["admin"] :
    proxies[contractName][network]["proxy"]
const contractAddress = { address: "0x317bf2f173960D9F1857eCcCE2696539a77610CB" }
const function_name = "initialize"
const constructor_args = [
    "a",
    "a",
    "0x9466b7430eC51c81e1F43dDCf69278878B559382",
    "0x47c4490B614D2a9B0064cA15B096652cD4D7A328",
    100,
    0,
    0,
    0,
    "a",
    0
]

async function ver() {
    const contractObj = await ethers.getContractFactory(contractName)
    const data = contractObj.interface.encodeFunctionData(function_name, constructor_args)
    await verifyContracts([contractAddress], [[beaconAdminAddress, data]], [contractName])
}

ver()
