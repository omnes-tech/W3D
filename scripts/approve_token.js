const { ethers } = require("hardhat");

const ERC20Address = "0xE097d6B3100777DC31B34dC2c58fB524C2e76921"
const contratcToApproveAddress = "0xA2cB401C0Ce5Fae166B7fCed7197f836E951888b"

async function approve() {
    const ERC20 = await ethers.getContractFactory("contracts/@openzeppelin/token/ERC20.sol:ERC20")
    const erc20 = ERC20.attach(ERC20Address)
    const tx = await erc20.approve(contratcToApproveAddress, ethers.utils.parseEther("1000"))
    await tx.wait()

}

approve()