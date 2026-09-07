'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { TeacherDatePicker } from '@/components/teacher/date-picker';
import { TeacherTimeSelect } from '@/components/teacher/time-select';
import { API_BASE_URL } from '@/lib/api';
import { getDashboardPathForRole } from '@/lib/auth';
import { cn } from '@/lib/utils';

interface MeResponse {
  user?: {
    role?: string;
    fullName?: string;
  } | null;
}

interface SolutionDraft {
  id: string;
  label: string;
  file: File;
}

interface SynonymRow {
  id: string;
  solutionName: string;
  aliasesText: string;
}

type SynonymInputMode = 'table' | 'json';

const SOLUTION_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const SOLUTION_UPLOAD_MAX_MB = 10;
const DEFAULT_SYNONYM_ROWS: SynonymRow[] = [
  {
    id: 'default-customer',
    solutionName: 'Customer',
    aliasesText: 'Client, Buyer',
  },
];

export default function TeacherCreateAssignmentPage() {
  const router = useRouter();
  const [teacherName, setTeacherName] = useState('Teacher');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [totalMarks, setTotalMarks] = useState('10');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [synonymInputMode, setSynonymInputMode] =
    useState<SynonymInputMode>('table');
  const [synonymRows, setSynonymRows] =
    useState<SynonymRow[]>(DEFAULT_SYNONYM_ROWS);
  const [synonymsMapText, setSynonymsMapText] = useState(
    formatSynonymsMapText(rowsToSynonymsMap(DEFAULT_SYNONYM_ROWS)),
  );
  const [solutions, setSolutions] = useState<SolutionDraft[]>([]);
  const [assignedStudentEmails, setAssignedStudentEmails] = useState<string[]>([]);
  const [inviteFileName, setInviteFileName] = useState('');

  useEffect(() => {
    async function validateTeacherSession() {
      try {
        const meRes = await fetch(`${API_BASE_URL}/auth/me`, {
          credentials: 'include',
        });
        if (!meRes.ok) {
          throw new Error('Session invalid');
        }

        const meData: MeResponse = await meRes.json();
        const role = meData.user?.role;
        if (role !== 'teacher') {
          router.replace(getDashboardPathForRole(role));
          return;
        }

        setTeacherName(meData.user?.fullName ?? 'Teacher');
      } catch {
        router.replace('/login');
        return;
      } finally {
        setLoading(false);
      }
    }

    void validateTeacherSession();
  }, [router]);

  const solutionCount = solutions.length;

  const parsedSynonymsPreview = useMemo(() => {
    const validation =
      synonymInputMode === 'json'
        ? validateSynonymsMap(synonymsMapText)
        : validateSynonymRows(synonymRows);

    return validation.isValid ? validation.value : null;
  }, [synonymInputMode, synonymRows, synonymsMapText]);

  const dueAt = useMemo(() => {
    if (!dueDate) {
      return '';
    }

    if (!dueTime) {
      return `${dueDate}T00:00`;
    }

    return `${dueDate}T${dueTime}`;
  }, [dueDate, dueTime]);

  function onSolutionFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    const allowedMimeTypes = new Set([
      'image/png',
      'image/jpeg',
      'image/jpg',
      'application/xml',
      'text/xml',
      'application/uxf',
    ]);

    const oversizedFiles: string[] = [];
    const invalidFiles: string[] = [];

    const newSolutions = files.flatMap((file) => {
      if (file.size > SOLUTION_UPLOAD_MAX_BYTES) {
        oversizedFiles.push(
          `${file.name} (${formatFileSize(file.size)})`,
        );
        return [];
      }

      if (
        !allowedMimeTypes.has(file.type) &&
        !file.name.toLowerCase().endsWith('.xml') &&
        !file.name.toLowerCase().endsWith('.uxf') &&
        !file.name.toLowerCase().endsWith('.png') &&
        !file.name.toLowerCase().endsWith('.jpg') &&
        !file.name.toLowerCase().endsWith('.jpeg')
      ) {
        invalidFiles.push(file.name);
        return [];
      }

      return [{
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label: file.name.replace(/\.[^.]+$/, ''),
        file,
      }];
    });

    if (oversizedFiles.length > 0) {
      const message =
        oversizedFiles.length === 1
          ? `${oversizedFiles[0]} is too large. Solution files must be ${SOLUTION_UPLOAD_MAX_MB} MB or smaller.`
          : `These solution files are too large: ${oversizedFiles.join(', ')}. Each file must be ${SOLUTION_UPLOAD_MAX_MB} MB or smaller.`;
      setError(message);
      window.alert(message);
    }

    if (invalidFiles.length > 0) {
      const message =
        invalidFiles.length === 1
          ? `${invalidFiles[0]} must be PNG, JPEG, XML, or UXF.`
          : `These files must be PNG, JPEG, XML, or UXF: ${invalidFiles.join(', ')}.`;
      setError(message);
      window.alert(message);
    }

    setSolutions((current) => [...current, ...newSolutions]);
    event.target.value = '';
  }

  function updateSolutionLabel(id: string, label: string) {
    setSolutions((current) =>
      current.map((item) => (item.id === id ? { ...item, label } : item)),
    );
  }

  function removeSolution(id: string) {
    setSolutions((current) => current.filter((item) => item.id !== id));
  }

  function changeSynonymInputMode(mode: SynonymInputMode) {
    if (mode === synonymInputMode) {
      return;
    }

    if (mode === 'table') {
      const validation = validateSynonymsMap(synonymsMapText);
      if (validation.isValid) {
        setSynonymRows(synonymsMapToRows(validation.value));
      } else {
        setError(validation.message);
      }
    } else {
      const validation = validateSynonymRows(synonymRows);
      if (validation.isValid) {
        setSynonymsMapText(formatSynonymsMapText(validation.value));
      } else {
        setError(validation.message);
      }
    }

    setSynonymInputMode(mode);
  }

  function updateSynonymRow(
    id: string,
    field: 'solutionName' | 'aliasesText',
    value: string,
  ) {
    setSynonymRows((current) => {
      const nextRows = current.map((row) =>
        row.id === id ? { ...row, [field]: value } : row,
      );
      setSynonymsMapText(formatSynonymsMapText(rowsToSynonymsMap(nextRows)));
      return nextRows;
    });
  }

  function addSynonymRow() {
    setSynonymRows((current) => [
      ...current,
      {
        id: `synonym-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        solutionName: '',
        aliasesText: '',
      },
    ]);
  }

  function removeSynonymRow(id: string) {
    setSynonymRows((current) => {
      const nextRows =
        current.length > 1
          ? current.filter((row) => row.id !== id)
          : [{ ...current[0], solutionName: '', aliasesText: '' }];
      setSynonymsMapText(formatSynonymsMapText(rowsToSynonymsMap(nextRows)));
      return nextRows;
    });
  }

  async function onInviteSpreadsheetSelected(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
      if (!sheet) {
        throw new Error('The uploaded spreadsheet does not contain a readable sheet.');
      }

      const rows = XLSX.utils.sheet_to_json<(string | null)[]>(sheet, {
        header: 1,
        blankrows: false,
      });

      const headerRow = (rows[0] ?? []).map((value) =>
        String(value ?? '')
          .trim()
          .toLowerCase(),
      );

      if (headerRow.length !== 1 || headerRow[0] !== 'email') {
        throw new Error(
          'Spreadsheet format must match the template exactly: one column with the header "email".',
        );
      }

      const emails = rows
        .slice(1)
        .map((row) => String(row[0] ?? '').trim().toLowerCase())
        .filter(Boolean);

      if (emails.length === 0) {
        throw new Error('The spreadsheet does not contain any student emails.');
      }

      const invalidEmail = emails.find((email) => !isValidEmail(email));
      if (invalidEmail) {
        throw new Error(`Invalid email found in spreadsheet: ${invalidEmail}`);
      }

      setAssignedStudentEmails([...new Set(emails)]);
      setInviteFileName(file.name);
    } catch (err) {
      setAssignedStudentEmails([]);
      setInviteFileName('');
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to parse the invited students spreadsheet.',
      );
    } finally {
      event.target.value = '';
    }
  }

  function downloadInviteTemplate() {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['email'],
      ['student1@student.adelaide.edu.au'],
      ['student2@student.adelaide.edu.au'],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Invited Students');
    XLSX.writeFile(workbook, 'assignment-invite-template.xlsx');
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      if (solutions.length === 0) {
        window.alert(
          'At least one solution file is required before creating an assignment.',
        );
        setSaving(false);
        return;
      }

      if (new Set(solutions.map((solution) => getSolutionFileMode(solution.file))).size > 1) {
        window.alert(
          'Use one solution format per assignment: either UXF/XML files or PNG/JPEG screenshots.',
        );
        setSaving(false);
        return;
      }

      const synonymsMapValidation =
        synonymInputMode === 'json'
          ? validateSynonymsMap(synonymsMapText)
          : validateSynonymRows(synonymRows);
      if (!synonymsMapValidation.isValid) {
        window.alert(
          synonymsMapValidation.message ??
            'Synonyms map must be valid JSON before creating the assignment.',
        );
        setSaving(false);
        return;
      }

      if (!isPublished) {
        const shouldContinue = window.confirm(
          'Publish immediately is unchecked. This assignment will be created as a draft and will not be visible to students yet.\n\nPress OK to continue creating it as a draft, or Cancel to return to the form.',
        );
        if (!shouldContinue) {
          setSaving(false);
          return;
        }
      }

      const synonymsMap = synonymsMapValidation.value;
      const assignmentRes = await fetch(`${API_BASE_URL}/teacher/assignments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          totalMarks: Number(totalMarks),
          dueAt: dueAt || null,
          synonymsMap,
          assignedStudentEmails,
          solutionCount,
          isPublished,
        }),
      });

      const assignmentData = await assignmentRes.json();
      if (!assignmentRes.ok) {
        throw new Error(assignmentData?.message ?? 'Failed to create assignment.');
      }

      for (const solution of solutions) {
        if (!solution.label.trim()) {
          throw new Error('Each solution file needs a label before upload.');
        }

        const formData = new FormData();
        formData.append('label', solution.label.trim());
        formData.append('file', solution.file);

        const solutionRes = await fetch(
          `${API_BASE_URL}/teacher/assignments/${assignmentData.assignmentId}/solutions`,
          {
            method: 'POST',
            credentials: 'include',
            body: formData,
          },
        );

        const solutionData = await parseApiResponse(solutionRes);
        if (!solutionRes.ok) {
          const uploadMessage = getApiErrorMessage(
            solutionData,
            `Failed to upload solution ${solution.file.name}.`,
          );

          if (solution.file.size > SOLUTION_UPLOAD_MAX_BYTES) {
            window.alert(
              `${solution.file.name} is too large. Solution files must be ${SOLUTION_UPLOAD_MAX_MB} MB or smaller.`,
            );
          } else if (uploadMessage.toLowerCase().includes('10 mb')) {
            window.alert(uploadMessage);
          }

          throw new Error(uploadMessage);
        }
      }

      setSuccess(
        `Assignment "${assignmentData.title}" created${solutionCount ? ` with ${solutionCount} solution file${solutionCount > 1 ? 's' : ''}` : ''}.`,
      );
      setSolutions([]);
      router.push('/teacher/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Loading teacher workspace...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 px-6 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col justify-between gap-4 rounded-2xl border border-blue-900/30 bg-slate-900/70 p-6 backdrop-blur sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-medium text-blue-200/80">Teacher workspace</p>
            <h1 className="mt-1 text-3xl font-semibold text-blue-50">
              Create Assignment
            </h1>
            <p className="mt-2 text-sm text-blue-200/90">
              Build the assignment, set publishing details, and upload solution files for {teacherName}.
            </p>
          </div>
          <Link
            href="/teacher/dashboard"
            className="rounded-lg border border-blue-300/30 bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            Back to Dashboard
          </Link>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="mb-4 rounded-lg border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {success}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="space-y-6 rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <div>
              <h2 className="text-lg font-semibold text-blue-100">Assignment Details</h2>
              <p className="mt-1 text-sm text-blue-200/80">
                These map directly to the current assignment schema.
              </p>
            </div>

            <div className="grid gap-4">
              <label className="grid gap-2 text-sm text-blue-50">
                <span>Title</span>
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-blue-400"
                  placeholder="Week 4 Class Diagram"
                />
              </label>

              <label className="grid gap-2 text-sm text-blue-50">
                <span>Description</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-blue-400"
                  placeholder="Describe the UML expectations, domain, and submission notes."
                />
              </label>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="grid gap-2 text-sm text-blue-50">
                  <span>Total Marks</span>
                  <input
                    required
                    min={0}
                    type="number"
                    value={totalMarks}
                    onChange={(e) => setTotalMarks(e.target.value)}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-blue-400"
                  />
                </label>

                <label className="grid gap-2 text-sm text-blue-50">
                  <span>Due Date</span>
                  <TeacherDatePicker
                    value={dueDate}
                    onChange={setDueDate}
                  />
                </label>

                <label className="grid gap-2 text-sm text-blue-50">
                  <span>Due Time</span>
                  <TeacherTimeSelect
                    value={dueTime}
                    onChange={setDueTime}
                  />
                </label>
              </div>

              <p className="text-xs text-blue-200/70">
                Pick both a date and time to set the deadline. Leave them blank if the assignment
                should have no due date.
              </p>

              <div className="grid gap-3 text-sm text-blue-50">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <span>Synonyms Map</span>
                    <p className="mt-1 text-xs text-blue-200/70">
                      Map solution class names to acceptable alternate names.
                    </p>
                  </div>
                  <div className="inline-flex rounded-xl border border-slate-700 bg-slate-950 p-1">
                    <button
                      type="button"
                      onClick={() => changeSynonymInputMode('table')}
                      className={cn(
                        'rounded-lg px-3 py-2 text-xs font-semibold transition',
                        synonymInputMode === 'table'
                          ? 'bg-blue-600 text-white'
                          : 'text-blue-200 hover:bg-slate-800',
                      )}
                    >
                      Table
                    </button>
                    <button
                      type="button"
                      onClick={() => changeSynonymInputMode('json')}
                      className={cn(
                        'rounded-lg px-3 py-2 text-xs font-semibold transition',
                        synonymInputMode === 'json'
                          ? 'bg-blue-600 text-white'
                          : 'text-blue-200 hover:bg-slate-800',
                      )}
                    >
                      JSON
                    </button>
                  </div>
                </div>

                {synonymInputMode === 'table' ? (
                  <div className="rounded-xl border border-slate-700 bg-slate-950 p-3">
                    <div className="hidden grid-cols-[0.8fr_1.2fr_auto] gap-3 px-1 pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-200/70 md:grid">
                      <span>Solution class</span>
                      <span>Comma-separated synonyms</span>
                      <span className="sr-only">Actions</span>
                    </div>
                    <div className="space-y-3">
                      {synonymRows.map((row) => (
                        <div
                          key={row.id}
                          className="grid gap-3 md:grid-cols-[0.8fr_1.2fr_auto] md:items-center"
                        >
                          <label className="grid gap-1 md:block">
                            <span className="text-xs text-blue-200/70 md:hidden">
                              Solution class
                            </span>
                            <input
                              value={row.solutionName}
                              onChange={(e) =>
                                updateSynonymRow(
                                  row.id,
                                  'solutionName',
                                  e.target.value,
                                )
                              }
                              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none transition focus:border-blue-400"
                              placeholder="Customer"
                            />
                          </label>
                          <label className="grid gap-1 md:block">
                            <span className="text-xs text-blue-200/70 md:hidden">
                              Comma-separated synonyms
                            </span>
                            <input
                              value={row.aliasesText}
                              onChange={(e) =>
                                updateSynonymRow(
                                  row.id,
                                  'aliasesText',
                                  e.target.value,
                                )
                              }
                              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none transition focus:border-blue-400"
                              placeholder="Client, Buyer"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => removeSynonymRow(row.id)}
                            className="rounded-lg border border-red-300/20 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/10"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={addSynonymRow}
                      className="mt-3 rounded-lg border border-blue-400/30 bg-blue-600/20 px-4 py-2 text-xs font-semibold text-blue-100 transition hover:bg-blue-600/30"
                    >
                      Add row
                    </button>
                  </div>
                ) : (
                  <label className="grid gap-2">
                    <textarea
                      value={synonymsMapText}
                      onChange={(e) => setSynonymsMapText(e.target.value)}
                      rows={8}
                      className={cn(
                        'rounded-xl border bg-slate-950 px-4 py-3 text-white outline-none transition',
                        parsedSynonymsPreview
                          ? 'border-slate-700 focus:border-blue-400'
                          : 'border-red-500/70 focus:border-red-400',
                      )}
                      placeholder='{"Customer": ["Client", "Buyer"]}'
                    />
                    <p className="text-xs text-blue-200/70">
                      JSON is validated when you press Create Assignment. Invalid JSON will show a popup.
                    </p>
                  </label>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3">
                <label className="flex items-center gap-3 text-sm text-blue-50">
                  <input
                    type="checkbox"
                    checked={isPublished}
                    onChange={(e) => setIsPublished(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-blue-500"
                  />
                  Publish immediately
                </label>
                <div className="rounded-full bg-slate-800 px-3 py-1 text-xs text-blue-200">
                  Solution count: {solutionCount}
                </div>
                <div className="rounded-full bg-slate-800 px-3 py-1 text-xs text-blue-200">
                  Invited students: {assignedStudentEmails.length}
                </div>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-950 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-blue-100">
                      Assign Specific Students
                    </h3>
                    <p className="mt-1 text-xs text-blue-200/70">
                      Download the sample spreadsheet, fill in student emails, then upload it here.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={downloadInviteTemplate}
                    className="rounded-lg border border-blue-400/30 bg-blue-600/20 px-4 py-2 text-sm font-medium text-blue-100 hover:bg-blue-600/30"
                  >
                    Download Template
                  </button>
                </div>

                <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-blue-400/40 bg-blue-500/5 px-6 py-6 text-center text-sm text-blue-100 transition hover:bg-blue-500/10">
                  <span className="font-semibold">Upload invited students spreadsheet</span>
                  <span className="mt-1 text-blue-200/80">
                    Accepted: XLSX or CSV with a single email column.
                  </span>
                  <input
                    type="file"
                    accept=".xlsx,.csv"
                    onChange={onInviteSpreadsheetSelected}
                    className="hidden"
                  />
                </label>

                <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                  <p className="text-sm font-medium text-blue-50">
                    {inviteFileName || 'No invite spreadsheet uploaded yet.'}
                  </p>
                  <p className="mt-1 text-xs text-blue-200/70">
                    {assignedStudentEmails.length > 0
                      ? `${assignedStudentEmails.length} student email${assignedStudentEmails.length > 1 ? 's' : ''} parsed successfully.`
                      : 'If no spreadsheet is uploaded, the assignment will be available to all students.'}
                  </p>
                  {assignedStudentEmails.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {assignedStudentEmails.slice(0, 8).map((email) => (
                        <span
                          key={email}
                          className="rounded-full bg-slate-800 px-3 py-1 text-xs text-blue-100"
                        >
                          {email}
                        </span>
                      ))}
                      {assignedStudentEmails.length > 8 ? (
                        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-blue-100">
                          +{assignedStudentEmails.length - 8} more
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-6 rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <div>
              <h2 className="text-lg font-semibold text-blue-100">Solution Files</h2>
              <p className="mt-1 text-sm text-blue-200/80">
                Upload PNG, JPEG, XML, or UXF solution files. Each file needs a label.
              </p>
            </div>

            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-blue-400/40 bg-blue-500/5 px-6 py-8 text-center text-sm text-blue-100 transition hover:bg-blue-500/10">
              <span className="font-semibold">Choose solution files</span>
              <span className="mt-1 text-blue-200/80">
                Multiple files supported. At least one file is required.
              </span>
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.xml,.uxf,image/png,image/jpeg,application/xml,text/xml,application/uxf"
                multiple
                onChange={onSolutionFilesSelected}
                className="hidden"
              />
            </label>

            <div className="space-y-3">
              {solutions.length === 0 ? (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-5 text-sm text-blue-200/80">
                  No solution files selected yet. You must upload at least one solution file to create the assignment.
                </div>
              ) : (
                solutions.map((solution) => (
                  <div
                    key={solution.id}
                    className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-blue-50">
                          {solution.file.name}
                        </p>
                        <p className="mt-1 text-xs text-blue-200/80">
                          {solution.file.type || 'application/xml'} ·{' '}
                          {(solution.file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSolution(solution.id)}
                        className="text-xs font-semibold text-red-300 hover:text-red-200"
                      >
                        Remove
                      </button>
                    </div>

                    <label className="mt-3 grid gap-2 text-sm text-blue-100">
                      <span>Label</span>
                      <input
                        value={solution.label}
                        onChange={(e) =>
                          updateSolutionLabel(solution.id, e.target.value)
                        }
                        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none transition focus:border-blue-400"
                        placeholder="Solution label"
                      />
                    </label>
                  </div>
                ))
              )}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Creating assignment...' : 'Create Assignment'}
            </button>
          </section>
        </form>
      </div>
    </main>
  );
}

function validateSynonymsMap(value: string):
  | { isValid: true; value: Record<string, string[]> }
  | { isValid: false; message: string } {
  if (!value.trim()) {
    return { isValid: true, value: {} };
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
      return {
        isValid: false,
        message: 'Synonyms map must be a JSON object.',
      };
    }

    return {
      isValid: true,
      value: Object.fromEntries(
        Object.entries(parsed).map(([key, entry]) => {
          if (
            !Array.isArray(entry) ||
            entry.some((item) => typeof item !== 'string')
          ) {
            throw new Error(
              `Each synonymsMap value must be an array of strings. Problem found at "${key}".`,
            );
          }

          return [key, entry];
        }),
      ),
    };
  } catch (error) {
    return {
      isValid: false,
      message:
        error instanceof Error
          ? error.message
          : 'Synonyms map must be valid JSON.',
    };
  }
}

function validateSynonymRows(rows: SynonymRow[]):
  | { isValid: true; value: Record<string, string[]> }
  | { isValid: false; message: string } {
  const entries = new Map<string, string[]>();

  for (const row of rows) {
    const solutionName = row.solutionName.trim();
    const aliases = splitSynonymAliases(row.aliasesText);

    if (!solutionName && aliases.length === 0) {
      continue;
    }

    if (!solutionName) {
      return {
        isValid: false,
        message: 'Each synonym row with aliases needs a solution class name.',
      };
    }

    if (aliases.length === 0) {
      return {
        isValid: false,
        message: `Add at least one synonym for "${solutionName}" or remove the row.`,
      };
    }

    entries.set(solutionName, [
      ...(entries.get(solutionName) ?? []),
      ...aliases,
    ]);
  }

  return {
    isValid: true,
    value: Object.fromEntries(
      Array.from(entries.entries()).map(([key, aliases]) => [
        key,
        Array.from(new Set(aliases)),
      ]),
    ),
  };
}

function rowsToSynonymsMap(rows: SynonymRow[]) {
  const entries = new Map<string, string[]>();

  for (const row of rows) {
    const solutionName = row.solutionName.trim();
    const aliases = splitSynonymAliases(row.aliasesText);

    if (!solutionName || aliases.length === 0) {
      continue;
    }

    entries.set(solutionName, [
      ...(entries.get(solutionName) ?? []),
      ...aliases,
    ]);
  }

  return Object.fromEntries(
    Array.from(entries.entries()).map(([key, aliases]) => [
      key,
      Array.from(new Set(aliases)),
    ]),
  );
}

function synonymsMapToRows(map: Record<string, string[]>): SynonymRow[] {
  const rows = Object.entries(map).map(([solutionName, aliases], index) => ({
    id: `synonym-${solutionName}-${index}`,
    solutionName,
    aliasesText: aliases.join(', '),
  }));

  return rows.length > 0
    ? rows
    : [{ id: 'empty-synonym-row', solutionName: '', aliasesText: '' }];
}

function splitSynonymAliases(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatSynonymsMapText(map: Record<string, string[]>) {
  return JSON.stringify(map, null, 2);
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function parseApiResponse(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text ? { message: text } : null;
}

function getApiErrorMessage(
  payload: unknown,
  fallback: string,
) {
  if (typeof payload === 'string' && payload.trim()) {
    return payload;
  }

  if (
    payload &&
    typeof payload === 'object' &&
    'message' in payload
  ) {
    const message = (payload as { message?: unknown }).message;

    if (typeof message === 'string' && message.trim()) {
      return message;
    }

    if (Array.isArray(message)) {
      const firstMessage = message.find(
        (item): item is string => typeof item === 'string' && item.trim().length > 0,
      );
      if (firstMessage) {
        return firstMessage;
      }
    }
  }

  return fallback;
}

function getSolutionFileMode(file: File) {
  const lowerName = file.name.toLowerCase();
  if (
    file.type === 'image/png' ||
    file.type === 'image/jpeg' ||
    lowerName.endsWith('.png') ||
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg')
  ) {
    return 'image';
  }

  return 'uxf';
}

function formatFileSize(sizeInBytes: number) {
  if (sizeInBytes >= 1024 * 1024) {
    return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(sizeInBytes / 1024).toFixed(1)} KB`;
}
