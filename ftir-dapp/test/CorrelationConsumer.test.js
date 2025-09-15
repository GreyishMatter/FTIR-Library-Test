// test/CorrelationConsumer.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CorrelationConsumer", function () {
  let contract, owner, user;
  const router = "0xb83E47C2bC239B3bf7CbC4A6b3b71721D0B672E0";
  const donId = "0x66756e2d657468657265756d2d7365706f6c69612d3100000000000000000000";
  const subscriptionId = 123;
  const sourceCode = "console.log('mock');";

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();
    const CorrelationConsumer = await ethers.getContractFactory("CorrelationConsumer");
    contract = await CorrelationConsumer.deploy(router, donId, subscriptionId, sourceCode);
    await contract.waitForDeployment();
  });

  it("should request correlation with correct payment", async function () {
    await contract.connect(owner).addToWhitelist(user.address); // Whitelist user
    const fileName = "test.json";
    const goldenData = JSON.stringify([0.1, 0.2]);
    const sampleData = JSON.stringify([0.1, 0.2]);
    const tx = await contract.connect(user).requestCorrelation(fileName, goldenData, sampleData, {
      value: ethers.parseEther("0.001")
    });
    await expect(tx).to.emit(contract, "CorrelationRequested");
  });
});