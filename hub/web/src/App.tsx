import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Layout from "./components/Layout.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import PagesList from "./pages/PagesList.tsx";
import PageEditor from "./pages/PageEditor.tsx";
import Plugins from "./pages/Plugins.tsx";
import Devices from "./pages/Devices.tsx";
import Logs from "./pages/Logs.tsx";
import Security from "./pages/Security.tsx";
import Modes from "./pages/Modes.tsx";
import Login from "./pages/Login.tsx";
import { api } from "./lib/api.ts";

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);

  const { data: authStatus, isLoading } = useQuery({
    queryKey: ["auth", "status"],
    queryFn: api.auth.status,
    retry: false,
  });

  if (isLoading) return null;

  const needsLogin =
    !loggedIn &&
    authStatus?.auth_required &&
    !authStatus?.authenticated;

  if (needsLogin) {
    return <Login onSuccess={() => setLoggedIn(true)} />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/pages" element={<PagesList />} />
        <Route path="/pages/:id" element={<PageEditor />} />
        <Route path="/modes" element={<Modes />} />
        <Route path="/plugins" element={<Plugins />} />
        <Route path="/devices" element={<Devices />} />
        <Route path="/logs" element={<Logs />} />
        <Route path="/security" element={<Security />} />
      </Routes>
    </Layout>
  );
}
