import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import CommandCenter from "./pages/CommandCenter";
import DecisionDetail from "./pages/DecisionDetail";
import StressTest from "./pages/StressTest";
import Timeline from "./pages/Timeline";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<CommandCenter />} />
        <Route path="/decisions/:id" element={<DecisionDetail />} />
        <Route path="/decisions/:id/stress-test" element={<StressTest />} />
        <Route path="/decisions/:id/timeline" element={<Timeline />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
