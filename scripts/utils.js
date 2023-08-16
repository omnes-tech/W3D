const fs = require('fs');
const hre = require("hardhat");
const lastDeploy = require("./last_deploy.json")

const USDTtokenContract = {
    "mumbai": "0xA02f6adc7926efeBBd59Fd43A84f4E0c0c91e832",
    "polygon": "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    "goerli": "0x509Ee0d083DdF8AC028f2a56731412edD63223B9",
    "sepolia": "",
    "mainnet": "0xdAC17F958D2ee523a2206206994597C13D831ec7"
}

const lastLineStr = {
    "USDC": "tokenContract[Coin.USDC_TOKEN] = IERC20(",
    "DAI": "tokenContract[Coin.DAI_TOKEN] = IERC20("
}
const upgradeableContracts = ["ERC721Art", "Crowdfund", "ERC1155Tickets_Art", "Management", "CRPReward", "CRPStaking"]

const contracts = ["ERC721Art", "ERC1155Tickets_Art"] //"ERC1155Tickets_Art",

async function verifyContracts(contractsArr, constructorArgsArr, contractsNameArr) {
    const networkName = hre.network.name
    if (networkName === "hardhat") {
        return
    }
    for (let ii = 0; ii < contractsNameArr.length; ii++) {
        console.log(`Verifying ${contractsNameArr[ii]}.sol (${contractsArr[ii].address})...`)
        if (typeof contractsArr[ii].address === "undefined") {
            continue
        }
        let trial = 1
        while (trial < 11) {
            try {
                await hre.run("verify:verify", {
                    address: contractsArr[ii].address,
                    constructorArguments: constructorArgsArr[ii],
                });
                break
            } catch (e) {
                console.log(e.message)
                if (e.message.includes("Already Verified") || e.message.includes("no such file or directory")
                    || e.message.includes("Bytecode does not match with the current version")
                    || e.message.includes("Contract source code already verified")) {
                    break
                }
                console.log(`Trial ${trial}`)
                trial++
            }
        }
    }
}

function saveABIs(contractsArr, contractsNameArr, subfolder = undefined) {
    console.log("Saving smart contracts' ABI and addresses...")

    const networkName = hre.network.name
    if (networkName === "hardhat") {
        return
    }
    const objsArr = []
    for (let ii = 0; ii < contractsNameArr.length; ii++) {
        let currContractPath
        if (subfolder) {
            currContractPath = `${subfolder}/${contractsNameArr[ii]}`
        } else {
            currContractPath = contractsNameArr[ii]
        }
        const file_path = `../artifacts/contracts/${currContractPath}.sol/${contractsNameArr[ii]}.json`
        if (fs.existsSync(file_path)) {
            const contractJson = require(file_path)
            const contractObj = { abi: contractJson.abi }
            if (!upgradeableContracts.includes(contractsNameArr[ii])) {
                contractObj["address"] = {}
                contractObj["address"][networkName] = contractsArr[ii].address
            }
            objsArr.push(contractObj)
        }
    }

    for (let ii = 0; ii < objsArr.length; ii++) {
        let path = `./ABIs/${contractsNameArr[ii]}.json`

        fs.readFile(path, (err, data) => {
            if (err) {
                fs.writeFile(path, JSON.stringify(objsArr[ii], null, 4), function (err) {
                    if (err) throw err;
                    console.log(`completed ${contractsNameArr[ii]}.sol`);
                })

            } else {
                let newObj = JSON.parse(data);
                if ("address" in newObj) {
                    const currAddObj = Object.keys(newObj["address"])
                        .filter((key) => key !== networkName)
                        .reduce((obj, key) => {
                            return Object.assign(obj, {
                                [key]: newObj["address"][key]
                            });
                        }, {});
                    objsArr[ii]["address"] = { ...objsArr[ii]["address"], ...currAddObj }
                }

                fs.writeFile(path, JSON.stringify(objsArr[ii], null, 4), function (err) {
                    if (err) throw err;
                    console.log(`completed ${contractsNameArr[ii]}.sol`);
                })
            }
        });

        // fs.writeFile(path, JSON.stringify(objsArr[ii]), function (err) {
        //   if (err) throw err;
        //   console.log(`completed ${contractsNameArr[ii]}.sol`);
        // })
    }
}

function saveProxiesInfo(ProxiesArr, ImplementationsArr, ProxyNamesArr, typeMap, onlyImplementation = false) {
    console.log("Saving proxies info")

    const networkName = hre.network.name
    if (networkName === "hardhat") {
        return
    }

    const file_path = `./ABIs/Contracts.json`
    const proxyType = {
        "Beacon": "admin",
        "UUPS": "proxy"
    }

    fs.readFile(file_path, (err, data) => {
        let contractJson
        let contractJsonWhole
        if (err) {
            console.log("File not found. Creating new file 'Contracts.json' in folder 'ABIs'")
            contractJson = {}
        } else {
            contractJsonWhole = JSON.parse(data);
            contractJson = contractJsonWhole["Proxies"];
        }
        for (let ii = 0; ii < ProxiesArr.length; ii++) {
            if (!(ProxyNamesArr[ii] in contractJson)) {
                contractJson[ProxyNamesArr[ii]] = {
                    "type": typeMap[ProxyNamesArr[ii]],
                    [networkName]: {
                        [proxyType[typeMap[ProxyNamesArr[ii]]]]: ProxiesArr[ii].address,
                        "implementation": ImplementationsArr[ii].address
                    }
                }
            } else {
                contractJson[ProxyNamesArr[ii]]["type"] = typeMap[ProxyNamesArr[ii]]
                contractJson[ProxyNamesArr[ii]][networkName] = {
                    [proxyType[typeMap[ProxyNamesArr[ii]]]]: ProxiesArr[ii].address,
                    "implementation": ImplementationsArr[ii].address
                }
            }
        }

        contractJsonWhole["Proxies"] = contractJson
        fs.writeFile(file_path, JSON.stringify(contractJsonWhole, null, 4), function (err) {
            if (err) throw err;
            console.log(`completed implementations`);
        })
    }
    );
}

function saveImplementationAddress(contractObjsArr, contractNamesArr) {
    console.log("Saving implementations addresses")

    const networkName = hre.network.name
    if (networkName === "hardhat") {
        return
    }

    const file_path = `./ABIs/Contracts.json`

    fs.readFile(file_path, (err, data) => {
        if (err) {
            console.log("File not found")
            return

        } else {
            const contractJsonWhole = JSON.parse(data)
            let contractJson = contractJsonWhole["Proxies"];
            for (let ii = 0; ii < contractNamesArr.length; ii++) {
                if (contractNamesArr[ii] in contractJson
                    && networkName in contractJson[contractNamesArr[ii]]) {
                    contractJson[contractNamesArr[ii]][networkName]["implementation"] = contractObjsArr[ii].address
                }
            }

            contractJsonWhole["Proxies"] = contractJson
            fs.writeFile(file_path, JSON.stringify(contractJsonWhole, null, 4), function (err) {
                if (err) throw err;
                console.log(`completed implementations`);
            })
        }
    });
}

function saveContractsAddress(contractObjsArr, contractNamesArr) {
    console.log("Saving implementations addresses")

    const networkName = hre.network.name
    if (networkName === "hardhat") {
        return
    }

    const file_path = `./ABIs/Contracts.json`

    fs.readFile(file_path, (err, data) => {
        if (err) {
            console.log("File not found")
            return

        } else {
            const contractJsonWhole = JSON.parse(data)
            let contractJson = contractJsonWhole["Contracts"];
            for (let ii = 0; ii < contractNamesArr.length; ii++) {
                if (contractNamesArr[ii] in contractJson
                    && networkName in contractJson[contractNamesArr[ii]]) {
                    contractJson[contractNamesArr[ii]][networkName] = contractObjsArr[ii].address
                } else {
                    contractJson[contractNamesArr[ii]] = {
                        [networkName]: contractObjsArr[ii].address
                    }
                }
            }

            contractJsonWhole["Contracts"] = contractJson
            fs.writeFile(file_path, JSON.stringify(contractJsonWhole, null, 4), function (err) {
                if (err) throw err;
                console.log(`completed implementations`);
            })
        }
    });
}

function replaceTokenAddress(contractName, tokenAddress, filepath = undefined, addressToReplace = undefined, saveNetwork = true) {
    const file_path = filepath ? filepath : `./contracts/${contractName}.sol`
    const data = fs.readFileSync(file_path, 'utf-8');

    const valueToReplace = addressToReplace ? addressToReplace : USDTtokenContract[lastDeploy["lastNetwork"]]
    let lastLine = ""
    let newData = ""
    data.split(/\r?\n/).forEach(line => {
        if (lastLine.includes("tokenContract[Coin.USDT_TOKEN] = IERC20(")) {
            line = line.replace(valueToReplace, tokenAddress)
        }
        lastLine = line
        newData += line + "\n"
    });

    fs.writeFileSync(`./contracts/${contractName}.sol`, newData, 'utf-8');

    if (saveNetwork) {
        const network = hre.network.name
        const currentdate = new Date();
        const datetime = currentdate.getDate() + "/"
            + (currentdate.getMonth() + 1) + "/"
            + currentdate.getFullYear() + " "
            + currentdate.getHours() + ":"
            + currentdate.getMinutes() + ":"
            + currentdate.getSeconds();
        const newJson = { lastNetwork: network, datetime: datetime }
        if (network !== "hardhat") {
            fs.writeFile("./scripts/last_deploy.json", JSON.stringify(newJson, null, 4), function writeJSON(err) {
                if (err) return console.log(err);
            });
        }
    }
}

function replaceTokenAddressBytecode(contractName, tokenAddress, filepath = undefined, addressToReplace = undefined) {
    const json_file_path = `../artifacts/contracts/${contractName}.sol/${contractName}.json`
    const file_path = filepath ? filepath : `./artifacts/contracts/${contractName}.sol/${contractName}.json`
    const valueToReplace = (addressToReplace ? addressToReplace : USDTtokenContract[lastDeploy["lastNetwork"]]).slice(2).toLowerCase()

    let data = JSON.parse(fs.readFileSync(file_path, 'utf-8'))
    let bytecode = data.bytecode
    bytecode = bytecode.replace(valueToReplace, tokenAddress.slice(2).toLowerCase())
    data = { ...data, bytecode }

    fs.writeFileSync(file_path, JSON.stringify(data, null, 4), 'utf-8');

    // if (fs.existsSync(json_file_path)) {
    //     let dataJSON = require(json_file_path)
    //     let bytecode = dataJSON.bytecode
    //     bytecode = bytecode.replace(valueToReplace, tokenAddress.slice(2).toLowerCase())
    //     dataJSON["bytecode"] = bytecode

    //     fs.writeFile(file_path, JSON.stringify(dataJSON, null, 4), function (err) {
    //         if (err) throw err;
    //     })
    // } else {
    //     fs.readFile(file_path, (err, data) => {
    //         if (err) {
    //             console.log(err)
    //             console.log(data)
    //         } else {
    //             let dataJSON
    //             try {
    //                 dataJSON = JSON.parse(data)
    //             } catch (e) {
    //                 console.log(e)
    //                 console.log(data)
    //             }
    //             let bytecode = dataJSON.bytecode
    //             bytecode = bytecode.replace(valueToReplace, tokenAddress.slice(2).toLowerCase())
    //             dataJSON["bytecode"] = bytecode

    //             fs.writeFile(file_path, JSON.stringify(dataJSON, null, 4), function (err) {
    //                 if (err) throw err;
    //             })
    //         }
    //     })
    // }
}

function replaceTokenAddresses() {

    const network = hre.network.name

    const tokenAddress = USDTtokenContract[network]
    for (let ii = 0; ii < contracts.length; ii++) {
        try {
            replaceTokenAddress(contracts[ii], tokenAddress, undefined, undefined, false)
        } catch { }
    }

    const currentdate = new Date();
    const datetime = currentdate.getDate() + "/"
        + (currentdate.getMonth() + 1) + "/"
        + currentdate.getFullYear() + " "
        + currentdate.getHours() + ":"
        + currentdate.getMinutes() + ":"
        + currentdate.getSeconds();
    const newJson = { lastNetwork: network, datetime: datetime }

    fs.writeFile("./scripts/last_deploy.json", JSON.stringify(newJson, null, 4), function writeJSON(err) {
        if (err) return console.log(err);
    });
}

module.exports = {
    verifyContracts, saveABIs, saveProxiesInfo, replaceTokenAddress,
    saveImplementationAddress, replaceTokenAddressBytecode, replaceTokenAddresses,
    USDTtokenContract, saveContractsAddress
}