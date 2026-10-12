// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {SignedPrice} from "../src/SignedPrice.sol";
import {RecallBook} from "../src/RecallBook.sol";

/// @notice One test per guarantee and per attack in the README's attack table.
contract RuleTest is Base {
    uint128 constant SIZE = 10_000 ether; // MON
    uint64 constant MOVED = 2_602_860; // +11 bps over P0 (stale at 10)
    uint64 constant NUDGED = 2_600_520; // +2 bps over P0 (not stale)

    // ---------------------------------------------------------------- guarantees

    function test_TakeNeverMatchesInItsOwnBlock() public {
        uint256 id = _postAsk(book, P0, SIZE);
        uint256 before = wmon.balanceOf(sniper);
        vm.prank(sniper);
        book.take(id, SIZE);
        assertEq(wmon.balanceOf(sniper), before, "filled in its own block");
        assertEq(book.getOrder(id).remaining, SIZE);
        assertEq(book.getOrder(id).pending, 1);
        // a settle call in the same block does nothing either
        assertEq(book.settle(16), 0);
        _next(DELAY - 1);
        assertEq(book.settle(16), 0, "settled before the delay elapsed");
        _next(1);
        assertEq(book.settle(16), 1);
        assertEq(wmon.balanceOf(sniper), before + SIZE);
        _assertConserved(book);
    }

    function test_OlderTakesSettleBeforeANewCallActs() public {
        uint256 id = _postAsk(book, P0, SIZE);
        vm.prank(sniper);
        book.take(id, SIZE);
        _next(DELAY);
        // the maker's cancel arrives after the delay: the take settles first, so the cancel finds a filled order
        SignedPrice.Package[] memory px = _px(MOVED);
        vm.prank(maker);
        vm.expectEmit(true, false, false, false, address(book));
        emit RecallBook.CancelTooLate(id);
        book.cancel(id, px);
        assertEq(book.getOrder(id).remaining, 0);
        (,, uint64 fills,,,,,) = book.stats();
        assertEq(fills, 1);
    }

    function test_OldestTakeSettlesFirst() public {
        uint256 id = _postAsk(book, P0, SIZE);
        vm.prank(sniper);
        book.take(id, SIZE); // first in line wants everything
        vm.prank(trader);
        book.take(id, SIZE / 2);
        _next(DELAY);
        uint256 s0 = wmon.balanceOf(sniper);
        uint256 t0 = wmon.balanceOf(trader);
        book.settle(16);
        assertEq(wmon.balanceOf(sniper) - s0, SIZE, "oldest take not served first");
        assertEq(wmon.balanceOf(trader), t0, "later take should find nothing");
        _assertConserved(book);
    }

    // ---------------------------------------------------------------- attack: fee race

    function test_FeeRace_StaleCancelBeatsAWaitingTake() public {
        uint256 id = _postAsk(book, P0, SIZE);
        uint256 sniperUsd = usd.balanceOf(sniper);
        uint256 makerMon = wmon.balanceOf(maker);
        vm.prank(sniper);
        book.take(id, SIZE); // block N, whatever fee it paid
        _next(1); // block N+1
        SignedPrice.Package[] memory px = _px(MOVED);
        vm.prank(maker);
        book.cancel(id, px);
        RecallBook.Order memory o = book.getOrder(id);
        assertFalse(o.live);
        assertEq(wmon.balanceOf(maker), makerMon + SIZE, "maker not refunded");
        _next(DELAY);
        book.settle(16);
        assertEq(usd.balanceOf(sniper), sniperUsd, "sniper not made whole");
        (,,, uint64 nothing,, uint64 stale,,) = book.stats();
        assertEq(nothing, 1);
        assertEq(stale, 1);
        _assertConserved(book);
    }

    function test_FeeRace_OrdinaryBookLetsTheSniperFill() public {
        uint256 id = _postAsk(plain, P0, SIZE);
        uint256 before = wmon.balanceOf(sniper);
        vm.prank(sniper);
        plain.take(id, SIZE); // lands first
        assertEq(wmon.balanceOf(sniper), before + SIZE, "ordinary book should fill at once");
        SignedPrice.Package[] memory px = _px(MOVED);
        vm.prank(maker);
        vm.expectEmit(true, false, false, false, address(plain));
        emit RecallBook.CancelTooLate(id);
        plain.cancel(id, px);
        _assertConserved(plain);
    }

    // ---------------------------------------------------------------- attack: dodge

    function test_Dodge_CancelWithoutAMoveWaitsForTheTrade() public {
        uint256 id = _postAsk(book, P0, SIZE);
        vm.prank(trader);
        book.take(id, SIZE);
        _next(1);
        SignedPrice.Package[] memory px = _px(NUDGED);
        vm.prank(maker);
        book.cancel(id, px);
        RecallBook.Order memory o = book.getOrder(id);
        assertTrue(o.live && o.cancelRequested, "dodge should be deferred");
        uint256 before = wmon.balanceOf(trader);
        _next(DELAY);
        book.settle(16);
        assertEq(wmon.balanceOf(trader), before + SIZE, "fair trade did not fill");
        (,,,,,, uint64 deferred,) = book.stats();
        assertEq(deferred, 1);
        _assertConserved(book);
    }

    function test_Dodge_CancelWithNoPriceAtAllWaits() public {
        uint256 id = _postAsk(book, P0, SIZE);
        vm.prank(trader);
        book.take(id, SIZE / 4);
        vm.prank(maker);
        book.cancel(id, _none());
        assertTrue(book.getOrder(id).cancelRequested);
        // nobody can take a quote the maker has asked to pull
        vm.prank(sniper);
        vm.expectRevert(RecallBook.NotLive.selector);
        book.take(id, 1 ether);
        uint256 makerMon = wmon.balanceOf(maker);
        _next(DELAY);
        book.settle(16);
        // trade filled, rest refunded to the maker once the queue cleared
        RecallBook.Order memory o = book.getOrder(id);
        assertFalse(o.live);
        assertEq(wmon.balanceOf(maker), makerMon + SIZE - SIZE / 4);
        _assertConserved(book);
    }

    function test_CancelWithNothingWaitingNeedsNoProof() public {
        uint256 id = _postAsk(book, P0, SIZE);
        uint256 makerMon = wmon.balanceOf(maker);
        vm.prank(maker);
        book.cancel(id, _none());
        assertFalse(book.getOrder(id).live);
        assertEq(wmon.balanceOf(maker), makerMon + SIZE);
    }

    function test_OnlyTheMakerCancels() public {
        uint256 id = _postAsk(book, P0, SIZE);
        vm.prank(sniper);
        vm.expectRevert(RecallBook.NotMaker.selector);
        book.cancel(id, _none());
    }

    // ---------------------------------------------------------------- attack: bad price

    function test_BadPrice_ForgedSignatureRejected() public {
        uint256 id = _postAsk(book, P0, SIZE);
        vm.prank(sniper);
        book.take(id, SIZE);
        _next(1);
        SignedPrice.Package[] memory px = _px(MOVED);
        uint256 rogue = 0xBAD;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(rogue, oracle.digest(MOVED, px[0].timestampMs));
        px[2] = SignedPrice.Package(MOVED, px[0].timestampMs, v, r, s);
        vm.prank(maker);
        vm.expectRevert(abi.encodeWithSelector(SignedPrice.UnknownSigner.selector, vm.addr(rogue)));
        book.cancel(id, px);
    }

    function test_BadPrice_TamperedValueRejected() public {
        uint256 id = _postAsk(book, P0, SIZE);
        vm.prank(sniper);
        book.take(id, SIZE);
        _next(1);
        SignedPrice.Package[] memory px = _px(NUDGED);
        px[0].value = MOVED; // claim a bigger move than was signed
        vm.prank(maker);
        vm.expectRevert(); // recovers some other address -> UnknownSigner(x)
        book.cancel(id, px);
    }

    function test_BadPrice_ReplayOfThePostPriceRejected() public {
        uint48 postTs = uint48(block.timestamp * 1000);
        uint256 id = _postAsk(book, P0, SIZE);
        vm.prank(sniper);
        book.take(id, SIZE);
        _next(1);
        // a package from before (or at) the post time cannot be used to claim a move
        SignedPrice.Package[] memory px = _pxAt(MOVED, postTs, 0, 3);
        vm.prank(maker);
        vm.expectRevert(abi.encodeWithSelector(RecallBook.StalePrice.selector, postTs, postTs));
        book.cancel(id, px);
    }

    function test_BadPrice_ExpiredPackageRejected() public {
        SignedPrice.Package[] memory old = _pxAt(P0, uint48(block.timestamp * 1000), 0, 3);
        vm.warp(block.timestamp + MAX_AGE + 1);
        vm.prank(maker);
        vm.expectRevert(
            abi.encodeWithSelector(SignedPrice.TooOld.selector, block.timestamp - MAX_AGE - 1, block.timestamp)
        );
        book.post(true, P0, SIZE, old);
    }

    function test_BadPrice_FuturePackageRejected() public {
        uint48 ahead = uint48((block.timestamp + 61) * 1000);
        SignedPrice.Package[] memory px = _pxAt(P0, ahead, 0, 3);
        vm.prank(maker);
        vm.expectRevert(abi.encodeWithSelector(SignedPrice.FromTheFuture.selector, block.timestamp + 61, block.timestamp));
        book.post(true, P0, SIZE, px);
    }

    function test_BadPrice_TooFewSignersRejected() public {
        SignedPrice.Package[] memory px = _pxAt(P0, uint48(block.timestamp * 1000), 0, 2);
        vm.prank(maker);
        vm.expectRevert(abi.encodeWithSelector(SignedPrice.TooFewPackages.selector, 2, 3));
        book.post(true, P0, SIZE, px);
    }

    function test_BadPrice_OneSignerTwiceRejected() public {
        SignedPrice.Package[] memory px = _px(P0);
        px[2] = px[0];
        vm.prank(maker);
        vm.expectRevert(abi.encodeWithSelector(SignedPrice.DuplicateSigner.selector, vm.addr(signerKeys[0])));
        book.post(true, P0, SIZE, px);
    }

    function test_BadPrice_MixedTimestampsRejected() public {
        SignedPrice.Package[] memory a = _px(P0);
        SignedPrice.Package[] memory b = _pxAt(P0, uint48(block.timestamp * 1000 - 1000), 3, 1);
        a[2] = b[0];
        vm.prank(maker);
        vm.expectRevert(SignedPrice.MixedTimestamps.selector);
        book.post(true, P0, SIZE, a);
    }

    function test_BadPrice_MalleableSignatureRejected() public {
        SignedPrice.Package[] memory px = _px(P0);
        uint256 n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141;
        px[0].s = bytes32(n - uint256(px[0].s));
        px[0].v = px[0].v == 27 ? 28 : 27;
        vm.prank(maker);
        vm.expectRevert(SignedPrice.MalleableSignature.selector);
        book.post(true, P0, SIZE, px);
    }

    function test_MedianIgnoresOneOutlier() public view {
        uint48 ts = uint48(block.timestamp * 1000);
        SignedPrice.Package[] memory px = new SignedPrice.Package[](3);
        uint256[3] memory vals = [uint256(P0), uint256(P0 + 10), uint256(P0 * 50)];
        for (uint256 i; i < 3; ++i) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKeys[i], oracle.digest(vals[i], ts));
            px[i] = SignedPrice.Package(vals[i], ts, v, r, s);
        }
        (uint256 m,) = oracle.verify(px);
        assertEq(m, P0 + 10);
    }

    // ---------------------------------------------------------------- attack: queue flood

    function test_QueueFlood_PerBlockCapRefusesTheExcess() public {
        uint256 id = _postAsk(book, P0, SIZE);
        uint256 cap = book.MAX_PER_BLOCK();
        for (uint256 i; i < cap; ++i) {
            vm.prank(sniper);
            book.take(id, 1 ether);
        }
        vm.prank(sniper);
        vm.expectRevert(abi.encodeWithSelector(RecallBook.BlockQueueFull.selector, block.number));
        book.take(id, 1 ether);
        _next(1);
        vm.prank(trader);
        book.take(id, 1 ether); // the next block has room again
    }

    // ---------------------------------------------------------------- attack: backlog

    function test_Backlog_RefusesNewTakesButCancelsAndPostsRun() public {
        uint256 id = _postAsk(book, P0, SIZE);
        uint256 other = _postAsk(book, P0, SIZE);
        for (uint256 i; i < 32; ++i) {
            vm.prank(sniper);
            book.take(id, 1 ether);
        }
        _next(DELAY);
        // one call settles WORK_CAP, the rest are still eligible -> takes refused
        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(RecallBook.SettlementBacklog.selector, 16, 32));
        book.take(other, 1 ether);
        // a cancel still runs (and does settlement work on the way)
        vm.prank(maker);
        book.cancel(other, _none());
        assertFalse(book.getOrder(other).live);
        // a post still runs
        _postAsk(book, P0, SIZE);
        assertEq(book.head(), 32, "posts and cancels should have drained the backlog");
        vm.prank(trader);
        book.take(id, 1 ether);
        _assertConserved(book);
    }

    // ---------------------------------------------------------------- attack: dropped cancel

    function test_DroppedCancel_NextBlockCancelStillLandsFirst() public {
        uint256 id = _postAsk(book, P0, SIZE);
        vm.prank(sniper);
        book.take(id, SIZE); // block N; the producer drops the maker's cancel from N
        _next(1); // N+1 (DELAY = 2)
        SignedPrice.Package[] memory px = _px(MOVED);
        vm.prank(maker);
        book.cancel(id, px);
        assertFalse(book.getOrder(id).live);
        _next(DELAY);
        book.settle(16);
        (,,, uint64 nothing,,,,) = book.stats();
        assertEq(nothing, 1);
    }

    // ---------------------------------------------------------------- money paths

    function test_BidSideFillPaysTheTakerInQuote() public {
        uint256 id = _postBid(book, P0, SIZE);
        uint256 cost = book.cost(SIZE, P0);
        uint256 usd0 = usd.balanceOf(trader);
        uint256 mon0 = wmon.balanceOf(trader);
        uint256 makerMon0 = wmon.balanceOf(maker);
        vm.prank(trader);
        book.take(id, SIZE);
        _next(DELAY);
        book.settle(16);
        assertEq(usd.balanceOf(trader) - usd0, cost);
        assertEq(mon0 - wmon.balanceOf(trader), SIZE);
        assertEq(wmon.balanceOf(maker) - makerMon0, SIZE);
        _assertConserved(book);
    }

    function test_PartialFillRefundsTheUnfilledEscrow() public {
        uint256 id = _postAsk(book, P0, SIZE / 2);
        vm.prank(sniper);
        book.take(id, SIZE / 2);
        // a second take is accepted while the first waits, but only what is left can fill
        vm.prank(trader);
        book.take(id, SIZE / 4);
        uint256 usd0 = usd.balanceOf(trader);
        _next(DELAY);
        book.settle(16);
        assertEq(usd.balanceOf(trader), usd0 + book.cost(SIZE / 4, P0), "trader escrow not refunded");
        _assertConserved(book);
    }

    function test_TooLargeAndOwnOrderAreRefused() public {
        uint256 id = _postAsk(book, P0, SIZE);
        vm.prank(sniper);
        vm.expectRevert(abi.encodeWithSelector(RecallBook.TooLarge.selector, SIZE + 1, SIZE));
        book.take(id, SIZE + 1);
        vm.prank(maker);
        vm.expectRevert(RecallBook.OwnOrder.selector);
        book.take(id, 1 ether);
    }

    function testFuzz_Conservation(uint128 a, uint128 b, bool stale, bool bid) public {
        a = uint128(bound(a, 1 ether, SIZE));
        b = uint128(bound(b, 1 ether, SIZE));
        uint256 id = bid ? _postBid(book, P0, SIZE) : _postAsk(book, P0, SIZE);
        vm.prank(sniper);
        book.take(id, a);
        if (a < SIZE) {
            vm.prank(trader);
            book.take(id, b > SIZE - a ? SIZE - a : b);
        }
        _next(1);
        SignedPrice.Package[] memory px = _px(stale ? MOVED : NUDGED);
        vm.prank(maker);
        book.cancel(id, px);
        _assertConserved(book);
        _next(DELAY);
        book.settle(16);
        _assertConserved(book);
        assertFalse(book.getOrder(id).live);
    }

    // ---------------------------------------------------------------- quote token

    function test_TestUSDClaimHasACooldown() public {
        vm.prank(sniper);
        vm.expectRevert();
        usd.claim();
        vm.warp(block.timestamp + 1 hours);
        vm.prank(sniper);
        usd.claim();
    }
}
