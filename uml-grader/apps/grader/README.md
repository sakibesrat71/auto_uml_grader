# UML Grader Service

Local grading service for comparing a teacher reference UML UXF file with a student submission UXF file.

The intended flow is:

1. Parse both UXF/XML files into normalized UML JSON.
2. Apply deterministic normalization and teacher synonyms.
3. Ask a local Ollama model for rubric-based semantic judgement.
4. Return a validated structured grade response to `apps/api`.

## Development

```bash
npm install
npm run start:dev
```

By default the service listens on `http://localhost:4100`.

## Endpoints

- `GET /health` confirms the grader service is running.
- `POST /grade` is the future grading endpoint. It currently validates the request shape and returns a placeholder response.
