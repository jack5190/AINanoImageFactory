# NanoImg Factory
NanoImg 工厂

## Project Overview
NanoImg Factory is a personal, open-source AI assistant that turns short briefs into deliverable visual assets. It combines a static PWA frontend with a Python proxy that connects to Google AI Studio (Nano Banana) for text-to-image generation. No database required.
项目概述：NanoImg Factory 是一款开源的个人 AI 助手，将简短需求转化为可交付的视觉素材；它使用静态 PWA 前端和连接 Google AI Studio（Nano Banana）的 Python 代理，无需数据库。

## Quick Start
快速开始

### Local (manual)
本地（手动）
1. Copy environment config:
   1. 复制环境配置：
   ```bash
   cp config/.env.example config/.env
   ```
2. Start backend:
   2. 启动后端：
   ```bash
   cd src/backend
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   uvicorn app:app --host 0.0.0.0 --port 8003
   ```
3. Serve frontend:
   3. 启动前端静态服务：
   ```bash
   cd src/frontend
   python -m http.server 8001
   ```
4. Open `http://localhost:8001`.
   4. 打开 `http://localhost:8001`。

### Docker Compose
Docker Compose 部署
```bash
cp config/.env.example config/.env
# set GOOGLE_AI_STUDIO_API_KEY in config/.env
# 在 config/.env 中填写 GOOGLE_AI_STUDIO_API_KEY

docker compose up -d --build
```

## Installation and Deployment Guide
安装与部署指南
- Recommended: Docker Compose + Nginx frontend container.
- 推荐：使用 Docker Compose + Nginx 前端容器。
- Backend only exposes `/api/*` endpoints.
- 后端仅暴露 `/api/*` 接口。

See `docker/centos-deploy.sh` for a CentOS-ready bootstrap script.
可参考 `docker/centos-deploy.sh` 获取适配 CentOS 的启动脚本。

## Usage Example
使用示例
1. Choose a template in the Template Market.
   1. 在模板市场选择一个模板。
2. Fill in industry, audience, and selling points.
   2. 填写行业、受众和卖点。
3. Click **Generate Prompt** then **Batch Generate**.
   3. 点击 **Generate Prompt**，然后点击 **Batch Generate**。
4. Download the delivery pack as a ZIP.
   4. 将交付包下载为 ZIP。
5. Use `demo.html` for API key validation and live tests.
   5. 使用 `demo.html` 验证 API 密钥并进行实时测试。
6. Open `http://localhost:8001/docs/index.html` for a lightweight web docs page.
   6. 打开 `http://localhost:8001/docs/index.html` 查看轻量文档页面。

## API Documentation
API 文档
Base URL: `http://localhost:8003/api`
基础地址：`http://localhost:8003/api`

- `GET /health`
  - 获取健康状态
  - Response: `{ "status": "ok", "provider": "nano-banana", "mock": false }`
  - 响应：`{ "status": "ok", "provider": "nano-banana", "mock": false }`

- `POST /key/status`
  - 校验密钥状态
  - Body: `{ "api_key": "...", "base_url": "..." }`
  - 请求体：`{ "api_key": "...", "base_url": "..." }`
  - Headers: `X-API-Key`, `X-Base-Url`
  - 请求头：`X-API-Key`, `X-Base-Url`

- `POST /generate`
  - 生成图片
  - Body:
    ```json
    {
      "prompt": "...",
      "negative_prompt": "...",
      "count": 1,
      "return_type": "base64"
    }
    ```
  - 请求体如上
  - Headers: `X-API-Key`, `X-Base-Url`, `X-Model`, `X-Return-Type`
  - 请求头：`X-API-Key`, `X-Base-Url`, `X-Model`, `X-Return-Type`

## Contribution Guide
贡献指南
- Fork the repo and create a feature branch.
- Fork 仓库并创建功能分支。
- Keep changes focused and add tests when needed.
- 变更应聚焦，必要时补充测试。
- Open a PR with a clear summary and screenshots for UI changes.
- 提交 PR 时提供清晰摘要；如有 UI 变更请附截图。

## License
MIT. See `LICENSE`.
许可证：MIT，详见 `LICENSE`。

## Deployment Notes
部署说明

### Minimum System Requirements
最低系统要求
- CPU: 2 cores
- CPU：2 核
- RAM: 4 GB
- 内存：4 GB
- Disk: 2 GB free
- 磁盘：2 GB 可用
- Docker: 24+
- Docker：24+

### Step-by-Step Deployment
分步部署
1. Install Docker + Compose (or use `docker/centos-deploy.sh`).
   1. 安装 Docker 与 Compose（或使用 `docker/centos-deploy.sh`）。
2. Copy config: `cp config/.env.example config/.env`.
   2. 复制配置：`cp config/.env.example config/.env`。
3. Add your Google AI Studio key: `GOOGLE_AI_STUDIO_API_KEY`.
   3. 填写 Google AI Studio 密钥：`GOOGLE_AI_STUDIO_API_KEY`。
4. Run: `docker compose up -d --build`.
   4. 运行：`docker compose up -d --build`。
5. Open: `http://<server-ip>:8001`.
   5. 打开：`http://<server-ip>:8001`。

### Environment Variables
环境变量
- `GOOGLE_AI_STUDIO_API_KEY`: API key for Nano Banana.
- `GOOGLE_AI_STUDIO_API_KEY`：Nano Banana 的 API 密钥。
- `GOOGLE_AI_STUDIO_BASE_URL`: defaults to `https://generativelanguage.googleapis.com/v1beta` (the proxy builds `/models/{model}:predict` for Imagen).
- `GOOGLE_AI_STUDIO_BASE_URL`：默认 `https://generativelanguage.googleapis.com/v1beta`（代理会拼接 `/models/{model}:predict`）。
- `GOOGLE_AI_STUDIO_MODEL`: defaults to `imagen-4.0-fast-generate-001`.
- `GOOGLE_AI_STUDIO_MODEL`：默认 `imagen-4.0-fast-generate-001`。
- `USE_MOCK`: set `true` for placeholder images without API access.
- `USE_MOCK`：设为 `true` 时在无 API 访问时返回占位图。

### FAQ
常见问题
- **Why do I see placeholder images?**
  - **为何看到占位图？**
  - The backend runs in mock mode or no API key is set.
  - 后端处于 mock 模式或未设置 API 密钥。
- **Can I host templates?**
  - **可以托管模板吗？**
  - Yes. Share JSON packs and import them in the Template Market.
  - 可以，分享 JSON 包并在模板市场导入。
- **Where are the default templates?**
  - **默认模板在哪里？**
  - `src/frontend/config/templates.json` (static assets used by the PWA).
  - `src/frontend/config/templates.json`（PWA 使用的静态资源）。
- **How do I validate my API key?**
  - **如何验证我的 API 密钥？**
  - Use `demo.html` (API Key Lab) and click **Validate Key**.
  - 使用 `demo.html`（API Key Lab）并点击 **Validate Key**。
