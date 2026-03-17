import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import PagesList from "./pages/PagesList.tsx";
import PageEditor from "./pages/PageEditor.tsx";
import Plugins from "./pages/Plugins.tsx";
import Devices from "./pages/Devices.tsx";
import Logs from "./pages/Logs.tsx";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/pages" element={<PagesList />} />
        <Route path="/pages/:id" element={<PageEditor />} />
        <Route path="/plugins" element={<Plugins />} />
        <Route path="/devices" element={<Devices />} />
        <Route path="/logs" element={<Logs />} />
      </Routes>
    </Layout>
  );
}
