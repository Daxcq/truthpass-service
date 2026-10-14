pragma solidity ^0.8.24;

interface ITruthPassDisputeAnchor {
    function raiseDispute(
        bytes32 disputeId,
        uint8 targetKind,
        bytes32 targetId,
        bytes32 reasonHash,
        uint256 chainId,
        bytes32 domain
    ) external returns (bool newlyStored);
}

/// @title TruthPassAuditEscrow
/// @notice Escrows consumer challenge stakes and settles them only after an
///         Agent finding and an independent verifier approval are recorded.
/// @dev This contract is a settlement rail, not a truth oracle. Evidence,
///      agentRunHash and verifierVersionHash bind the decision to off-chain
///      artifacts that can be audited later.
contract TruthPassAuditEscrow {
    bytes32 public constant DEFAULT_ADMIN_ROLE = bytes32(0);
    bytes32 public constant AUDIT_AGENT_ROLE = keccak256("AUDIT_AGENT_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant ARBITER_ROLE = keccak256("ARBITER_ROLE");
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");

    uint8 public constant OPEN = 1;
    uint8 public constant FINDING_SUBMITTED = 2;
    uint8 public constant VERIFIER_APPROVED = 3;
    uint8 public constant UPHELD = 4;
    uint8 public constant REJECTED = 5;

    struct Challenge {
        address challenger;
        uint8 targetKind;
        bytes32 targetId;
        bytes32 reasonHash;
        bytes32 agentRunHash;
        uint256 stake;
        uint8 status;
        bytes32 evidenceRoot;
        bytes32 auditResultHash;
        bytes32 verifierVersionHash;
        bytes32 agentAttestationHash;
        bytes32 resolutionHash;
        uint64 createdAt;
    }

    ITruthPassDisputeAnchor public immutable anchor;
    uint256 public immutable chainId;
    bytes32 public immutable anchorDomain;
    address public treasury;
    uint256 public minStake;
    uint256 public rewardPool;
    bool private locked;

    mapping(bytes32 => mapping(address => bool)) private roles;
    mapping(bytes32 => Challenge) public challengeById;
    mapping(bytes32 => uint256) public targetBondById;

    error AccessDenied(bytes32 role, address account);
    error InvalidArgument();
    error DuplicateChallenge(bytes32 challengeId);
    error MissingChallenge(bytes32 challengeId);
    error InvalidStatus(bytes32 challengeId, uint8 status);
    error TransferFailed();
    error Reentrancy();

    event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);
    event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender);
    event ChallengeOpened(bytes32 indexed challengeId, bytes32 indexed targetId, address indexed challenger, uint256 stake, bytes32 agentRunHash);
    event AuditFindingSubmitted(bytes32 indexed challengeId, bytes32 indexed evidenceRoot, bytes32 auditResultHash, bytes32 verifierVersionHash, bytes32 agentAttestationHash);
    event AuditVerifierApproved(bytes32 indexed challengeId, bytes32 indexed auditResultHash, address indexed verifier);
    event ChallengeResolved(bytes32 indexed challengeId, bool upheld, bytes32 resolutionHash, address indexed arbiter);
    event ChallengeRewardPaid(bytes32 indexed challengeId, address indexed recipient, uint256 amount);
    event ChallengeStakeSlashed(bytes32 indexed challengeId, address indexed treasury, uint256 amount);
    event TargetBondFunded(bytes32 indexed targetId, address indexed funder, uint256 amount);

    modifier onlyRole(bytes32 role) {
        if (!roles[role][msg.sender]) revert AccessDenied(role, msg.sender);
        _;
    }

    modifier nonReentrant() {
        if (locked) revert Reentrancy();
        locked = true;
        _;
        locked = false;
    }

    constructor(address anchorAddress, uint256 expectedChainId, bytes32 domain, address treasuryAddress, uint256 minimumStake) {
        if (anchorAddress == address(0) || treasuryAddress == address(0) || expectedChainId == 0 || domain == bytes32(0)) revert InvalidArgument();
        anchor = ITruthPassDisputeAnchor(anchorAddress);
        chainId = expectedChainId;
        anchorDomain = domain;
        treasury = treasuryAddress;
        minStake = minimumStake;
        roles[DEFAULT_ADMIN_ROLE][msg.sender] = true;
        emit RoleGranted(DEFAULT_ADMIN_ROLE, msg.sender, msg.sender);
    }

    receive() external payable {
        rewardPool += msg.value;
    }

    function hasRole(bytes32 role, address account) external view returns (bool) { return roles[role][account]; }

    function grantRole(bytes32 role, address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (account == address(0)) revert InvalidArgument();
        roles[role][account] = true;
        emit RoleGranted(role, account, msg.sender);
    }

    function revokeRole(bytes32 role, address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        roles[role][account] = false;
        emit RoleRevoked(role, account, msg.sender);
    }

    function setTreasury(address treasuryAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (treasuryAddress == address(0)) revert InvalidArgument();
        treasury = treasuryAddress;
    }

    function setMinStake(uint256 minimumStake) external onlyRole(DEFAULT_ADMIN_ROLE) { minStake = minimumStake; }

    function fundRewardPool() external payable onlyRole(TREASURY_ROLE) {
        rewardPool += msg.value;
    }

    function fundTargetBond(bytes32 targetId) external payable {
        if (targetId == bytes32(0) || msg.value == 0) revert InvalidArgument();
        targetBondById[targetId] += msg.value;
        emit TargetBondFunded(targetId, msg.sender, msg.value);
    }

    function openChallenge(
        bytes32 challengeId,
        uint8 targetKind,
        bytes32 targetId,
        bytes32 reasonHash,
        bytes32 agentRunHash
    ) external payable nonReentrant returns (bool newlyStored) {
        if (challengeId == bytes32(0) || targetId == bytes32(0) || reasonHash == bytes32(0) || agentRunHash == bytes32(0) || targetKind < 1 || targetKind > 4 || msg.value < minStake) revert InvalidArgument();
        if (challengeById[challengeId].createdAt != 0) revert DuplicateChallenge(challengeId);
        anchor.raiseDispute(challengeId, targetKind, targetId, reasonHash, chainId, anchorDomain);
        challengeById[challengeId] = Challenge(msg.sender, targetKind, targetId, reasonHash, agentRunHash, msg.value, OPEN, bytes32(0), bytes32(0), bytes32(0), bytes32(0), bytes32(0), uint64(block.timestamp));
        emit ChallengeOpened(challengeId, targetId, msg.sender, msg.value, agentRunHash);
        return true;
    }

    function submitAuditFinding(
        bytes32 challengeId,
        bytes32 evidenceRoot,
        bytes32 auditResultHash,
        bytes32 verifierVersionHash,
        bytes32 agentAttestationHash
    ) external onlyRole(AUDIT_AGENT_ROLE) {
        Challenge storage challenge = challengeById[challengeId];
        if (challenge.createdAt == 0) revert MissingChallenge(challengeId);
        if (challenge.status != OPEN) revert InvalidStatus(challengeId, challenge.status);
        if (evidenceRoot == bytes32(0) || auditResultHash == bytes32(0) || verifierVersionHash == bytes32(0) || agentAttestationHash == bytes32(0)) revert InvalidArgument();
        challenge.evidenceRoot = evidenceRoot;
        challenge.auditResultHash = auditResultHash;
        challenge.verifierVersionHash = verifierVersionHash;
        challenge.agentAttestationHash = agentAttestationHash;
        challenge.status = FINDING_SUBMITTED;
        emit AuditFindingSubmitted(challengeId, evidenceRoot, auditResultHash, verifierVersionHash, agentAttestationHash);
    }

    function approveAuditFinding(bytes32 challengeId) external onlyRole(VERIFIER_ROLE) {
        Challenge storage challenge = challengeById[challengeId];
        if (challenge.createdAt == 0) revert MissingChallenge(challengeId);
        if (challenge.status != FINDING_SUBMITTED) revert InvalidStatus(challengeId, challenge.status);
        challenge.status = VERIFIER_APPROVED;
        emit AuditVerifierApproved(challengeId, challenge.auditResultHash, msg.sender);
    }

    function resolveChallenge(bytes32 challengeId, bool upheld, bytes32 resolutionHash) external onlyRole(ARBITER_ROLE) nonReentrant {
        Challenge storage challenge = challengeById[challengeId];
        if (challenge.createdAt == 0) revert MissingChallenge(challengeId);
        if (challenge.status != VERIFIER_APPROVED || resolutionHash == bytes32(0)) revert InvalidStatus(challengeId, challenge.status);
        challenge.resolutionHash = resolutionHash;
        uint256 payout;
        if (upheld) {
            challenge.status = UPHELD;
            uint256 targetBond = targetBondById[challenge.targetId];
            uint256 targetReward = targetBond < challenge.stake ? targetBond : challenge.stake;
            targetBondById[challenge.targetId] = targetBond - targetReward;
            uint256 poolReward = challenge.stake > targetReward && rewardPool < challenge.stake - targetReward
                ? rewardPool
                : challenge.stake - targetReward;
            rewardPool -= poolReward;
            payout = challenge.stake + targetReward + poolReward;
            if (targetReward > 0) emit ChallengeStakeSlashed(challengeId, treasury, targetReward);
        } else {
            challenge.status = REJECTED;
            uint256 slash = challenge.stake;
            challenge.stake = 0;
            (bool sent, ) = treasury.call{value: slash}("");
            if (!sent) revert TransferFailed();
            emit ChallengeStakeSlashed(challengeId, treasury, slash);
        }
        emit ChallengeResolved(challengeId, upheld, resolutionHash, msg.sender);
        if (upheld) {
            if (rewardPool >= payout - challenge.stake) rewardPool -= payout - challenge.stake;
            else payout = challenge.stake;
            challenge.stake = 0;
            (bool sent, ) = challenge.challenger.call{value: payout}("");
            if (!sent) revert TransferFailed();
            emit ChallengeRewardPaid(challengeId, challenge.challenger, payout);
        }
    }
}
