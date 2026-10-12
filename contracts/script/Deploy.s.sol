// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {SignedPrice} from "../src/SignedPrice.sol";
import {RecallBook, IERC20} from "../src/RecallBook.sol";
import {TestUSD} from "../src/TestUSD.sol";

/// @notice Deploys the price verifier, the quote token and two books from the same contract:
///         one with the cancel-first rule on, one ordinary. Base is the chain's own wrapped MON.
contract Deploy is Script {
    // MON/USD packages from the public price gateway, five production signers, any three.
    bytes32 constant FEED = bytes32("MON");
    uint256 constant THRESHOLD = 3;
    uint256 constant MAX_AGE = 60;

    function run() external {
        address wmon = vm.envAddress("WMON");
        uint256 delay = vm.envOr("DELAY_BLOCKS", uint256(2));
        uint256 staleBps = vm.envOr("STALE_BPS", uint256(10));

        address[] memory s = new address[](5);
        s[0] = 0x51Ce04Be4b3E32572C4Ec9135221d0691Ba7d202;
        s[1] = 0x8BB8F32Df04c8b654987DAaeD53D6B6091e3B774;
        s[2] = 0x9c5AE89C4Af6aA32cE58588DBaF90d18a855B6de;
        s[3] = 0xDD682daEC5A90dD295d14DA4b0bec9281017b5bE;
        s[4] = 0xdEB22f54738d54976C4c0fe5ce6d408E40d88499;

        vm.startBroadcast();
        SignedPrice oracle = new SignedPrice(FEED, s, THRESHOLD, MAX_AGE);
        TestUSD usd = new TestUSD();
        RecallBook recall = new RecallBook(IERC20(wmon), IERC20(address(usd)), oracle, true, delay, staleBps);
        RecallBook plain = new RecallBook(IERC20(wmon), IERC20(address(usd)), oracle, false, delay, staleBps);
        vm.stopBroadcast();

        console2.log("oracle", address(oracle));
        console2.log("usd", address(usd));
        console2.log("recall", address(recall));
        console2.log("plain", address(plain));
    }
}
