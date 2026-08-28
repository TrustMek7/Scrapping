import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router";
import NotFound from "./pages/OtherPage/NotFound";
import MonitoringAlerts from "./pages/Monitoring/Alerts";
import Sources from "./pages/Monitoring/Sources";
import Entities from "./pages/Monitoring/Entities";
import AppLayout from "./layout/AppLayout";
import { ScrollToTop } from "./components/common/ScrollToTop";

export default function App() {
  return (
    <Router>
      <ScrollToTop />
      <Routes>
        <Route element={<AppLayout />}>
          <Route index path="/" element={<Navigate to="/monitoreo/alertas" replace />} />
          <Route path="/monitoreo/alertas" element={<MonitoringAlerts />} />
          <Route path="/monitoreo/fuentes" element={<Sources />} />
          <Route path="/monitoreo/entidades" element={<Entities />} />
        </Route>

        {/* Ruta no encontrada */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}
