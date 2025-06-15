# 🧩 Gmic — Linera GMicrochains

🔗 **Live Demo:** [gmic.top](https://gmic.top/)  
📘 **Description:** A smart contract and dApp interaction guide for the Linera blockchain.

---

## 📦 1. Environment Setup and Wallet Initialization

Before starting, set up your development environment and create a temporary wallet:

### 🔧 Set Environment Variables

```bash
# Add current directory's debug binaries to PATH
export PATH="$PWD/target/debug:$PATH"

# Create a temporary directory for wallet data
LINERA_TMP_DIR=$(mktemp -d)
export LINERA_WALLET="$LINERA_TMP_DIR/wallet.json"
export LINERA_STORAGE="$LINERA_TMP_DIR/wallet.db"

# Set the faucet URL (testnet)
FAUCET_URL=https://faucet.testnet-babbage.linera.net

# Request chain and account from the faucet
INFO_1=($(linera wallet request-chain --faucet $FAUCET_URL))
CHAIN_1="${INFO_1[0]}"
OWNER_1="${INFO_1[1]}"

# Build the Gmic contract (assuming project structure)
cd Gmic && cargo build --release --target wasm32-unknown-unknown

```
🚀 2. Contract Publishing and Application Creation
📤 Publish the Smart Contract Module
# Publish the contract module (adjust paths as needed)
MODULE_ID=$(linera publish-module \
    examples/target/wasm32-unknown-unknown/release/gm_{contract,service}.wasm)

💡 Create the Application Instance
# Create the application with the published module
APP_ID=$(linera create-application "$MODULE_ID" "$CHAIN_1" --json-argument "{\"owner\":\"$OWNER_1\"}")

🌐 3. GraphQL Interaction Examples
Below are some GraphQL queries and mutations that can be executed via GraphiQL or other GraphQL clients.

🔍 Query Total Messages

```
graphql
query {  
  getTotalMessages  
}  
Query GM Record by Owner
graphql
query GetGmRecord {  
  getGmRecord(owner: "0x677c7eb04a63136df4711c323be1820058c00d97959a91a2c6e99e89d65ef434") {  
    timestamp  
  }  
}  
Send a GM Message

```
graphql
mutation SendGM {  
  sendGm(  
    chainId: "25c75dc1458e61ab8e8be77395c1c570ef5b26ef4d6f34fb8d374caf45e3a6a7",  
    sender: "0x6330caeec0b30dc0cb28e817aecd8ef21767bdd8777b085543bd9707b26e31a6"  
  ) {  
    success  
    message  
    timestamp  
  }  
}  

# Mutation: Send GMicrochains to Specific Recipient

```
graphql
mutation SendGMTo {
  sendGmTo(
    chainId: "9fffb30f691e24eda6d1de09f73e4e37bb33ff733c18fc088cface83471e0db08",
    sender: "0xa7be0bdc46321e467b60cbe58e979d60f3cf0e71ce465f72e3cd49c57727f80b",
    recipient: "0x4bcd86b2bfb5f42ae343f6859b6b113cec83504e2239b75b1af2668da04c519a"
  ) {
    success
    message
    timestamp
  }
}
