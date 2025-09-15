// scripts/interact.js
const hre = require("hardhat");

async function main() {
  const contractAddress = "YOUR_CONTRACT_ADDRESS";
  const userAddress = "USER_ADDRESS_TO_WHITELIST";
  const contract = await hre.ethers.getContractAt("CorrelationConsumer", contractAddress);
  await contract.addToWhitelist(userAddress);
  console.log(`${userAddress} whitelisted`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1);
});