// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SignedPrice} from "../src/SignedPrice.sol";

/// @notice Known-answer test: three real MON/USD packages captured from the public price gateway,
///         verified against the five production signer addresses. Proves the digest layout and the
///         no-prefix signature scheme against data the contract will see on the live chain.
contract SignedPriceRealTest is Test {
    function test_RealGatewayPackagesVerify() public {
        address[] memory s = new address[](5);
        s[0] = 0x51Ce04Be4b3E32572C4Ec9135221d0691Ba7d202;
        s[1] = 0x8BB8F32Df04c8b654987DAaeD53D6B6091e3B774;
        s[2] = 0x9c5AE89C4Af6aA32cE58588DBaF90d18a855B6de;
        s[3] = 0xDD682daEC5A90dD295d14DA4b0bec9281017b5bE;
        s[4] = 0xdEB22f54738d54976C4c0fe5ce6d408E40d88499;
        SignedPrice o = new SignedPrice(bytes32("MON"), s, 3, 60);
        uint48 ts = 1791794310000;
        vm.warp(ts / 1000 + 5);
        SignedPrice.Package[] memory p = new SignedPrice.Package[](3);
        p[0] = SignedPrice.Package(
            2604237, ts, 28,
            0x0f5d74e60ee9cc1cca5eeb80e6f75a967a0336ca4509bc3de00f82f9651299c6,
            0x3a099c1ce3a70f9793d5f7b20ca2c44a703d9918c374bc155d47ba9852b6e433
        );
        p[1] = SignedPrice.Package(
            2604237, ts, 28,
            0xd2b4ec03524d8e3feb7418fc1f5ddb71ca6a042a22e8068efee24726b20fe307,
            0x1efd61535c93a6527d56d954d212f1f80ef43ca2705de5f774539e01213cdcff
        );
        p[2] = SignedPrice.Package(
            2604237, ts, 28,
            0x1069948db5e097be608aeb4f9a498d9b7a87648dc11784c3407f141736d087ca,
            0x5b38e079048e2eac96c15cbb8e858ac55f1621355241c5e3feca5a15daf15892
        );
        (uint256 median, uint48 t) = o.verify(p);
        assertEq(median, 2604237);
        assertEq(t, ts);

        // the same packages are refused once they are older than the age limit
        vm.warp(ts / 1000 + 61);
        vm.expectRevert(abi.encodeWithSelector(SignedPrice.TooOld.selector, ts / 1000, ts / 1000 + 61));
        o.verify(p);
    }
}
