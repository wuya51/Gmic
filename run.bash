#!/usr/bin/env bash

set -eu

# 设置目录和环境变量
DIR=$HOME/.config
mkdir -p $DIR
export LINERA_WALLET="$DIR/wallet.json"
export LINERA_KEYSTORE="$DIR/keystore.json"
export LINERA_STORAGE="rocksdb:$DIR/wallet.db"

# 初始化钱包并连接水龙头
linera wallet init --faucet https://faucet.testnet-conway.linera.net

# 请求一个新链，并捕获输出（CHAIN 和 OWNER）
CHAIN_OWNER=($(linera wallet request-chain --faucet https://faucet.testnet-conway.linera.net))
CHAIN="${CHAIN_OWNER[0]}"
OWNER="${CHAIN_OWNER[1]}"

# 验证（可选）：显示钱包中的链信息
linera wallet show

# 构建 WASM 模块
cd /build
cargo build --release --target wasm32-unknown-unknown

# 发布模块
MODULE_ID=$(linera publish-module \
    target/wasm32-unknown-unknown/release/gm_contract.wasm \
    target/wasm32-unknown-unknown/release/gm_service.wasm)

# 在指定链上创建应用，使用 OWNER 作为初始所有者
APP_ID=$(linera create-application "$MODULE_ID" "$CHAIN" --json-argument "{\"owner\":\"$OWNER\"}")

# 构建并运行前端
cd web-frontend
npm install
BROWSER=none npm run dev &
