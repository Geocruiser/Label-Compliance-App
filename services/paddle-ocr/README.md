# PaddleOCR Service

Dockerized OCR service used by the Label Compliance App.

## Endpoints

- `GET /health`
- `POST /ocr`

`POST /ocr` request body:

```json
{
  "image_base64": "<base64 image bytes>",
  "filename": "label.png",
  "mime_type": "image/png"
}
```

## Run with Docker

```bash
docker build -t label-paddle-ocr services/paddle-ocr
docker run --rm -p 8001:8001 label-paddle-ocr
```
