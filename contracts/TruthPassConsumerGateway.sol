pragma solidity ^0.8.24;

interface ITruthPassEvidenceAnchor {
    function recordPurchase(
        bytes32 purchaseId,
        bytes32 consumerCommitment,
        bytes32 batchCommitment,
        bytes32 purchaseProofHash,
        bytes32 consentHash,
        uint256 chainId,
        bytes32 domain
    ) external returns (bool newlyStored);

    function recordContribution(
        bytes32 contributionId,
        bytes32 purchaseId,
        bytes32 evidenceHash,
        bytes32 contributionHash,
        uint8 score,
        uint256 chainId,
        bytes32 domain
    ) external returns (bool newlyStored);

    function raiseDispute(
        bytes32 disputeId,
        uint8 targetKind,
        bytes32 targetId,
        bytes32 reasonHash,
        uint256 chainId,
        bytes32 domain
    ) external returns (bool newlyStored);
}

/// @title TruthPassConsumerGateway
/// @notice Lets an end-user wallet submit consumer actions without receiving
///         the privileged roles held by the evidence anchor. The gateway is
///         granted only the three consumer writer roles on the anchor.
/// @dev The end-user is always msg.sender at this contract. Raw identity and
///      order details stay off-chain; only commitments reach the anchor.
contract TruthPassConsumerGateway {
    ITruthPassEvidenceAnchor public immutable anchor;
    uint256 public immutable chainId;
    bytes32 public immutable anchorDomain;

    mapping(bytes32 => address) public purchaseOwner;
    mapping(bytes32 => address) public disputeOwner;

    error InvalidAddress();
    error InvalidTargetKind();
    error PurchaseAlreadyBound(bytes32 purchaseId);
    error PurchaseNotOwned(bytes32 purchaseId, address caller);
    error DisputeAlreadyBound(bytes32 disputeId);

    event ConsumerPurchaseSubmitted(
        bytes32 indexed purchaseId,
        bytes32 indexed batchCommitment,
        address indexed consumer,
        bool newlyStored
    );
    event ConsumerContributionSubmitted(
        bytes32 indexed contributionId,
        bytes32 indexed purchaseId,
        address indexed consumer,
        bool newlyStored
    );
    event ConsumerDisputeSubmitted(
        bytes32 indexed disputeId,
        bytes32 indexed targetId,
        address indexed consumer,
        uint8 targetKind,
        bool newlyStored
    );

    constructor(address anchorAddress, uint256 expectedChainId, bytes32 domain) {
        if (anchorAddress == address(0) || expectedChainId == 0 || domain == bytes32(0)) revert InvalidAddress();
        anchor = ITruthPassEvidenceAnchor(anchorAddress);
        chainId = expectedChainId;
        anchorDomain = domain;
    }

    function consumerCommitment(address consumer) public pure returns (bytes32) {
        return keccak256(abi.encode("truthpass:consumer:v1", consumer));
    }

    function recordPurchase(
        bytes32 purchaseId,
        bytes32 batchCommitment,
        bytes32 purchaseProofHash,
        bytes32 consentHash
    ) external returns (bool newlyStored) {
        if (purchaseOwner[purchaseId] != address(0)) revert PurchaseAlreadyBound(purchaseId);
        purchaseOwner[purchaseId] = msg.sender;
        newlyStored = anchor.recordPurchase(
            purchaseId,
            consumerCommitment(msg.sender),
            batchCommitment,
            purchaseProofHash,
            consentHash,
            chainId,
            anchorDomain
        );
        emit ConsumerPurchaseSubmitted(purchaseId, batchCommitment, msg.sender, newlyStored);
    }

    function recordContribution(
        bytes32 contributionId,
        bytes32 purchaseId,
        bytes32 evidenceHash,
        bytes32 contributionHash,
        uint8 score
    ) external returns (bool newlyStored) {
        address owner = purchaseOwner[purchaseId];
        if (owner != msg.sender) revert PurchaseNotOwned(purchaseId, msg.sender);
        newlyStored = anchor.recordContribution(
            contributionId,
            purchaseId,
            evidenceHash,
            contributionHash,
            score,
            chainId,
            anchorDomain
        );
        emit ConsumerContributionSubmitted(contributionId, purchaseId, msg.sender, newlyStored);
    }

    function raiseDispute(
        bytes32 disputeId,
        uint8 targetKind,
        bytes32 targetId,
        bytes32 reasonHash
    ) external returns (bool newlyStored) {
        if (targetKind < 1 || targetKind > 4) revert InvalidTargetKind();
        if (disputeOwner[disputeId] != address(0)) revert DisputeAlreadyBound(disputeId);
        disputeOwner[disputeId] = msg.sender;
        newlyStored = anchor.raiseDispute(disputeId, targetKind, targetId, reasonHash, chainId, anchorDomain);
        emit ConsumerDisputeSubmitted(disputeId, targetId, msg.sender, targetKind, newlyStored);
    }
}
