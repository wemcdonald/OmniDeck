import { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import PagesList from "./pages/PagesList.tsx";
import PageEditor from "./pages/PageEditor.tsx";
import Plugins from "./pages/Plugins.tsx";
import Devices from "./pages/Devices.tsx";
import Logs from "./pages/Logs.tsx";
import Security from "./pages/Security.tsx";
import Login from "./pages/Login.tsx";
import { api } from "./lib/api.ts";

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    api.auth
      .status()
      .then(({ auth_required, authenticated }) => {
        setNeedsLogin(auth_required && !authenticated);
        setAuthChecked(true);
      })
      .catch(() => {
        // If auth status fails, assume no auth needed (backward compat)
        setAuthChecked(true);
      });
  }, []);

  if (!authChecked) return null;

  if (needsLogin) {
    return <Login onSuccess={() => setNeedsLogin(false)} />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/pages" element={<PagesList />} />
        <Route path="/pages/:id" element={<PageEditor />} />
        <Route path="/plugins" element={<Plugins />} />
        <Route path="/devices" element={<Devices />} />
        <Route path="/logs" element={<Logs />} />
        <Route path="/security" element={<Security />} />
      </Routes>
    </Layout>
  );
}
