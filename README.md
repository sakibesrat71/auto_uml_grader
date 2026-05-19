# Auto UML Grader

Auto UML Grader is a full-stack web application for creating UML class diagram assignments, accepting student submissions, and producing automated feedback and marks. It is built around three local services:

- `apps/web`: the Next.js frontend used by students and teachers.
- `apps/api`: the NestJS API, authentication layer, MongoDB persistence layer, and dashboard backend.
- `apps/grader`: the NestJS grading service that parses, compares, and grades UML submissions.

The app supports both UMLet UXF/XML files and PNG/JPEG diagram screenshots. UXF/XML submissions are parsed and compared structurally, while screenshot submissions are sent to a local vision-capable Ollama model for image-based grading.

## Project Overview

The project is designed for a university-style UML assessment workflow.

Teachers can create assignments, upload one or more reference solutions, invite or assign students by email, view submissions, override marks, regrade work, publish results, and inspect review flags. Students can sign up with an Adelaide student email, view assigned UML tasks, submit files, monitor grading status, and view marks after teachers publish them.

Automatic grading works in two modes:

- **UXF/XML grading**: parses UMLet files with `fast-xml-parser`, normalizes classes, attributes, methods, and relationships, then compares the student submission against the teacher reference.
- **Image grading**: sends teacher and student diagram screenshots to a local Ollama vision model and returns rubric-based feedback.

When the AI model is unavailable, the grader can fall back to deterministic scoring for UXF/XML comparisons.

## Features

- Student signup with OTP email verification.
- Login/logout with HTTP-only access and refresh cookies.
- Role-aware dashboards for students and teachers.
- Superadmin teacher invitation flow.
- Teacher assignment creation with title, description, marks, due date, publication state, student email assignment, and synonym mappings.
- Reference solution upload for `.uxf`, `.xml`, `.png`, `.jpg`, and `.jpeg` files.
- Assignment-level enforcement that all reference solutions use the same grading mode.
- Student assignment list, due-date alerts, recent grades, and submission history.
- Student upload validation based on the teacher reference solution type.
- Background grading after submission.
- Rubric breakdown, discrepancy lists, low-confidence flags, extraction issue flags, and manual review recommendations.
- Teacher submission table, analytics, activity feed, grade override, regrade, close assignment, delete assignment, and publish marks flows.
- Email notifications for signup OTPs, teacher invites, new assignments, and published marks.
- MongoDB-backed persistence for users, assignments, solutions, submissions, grades, grader logs, signup verification records, and teacher invites.
- Local development launcher for Windows.

## Tech Stack

### Frontend

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- shadcn-style component setup
- Base UI
- Lucide React icons
- `jose` for middleware JWT verification
- `xlsx` for spreadsheet/export-related frontend workflows

### API

- NestJS 11
- TypeScript
- MongoDB with Mongoose
- Passport JWT authentication
- HTTP-only cookie auth
- bcrypt password hashing
- Nodemailer email delivery
- Express body parsing and CORS

### Grader Service

- NestJS 11
- TypeScript
- `fast-xml-parser` for UMLet UXF/XML parsing
- Deterministic UML comparison logic
- Ollama integration for text and vision grading
- Structured grading contracts for score, rubric, discrepancies, and flags

### Local Infrastructure

- Node.js and npm
- MongoDB running locally or through a hosted MongoDB URI
- Optional Ollama local models for AI-assisted grading

## Repository Structure

```text
auto_uml_grader/
├── package.json
├── README.md
└── uml-grader/
    ├── start-dev.cmd
    ├── start-dev.ps1
    ├── docs/
    │   └── test-fixtures/
    └── apps/
        ├── api/
        ├── grader/
        └── web/
```

## Web Routes

The frontend runs at `http://localhost:3000` by default.

| Route | Purpose |
| --- | --- |
| `/` | Home and quick links |
| `/login` | Student or teacher login |
| `/signup` | Student signup |
| `/signup/verify` | Student OTP verification |
| `/teacher/signup` | Teacher invite acceptance |
| `/dashboard` | Generic role redirect/check page |
| `/student/dashboard` | Student dashboard |
| `/student/assignments/[id]` | Student assignment detail and submission |
| `/student/submissions/[submissionId]` | Student submission result detail |
| `/teacher/dashboard` | Teacher dashboard |
| `/teacher/assignments/new` | Create a teacher assignment |
| `/teacher/assignments/[id]` | Teacher assignment detail, submissions, solutions, marks, and actions |

Protected frontend routes are enforced by `apps/web/middleware.ts`. The middleware reads the `access_token` cookie and redirects users based on role.

## API Routes

The API runs at `http://localhost:4000` by default.

### Public and Health

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/` | Basic API hello response |
| `GET` | `/health` | API and MongoDB health check |

### Auth

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/auth/signup` | Start student signup and send OTP |
| `POST` | `/auth/signup/verify` | Verify OTP and create student account |
| `POST` | `/auth/login` | Login student or teacher |
| `POST` | `/auth/refresh` | Refresh session from refresh token |
| `POST` | `/auth/logout` | Logout and clear cookies |
| `GET` | `/auth/me` | Return current authenticated user |
| `POST` | `/auth/superadmin/login` | Login as configured superadmin |
| `POST` | `/auth/superadmin/invite-teachers` | Invite teachers by email using a superadmin token |
| `POST` | `/auth/teacher/accept-invite` | Create teacher account from invite token |

### Student

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/student/dashboard/summary` | Student dashboard summary |
| `GET` | `/student/assignments` | Student assignment list |
| `GET` | `/student/grades/recent?limit=5` | Recent published grades |
| `GET` | `/student/assignments/:assignmentId` | Assignment detail and submission rules |
| `POST` | `/student/assignments/:assignmentId/submissions` | Upload a submission |
| `GET` | `/student/submissions/:submissionId` | Submission detail and feedback |

### Teacher Dashboard

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/teacher/dashboard/quick-stats` | Dashboard summary cards |
| `GET` | `/teacher/dashboard/assignments` | Teacher assignment table |
| `GET` | `/teacher/dashboard/action-shortcuts` | Dashboard action shortcuts |
| `GET` | `/teacher/dashboard/needs-review-queue?limit=10` | Submissions needing review |
| `GET` | `/teacher/dashboard/recent-activity?limit=10` | Recent teacher activity |

### Teacher Assignments

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/teacher/assignments` | Create assignment |
| `GET` | `/teacher/assignments/:assignmentId` | Assignment detail |
| `PATCH` | `/teacher/assignments/:assignmentId/close` | Close assignment |
| `PATCH` | `/teacher/assignments/:assignmentId/publish-marks` | Publish marks to students |
| `DELETE` | `/teacher/assignments/:assignmentId` | Delete assignment and related records |
| `POST` | `/teacher/assignments/:assignmentId/solutions` | Upload reference solution |
| `PATCH` | `/teacher/assignments/:assignmentId/solutions/:solutionId` | Replace reference solution |
| `DELETE` | `/teacher/assignments/:assignmentId/solutions/:solutionId` | Delete reference solution |
| `PATCH` | `/teacher/assignments/:assignmentId/submissions/:submissionId/override` | Override a submission grade |
| `PATCH` | `/teacher/assignments/:assignmentId/submissions/:submissionId/regrade` | Regrade a submission |

## Grader Routes

The grader runs at `http://localhost:4100` by default.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Grader health and configured Ollama model details |
| `POST` | `/grade` | Grade UXF/XML solution and submission |
| `POST` | `/grade-images` | Grade image solution and submission |
| `POST` | `/parse-uxf` | Parse a UXF/XML file into normalized UML JSON |
| `POST` | `/compare` | Compare two UXF/XML diagrams without full grading |

## Download and Run Locally

### 1. Install prerequisites

Install these on your computer:

- Node.js 20 or newer
- npm
- MongoDB Community Server, MongoDB Atlas, or another reachable MongoDB instance
- Git
- Optional: Ollama for AI-assisted grading

If you want Ollama grading:

```bash
ollama pull qwen2.5:3b-instruct
ollama pull gemma3:4b
```

### 2. Download the project

```bash
git clone <your-repository-url>
cd auto_uml_grader/uml-grader
```

If you downloaded a ZIP file instead, extract it and open a terminal in the `uml-grader` folder.

### 3. Install dependencies

This repository has separate npm projects for each app, so install dependencies in each folder.

```bash
cd apps/api
npm install

cd ../grader
npm install

cd ../web
npm install
```

Return to the project runner folder:

```bash
cd ../..
```

### 4. Configure environment variables

Create `apps/api/.env`:

```env
PORT=4000
MONGODB_URI=mongodb://127.0.0.1:27017/auto_uml_grader

JWT_ACCESS_SECRET=replace-with-a-long-random-string
JWT_REFRESH_SECRET=replace-with-another-long-random-string
JWT_SUPERADMIN_SECRET=replace-with-a-superadmin-random-string
JWT_TEACHER_INVITE_SECRET=replace-with-a-teacher-invite-random-string

SUPERADMIN_EMAIL=admin@example.com
SUPERADMIN_PASSWORD=change-this-password

SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_FROM="Auto UML Grader <no-reply@example.com>"

OTP_EXPIRY_MINUTES=10
TEACHER_INVITE_BASE_URL=http://localhost:3000/teacher/signup
GRADER_BASE_URL=http://127.0.0.1:4100
```

Create `apps/grader/.env`:

```env
PORT=4100
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:3b-instruct
OLLAMA_VISION_MODEL=gemma3:4b
GRADER_USE_OLLAMA=true
```

Create `apps/web/.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
JWT_ACCESS_SECRET=replace-with-the-same-value-as-api-JWT_ACCESS_SECRET
```

Notes:

- `JWT_ACCESS_SECRET` must match between `apps/api/.env` and `apps/web/.env.local` because the web middleware verifies the access token.
- SMTP is required for student OTP signup and teacher invitation emails.
- To run UXF/XML grading without Ollama, set `GRADER_USE_OLLAMA=false` in `apps/grader/.env`.

### 5. Start MongoDB

If MongoDB is installed locally, start it before running the apps. The default API connection is:

```text
mongodb://127.0.0.1:27017/auto_uml_grader
```

You can also use MongoDB Atlas by replacing `MONGODB_URI` in `apps/api/.env`.

### 6. Start the apps

On Windows, from the `uml-grader` folder:

```powershell
.\start-dev.ps1
```

Or:

```cmd
start-dev.cmd
```

The script starts all three apps and writes logs to each app folder.

For macOS, Linux, or manual startup, open three terminals:

```bash
cd uml-grader/apps/grader
npm run start:dev
```

```bash
cd uml-grader/apps/api
npm run start:dev
```

```bash
cd uml-grader/apps/web
npm run dev
```

### 7. Open the app

Visit:

```text
http://localhost:3000
```

Service URLs:

- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- Grader: `http://localhost:4100`

Health checks:

- `http://localhost:4000/health`
- `http://localhost:4100/health`

## Typical Usage Flow

1. Configure the API, web, grader, MongoDB, SMTP, and optional Ollama settings.
2. Start all services.
3. Use the superadmin route to invite teacher emails.
4. Teachers accept the invite at `/teacher/signup`.
5. Teachers log in and create assignments.
6. Teachers upload reference UML solutions as UXF/XML files or images.
7. Students sign up using an `@student.adelaide.edu.au` email and verify OTP.
8. Students open assigned work and upload their UML submission.
9. The API stores the submission and calls the grader service in the background.
10. Teachers review results, override marks when needed, and publish marks.
11. Students view published grades and feedback.

## File Upload Rules

Teacher reference solutions support:

- `.uxf`
- `.xml`
- `.png`
- `.jpg`
- `.jpeg`

Student submissions must match the assignment's reference solution mode:

- If the teacher uploaded UXF/XML, students must submit UXF/XML.
- If the teacher uploaded PNG/JPEG, students must submit PNG/JPEG.

The teacher solution upload limit is 10 MB.

## Scripts

### API

Run from `uml-grader/apps/api`:

```bash
npm run start:dev
npm run build
npm run lint
npm run test
npm run test:e2e
```

### Grader

Run from `uml-grader/apps/grader`:

```bash
npm run start:dev
npm run build
npm run lint
npm run test
```

### Web

Run from `uml-grader/apps/web`:

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Testing

Unit tests are available in the API and grader apps. The grader also includes tests for UXF parsing and diagram comparison.

```bash
cd uml-grader/apps/grader
npm run test

cd ../api
npm run test
npm run test:e2e
```

Fixture UMLet files are stored in:

```text
uml-grader/docs/test-fixtures/
```

## Troubleshooting

### API says database is down

Check that MongoDB is running and that `MONGODB_URI` points to the correct server.

### Web redirects back to login after successful login

Make sure `JWT_ACCESS_SECRET` in `apps/web/.env.local` exactly matches `JWT_ACCESS_SECRET` in `apps/api/.env`.

### Student signup fails

Student signup only accepts emails ending in:

```text
@student.adelaide.edu.au
```

Also confirm SMTP settings are present and valid.

### Teacher invite fails

Confirm these API variables are configured:

```env
SUPERADMIN_EMAIL
SUPERADMIN_PASSWORD
JWT_SUPERADMIN_SECRET
JWT_TEACHER_INVITE_SECRET
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS
SMTP_FROM
```

### Grading fails

Check that the grader service is running at `http://localhost:4100` and that `GRADER_BASE_URL` in `apps/api/.env` points to it.

For Ollama grading, check:

```bash
ollama list
```

If you want deterministic UXF/XML fallback only, set:

```env
GRADER_USE_OLLAMA=false
```

### Port already in use

Default ports:

- Web: `3000`
- API: `4000`
- Grader: `4100`
- MongoDB: `27017`

Stop the process using the port or update the relevant `PORT` value in the app `.env` file.

## Current Notes

- The project stores uploaded files as base64 data URLs in MongoDB records rather than using external object storage.
- The root `package.json` is minimal; dependency installation and scripts are managed separately in `apps/api`, `apps/grader`, and `apps/web`.
- The Windows launcher checks MongoDB, starts the three services, waits for ports, prints health information, and writes logs to `*.out.log` and `*.err.log` files.
