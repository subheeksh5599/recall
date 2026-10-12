// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SignedPrice} from "./SignedPrice.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// @title RecallBook
/// @notice A two-token order book. With `cancelFirst` on, posts and cancels apply the moment they
///         land, takes wait `delay` blocks, every call settles eligible takes oldest-first before
///         doing its own work, and a cancel only overtakes a waiting take when a signed price
///         shows the quote moved at least `staleBps` since it was posted. With it off, the same
///         contract is an ordinary book: takes fill in the transaction that sends them.
contract RecallBook {
    // ------------------------------------------------------------------ types
    struct Order {
        address maker;
        bool isAsk; // maker sells base for quote
        bool live;
        bool cancelRequested;
        uint32 pending; // queued takes against this order
        uint64 price; // quote per base, 1e8 scale
        uint64 postPrice; // signed reference price when posted, 1e8 scale
        uint48 postTsMs; // timestamp of that signed price
        uint128 remaining; // base still offered / wanted
        uint256 escrow; // tokens the book holds for this order (base for asks, quote for bids)
    }

    struct Take {
        address taker;
        uint64 orderId;
        uint64 blockNumber;
        uint128 size; // base
        uint256 escrow; // tokens the book holds for this take (quote when buying, base when selling)
    }

    struct Stats {
        uint64 posts;
        uint64 takesQueued;
        uint64 fills;
        uint64 takesFoundNothing;
        uint64 cancels;
        uint64 staleCancels;
        uint64 deferredCancels;
        uint128 baseFilled;
    }

    // ------------------------------------------------------------------ errors
    error ZeroAmount();
    error NotMaker();
    error NotLive();
    error OwnOrder();
    error TooLarge(uint256 size, uint256 remaining);
    error BlockQueueFull(uint256 blockNumber);
    error SettlementBacklog(uint256 head, uint256 queued);
    error StalePrice(uint48 cancelTsMs, uint48 postTsMs);
    error TransferFailed();
    error Reentrancy();

    // ------------------------------------------------------------------ events
    event Posted(uint256 indexed id, address indexed maker, bool isAsk, uint64 price, uint128 size, uint64 postPrice, uint48 postTsMs);
    event TakeQueued(uint256 indexed takeIndex, uint256 indexed orderId, address indexed taker, uint128 size, uint64 blockNumber);
    event Filled(uint256 indexed takeIndex, uint256 indexed orderId, address indexed taker, uint128 size, uint64 price);
    event FoundNothing(uint256 indexed takeIndex, uint256 indexed orderId, address indexed taker, uint128 size);
    event Cancelled(uint256 indexed id, bool stale, uint64 cancelPrice, uint256 moveBps);
    event CancelDeferred(uint256 indexed id, uint64 cancelPrice, uint256 moveBps);
    event CancelTooLate(uint256 indexed id);

    // ------------------------------------------------------------------ config
    uint256 public constant PRICE_SCALE = 1e8;
    uint256 public constant WORK_CAP = 16; // takes settled per call
    uint256 public constant MAX_PER_BLOCK = 32; // takes queued per block

    IERC20 public immutable base;
    IERC20 public immutable quote;
    SignedPrice public immutable oracle;
    bool public immutable cancelFirst;
    uint256 public immutable delay; // blocks a take waits
    uint256 public immutable staleBps; // move that makes a quote stale

    // ------------------------------------------------------------------ state
    Order[] private _orders; // id = index + 1
    Take[] private _queue;
    uint256 public head; // next take to settle
    mapping(uint256 => uint256) public queuedInBlock;
    Stats public stats;
    uint256 private _lock = 1;

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(IERC20 base_, IERC20 quote_, SignedPrice oracle_, bool cancelFirst_, uint256 delay_, uint256 staleBps_) {
        require(address(base_) != address(quote_) && delay_ > 0 && staleBps_ > 0, "bad config");
        base = base_;
        quote = quote_;
        oracle = oracle_;
        cancelFirst = cancelFirst_;
        delay = delay_;
        staleBps = staleBps_;
    }

    // ------------------------------------------------------------------ maker side
    /// @notice Post a quote. The signed price is recorded as the reference the quote was made against.
    function post(bool isAsk, uint64 price, uint128 size, SignedPrice.Package[] calldata px)
        external
        nonReentrant
        returns (uint256 id)
    {
        _settle(WORK_CAP);
        if (price == 0 || size == 0) revert ZeroAmount();
        (uint256 ref, uint48 ts) = oracle.verify(px);
        uint256 escrow = isAsk ? size : _cost(size, price);
        if (escrow == 0) revert ZeroAmount();
        _orders.push(
            Order({
                maker: msg.sender,
                isAsk: isAsk,
                live: true,
                cancelRequested: false,
                pending: 0,
                price: price,
                postPrice: uint64(ref),
                postTsMs: ts,
                remaining: size,
                escrow: escrow
            })
        );
        id = _orders.length;
        stats.posts++;
        _pull(isAsk ? base : quote, msg.sender, escrow);
        emit Posted(id, msg.sender, isAsk, price, size, uint64(ref), ts);
    }

    /// @notice Cancel a quote. With no take waiting it applies at once. With a take waiting it applies
    ///         at once only if `px` proves a move of at least `staleBps`; otherwise it applies after
    ///         the waiting takes settle.
    function cancel(uint256 id, SignedPrice.Package[] calldata px) external nonReentrant {
        _settle(WORK_CAP);
        Order storage o = _order(id);
        if (o.maker != msg.sender) revert NotMaker();
        if (!o.live) {
            // settlement that ran at the top of this call may have filled it already
            emit CancelTooLate(id);
            return;
        }
        if (o.pending == 0) {
            _remove(id, o);
            stats.cancels++;
            emit Cancelled(id, false, 0, 0);
            return;
        }
        uint256 nowPrice;
        uint256 move;
        if (px.length > 0) {
            uint48 ts;
            (nowPrice, ts) = oracle.verify(px);
            if (ts <= o.postTsMs) revert StalePrice(ts, o.postTsMs);
            move = _moveBps(o.postPrice, nowPrice);
        }
        if (px.length > 0 && move >= staleBps) {
            _remove(id, o);
            stats.cancels++;
            stats.staleCancels++;
            emit Cancelled(id, true, uint64(nowPrice), move);
        } else {
            o.cancelRequested = true;
            stats.deferredCancels++;
            emit CancelDeferred(id, uint64(nowPrice), move);
        }
    }

    // ------------------------------------------------------------------ taker side
    /// @notice Take `size` base against quote `id`. Queued for `delay` blocks when `cancelFirst`,
    ///         filled in this transaction otherwise.
    function take(uint256 id, uint128 size) external nonReentrant returns (uint256 takeIndex) {
        _settle(WORK_CAP);
        if (size == 0) revert ZeroAmount();
        Order storage o = _order(id);
        if (!o.live || o.cancelRequested) revert NotLive();
        if (o.maker == msg.sender) revert OwnOrder();
        if (size > o.remaining) revert TooLarge(size, o.remaining);
        uint256 escrow = o.isAsk ? _cost(size, o.price) : size;
        if (escrow == 0) revert ZeroAmount();

        if (!cancelFirst) {
            _pull(o.isAsk ? quote : base, msg.sender, escrow);
            takeIndex = _queue.length;
            _queue.push(Take(msg.sender, uint64(id), uint64(block.number), size, escrow));
            head = _queue.length;
            stats.takesQueued++;
            emit TakeQueued(takeIndex, id, msg.sender, size, uint64(block.number));
            _fill(takeIndex, _queue[takeIndex], o);
            return takeIndex;
        }

        if (head < _queue.length && _queue[head].blockNumber + delay <= block.number) {
            revert SettlementBacklog(head, _queue.length);
        }
        if (queuedInBlock[block.number] >= MAX_PER_BLOCK) revert BlockQueueFull(block.number);
        queuedInBlock[block.number]++;
        _pull(o.isAsk ? quote : base, msg.sender, escrow);
        takeIndex = _queue.length;
        _queue.push(Take(msg.sender, uint64(id), uint64(block.number), size, escrow));
        o.pending++;
        stats.takesQueued++;
        emit TakeQueued(takeIndex, id, msg.sender, size, uint64(block.number));
    }

    /// @notice Settle up to `maxTakes` eligible takes. Anyone may call it.
    function settle(uint256 maxTakes) external nonReentrant returns (uint256 done) {
        return _settle(maxTakes);
    }

    // ------------------------------------------------------------------ views
    function orderCount() external view returns (uint256) {
        return _orders.length;
    }

    function getOrder(uint256 id) external view returns (Order memory) {
        return _order(id);
    }

    function queueLength() external view returns (uint256) {
        return _queue.length;
    }

    function getTake(uint256 index) external view returns (Take memory) {
        return _queue[index];
    }

    /// @notice Takes that could settle right now.
    function eligible() external view returns (uint256 n) {
        for (uint256 i = head; i < _queue.length && _queue[i].blockNumber + delay <= block.number; ++i) ++n;
    }

    /// @notice Move in bps between a quote's posted reference and `price`.
    function moveBps(uint256 id, uint256 price) external view returns (uint256) {
        return _moveBps(_order(id).postPrice, price);
    }

    function cost(uint128 size, uint64 price) external pure returns (uint256) {
        return _cost(size, price);
    }

    // ------------------------------------------------------------------ internals
    function _settle(uint256 cap) internal returns (uint256 done) {
        if (!cancelFirst) return 0;
        uint256 len = _queue.length;
        uint256 h = head;
        while (h < len && done < cap) {
            Take storage t = _queue[h];
            if (t.blockNumber + delay > block.number) break;
            Order storage o = _orders[t.orderId - 1];
            o.pending--;
            if (o.live && o.remaining > 0) {
                _fill(h, t, o);
            } else {
                uint256 refund = t.escrow;
                t.escrow = 0;
                stats.takesFoundNothing++;
                _push(o.isAsk ? quote : base, t.taker, refund);
                emit FoundNothing(h, t.orderId, t.taker, t.size);
            }
            if (o.live && o.cancelRequested && o.pending == 0) {
                _remove(t.orderId, o);
                stats.cancels++;
                emit Cancelled(t.orderId, false, 0, 0);
            }
            ++h;
            ++done;
        }
        head = h;
    }

    /// @dev Fill take `t` against live order `o` for as much as is left.
    function _fill(uint256 index, Take storage t, Order storage o) internal {
        uint128 f = t.size <= o.remaining ? t.size : o.remaining;
        o.remaining -= f;
        uint256 notional = _cost(f, o.price);
        uint256 takerEscrow = t.escrow;
        t.escrow = 0;
        stats.fills++;
        stats.baseFilled += f;
        if (o.isAsk) {
            // taker escrowed quote; maker escrowed base
            o.escrow -= f;
            _push(base, t.taker, f);
            _push(quote, o.maker, notional);
            if (takerEscrow > notional) _push(quote, t.taker, takerEscrow - notional);
        } else {
            // taker escrowed base; maker escrowed quote
            if (notional > o.escrow) notional = o.escrow;
            o.escrow -= notional;
            _push(quote, t.taker, notional);
            _push(base, o.maker, f);
            if (takerEscrow > f) _push(base, t.taker, takerEscrow - f);
        }
        emit Filled(index, t.orderId, t.taker, f, o.price);
        if (o.remaining == 0) {
            o.live = false;
            uint256 dust = o.escrow;
            o.escrow = 0;
            if (dust > 0) _push(o.isAsk ? base : quote, o.maker, dust);
        }
    }

    function _remove(uint256, Order storage o) internal {
        o.live = false;
        o.cancelRequested = false;
        o.remaining = 0;
        uint256 refund = o.escrow;
        o.escrow = 0;
        if (refund > 0) _push(o.isAsk ? base : quote, o.maker, refund);
    }

    function _order(uint256 id) internal view returns (Order storage) {
        require(id > 0 && id <= _orders.length, "no order");
        return _orders[id - 1];
    }

    function _cost(uint128 size, uint64 price) internal pure returns (uint256) {
        return (uint256(size) * price) / PRICE_SCALE;
    }

    function _moveBps(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a == 0) return 0;
        uint256 d = a > b ? a - b : b - a;
        return (d * 10_000) / a;
    }

    function _pull(IERC20 token, address from, uint256 amount) internal {
        if (!token.transferFrom(from, address(this), amount)) revert TransferFailed();
    }

    function _push(IERC20 token, address to, uint256 amount) internal {
        if (amount == 0) return;
        if (!token.transfer(to, amount)) revert TransferFailed();
    }
}
