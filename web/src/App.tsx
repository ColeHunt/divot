import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './lib/auth.js';
import { usePath } from './lib/router.js';
import { isValidRoundCode, normaliseRoundCode } from './lib/roundCode.js';
import { Nav } from './components/Nav.js';
import { ViewportDebug } from './components/ViewportDebug.js';
import { Login } from './screens/Login.js';
import { Register } from './screens/Register.js';
import { ForgotPassword } from './screens/ForgotPassword.js';
import { ResetPassword } from './screens/ResetPassword.js';
import { Account } from './screens/Account.js';
import { Home } from './screens/Home.js';
import { Friends } from './screens/Friends.js';
import { Courses } from './screens/Courses.js';
import { CourseDetail } from './screens/CourseDetail.js';
import { NewCourse } from './screens/NewCourse.js';
import { EditCourse } from './screens/EditCourse.js';
import { NewRound } from './screens/NewRound.js';
import { Round } from './screens/Round.js';
import { Rounds } from './screens/Rounds.js';

function Shell() {
  const { user, loading } = useAuth();
  const path = usePath();

  if (loading) {
    return (
      <div className="app">
        <div className="center-screen">
          <p className="muted">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (path === '/register') return <Register />;
    if (path === '/forgot-password') return <ForgotPassword />;
    if (path === '/reset-password') return <ResetPassword />;
    return <Login />;
  }

  const roundMatch = /^\/round\/([0-9A-Za-z]{6})$/.exec(path);
  if (roundMatch) {
    const code = normaliseRoundCode(roundMatch[1]!);
    if (isValidRoundCode(code)) return <Round key={code} code={code} />;
  }

  const editCourseMatch = /^\/courses\/([^/]+)\/edit$/.exec(path);

  let screen: ReactNode;
  if (path === '/friends') screen = <Friends />;
  else if (path === '/account') screen = <Account />;
  else if (path === '/courses/new') screen = <NewCourse />;
  else if (editCourseMatch) screen = <EditCourse key={path} id={editCourseMatch[1]!} />;
  else if (path.startsWith('/courses/')) screen = <CourseDetail key={path} id={path.slice('/courses/'.length)} />;
  else if (path === '/courses') screen = <Courses />;
  else if (path === '/rounds') screen = <Rounds />;
  else if (path === '/round/new') screen = <NewRound />;
  else screen = <Home />;

  return (
    <>
      {screen}
      <Nav path={path} />
    </>
  );
}

export function App() {
  const debugViewport = new URLSearchParams(window.location.search).has('vp');
  return (
    <AuthProvider>
      <Shell />
      {debugViewport && <ViewportDebug />}
    </AuthProvider>
  );
}
