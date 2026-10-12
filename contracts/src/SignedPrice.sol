// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SignedPrice
/// @notice Verifies price packages signed off-chain by a fixed signer set and returns their median.
/// @dev A package is the 32-byte feed id, the value scaled by 1e8, a 6-byte millisecond timestamp,
///      the 4-byte value width (32) and the 3-byte point count (1). The signers sign the keccak256
///      of those bytes directly. The signer set and the threshold are fixed at deployment.
contract SignedPrice {
    struct Package {
        uint256 value; // price * 1e8
        uint48 timestampMs; // when the signer produced it
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    error TooFewPackages(uint256 given, uint256 needed);
    error UnknownSigner(address signer);
    error DuplicateSigner(address signer);
    error MixedTimestamps();
    error TooOld(uint256 timestampSec, uint256 nowSec);
    error FromTheFuture(uint256 timestampSec, uint256 nowSec);
    error MalleableSignature();

    uint256 private constant HALF_N = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;
    uint256 public constant FUTURE_SKEW = 60; // seconds a package may run ahead of the block clock

    bytes32 public immutable feedId;
    uint256 public immutable threshold;
    uint256 public immutable maxAge; // seconds
    address[] private _signers;
    mapping(address => uint256) private _signerSlot; // index + 1

    constructor(bytes32 feedId_, address[] memory signers_, uint256 threshold_, uint256 maxAge_) {
        require(threshold_ > 0 && threshold_ <= signers_.length && signers_.length <= 32, "bad signer set");
        feedId = feedId_;
        threshold = threshold_;
        maxAge = maxAge_;
        for (uint256 i; i < signers_.length; ++i) {
            require(signers_[i] != address(0) && _signerSlot[signers_[i]] == 0, "bad signer");
            _signers.push(signers_[i]);
            _signerSlot[signers_[i]] = i + 1;
        }
    }

    function signers() external view returns (address[] memory) {
        return _signers;
    }

    /// @notice The bytes a signer signs for `value` at `timestampMs`.
    function digest(uint256 value, uint48 timestampMs) public view returns (bytes32) {
        return keccak256(abi.encodePacked(feedId, value, timestampMs, uint32(32), uint24(1)));
    }

    /// @notice Check `pkgs` and return the median value and the shared timestamp (ms).
    function verify(Package[] calldata pkgs) public view returns (uint256 median, uint48 timestampMs) {
        uint256 n = pkgs.length;
        if (n < threshold) revert TooFewPackages(n, threshold);
        timestampMs = pkgs[0].timestampMs;
        uint256 tsSec = uint256(timestampMs) / 1000;
        if (tsSec + maxAge < block.timestamp) revert TooOld(tsSec, block.timestamp);
        if (tsSec > block.timestamp + FUTURE_SKEW) revert FromTheFuture(tsSec, block.timestamp);

        uint256[] memory vals = new uint256[](n);
        uint256 seen;
        for (uint256 i; i < n; ++i) {
            Package calldata p = pkgs[i];
            if (p.timestampMs != timestampMs) revert MixedTimestamps();
            if (uint256(p.s) > HALF_N) revert MalleableSignature();
            address signer = ecrecover(digest(p.value, p.timestampMs), p.v, p.r, p.s);
            uint256 slot = _signerSlot[signer];
            if (slot == 0) revert UnknownSigner(signer);
            uint256 bit = 1 << (slot - 1);
            if (seen & bit != 0) revert DuplicateSigner(signer);
            seen |= bit;
            vals[i] = p.value;
        }
        // insertion sort: n is a handful
        for (uint256 i = 1; i < n; ++i) {
            uint256 x = vals[i];
            uint256 j = i;
            while (j > 0 && vals[j - 1] > x) {
                vals[j] = vals[j - 1];
                --j;
            }
            vals[j] = x;
        }
        median = n % 2 == 1 ? vals[n / 2] : (vals[n / 2 - 1] + vals[n / 2]) / 2;
    }
}
