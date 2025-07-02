# deploy-contracts/Dockerfile - 简化版
FROM node:22-alpine

# 设置工作目录
WORKDIR /app

# 复制package文件
COPY package*.json ./

# 安装依赖
RUN npm ci && npm cache clean --force

# 复制源代码
COPY . .

# 创建日志目录
RUN mkdir -p logs

# 设置用户权限
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app
USER nodejs

# 暴露端口
EXPOSE 3000

# 简化的健康检查（使用Node.js）
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# 启动命令
CMD ["node", "app-v2.js"]