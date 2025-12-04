# True Name RPG: An Encrypted Adventure Game 🎮✨

True Name RPG is a unique role-playing game (RPG) that intertwines magic and mystery with cutting-edge security through **Zama's Fully Homomorphic Encryption technology**. In this enchanted world, each character is defined by a FHE-encrypted "True Name," providing a thrilling layer of strategy and protection against adversaries. 

## The Challenge of Identity in Magic ⚔️

In a realm filled with magic and powerful spells, characters often face the terrifying risk of having their identities exposed. If enemies can guess parts of your "True Name," they can unleash devastating attacks. This project addresses the critical need for safeguarding character identities in gameplay, allowing players to immerse themselves in a secure and engaging adventure.

## Unleashing Security with FHE 🔐

Our solution leverages **Fully Homomorphic Encryption (FHE)** to maintain the confidentiality of character identities without sacrificing gameplay dynamics. Zama's open-source libraries, such as **Concrete** and **TFHE-rs**, empower us to execute spells and actions while keeping the underlying names secure. This means that even if the enemy can attempt to guess a character's True Name, the core mechanics ensure robust protection, transforming the concept of identity into an essential aspect of both defense and offense.

## Core Features 🚀

- **FHE-Encrypted True Names**: Each character's identity is protected by state-of-the-art encryption, ensuring that players can engage in combat without fear of identity exposure.
- **Homomorphic Spell Execution**: Players can perform spells and abilities that interact with encrypted names while maintaining the integrity of gameplay.
- **Dynamic Name Guessing Mechanic**: The game features a compelling mechanic where players must outsmart their enemies, using strategy to protect their True Names and counteract attacks.
- **Rich Storyline with High Fantasy Elements**: Immerse yourself in a world filled with magical creatures, ancient spells, and endless adventures, all wrapped in a captivating narrative.

## Technology Stack 🛠️

- **Zama FHE SDK**: The backbone of our security, enabling encrypted computations.
- **Concrete**: For efficient homomorphic encryption operations.
- **TFHE-rs**: To handle fast bootstrapping and secure operations.
- **Node.js**: For backend logic and server interactions.
- **Hardhat**: For Ethereum smart contracts development and testing.

## Directory Structure 📁

Here’s a glimpse into the project's structure:
```
True_Name_RPG_FHE/
│
├── contracts/
│   └── True_Name_RPG.sol
│
├── src/
│   ├── index.js
│   ├── gameLogic.js
│   └── spells.js
│
├── tests/
│   └── gameLogic.test.js
│
├── package.json
└── README.md
```

## Installation Guide 🛠️

To set up True Name RPG on your local machine, follow these steps:

1. Ensure you have **Node.js** and **npm** installed.
2. Navigate to the project directory where you downloaded the files.
3. Run the following command to install the necessary dependencies:
   ```bash
   npm install
   ```
This command will fetch all required libraries, including Zama FHE, to ensure your project operates smoothly.

## Build & Run Instructions 🚀

After successfully installing the dependencies, you can compile and run the project:

1. **Compile the Smart Contracts**:
   ```bash
   npx hardhat compile
   ```

2. **Run Tests**:
   ```bash
   npx hardhat test
   ```

3. **Start the Game Server**:
   ```bash
   node src/index.js
   ```

Upon launching, you can access your character's adventure and start exploring the enchanting world of True Name RPG.

## Acknowledgements 🙏

This project would not be possible without the pioneering efforts of the Zama team. Their open-source tools and dedication to advancing confidential computing significantly enhance the realm of secure blockchain applications. Thank you for enabling this magical adventure to flourish within the confines of security!
