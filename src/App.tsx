import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'

import { Layout } from './components/layout/Layout'
import { FixturePage } from './pages/FixturePage'
import { GruposPage } from './pages/GruposPage'
import { RankingPage } from './pages/RankingPage'
import { MisPrediccionesPage } from './pages/MisPrediccionesPage'
import { PerfilPage } from './pages/PerfilPage'
import { AuthPage } from './pages/AuthPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { UsuariosPage } from './pages/admin/UsuariosPage'
import { ResultadosPage } from './pages/admin/ResultadosPage'
import { ConfigPage } from './pages/admin/ConfigPage'
import { GrupoDetailPage } from './pages/GrupoDetailPage'
import { EquipoPage } from './pages/EquipoPage'
import { AyudaPage } from './pages/AyudaPage'
import { EquiposAdminPage } from './pages/admin/EquiposAdminPage'
import { PartidosAdminPage } from './pages/admin/PartidosAdminPage'
import { AuditoriaPage } from './pages/admin/AuditoriaPage'
import { TercerosPage } from './pages/admin/TercerosPage'
import { PosicionesGruposPage } from './pages/admin/PosicionesGruposPage'
import { CombinacionesPage } from './pages/admin/CombinacionesPage'
import { CorreosPage } from './pages/admin/CorreosPage'
import { ResultAutoPage } from './pages/admin/ResultAutoPage'
import { BracketPage } from './pages/BracketPage'
import { MasPuntosPage } from './pages/MasPuntosPage'
import { SubgruposPage } from './pages/SubgruposPage'
import { SubgrupoDetailPage } from './pages/SubgrupoDetailPage'
import { DescargarAppPage } from './pages/DescargarAppPage'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { ApiPage } from './pages/ApiPage'
import { useUpdateCheck } from './hooks/useUpdateCheck'
import { UpdateModal } from './components/ui/UpdateModal'
// v2 multi-tenant (Fase 2)
import { PencasPage } from './pages/PencasPage'
import { TenCompLayout } from './components/tencomp/TenCompLayout'
import { PencaDashboardPage } from './pages/penca/PencaDashboardPage'
import { PencaPlaceholderPage } from './pages/penca/PencaPlaceholderPage'
import { PencaFixturePage } from './pages/penca/PencaFixturePage'
import { PencaRankingPage } from './pages/penca/PencaRankingPage'
import { PencaMisPrediccionesPage } from './pages/penca/PencaMisPrediccionesPage'
import { PencaAyudaPage } from './pages/penca/PencaAyudaPage'
import { PencaGruposPage } from './pages/penca/PencaGruposPage'
import { PencaGrupoDetailPage } from './pages/penca/PencaGrupoDetailPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 1 },
  },
})


function AppContent() {
  const { update, dismiss } = useUpdateCheck()

  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/fixture" replace />} />
            <Route path="fixture"           element={<FixturePage />} />
            <Route path="grupos"            element={<GruposPage />} />
            <Route path="grupos/:grupo"     element={<GrupoDetailPage />} />
            <Route path="equipos/:id"       element={<EquipoPage />} />
            <Route path="ranking"           element={<RankingPage />} />
            <Route path="mis-predicciones"  element={<MisPrediccionesPage />} />
            <Route path="perfil"            element={<PerfilPage />} />
            <Route path="descargar"         element={<DescargarAppPage />} />
            <Route path="auth"              element={<AuthPage />} />
            <Route path="auth-callback"     element={<AuthCallbackPage />} />
            <Route path="api-info"          element={<ApiPage />} />
            <Route path="ayuda"             element={<AyudaPage />} />
            <Route path="cuadro"            element={<BracketPage />} />
            <Route path="mas-puntos"        element={<MasPuntosPage />} />
            <Route path="subgrupos"         element={<SubgruposPage />} />
            <Route path="subgrupos/:id"     element={<SubgrupoDetailPage />} />

            {/* ── v2 multi-tenant (Fase 2) — convive con las rutas v1 de arriba ── */}
            <Route path="pencas"            element={<PencasPage />} />
            <Route path="p/:slug"           element={<TenCompLayout />}>
              <Route index                  element={<PencaDashboardPage />} />
              <Route path="fixture"         element={<PencaFixturePage />} />
              <Route path="grupos"          element={<PencaGruposPage />} />
              <Route path="grupos/:grupo"   element={<PencaGrupoDetailPage />} />
              <Route path="cuadro"          element={<PencaPlaceholderPage title="Cuadro" />} />
              <Route path="ranking"         element={<PencaRankingPage />} />
              <Route path="mis-predicciones" element={<PencaMisPrediccionesPage />} />
              <Route path="mas-puntos"      element={<PencaPlaceholderPage title="+ Puntos" />} />
              <Route path="subgrupos"       element={<PencaPlaceholderPage title="Subgrupos" />} />
              <Route path="ayuda"           element={<PencaAyudaPage />} />
              <Route path="admin"           element={<PencaPlaceholderPage title="Administración de la penca" />} />
            </Route>

            {/* Admin */}
            <Route path="admin/usuarios"    element={<UsuariosPage />} />
            <Route path="admin/resultados"  element={<ResultadosPage />} />
            <Route path="admin/config"      element={<ConfigPage />} />
            <Route path="admin/equipos"     element={<EquiposAdminPage />} />
            <Route path="admin/auditoria"   element={<AuditoriaPage />} />
            <Route path="admin/partidos"    element={<PartidosAdminPage />} />
            <Route path="admin/terceros"    element={<TercerosPage />} />
            <Route path="admin/posiciones-grupos" element={<PosicionesGruposPage />} />
            <Route path="admin/combinaciones"     element={<CombinacionesPage />} />
            <Route path="admin/correos"           element={<CorreosPage />} />
            <Route path="admin/resultauto"        element={<ResultAutoPage />} />
            <Route path="*"                 element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>

      {update && (
        <UpdateModal
          versionName={update.version_name}
          apkUrl={update.apk_url}
          releaseNotes={update.release_notes}
          forceUpdate={update.force_update}
          onDismiss={dismiss}
        />
      )}
    </>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
      <Toaster
        theme="dark"
        toastOptions={{
          style: {
            background: '#141925',
            border: '1px solid #1E2535',
            color: '#F8FAFC',
          },
        }}
      />
    </QueryClientProvider>
  )
}
