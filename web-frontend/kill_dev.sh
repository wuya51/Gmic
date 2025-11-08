#!/bin/bash

# 脚本描述：杀死所有匹配 "BROWSER=none npm run dev" 的后台进程/ job
# 使用前：chmod +x kill_dev.sh
# 运行：./kill_dev.sh

echo "正在查找匹配的进程和 job..."

# 步骤1: 检查运行中的进程 PID
PIDS=$(pgrep -f "BROWSER=none npm run dev" 2>/dev/null)
if [ -n "$PIDS" ]; then
    echo "找到运行进程 PID: $PIDS，正在强制杀死..."
    pkill -9 -f "BROWSER=none npm run dev"
fi

# 步骤2: 检查后台 job（针对 stopped 等状态）
echo "检查后台 job..."
JOBS_OUTPUT=$(jobs | grep "npm run dev" 2>/dev/null)
if [ -n "$JOBS_OUTPUT" ]; then
    echo "找到匹配 job: $JOBS_OUTPUT"
    # 提取 job 号（如 [3] -> 3）
    JOB_NUMS=$(echo "$JOBS_OUTPUT" | awk '{print $1}' | sed 's/\[\(.*\)\].*/\1/' | tr '\n' ' ')
    if [ -n "$JOB_NUMS" ]; then
        echo "正在杀死 job: $JOB_NUMS"
        for JOB_NUM in $JOB_NUMS; do
            kill -9 "%$JOB_NUM" 2>/dev/null
        done
        echo "后台 job 已杀死。"
    fi
else
    echo "未找到匹配的后台 job。"
fi

# 步骤3: 额外杀残留（node 子进程、端口）
echo "清理残留..."
pkill -9 -f "npm run dev" 2>/dev/null  # 更广匹配
pkill -9 node 2>/dev/null  # 杀所有 node（小心，如果有其他项目）

# 检查端口 3000（常见 dev 端口，改成你的如果不同）
echo "检查端口 3000..."
lsof -i :3000 2>/dev/null | grep LISTEN | awk '{print $2}' | xargs -r kill -9 2>/dev/null

# 验证
sleep 1
echo "验证结果："
pgrep -f "npm run dev" 2>/dev/null && echo "警告：仍有进程残留！" || echo "✓ 进程清理完成。"
jobs 2>/dev/null | grep "npm run dev" && echo "警告：仍有 job 残留！" || echo "✓ job 清理完成。"