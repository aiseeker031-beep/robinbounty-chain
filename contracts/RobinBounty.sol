// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title RobinBounty - fixed-prize, non-custodial developer bounty escrow
/// @notice The creator selects the winner. If no award is made before the review
/// window closes, anyone can trigger a refund to the creator. Work is NOT
/// guaranteed payment. Never send funds directly to this contract.
contract RobinBounty is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MIN_DURATION = 1 hours;
    uint256 public constant MAX_DURATION = 90 days;
    uint256 public constant REVIEW_WINDOW = 7 days;
    uint256 public constant MAX_TITLE_BYTES = 120;
    uint256 public constant MAX_DETAILS_BYTES = 800;
    uint256 public constant MAX_PROOF_BYTES = 400;

    enum Status { Open, Awarded, Cancelled, Refunded }

    struct Bounty {
        address creator;
        address token; // address(0) for ETH
        uint256 amount;
        uint64 deadline;
        uint64 createdAt;
        uint32 submissions;
        uint32 winnerIndex; // 1-based, zero means none
        Status status;
        string title;
        string details;
    }

    struct Submission {
        address developer;
        uint64 submittedAt;
        string proofURI;
    }

    Bounty[] private _bounties;
    mapping(uint256 => Submission[]) private _submissions;
    mapping(uint256 => mapping(address => bool)) public hasSubmitted;

    event BountyCreated(uint256 indexed bountyId, address indexed creator, address indexed token, uint256 amount, uint64 deadline);
    event WorkSubmitted(uint256 indexed bountyId, uint256 indexed submissionIndex, address indexed developer, string proofURI);
    event BountyAwarded(uint256 indexed bountyId, uint256 indexed submissionIndex, address indexed developer, uint256 amount);
    event BountyCancelled(uint256 indexed bountyId);
    event BountyRefunded(uint256 indexed bountyId);

    error InvalidId();
    error InvalidAmount();
    error InvalidDuration();
    error InvalidText();
    error NotCreator();
    error InvalidStatus();
    error SubmissionClosed();
    error AlreadySubmitted();
    error NoSubmissions();
    error CannotCancel();
    error TooLateToAward();
    error RefundUnavailable();
    error UnsupportedToken();
    error InvalidSubmission();
    error DirectTransfersDisabled();

    /// @notice Create a new funded bounty. ERC20 assets require prior approval.
    function createBounty(
        string calldata title,
        string calldata details,
        address token,
        uint256 amount,
        uint64 deadline
    ) external payable nonReentrant returns (uint256 id) {
        if (amount == 0) revert InvalidAmount();
        if (bytes(title).length == 0 || bytes(title).length > MAX_TITLE_BYTES || bytes(details).length > MAX_DETAILS_BYTES) revert InvalidText();
        if (deadline < block.timestamp + MIN_DURATION || deadline > block.timestamp + MAX_DURATION) revert InvalidDuration();
        if (token == address(0)) {
            if (msg.value != amount) revert InvalidAmount();
        } else {
            if (msg.value != 0 || token.code.length == 0) revert UnsupportedToken();
            uint256 beforeBalance = IERC20(token).balanceOf(address(this));
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
            // Reject fee-on-transfer assets to preserve exact escrow accounting.
            if (IERC20(token).balanceOf(address(this)) - beforeBalance != amount) revert UnsupportedToken();
        }

        id = _bounties.length;
        _bounties.push(Bounty({
            creator: msg.sender,
            token: token,
            amount: amount,
            deadline: deadline,
            createdAt: uint64(block.timestamp),
            submissions: 0,
            winnerIndex: 0,
            status: Status.Open,
            title: title,
            details: details
        }));
        emit BountyCreated(id, msg.sender, token, amount, deadline);
    }

    /// @notice One proof per developer and bounty, permanently public onchain.
    function submitWork(uint256 bountyId, string calldata proofURI) external {
        Bounty storage bounty = _get(bountyId);
        if (bounty.status != Status.Open) revert InvalidStatus();
        if (block.timestamp >= bounty.deadline) revert SubmissionClosed();
        if (bytes(proofURI).length == 0 || bytes(proofURI).length > MAX_PROOF_BYTES) revert InvalidText();
        if (msg.sender == bounty.creator) revert InvalidSubmission();
        if (hasSubmitted[bountyId][msg.sender]) revert AlreadySubmitted();
        hasSubmitted[bountyId][msg.sender] = true;
        _submissions[bountyId].push(Submission(msg.sender, uint64(block.timestamp), proofURI));
        bounty.submissions += 1;
        emit WorkSubmitted(bountyId, bounty.submissions - 1, msg.sender, proofURI);
    }

    /// @notice Creator selects a winning submission, paying its author in full.
    function award(uint256 bountyId, uint256 submissionIndex) external nonReentrant {
        Bounty storage bounty = _get(bountyId);
        if (msg.sender != bounty.creator) revert NotCreator();
        if (bounty.status != Status.Open) revert InvalidStatus();
        if (block.timestamp > uint256(bounty.deadline) + REVIEW_WINDOW) revert TooLateToAward();
        if (submissionIndex >= _submissions[bountyId].length) revert InvalidSubmission();
        address developer = _submissions[bountyId][submissionIndex].developer;
        bounty.status = Status.Awarded;
        bounty.winnerIndex = uint32(submissionIndex + 1);
        _payout(bounty.token, developer, bounty.amount);
        emit BountyAwarded(bountyId, submissionIndex, developer, bounty.amount);
    }

    /// @notice Creator may cancel only while nobody has submitted work.
    function cancel(uint256 bountyId) external nonReentrant {
        Bounty storage bounty = _get(bountyId);
        if (msg.sender != bounty.creator) revert NotCreator();
        if (bounty.status != Status.Open) revert InvalidStatus();
        if (bounty.submissions != 0) revert CannotCancel();
        bounty.status = Status.Cancelled;
        _payout(bounty.token, bounty.creator, bounty.amount);
        emit BountyCancelled(bountyId);
    }

    /// @notice Anyone may trigger refund to CREATOR after review window ends.
    function refundExpired(uint256 bountyId) external nonReentrant {
        Bounty storage bounty = _get(bountyId);
        if (bounty.status != Status.Open) revert InvalidStatus();
        if (block.timestamp <= uint256(bounty.deadline) + REVIEW_WINDOW) revert RefundUnavailable();
        bounty.status = Status.Refunded;
        _payout(bounty.token, bounty.creator, bounty.amount);
        emit BountyRefunded(bountyId);
    }

    function bountyCount() external view returns (uint256) { return _bounties.length; }
    function getBounty(uint256 bountyId) external view returns (Bounty memory) { return _get(bountyId); }
    function getSubmission(uint256 bountyId, uint256 index) external view returns (Submission memory) {
        _get(bountyId);
        if (index >= _submissions[bountyId].length) revert InvalidSubmission();
        return _submissions[bountyId][index];
    }

    function _get(uint256 id) internal view returns (Bounty storage bounty) {
        if (id >= _bounties.length) revert InvalidId();
        return _bounties[id];
    }

    function _payout(address token, address to, uint256 amount) private {
        if (token == address(0)) {
            (bool ok,) = payable(to).call{value: amount}("");
            require(ok, "ETH payout failed");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    receive() external payable { revert DirectTransfersDisabled(); }
    fallback() external payable { revert DirectTransfersDisabled(); }
}
