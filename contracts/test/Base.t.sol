// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SignedPrice} from "../src/SignedPrice.sol";
import {RecallBook, IERC20} from "../src/RecallBook.sol";
import {TestUSD} from "../src/TestUSD.sol";
import {MockWrapped} from "./mocks/MockWrapped.sol";

/// @notice Shared world: five signers (threshold 3), a cancel-first book and an ordinary book
///         built from the same contract, a wrapped-native base and the claimable dollar quote.
abstract contract Base is Test {
    bytes32 constant FEED = bytes32("MON");
    uint256 constant MAX_AGE = 60;
    uint256 constant DELAY = 2;
    uint256 constant STALE_BPS = 10;
    uint64 constant P0 = 2_600_000; // $0.026 in 1e8

    uint256[5] signerKeys = [uint256(0xA11), 0xB22, 0xC33, 0xD44, 0xE55];
    SignedPrice oracle;
    RecallBook book; // cancel-first
    RecallBook plain; // ordinary
    MockWrapped wmon;
    TestUSD usd;

    address maker = makeAddr("maker");
    address sniper = makeAddr("sniper");
    address trader = makeAddr("trader");

    function setUp() public virtual {
        vm.warp(1_790_000_000);
        vm.roll(100);
        address[] memory s = new address[](5);
        for (uint256 i; i < 5; ++i) s[i] = vm.addr(signerKeys[i]);
        oracle = new SignedPrice(FEED, s, 3, MAX_AGE);
        wmon = new MockWrapped();
        usd = new TestUSD();
        book = new RecallBook(IERC20(address(wmon)), IERC20(address(usd)), oracle, true, DELAY, STALE_BPS);
        plain = new RecallBook(IERC20(address(wmon)), IERC20(address(usd)), oracle, false, DELAY, STALE_BPS);
        address[3] memory people = [maker, sniper, trader];
        for (uint256 i; i < 3; ++i) _fund(people[i]);
    }

    function _fund(address who) internal {
        vm.deal(who, 1_000_000 ether);
        vm.startPrank(who);
        wmon.deposit{value: 500_000 ether}();
        usd.claim();
        wmon.approve(address(book), type(uint256).max);
        usd.approve(address(book), type(uint256).max);
        wmon.approve(address(plain), type(uint256).max);
        usd.approve(address(plain), type(uint256).max);
        vm.stopPrank();
    }

    /// @dev Three packages signed by signers 0..2 at the current block time.
    function _px(uint256 value) internal view returns (SignedPrice.Package[] memory) {
        return _pxAt(value, uint48(block.timestamp * 1000), 0, 3);
    }

    function _pxAt(uint256 value, uint48 tsMs, uint256 first, uint256 n)
        internal
        view
        returns (SignedPrice.Package[] memory pk)
    {
        pk = new SignedPrice.Package[](n);
        bytes32 d = oracle.digest(value, tsMs);
        for (uint256 i; i < n; ++i) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKeys[first + i], d);
            pk[i] = SignedPrice.Package(value, tsMs, v, r, s);
        }
    }

    function _none() internal pure returns (SignedPrice.Package[] memory) {
        return new SignedPrice.Package[](0);
    }

    function _next(uint256 blocks) internal {
        vm.roll(block.number + blocks);
        vm.warp(block.timestamp + blocks); // ~1s per step is enough resolution here
    }

    function _postAsk(RecallBook b, uint64 price, uint128 size) internal returns (uint256 id) {
        SignedPrice.Package[] memory px = _px(P0);
        vm.prank(maker);
        id = b.post(true, price, size, px);
    }

    function _postBid(RecallBook b, uint64 price, uint128 size) internal returns (uint256 id) {
        SignedPrice.Package[] memory px = _px(P0);
        vm.prank(maker);
        id = b.post(false, price, size, px);
    }

    /// @dev Book balances must equal everything it owes: escrow of live orders plus unsettled takes.
    function _assertConserved(RecallBook b) internal view {
        uint256 baseOwed;
        uint256 quoteOwed;
        uint256 n = b.orderCount();
        for (uint256 id = 1; id <= n; ++id) {
            RecallBook.Order memory o = b.getOrder(id);
            if (o.isAsk) baseOwed += o.escrow;
            else quoteOwed += o.escrow;
        }
        uint256 q = b.queueLength();
        for (uint256 i = b.head(); i < q; ++i) {
            RecallBook.Take memory t = b.getTake(i);
            RecallBook.Order memory o = b.getOrder(t.orderId);
            if (o.isAsk) quoteOwed += t.escrow;
            else baseOwed += t.escrow;
        }
        assertEq(wmon.balanceOf(address(b)), baseOwed, "base held != base owed");
        assertEq(usd.balanceOf(address(b)), quoteOwed, "quote held != quote owed");
    }
}
