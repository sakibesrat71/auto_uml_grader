# UML Grader Service

Local grading service for comparing a teacher reference UML UXF file with a student submission UXF file.

The intended flow is:

1. Parse both UXF/XML files into normalized UML JSON.
2. Apply deterministic normalization and teacher synonyms.
3. Ask Gemini for rubric-based semantic judgement and image grading.
4. Return a validated structured grade response to `apps/api`.

## Development

```bash
npm install
npm run start:dev
```

By default the service listens on `http://localhost:4100`.

Create `.env` for Gemini-backed grading:

```env
PORT=4100
GEMINI_API_KEY=your-google-ai-studio-api-key
GEMINI_MODEL=gemini-flash-lite-latest
```

## Endpoints

- `GET /health` confirms the grader service is running and reports the Gemini model.
- `POST /grade` grades UXF/XML UML submissions with deterministic comparison plus Gemini feedback.
- `POST /grade-images` grades PNG/JPEG UML screenshots with Gemini vision input.
