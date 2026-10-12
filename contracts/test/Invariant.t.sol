// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {SignedPrice} from "../src/SignedPrice.sol";
import {RecallBook} from "../src/RecallBook.sol";

/// @notice Drives random posts, takes, cancels (with and without a stale proof), settles and block
///         advances against the cancel-first book and checks it always holds exactly what it owes.
contract InvariantTest is Base {
    Actor[3] actors;

    function setUp() public override {
        super.setUp();
        actors[0] = new Actor(this);
        actors[1] = new Actor(this);
        actors[2] = new Actor(this);
        for (uint256 i; i < 3; ++i) {
            address a = address(actors[i]);
            vm.deal(a, 1_000_000 ether);
            vm.startPrank(a);
            wmon.deposit{value: 500_000 ether}();
            usd.claim();
            wmon.approve(address(book), type(uint256).max);
            usd.approve(address(book), type(uint256).max);
            vm.stopPrank();
        }
        targetContract(address(this));
        bytes4[] memory sel = new bytes4[](5);
        sel[0] = this.hPost.selector;
        sel[1] = this.hTake.selector;
        sel[2] = this.hCancel.selector;
        sel[3] = this.hSettle.selector;
        sel[4] = this.hRoll.selector;
        targetSelector(FuzzSelector({addr: address(this), selectors: sel}));
    }

    function hPost(uint8 who, bool ask, uint64 price, uint128 size) external {
        price = uint64(bound(price, P0 / 2, P0 * 2));
        size = uint128(bound(size, 1 ether, 5_000 ether));
        SignedPrice.Package[] memory px = _px(P0);
        vm.prank(address(actors[who % 3]));
        book.post(ask, price, size, px);
    }

    function hTake(uint8 who, uint256 id, uint128 size) external {
        uint256 n = book.orderCount();
        if (n == 0) return;
        id = bound(id, 1, n);
        RecallBook.Order memory o = book.getOrder(id);
        if (!o.live || o.cancelRequested || o.remaining == 0) return;
        address a = address(actors[who % 3]);
        if (a == o.maker) return;
        size = uint128(bound(size, 1, o.remaining));
        if (o.isAsk && book.cost(size, o.price) == 0) return;
        vm.prank(a);
        try book.take(id, size) {} catch {}
    }

    function hCancel(uint256 id, bool stale) external {
        uint256 n = book.orderCount();
        if (n == 0) return;
        id = bound(id, 1, n);
        RecallBook.Order memory o = book.getOrder(id);
        SignedPrice.Package[] memory px = _px(stale ? uint256(o.postPrice) * 10_020 / 10_000 : o.postPrice);
        vm.prank(o.maker);
        try book.cancel(id, px) {} catch {}
    }

    function hSettle(uint8 k) external {
        book.settle(bound(k, 1, 16));
    }

    function hRoll(uint8 k) external {
        _next(bound(k, 1, 3));
    }

    function invariant_BookHoldsExactlyWhatItOwes() public view {
        _assertConserved(book);
    }

    function invariant_HeadNeverPassesTheQueue() public view {
        assertLe(book.head(), book.queueLength());
    }
}

contract Actor {
    constructor(InvariantTest) {}
    receive() external payable {}
}
