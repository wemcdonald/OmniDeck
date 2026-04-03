import { useState, lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Layout from "./components/Layout.tsx";
import { api } from "./lib/api.ts";

const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const PagesList = lazy(() => import("./pages/PagesList.tsx"));
const PageEditor = lazy(() => import("./pages/PageEditor.tsx"));
const Plugins = lazy(() => import("./pages/Plugins.tsx"));
const Devices = lazy(() => import("./pages/Devices.tsx"));
const Logs = lazy(() => import("./pages/Logs.tsx"));
const Agents = lazy(() => import("./pages/Agents.tsx"));
const Modes = lazy(() => import("./pages/Modes.tsx"));
const Login = lazy(() => import("./pages/Login.tsx"));

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);

  const { data: authStatus, isLoading, isError, refetch } = useQuery({
    queryKey: ["auth", "status"],
    queryFn: api.auth.status,
    retry: 2,
  });

  if (isLoading) return null;

  if (isError) {
    return (
      <div className="flex h-screen items-center justify-center flex-col gap-4 text-muted-foreground">
        <p className="text-sm">Unable to reach the hub. Check your connection.</p>
        <button
          onClick={() => void refetch()}
          className="rounded bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
        >
          Retry
        </button>
      </div>
    );
  }

  const needsLogin =
    !loggedIn &&
    authStatus?.auth_required &&
    !authStatus?.authenticated;

  if (needsLogin) {
    return (
      <Suspense fallback={null}>
        <Login onSuccess={() => setLoggedIn(true)} />
      </Suspense>
    );
  }

  return (
    <Layout>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/pages" element={<PagesList />} />
          <Route path="/pages/:id" element={<PageEditor />} />
          <Route path="/modes" element={<Modes />} />
          <Route path="/plugins" element={<Plugins />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/agents" element={<Agents />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
