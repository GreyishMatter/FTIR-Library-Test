
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import {ConfirmedOwner} from "@chainlink/contracts/src/v0.8/shared/access/ConfirmedOwner.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";

contract CorrelationConsumer is FunctionsClient, ConfirmedOwner {
    using FunctionsRequest for FunctionsRequest.Request;

    uint64 public subscriptionId;
    uint32 public gasLimit = 300000;
    bytes32 public donId;
    string public sourceCode;
    address public refundAddress;

    uint256 public constant REQUEST_COST = 0.001 ether;
    uint256 public constant REWARD_AMOUNT = 0.002 ether;

    mapping(bytes32 => address) public requestToSender;
    mapping(bytes32 => string) public requestToFileName;
    mapping(bytes32 => bytes32) public requestToDataHash;
    mapping(string => bool) public correlationResults;
    mapping(string => uint256) public correlationPercentages;
    mapping(address => bool) public whitelist;

    event CorrelationRequested(bytes32 indexed requestId, string fileName, address sender, bytes32 dataHash);
    event CorrelationFulfilled(bytes32 indexed requestId, string fileName, bool result, uint256 percentage);
    event RefundSent(address indexed to, uint256 amount);
    event RewardSent(address indexed to, uint256 amount);
    event WhitelistUpdated(address indexed user, bool status);

    modifier onlyWhitelisted() {
        require(whitelist[msg.sender], "User not whitelisted");
        _;
    }

    constructor(address router, bytes32 _donId, uint64 _subscriptionId, string memory _sourceCode) 
        FunctionsClient(router) 
        ConfirmedOwner(msg.sender) 
    {
        donId = _donId;
        subscriptionId = _subscriptionId;
        sourceCode = _sourceCode;
        refundAddress = msg.sender;
        whitelist[msg.sender] = true;
    }

    function requestCorrelation(string memory fileName, string memory goldenData, string memory sampleData) 
        external 
        payable 
        onlyWhitelisted 
        returns (bytes32 requestId) 
    {
        require(msg.value >= REQUEST_COST, "Insufficient payment: 0.001 ETH required");

        bytes32 dataHash = keccak256(abi.encode(fileName, goldenData, sampleData));

        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJsCode(sourceCode);
        string[] memory args = new string[](3);
        args[0] = fileName;
        args[1] = goldenData;
        args[2] = sampleData;
        req.setArgs(args);

        requestId = _sendRequest(req.encodeCBOR(), subscriptionId, gasLimit, donId);
        requestToSender[requestId] = msg.sender;
        requestToFileName[requestId] = fileName;
        requestToDataHash[requestId] = dataHash;

        emit CorrelationRequested(requestId, fileName, msg.sender, dataHash);
    }

    function fulfillRequest(bytes32 requestId, bytes memory response, bytes memory err) 
        internal 
        override 
    {
        if (err.length > 0) {
            revert(string(err));
        }

        (bool result, uint256 percentage) = abi.decode(response, (bool, uint256));
        string memory fileName = requestToFileName[requestId];
        address sender = requestToSender[requestId];

        correlationResults[fileName] = result;
        correlationPercentages[fileName] = percentage;

        if (REQUEST_COST > 0) {
            (bool refundSuccess, ) = sender.call{value: REQUEST_COST}("");
            require(refundSuccess, "Refund failed");
            emit RefundSent(sender, REQUEST_COST);
        }

        if (result && REWARD_AMOUNT > 0) {
            (bool rewardSuccess, ) = sender.call{value: REWARD_AMOUNT}("");
            require(rewardSuccess, "Reward failed");
            emit RewardSent(sender, REWARD_AMOUNT);
        }

        emit CorrelationFulfilled(requestId, fileName, result, percentage);
    }

    function addToWhitelist(address user) external onlyOwner {
        whitelist[user] = true;
        emit WhitelistUpdated(user, true);
    }

    function removeFromWhitelist(address user) external onlyOwner {
        whitelist[user] = false;
        emit WhitelistUpdated(user, false);
    }

    function isWhitelisted(address user) external view returns (bool) {
        return whitelist[user];
    }

    function getRequestDataHash(bytes32 requestId) external view returns (bytes32) {
        return requestToDataHash[requestId];
    }

    function withdrawETH() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");
        (bool success, ) = refundAddress.call{value: balance}("");
        require(success, "Withdrawal failed");
    }

    receive() external payable {}
}