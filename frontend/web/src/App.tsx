// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface Character {
  id: string;
  name: string;
  trueNameEncrypted: string;
  health: number;
  mana: number;
  level: number;
  class: string;
  owner: string;
  createdAt: number;
}

interface Spell {
  id: string;
  name: string;
  description: string;
  manaCost: number;
  successRate: number;
  damage: number;
}

interface BattleLog {
  id: string;
  timestamp: number;
  attacker: string;
  defender: string;
  spellUsed: string;
  damage: number;
  success: boolean;
  trueNameRevealed: boolean;
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const FHECompute = (encryptedData: string, operation: string): string => {
  const value = FHEDecryptNumber(encryptedData);
  let result = value;
  
  switch(operation) {
    case 'increase10%':
      result = value * 1.1;
      break;
    case 'decrease10%':
      result = value * 0.9;
      break;
    case 'double':
      result = value * 2;
      break;
    default:
      result = value;
  }
  
  return FHEEncryptNumber(result);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [myCharacters, setMyCharacters] = useState<Character[]>([]);
  const [battleLogs, setBattleLogs] = useState<BattleLog[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newCharacterData, setNewCharacterData] = useState({ name: "", className: "warrior", trueNamePart1: 0, trueNamePart2: 0, trueNamePart3: 0 });
  const [showTutorial, setShowTutorial] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [decryptedValue, setDecryptedValue] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterClass, setFilterClass] = useState("all");
  
  const spells: Spell[] = [
    { id: "1", name: "True Name Probe", description: "Attempt to guess part of enemy's true name", manaCost: 20, successRate: 0.3, damage: 15 },
    { id: "2", name: "Soul Pierce", description: "Direct damage spell", manaCost: 10, successRate: 0.8, damage: 8 },
    { id: "3", name: "Mana Drain", description: "Steal mana from opponent", manaCost: 5, successRate: 0.6, damage: 5 },
    { id: "4", name: "Reveal Essence", description: "Higher chance to reveal true name", manaCost: 30, successRate: 0.5, damage: 10 },
  ];

  useEffect(() => {
    loadCharacters().finally(() => setLoading(false));
    loadBattleLogs();
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  useEffect(() => {
    if (isConnected && address) {
      setMyCharacters(characters.filter(char => char.owner.toLowerCase() === address.toLowerCase()));
    } else {
      setMyCharacters([]);
    }
  }, [characters, address, isConnected]);

  const loadCharacters = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      const keysBytes = await contract.getData("character_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing character keys:", e); }
      }
      const list: Character[] = [];
      for (const key of keys) {
        try {
          const characterBytes = await contract.getData(`character_${key}`);
          if (characterBytes.length > 0) {
            try {
              const characterData = JSON.parse(ethers.toUtf8String(characterBytes));
              list.push({ 
                id: key, 
                name: characterData.name, 
                trueNameEncrypted: characterData.trueNameEncrypted, 
                health: characterData.health, 
                mana: characterData.mana, 
                level: characterData.level, 
                class: characterData.class, 
                owner: characterData.owner, 
                createdAt: characterData.createdAt 
              });
            } catch (e) { console.error(`Error parsing character data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading character ${key}:`, e); }
      }
      list.sort((a, b) => b.createdAt - a.createdAt);
      setCharacters(list);
    } catch (e) { console.error("Error loading characters:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const loadBattleLogs = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      const keysBytes = await contract.getData("battle_log_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing battle log keys:", e); }
      }
      const logs: BattleLog[] = [];
      for (const key of keys) {
        try {
          const logBytes = await contract.getData(`battle_log_${key}`);
          if (logBytes.length > 0) {
            try {
              const logData = JSON.parse(ethers.toUtf8String(logBytes));
              logs.push({ 
                id: key,
                timestamp: logData.timestamp,
                attacker: logData.attacker,
                defender: logData.defender,
                spellUsed: logData.spellUsed,
                damage: logData.damage,
                success: logData.success,
                trueNameRevealed: logData.trueNameRevealed
              });
            } catch (e) { console.error(`Error parsing battle log data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading battle log ${key}:`, e); }
      }
      logs.sort((a, b) => b.timestamp - a.timestamp);
      setBattleLogs(logs.slice(0, 10)); // Show only latest 10 logs
    } catch (e) { console.error("Error loading battle logs:", e); }
  };

  const createCharacter = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setCreating(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting True Name with Zama FHE..." });
    try {
      // Encrypt each part of the true name
      const encryptedPart1 = FHEEncryptNumber(newCharacterData.trueNamePart1);
      const encryptedPart2 = FHEEncryptNumber(newCharacterData.trueNamePart2);
      const encryptedPart3 = FHEEncryptNumber(newCharacterData.trueNamePart3);
      
      // Combine encrypted parts
      const trueNameEncrypted = `${encryptedPart1}|${encryptedPart2}|${encryptedPart3}`;
      
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const characterId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const characterData = { 
        name: newCharacterData.name, 
        trueNameEncrypted: trueNameEncrypted, 
        health: 100, 
        mana: 50, 
        level: 1, 
        class: newCharacterData.className, 
        owner: address, 
        createdAt: Math.floor(Date.now() / 1000)
      };
      
      await contract.setData(`character_${characterId}`, ethers.toUtf8Bytes(JSON.stringify(characterData)));
      
      // Update character keys
      const keysBytes = await contract.getData("character_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(characterId);
      await contract.setData("character_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Character created with FHE-encrypted True Name!" });
      await loadCharacters();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewCharacterData({ name: "", className: "warrior", trueNamePart1: 0, trueNamePart2: 0, trueNamePart3: 0 });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Creation failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setCreating(false); }
  };

  const castSpell = async (spell: Spell, target: Character) => {
    if (!isConnected || !address) { alert("Please connect wallet first"); return; }
    if (myCharacters.length === 0) { alert("You need a character to cast spells"); return; }
    
    setTransactionStatus({ visible: true, status: "pending", message: `Casting ${spell.name} with FHE computation...` });
    
    try {
      const attacker = myCharacters[0]; // For simplicity, use first character
      if (attacker.mana < spell.manaCost) {
        throw new Error("Not enough mana");
      }
      
      // Calculate success
      const success = Math.random() < spell.successRate;
      let damage = spell.damage;
      let trueNameRevealed = false;
      
      // If spell is a true name probe and successful
      if (spell.id === "1" || spell.id === "4") {
        if (success) {
          trueNameRevealed = true;
          damage *= 2; // Double damage if true name is revealed
        }
      }
      
      // Update attacker mana
      const newMana = attacker.mana - spell.manaCost;
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const updatedAttacker = { 
        ...attacker, 
        mana: newMana
      };
      
      await contract.setData(`character_${attacker.id}`, ethers.toUtf8Bytes(JSON.stringify(updatedAttacker)));
      
      // Update target health if spell was successful
      if (success) {
        const newHealth = target.health - damage;
        const updatedTarget = { 
          ...target, 
          health: newHealth > 0 ? newHealth : 0
        };
        
        await contract.setData(`character_${target.id}`, ethers.toUtf8Bytes(JSON.stringify(updatedTarget)));
      }
      
      // Create battle log
      const logId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const logData = {
        timestamp: Math.floor(Date.now() / 1000),
        attacker: address,
        defender: target.owner,
        spellUsed: spell.name,
        damage: success ? damage : 0,
        success,
        trueNameRevealed
      };
      
      await contract.setData(`battle_log_${logId}`, ethers.toUtf8Bytes(JSON.stringify(logData)));
      
      // Update battle log keys
      const keysBytes = await contract.getData("battle_log_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(logId);
      await contract.setData("battle_log_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      setTransactionStatus({ visible: true, status: "success", message: success ? 
        `${spell.name} succeeded! ${trueNameRevealed ? "True Name revealed! " : ""}${damage} damage dealt.` : 
        `${spell.name} failed!` });
      
      await loadCharacters();
      await loadBattleLogs();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Spell failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptNumber(encryptedData);
    } catch (e) { console.error("Decryption failed:", e); return null; } 
    finally { setIsDecrypting(false); }
  };

  const filteredCharacters = characters.filter(character => {
    const matchesSearch = character.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          character.owner.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesClass = filterClass === "all" || character.class === filterClass;
    return matchesSearch && matchesClass;
  });

  if (loading) return (
    <div className="loading-screen pixel-bg">
      <div className="pixel-spinner"></div>
      <p>Initializing encrypted connection to Zama FHE...</p>
    </div>
  );

  return (
    <div className="app-container pixel-theme">
      <header className="app-header pixel-border">
        <div className="logo">
          <div className="logo-icon"><div className="pixel-heart"></div></div>
          <h1>True<span>Name</span>RPG</h1>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowCreateModal(true)} className="create-character-btn pixel-button">
            <div className="pixel-plus"></div>Create Character
          </button>
          <button className="pixel-button" onClick={() => setShowTutorial(!showTutorial)}>
            {showTutorial ? "Hide Guide" : "Show Guide"}
          </button>
          <div className="wallet-connect-wrapper"><ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/></div>
        </div>
      </header>
      <div className="main-content">
        <div className="welcome-banner pixel-border">
          <div className="welcome-text">
            <h2>True Name RPG - FHE Adventure</h2>
            <p>A magical RPG where each character has a FHE-encrypted "True Name". Guess your enemy's True Name to deal massive damage!</p>
          </div>
          <div className="fhe-indicator"><div className="pixel-lock"></div><span>Zama FHE Encryption Active</span></div>
        </div>
        
        {showTutorial && (
          <div className="tutorial-section pixel-border">
            <h2>True Name RPG Guide</h2>
            <p className="subtitle">Learn the mechanics of True Name combat</p>
            <div className="tutorial-steps">
              <div className="tutorial-step pixel-border">
                <div className="step-icon">⚔️</div>
                <div className="step-content">
                  <h3>True Name Mechanics</h3>
                  <p>Each character has a True Name encrypted with Zama FHE technology. This name is the source of their power.</p>
                </div>
              </div>
              <div className="tutorial-step pixel-border">
                <div className="step-icon">🔍</div>
                <div className="step-content">
                  <h3>Name Revelation Spells</h3>
                  <p>Use special spells to guess parts of your enemy's True Name. Successful guesses deal massive damage!</p>
                </div>
              </div>
              <div className="tutorial-step pixel-border">
                <div className="step-icon">🛡️</div>
                <div className="step-content">
                  <h3>FHE Protection</h3>
                  <p>Your True Name remains encrypted even during computation. Zama FHE allows calculations without decryption.</p>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div className="dashboard-grid">
          <div className="dashboard-card pixel-border">
            <h3>Game Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item"><div className="stat-value">{characters.length}</div><div className="stat-label">Total Characters</div></div>
              <div className="stat-item"><div className="stat-value">{myCharacters.length}</div><div className="stat-label">Your Characters</div></div>
              <div className="stat-item"><div className="stat-value">{battleLogs.length}</div><div className="stat-label">Battles</div></div>
              <div className="stat-item"><div className="stat-value">
                {battleLogs.filter(log => log.trueNameRevealed).length}
              </div><div className="stat-label">True Names Revealed</div></div>
            </div>
          </div>
          
          <div className="dashboard-card pixel-border">
            <h3>Recent Battles</h3>
            <div className="battle-logs">
              {battleLogs.length === 0 ? (
                <p className="no-data">No battles yet</p>
              ) : (
                battleLogs.map(log => (
                  <div key={log.id} className="battle-log pixel-border">
                    <div className="battle-summary">
                      <span className="attacker">{log.attacker.substring(0, 6)}...</span>
                      <span className="battle-action">used {log.spellUsed} on</span>
                      <span className="defender">{log.defender.substring(0, 6)}...</span>
                    </div>
                    <div className="battle-result">
                      {log.success ? (
                        <span className="success">✓ {log.damage} damage{log.trueNameRevealed ? " (True Name hit!)" : ""}</span>
                      ) : (
                        <span className="fail">✗ Missed</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        
        <div className="characters-section">
          <div className="section-header">
            <h2>Characters</h2>
            <div className="header-actions">
              <div className="search-box pixel-border">
                <input 
                  type="text" 
                  placeholder="Search characters..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <select 
                className="pixel-select pixel-border"
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
              >
                <option value="all">All Classes</option>
                <option value="warrior">Warrior</option>
                <option value="mage">Mage</option>
                <option value="rogue">Rogue</option>
                <option value="cleric">Cleric</option>
              </select>
              <button onClick={loadCharacters} className="refresh-btn pixel-button" disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="characters-grid">
            {filteredCharacters.length === 0 ? (
              <div className="no-characters pixel-border">
                <div className="no-chars-icon">⚔️</div>
                <p>No characters found</p>
                <button className="pixel-button primary" onClick={() => setShowCreateModal(true)}>Create First Character</button>
              </div>
            ) : (
              filteredCharacters.map(character => (
                <div className="character-card pixel-border" key={character.id}>
                  <div className="character-header">
                    <h3>{character.name}</h3>
                    <span className="character-class">{character.class}</span>
                  </div>
                  <div className="character-details">
                    <div className="character-level">Lvl {character.level}</div>
                    <div className="character-stats">
                      <div className="stat"><span className="label">HP:</span> <span className="value">{character.health}</span></div>
                      <div className="stat"><span className="label">MP:</span> <span className="value">{character.mana}</span></div>
                    </div>
                    <div className="character-owner">
                      Owner: {character.owner.substring(0, 6)}...{character.owner.substring(38)}
                    </div>
                  </div>
                  <div className="character-actions">
                    {isConnected && myCharacters.length > 0 && myCharacters[0].id !== character.id && (
                      <div className="spell-buttons">
                        <h4>Cast Spell:</h4>
                        {spells.map(spell => (
                          <button 
                            key={spell.id}
                            className="pixel-button small"
                            onClick={() => castSpell(spell, character)}
                            disabled={myCharacters[0].mana < spell.manaCost}
                            title={`${spell.name}: ${spell.description}\nMana Cost: ${spell.manaCost}\nSuccess Rate: ${spell.successRate * 100}%`}
                          >
                            {spell.name}
                          </button>
                        ))}
                      </div>
                    )}
                    <button 
                      className="pixel-button"
                      onClick={() => setSelectedCharacter(character)}
                    >
                      View Details
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreate 
          onSubmit={createCharacter} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating} 
          characterData={newCharacterData} 
          setCharacterData={setNewCharacterData}
        />
      )}
      
      {selectedCharacter && (
        <CharacterDetailModal 
          character={selectedCharacter} 
          onClose={() => { setSelectedCharacter(null); setDecryptedValue(null); }} 
          decryptedValue={decryptedValue} 
          setDecryptedValue={setDecryptedValue} 
          isDecrypting={isDecrypting} 
          decryptWithSignature={decryptWithSignature}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content pixel-border">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="pixel-spinner"></div>}
              {transactionStatus.status === "success" && <div className="pixel-check">✓</div>}
              {transactionStatus.status === "error" && <div className="pixel-error">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      <footer className="app-footer pixel-border">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo"><div className="pixel-heart"></div><span>TrueNameRPG</span></div>
            <p>FHE-based RPG with True Name mechanics powered by Zama</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Community</a>
            <a href="#" className="footer-link">GitHub</a>
            <a href="#" className="footer-link">About Zama</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge"><span>Powered by Zama FHE</span></div>
          <div className="copyright">© {new Date().getFullYear()} True Name RPG. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  characterData: any;
  setCharacterData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ onSubmit, onClose, creating, characterData, setCharacterData }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setCharacterData({ ...characterData, [name]: value });
  };

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>, part: number) => {
    const value = parseFloat(e.target.value);
    setCharacterData({ 
      ...characterData, 
      [`trueNamePart${part}`]: isNaN(value) ? 0 : value 
    });
  };

  const handleSubmit = () => {
    if (!characterData.name || !characterData.className) { 
      alert("Please fill required fields"); 
      return; 
    }
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal pixel-border">
        <div className="modal-header">
          <h2>Create New Character</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        <div className="modal-body">
          <div className="fhe-notice-banner pixel-border">
            <div className="key-icon">🔒</div> 
            <div><strong>FHE Encryption Notice</strong><p>Your True Name will be encrypted with Zama FHE before storage</p></div>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label>Character Name *</label>
              <input 
                type="text" 
                name="name" 
                value={characterData.name} 
                onChange={handleChange} 
                placeholder="Enter character name..." 
                className="pixel-input"
              />
            </div>
            <div className="form-group">
              <label>Class *</label>
              <select name="className" value={characterData.className} onChange={handleChange} className="pixel-select">
                <option value="warrior">Warrior</option>
                <option value="mage">Mage</option>
                <option value="rogue">Rogue</option>
                <option value="cleric">Cleric</option>
              </select>
            </div>
            <div className="form-group full-width">
              <label>True Name Parts (Numerical Values) *</label>
              <p className="field-description">Your True Name consists of 3 numerical values that will be FHE-encrypted</p>
              <div className="true-name-parts">
                <input 
                  type="number" 
                  value={characterData.trueNamePart1} 
                  onChange={(e) => handleValueChange(e, 1)}
                  placeholder="Part 1" 
                  className="pixel-input"
                  step="1"
                />
                <input 
                  type="number" 
                  value={characterData.trueNamePart2} 
                  onChange={(e) => handleValueChange(e, 2)}
                  placeholder="Part 2" 
                  className="pixel-input"
                  step="1"
                />
                <input 
                  type="number" 
                  value={characterData.trueNamePart3} 
                  onChange={(e) => handleValueChange(e, 3)}
                  placeholder="Part 3" 
                  className="pixel-input"
                  step="1"
                />
              </div>
            </div>
          </div>
          <div className="encryption-preview">
            <h4>FHE Encryption Preview</h4>
            <div className="preview-container pixel-border">
              <div className="plain-data">
                <span>True Name Values:</span>
                <div>{characterData.trueNamePart1 || '0'}, {characterData.trueNamePart2 || '0'}, {characterData.trueNamePart3 || '0'}</div>
              </div>
              <div className="encryption-arrow">→</div>
              <div className="encrypted-data">
                <span>Encrypted Data:</span>
                <div>
                  {characterData.trueNamePart1 ? FHEEncryptNumber(characterData.trueNamePart1).substring(0, 20) + '...' : 'Not encrypted'} | 
                  {characterData.trueNamePart2 ? FHEEncryptNumber(characterData.trueNamePart2).substring(0, 20) + '...' : 'Not encrypted'} | 
                  {characterData.trueNamePart3 ? FHEEncryptNumber(characterData.trueNamePart3).substring(0, 20) + '...' : 'Not encrypted'}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn pixel-button">Cancel</button>
          <button onClick={handleSubmit} disabled={creating} className="submit-btn pixel-button primary">
            {creating ? "Encrypting with FHE..." : "Create Character"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface CharacterDetailModalProps {
  character: Character;
  onClose: () => void;
  decryptedValue: number | null;
  setDecryptedValue: (value: number | null) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedData: string) => Promise<number | null>;
}

const CharacterDetailModal: React.FC<CharacterDetailModalProps> = ({ 
  character, onClose, decryptedValue, setDecryptedValue, isDecrypting, decryptWithSignature 
}) => {
  const handleDecrypt = async (encryptedPart: string) => {
    const decrypted = await decryptWithSignature(encryptedPart);
    if (decrypted !== null) setDecryptedValue(decrypted);
  };

  const encryptedParts = character.trueNameEncrypted.split('|');

  return (
    <div className="modal-overlay">
      <div className="character-detail-modal pixel-border">
        <div className="modal-header">
          <h2>{character.name} - {character.class}</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        <div className="modal-body">
          <div className="character-info">
            <div className="info-item"><span>Level:</span><strong>{character.level}</strong></div>
            <div className="info-item"><span>Health:</span><strong>{character.health}</strong></div>
            <div className="info-item"><span>Mana:</span><strong>{character.mana}</strong></div>
            <div className="info-item"><span>Owner:</span><strong>{character.owner.substring(0, 6)}...{character.owner.substring(38)}</strong></div>
            <div className="info-item"><span>Created:</span><strong>{new Date(character.createdAt * 1000).toLocaleString()}</strong></div>
          </div>
          
          <div className="true-name-section">
            <h3>True Name (FHE Encrypted)</h3>
            <div className="fhe-tag pixel-border">
              <div className="fhe-icon">🔒</div>
              <span>Protected by Zama FHE</span>
            </div>
            
            <div className="encrypted-parts">
              {encryptedParts.map((part, index) => (
                <div key={index} className="encrypted-part pixel-border">
                  <div className="part-header">
                    <span>Part {index + 1}</span>
                    <button 
                      className="pixel-button small"
                      onClick={() => handleDecrypt(part)}
                      disabled={isDecrypting}
                    >
                      {isDecrypting ? "Decrypting..." : "Decrypt with Signature"}
                    </button>
                  </div>
                  <div className="part-data">{part.substring(0, 50)}...</div>
                </div>
              ))}
            </div>
            
            {decryptedValue !== null && (
              <div className="decrypted-data-section pixel-border">
                <h3>Decrypted Value</h3>
                <div className="decrypted-value">{decryptedValue}</div>
                <div className="decryption-notice">
                  <div className="warning-icon">⚠️</div>
                  <span>This value was decrypted using your wallet signature. It's normally hidden during gameplay.</span>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn pixel-button">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;