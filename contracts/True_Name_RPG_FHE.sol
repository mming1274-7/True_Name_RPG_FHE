pragma solidity ^0.8.24;
import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract TrueNameRPGFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchClosed();
    error BatchFull();
    error InvalidBatch();
    error StaleWrite();
    error ReplayAttempt();
    error StateMismatch();
    error InvalidDecryption();

    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused();
    event Unpaused();
    event CooldownUpdated(uint256 newCooldown);
    event BatchOpened(uint256 indexed batchId, address indexed opener);
    event BatchClosed(uint256 indexed batchId, address indexed closer);
    event TrueNameSubmitted(address indexed player, uint256 indexed batchId, bytes32 encryptedName);
    event GuessSubmitted(address indexed guesser, uint256 indexed batchId, bytes32 encryptedGuess);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId, bytes32 stateHash);
    event DecryptionComplete(uint256 indexed requestId, uint256 indexed batchId, uint256 matchCount);
    event DamageApplied(address indexed player, address indexed guesser, uint256 damage);

    bool public paused;
    uint256 public cooldownSeconds;
    uint256 public batchIdCounter;
    uint256 public constant MAX_BATCH_SIZE = 100;

    mapping(address => bool) public providers;
    mapping(address => uint256) public lastActionAt;
    mapping(uint256 => Batch) public batches;
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    struct EncryptedGuess {
        euint32 guess;
        bool processed;
    }

    struct Batch {
        bool active;
        uint256 modelVersion;
        euint32 encryptedTrueName;
        mapping(address => EncryptedGuess) guesses;
        address[] guessers;
        uint256 matchCount;
        bool closed;
    }

    struct DecryptionContext {
        uint256 batchId;
        uint256 modelVersion;
        bytes32 stateHash;
        bool processed;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!providers[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier checkCooldown() {
        if (block.timestamp < lastActionAt[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        lastActionAt[msg.sender] = block.timestamp;
        _;
    }

    constructor() {
        owner = msg.sender;
        providers[owner] = true;
        cooldownSeconds = 30;
        batchIdCounter = 1;
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused();
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused();
    }

    function setCooldown(uint256 newCooldown) external onlyOwner {
        cooldownSeconds = newCooldown;
        emit CooldownUpdated(newCooldown);
    }

    function addProvider(address provider) external onlyOwner {
        providers[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        providers[provider] = false;
        emit ProviderRemoved(provider);
    }

    function openBatch() external onlyProvider whenNotPaused checkCooldown returns (uint256 batchId) {
        batchId = batchIdCounter++;
        batches[batchId].active = true;
        batches[batchId].modelVersion = currentModelVersion;
        emit BatchOpened(batchId, msg.sender);
        return batchId;
    }

    function closeBatch(uint256 batchId) external onlyProvider whenNotPaused checkCooldown {
        if (!batches[batchId].active || batches[batchId].closed) revert InvalidBatch();
        batches[batchId].closed = true;
        emit BatchClosed(batchId, msg.sender);
    }

    function submitTrueName(uint256 batchId, euint32 encryptedName) external onlyProvider whenNotPaused checkCooldown {
        if (!batches[batchId].active || batches[batchId].closed) revert InvalidBatch();
        if (batches[batchId].modelVersion != currentModelVersion) revert StaleWrite();

        batches[batchId].encryptedTrueName = encryptedName;
        emit TrueNameSubmitted(msg.sender, batchId, FHE.toBytes32(encryptedName));
    }

    function submitGuess(uint256 batchId, euint32 encryptedGuess) external whenNotPaused checkCooldown {
        if (!batches[batchId].active || batches[batchId].closed) revert InvalidBatch();
        if (batches[batchId].guessers.length >= MAX_BATCH_SIZE) revert BatchFull();

        batches[batchId].guesses[msg.sender] = EncryptedGuess(encryptedGuess, false);
        batches[batchId].guessers.push(msg.sender);
        emit GuessSubmitted(msg.sender, batchId, FHE.toBytes32(encryptedGuess));
    }

    function requestBatchDecryption(uint256 batchId) external whenNotPaused checkCooldown {
        if (!batches[batchId].active || !batches[batchId].closed) revert InvalidBatch();

        bytes32[] memory cts = new bytes32[](1 + batches[batchId].guessers.length);
        cts[0] = FHE.toBytes32(batches[batchId].encryptedTrueName);

        for (uint i = 0; i < batches[batchId].guessers.length; i++) {
            address guesser = batches[batchId].guessers[i];
            cts[i+1] = FHE.toBytes32(batches[batchId].guesses[guesser].guess);
        }

        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.handleBatchDecryption.selector);

        decryptionContexts[requestId] = DecryptionContext({
            batchId: batchId,
            modelVersion: batches[batchId].modelVersion,
            stateHash: stateHash,
            processed: false
        });

        emit DecryptionRequested(requestId, batchId, stateHash);
    }

    function handleBatchDecryption(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        if (decryptionContexts[requestId].processed) revert ReplayAttempt();

        DecryptionContext memory context = decryptionContexts[requestId];
        Batch storage batch = batches[context.batchId];

        // Rebuild ciphertexts in same order
        bytes32[] memory cts = new bytes32[](1 + batch.guessers.length);
        cts[0] = FHE.toBytes32(batch.encryptedTrueName);

        for (uint i = 0; i < batch.guessers.length; i++) {
            address guesser = batch.guessers[i];
            cts[i+1] = FHE.toBytes32(batch.guesses[guesser].guess);
        }

        bytes32 currHash = _hashCiphertexts(cts);
        if (currHash != context.stateHash) revert StateMismatch();

        try FHE.checkSignatures(requestId, cleartexts, proof) {
            // Decode cleartexts in same order
            uint256 trueName = abi.decode(cleartexts, (uint256));
            uint256 matchCount;

            uint256 offset = 32;
            for (uint i = 0; i < batch.guessers.length; i++) {
                uint256 guess = abi.decode(cleartexts, (uint256));
                if (guess == trueName) {
                    matchCount++;
                    emit DamageApplied(batch.guessers[i], batch.guessers[i], 100);
                }
                offset += 32;
            }

            batch.matchCount = matchCount;
            decryptionContexts[requestId].processed = true;
            emit DecryptionComplete(requestId, context.batchId, matchCount);
        } catch {
            revert InvalidDecryption();
        }
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 x) internal returns (euint32) {
        if (!FHE.isInitialized(x)) {
            x = FHE.asEuint32(0);
        }
        return x;
    }

    function _requireInitialized(euint32 x, string memory tag) internal pure {
        if (!FHE.isInitialized(x)) {
            revert(string(abi.encodePacked(tag, " not initialized")));
        }
    }
}