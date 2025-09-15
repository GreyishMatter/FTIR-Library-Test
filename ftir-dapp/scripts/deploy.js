// scripts/deploy.js
const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const router = "0xb83E47C2bC239B3bf7CbC4A6b3b71721D0B672E0"; // Sepolia Functions Router
  const donId = "0x66756e2d657468657265756d2d7365706f6c69612d3100000000000000000000"; // Sepolia DON ID
  const subscriptionId = "YOUR_SUBSCRIPTION_ID"; // Replace with your subscription ID
  const sourceCode = fs.readFileSync("functions/correlation.js", "utf8");

  const CorrelationConsumer = await hre.ethers.getContractFactory("CorrelationConsumer");
  const contract = await CorrelationConsumer.deploy(router, donId, subscriptionId, sourceCode);
  await contract.waitForDeployment();

  console.log("Contract deployed to:", contract.target);
  console.log("Deployer whitelisted:", deployer.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1);
});