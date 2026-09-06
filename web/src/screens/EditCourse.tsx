import { useEffect, useState } from 'react';
import type { Course } from '@shared/types.js';
import { CourseForm, holesToInput, type CourseFormValues } from '../components/CourseForm.js';
import { api, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { navigate } from '../lib/router.js';

export function EditCourse({ id }: { id: string }) {
  const { isAdmin } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The server enforces this too (PATCH/DELETE are admin-only) — this is
    // just so a non-admin who lands here directly sees their course, not a
    // form that would 403 on submit.
    if (!isAdmin) {
      navigate(`/courses/${id}`);
      return;
    }
    api.get<{ course: Course }>(`/api/courses/${id}`).then((res) => setCourse(res.course));
  }, [id, isAdmin]);

  async function submit(values: CourseFormValues) {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/courses/${id}`, values);
      navigate(`/courses/${id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save those changes');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <div className="topbar">
        <button className="btn-ghost" style={{ padding: 0, minHeight: 0 }} onClick={() => navigate(`/courses/${id}`)}>
          ← Cancel
        </button>
      </div>

      {!course ? (
        <div className="center-screen">
          <p className="muted">Loading…</p>
        </div>
      ) : (
        <CourseForm
          initialName={course.name}
          initialLocation={course.location ?? ''}
          initialLatitude={course.latitude}
          initialLongitude={course.longitude}
          initialHoles={holesToInput(course.holes)}
          submitLabel="Save changes"
          busy={busy}
          error={error}
          onSubmit={submit}
        />
      )}
    </div>
  );
}
