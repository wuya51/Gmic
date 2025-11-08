#!/usr/bin/env bash

set -eu

# 获取脚本所在目录和linera-protocol目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "脚本目录: $SCRIPT_DIR"
LINERA_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
echo "Linera协议目录: $LINERA_DIR"

# 获取应用名称（当前目录名）
APP_NAME=$(basename "$SCRIPT_DIR")
echo "应用名称: $APP_NAME"

# 检查并添加应用到examples/Cargo.toml工作区
EXAMPLES_CARGO_TOML="$LINERA_DIR/examples/Cargo.toml"
if [ -f "$EXAMPLES_CARGO_TOML" ]; then
    # 检查应用是否已在工作区成员列表中
    if ! grep -q "\"$APP_NAME\"" "$EXAMPLES_CARGO_TOML"; then
        echo "将应用 $APP_NAME 添加到工作区成员列表..."
        # 在members列表中添加应用名，在最后一个条目后添加
        sed -i '/^members = \[/,/^]$/ s/^]$/    "'"$APP_NAME"'",\n]/' "$EXAMPLES_CARGO_TOML"
        echo "已添加 $APP_NAME 到工作区成员列表"
        
        # 在workspace.dependencies部分添加应用依赖
        echo "添加 $APP_NAME 到工作区依赖项..."
        # 找到最后一个工作区依赖项并在其后添加
        LAST_DEP=$(grep -n "= { path = \"\.\/" "$EXAMPLES_CARGO_TOML" | tail -1 | cut -d: -f1)
        if [ -n "$LAST_DEP" ]; then
            sed -i "${LAST_DEP}a ${APP_NAME} = { path = \"./${APP_NAME}\" }" "$EXAMPLES_CARGO_TOML"
        else
            # 如果找不到其他依赖项，则在[workspace.dependencies]后添加
            sed -i '/^\[workspace.dependencies\]/a '"$APP_NAME"' = { path = "./'"$APP_NAME"'" }' "$EXAMPLES_CARGO_TOML"
        fi
        echo "已添加 $APP_NAME 到工作区依赖项"
    else
        echo "应用 $APP_NAME 已在工作区成员列表中"
    fi
else
    echo "警告: 找不到 examples/Cargo.toml 文件"
fi

# 设置目录和环境变量
DIR=$HOME/.config
mkdir -p $DIR
export LINERA_WALLET="$DIR/wallet.json"
export LINERA_KEYSTORE="$DIR/keystore.json"
export LINERA_STORAGE="rocksdb:$DIR/wallet.db"

# 切换到linera-protocol目录执行Linera命令
cd "$LINERA_DIR"

# 检查钱包是否已存在，如果不存在则初始化
if [ ! -f "$LINERA_WALLET" ]; then
    echo "钱包不存在，正在初始化..."
    linera wallet init --faucet https://faucet.testnet-conway.linera.net
else
    echo "钱包已存在，跳过初始化"
fi

# 请求一个新链，并捕获输出（CHAIN 和 OWNER）
CHAIN_OWNER=($(linera wallet request-chain --faucet https://faucet.testnet-conway.linera.net))
CHAIN="${CHAIN_OWNER[0]}"
OWNER="${CHAIN_OWNER[1]}"

# 验证（可选）：显示钱包中的链信息
linera wallet show

# 切换回gmic-buildathon目录构建WASM模块
cd "$SCRIPT_DIR"
# 使用独立的Cargo命令构建，避免工作区冲突
CARGO_MANIFEST_DIR="$SCRIPT_DIR" cargo build --release --target wasm32-unknown-unknown --manifest-path "$SCRIPT_DIR/Cargo.toml"

# 切换回linera-protocol目录发布模块
cd "$LINERA_DIR"
MODULE_ID=$(linera publish-module \
    "$SCRIPT_DIR/target/wasm32-unknown-unknown/release/gm_contract.wasm" \
    "$SCRIPT_DIR/target/wasm32-unknown-unknown/release/gm_service.wasm")

# 在指定链上创建应用，使用 OWNER 作为初始所有者
APP_ID=$(linera create-application "$MODULE_ID" "$CHAIN" --json-argument "{\"owner\":\"$OWNER\"}")

# 启动Linera服务
echo "启动Linera服务在端口8080..."
linera service --port 8080 &
SERVICE_PID=$!
echo "Linera服务已启动，PID: $SERVICE_PID"

# 构建并运行前端
cd "$SCRIPT_DIR/web-frontend"
npm install
BROWSER=none npm run dev &
FRONTEND_PID=$!
echo "前端服务已启动，PID: $FRONTEND_PID"

# 等待用户中断
echo "按 Ctrl+C 停止所有服务"
trap "echo '正在停止服务...'; kill $SERVICE_PID $FRONTEND_PID; exit" INT
wait
