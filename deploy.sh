#!/bin/bash
# web3auth-pnp-examples/deploy.sh

set -e

echo "🚀 开始内部通信版本部署..."

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# 获取服务器IP
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s ipinfo.io/ip 2>/dev/null || hostname -I | awk '{print $1}')
log_info "检测到服务器IP: $SERVER_IP"

# 创建目录
mkdir -p deploy-contracts/logs


# 停止旧容器
log_info "停止旧容器..."
docker-compose down --remove-orphans

# 构建和启动
log_info "构建镜像..."
docker-compose build --no-cache

log_info "启动服务..."
docker-compose up -d

# 等待服务启动
log_info "等待服务启动..."
sleep 15

# 检查服务
log_info "检查服务状态..."
docker-compose ps

# 测试连接
log_info "测试服务..."
if curl -f http://localhost/api/health &>/dev/null; then
    log_info "✅ API通过前端代理访问正常"
else
    log_warn "⚠️  API代理可能有问题"
fi

if curl -f http://localhost &>/dev/null; then
    log_info "✅ 前端服务正常"
else
    log_warn "⚠️  前端服务异常"
fi

echo ""
log_info "🎉 部署完成！"
echo ""
echo "📱 用户访问地址："
echo "   应用: http://$SERVER_IP"
echo ""
echo "🔐 内部服务（不对外开放）："
echo "   后端API: backend:3001 (仅容器内部)"
echo ""
echo "🧪 API测试："
echo "   curl http://$SERVER_IP/api/health"
echo ""