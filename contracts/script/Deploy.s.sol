// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {TriageOracle} from "../src/TriageOracle.sol";

contract Deploy is Script {
    // the dedicated agent wallet — ONLY address allowed to settle claims
    address constant AGENT = 0xe1Bce02897b329D8354cacE36831A12A624c4f8D;

    function run() external {
        vm.startBroadcast();

        // 1. deploy the test stablecoin (mints 1,000,000 mUSDC to deployer)
        MockUSDC token = new MockUSDC();
        console.log("MockUSDC deployed at:", address(token));

        // 2. deploy the oracle, pointing it at the token + agent
        TriageOracle oracle = new TriageOracle(address(token), AGENT);
        console.log("TriageOracle deployed at:", address(oracle));

        // 3. fund the oracle with 100,000 mUSDC so it can pay claims
        token.transfer(address(oracle), 100_000 * 10 ** 6);
        console.log("Funded oracle with 100,000 mUSDC");

        vm.stopBroadcast();
    }
}