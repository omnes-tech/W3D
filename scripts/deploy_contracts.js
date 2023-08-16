const { ethers } = require("hardhat");
const hre = require("hardhat");
const { saveABIs, verifyContracts, saveContractsAddress } = require("./utils")

const ERC20Decimals = 6
const verify = true
const saveABI = true
const saveAddresses = true
const contractsNameArr = ["MockUSDToken"]
const constrcutorArgs = [[ERC20Decimals]]
const useGasPrice = true
const addPath = "mocks"

async function main() {
  const block = await ethers.provider.getBlock("latest")
  const gasLimit = block.gasLimit.sub(1)
  const network = hre.network.name
  let gasPrice

  console.log(`Network: ${network}`)

  const contractsObjArr = []

  for (let ii = 0; ii < contractsNameArr.length; ii++) {
    if (useGasPrice) {
      gasPrice = (await ethers.provider.getGasPrice()).add(ethers.utils.parseUnits("30", "gwei"))
    } else {
      gasPrice = await ethers.provider.getGasPrice()
    }

    const Contract = await ethers.getContractFactory(contractsNameArr[ii])
    const contract = await Contract.deploy(...constrcutorArgs[ii], { gasLimit, gasPrice })
    console.log(`Tx Hash: ${contract.deployTransaction.hash}`)
    await contract.deployed()
    console.log(`Deployed ${contractsNameArr[ii]} implementation at ${contract.address}\n`)

    contractsObjArr.push(contract)
  }

  if (saveABI) {
    saveABIs(contractsObjArr, contractsNameArr, addPath)
  }

  if (saveAddresses) {
    saveContractsAddress(contractsObjArr, contractsNameArr)
  }

  if (verify) {
    await verifyContracts(contractsObjArr, constrcutorArgs, contractsNameArr)
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
