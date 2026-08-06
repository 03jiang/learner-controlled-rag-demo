# Backend

## Local development

From this directory:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```

Open:

- API documentation: http://127.0.0.1:8000/docs
- Health check: http://127.0.0.1:8000/health

Run tests:

```bash
pytest
```

## Model API

DeepSeek is the default provider. Copy `.env.example` to `.env`, then add your API key to `.env`. Never commit that file.

```bash
cp .env.example .env
```
