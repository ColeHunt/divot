import { useState } from 'react';
import type { Course } from '@shared/types.js';
import { CourseForm, type CourseFormValues } from '../components/CourseForm.js';
import { api, ApiError } from '../lib/api.js';
import { navigate } from '../lib/router.js';

export function NewCourse() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(values: CourseFormValues) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ course: Course }>('/api/courses', values);
      navigate(`/courses/${res.course.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that course');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <div className="topbar">
        <button className="btn-ghost" style={{ padding: 0, minHeight: 0 }} onClick={() => navigate('/courses')}>
          ← Courses
        </button>
      </div>
      <CourseForm submitLabel="Save course" busy={busy} error={error} onSubmit={submit} />
    </div>
  );
}
