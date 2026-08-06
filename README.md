# Learner-Controlled GenAI Scaffolding Demo

> TODO：补充产品定位、目标用户、研究背景和演示故事。

这是一个把技术材料转化为可调节学习支持的全栈演示。用户可以粘贴文本或上传 PDF；后端将 PDF 切块、生成向量并写入 ChromaDB，根据问题检索相关片段，再结合用户可编辑的支持配置调用 DeepSeek，返回解释、下一步行动、可选提示和待确认的状态更新。

## 技术栈

- 前端：Next.js 16、React 19、TypeScript、Tailwind CSS
- 后端：Python 3.12、FastAPI、Pydantic
- 生成模型：DeepSeek，使用 OpenAI 兼容 SDK
- RAG：pypdf、ChromaDB
- Embedding：本地 `BAAI/bge-m3`；部署使用 Voyage `voyage-4-lite`；保留哈希基线
- 测试：pytest、ESLint、Next.js production build

## 从零开始运行

需要 Node.js 20+、npm 和 Python 3.12。首次使用本地 Embedding 时会下载 `BAAI/bge-m3`，需要较长时间和较多磁盘空间。

### 1. 配置后端

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-local.txt -r requirements-dev.txt
cp .env.example .env
```

打开 `backend/.env`，填写 `DEEPSEEK_API_KEY`，然后启动：

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

健康检查：`http://127.0.0.1:8000/health`
API 文档：`http://127.0.0.1:8000/docs`

### 2. 配置前端

另开一个终端：

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

打开 `http://localhost:3000`。

### 3. 运行测试

后端：

```bash
cd backend
source .venv/bin/activate
PYTHONPATH=. python -m pytest tests -q
```

前端：

```bash
cd frontend
npm run lint
npm run build
```

## 环境变量

完整模板见根目录 `.env.example` 和 `backend/.env.example`。

| 变量 | 说明 | 默认或示例 |
|---|---|---|
| `LLM_PROVIDER` | 生成模型供应商标识 | `deepseek` |
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥，必填 | 无 |
| `DEEPSEEK_BASE_URL` | DeepSeek 兼容 API 地址 | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | 生成模型名 | `deepseek-v4-flash` |
| `EMBEDDING_MODE` | `hash`、`local` 或 `api` | `local` |
| `EMBEDDING_PROVIDER` | Embedding 供应商说明 | `sentence-transformers` |
| `EMBEDDING_MODEL` | Embedding 模型名 | `BAAI/bge-m3` |
| `EMBEDDING_BASE_URL` | OpenAI 兼容 Embedding API 地址 | API 模式必填 |
| `EMBEDDING_API_KEY` | Embedding API 密钥 | API 模式必填 |
| `EMBEDDING_BATCH_SIZE` | API 每批发送的文本数量 | `64` |
| `EMBEDDING_MAX_RETRIES` | API 失败后的最大重试次数 | `3` |
| `CHUNK_SIZE` | 每个 PDF 片段的字符数 | `1200` |
| `CHUNK_OVERLAP` | 相邻片段重叠字符数 | `180` |
| `TOP_K` | 每次检索返回的片段数 | `5` |
| `BACKEND_URL` | Next.js 服务端访问 FastAPI 的地址 | `http://127.0.0.1:8000` |

修改 Embedding 模式、模型或切块参数后，需要重启后端并重新上传 PDF。若要完全清空索引，可停止后端后删除 `backend/data/chroma/`。

### Embedding 三种运行模式

| 模式 | 用途 | 安装命令 |
|---|---|---|
| `hash` | 无外部依赖的检索基线 | `pip install -r requirements.txt` |
| `local` | 本地开发，使用 `BAAI/bge-m3` | `pip install -r requirements-local.txt` |
| `api` | Render 部署，使用 Voyage | `pip install -r requirements.txt` |

API 模式以 64 个文本为一批。遇到速率限制、连接失败、超时或 5xx 时最多重试 3 次，按约 1、2、4 秒指数退避，并优先遵循 `Retry-After`。

## 部署

### Render 后端

1. 将仓库推送到 GitHub。
2. 在 Render 选择 **New > Blueprint**，连接仓库；Render 会读取根目录 `render.yaml`。
3. 创建时填写两个 `sync: false` 的密钥：`DEEPSEEK_API_KEY` 和 `EMBEDDING_API_KEY`。
4. 部署完成后访问 `https://你的服务.onrender.com/health`，确认返回 `{"status":"ok"}`。

免费 Render 实例使用临时文件系统，休眠或重新部署后 Chroma 索引可能丢失，用户需要重新上传 PDF。生产环境应改用持久化磁盘或托管向量数据库。

### Vercel 前端

1. 在 Vercel 导入同一个 GitHub 仓库。
2. 将 **Root Directory** 设置为 `frontend`。
3. 添加环境变量 `BACKEND_URL=https://你的服务.onrender.com`，不要以 `/` 结尾。
4. 使用默认 Next.js 构建设置部署。

## 项目结构

```text
backend/                  FastAPI、模型编排、PDF 解析与 RAG
frontend/                 Next.js 用户界面和后端代理路由
backend/data/chroma/      本地向量索引，不提交 Git
backend/data/models/      本地 Embedding 权重，不提交 Git
outputs/                  演示和验收产物
```

## 已知局限

- Embedding 检索质量取决于模型、问题表达、切块参数和文档结构。短而含糊的跨语言问题仍可能命中目录或参考文献；生产系统应考虑查询改写、混合检索和重排序。
- 当前提示词注入防护属于基础防护：材料边界、系统规则和闭合标签转义可以抵御简单注入，但不能保证抵御所有间接提示词注入。生产环境还需要内容检测、权限隔离、输出验证和对抗测试。
- 扫描版 PDF 没有 OCR，只有包含文本层的 PDF 可以被索引。
- ChromaDB 当前使用本地持久化，没有文档删除、租户隔离或生命周期管理。
- 本地 `BAAI/bge-m3` 体积较大，免费部署实例可能内存不足；部署时可切换到远程 Embedding API。
- 当前演示没有用户账户、速率限制、持久化任务状态或生产级监控。
