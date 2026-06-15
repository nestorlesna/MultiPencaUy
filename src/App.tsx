import { BrowserRouter, Routes, Route } from 'react-router-dom'
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
import { EntryRedirect } from './pages/EntryRedirect'
import { TenCompLayout } from './components/tencomp/TenCompLayout'
import { PencaDashboardPage } from './pages/penca/PencaDashboardPage'
import { PencaFixturePage } from './pages/penca/PencaFixturePage'
import { PencaRankingPage } from './pages/penca/PencaRankingPage'
import { PencaMisPrediccionesPage } from './pages/penca/PencaMisPrediccionesPage'
import { PencaAyudaPage } from './pages/penca/PencaAyudaPage'
import { PencaGruposPage } from './pages/penca/PencaGruposPage'
import { PencaGrupoDetailPage } from './pages/penca/PencaGrupoDetailPage'
import { PencaAdminPage } from './pages/penca/PencaAdminPage'
import { PencaCuadroPage } from './pages/penca/PencaCuadroPage'
import { PencaMasPuntosPage } from './pages/penca/PencaMasPuntosPage'
import { PencaSubgruposPage } from './pages/penca/PencaSubgruposPage'
import { PencaSubgrupoDetailPage } from './pages/penca/PencaSubgrupoDetailPage'
import { AdminHubPage } from './pages/admin/AdminHubPage'
import { AdminTenantsPage } from './pages/admin/AdminTenantsPage'
import { CompetenciasPage } from './pages/admin/CompetenciasPage'
import { CompetenciaDetailPage } from './pages/admin/CompetenciaDetailPage'
import { AdminResultadosV2Page } from './pages/admin/AdminResultadosV2Page'
import { TenantAdminPage } from './pages/tenant/TenantAdminPage'

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
            <Route index element={<EntryRedirect />} />
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
              <Route path="cuadro"          element={<PencaCuadroPage />} />
              <Route path="ranking"         element={<PencaRankingPage />} />
              <Route path="mis-predicciones" element={<PencaMisPrediccionesPage />} />
              <Route path="mas-puntos"      element={<PencaMasPuntosPage />} />
              <Route path="subgrupos"       element={<PencaSubgruposPage />} />
              <Route path="subgrupos/:id"   element={<PencaSubgrupoDetailPage />} />
              <Route path="ayuda"           element={<PencaAyudaPage />} />
              <Route path="admin"           element={<PencaAdminPage />} />
            </Route>

            {/* ── Admin de tenant (v2) ── */}
            <Route path="t/:tenantSlug/admin" element={<TenantAdminPage />} />

            {/* ── Super-admin plataforma (v2) ── */}
            <Route path="admin"               element={<AdminHubPage />} />
            <Route path="admin/tenants"       element={<AdminTenantsPage />} />
            <Route path="admin/competencias"     element={<CompetenciasPage />} />
            <Route path="admin/competencias/:id" element={<CompetenciaDetailPage />} />
            {/* Catálogo deportivo scopeado a la competencia */}
            <Route path="admin/competencias/:id/equipos"           element={<EquiposAdminPage />} />
            <Route path="admin/competencias/:id/partidos"          element={<PartidosAdminPage />} />
            <Route path="admin/competencias/:id/terceros"          element={<TercerosPage />} />
            <Route path="admin/competencias/:id/posiciones-grupos" element={<PosicionesGruposPage />} />
            <Route path="admin/competencias/:id/combinaciones"     element={<CombinacionesPage />} />
            <Route path="admin/competencias/:id/resultauto"        element={<ResultAutoPage />} />
            <Route path="admin/resultados-v2" element={<AdminResultadosV2Page />} />

            {/* Admin */}
            <Route path="admin/usuarios"    element={<UsuariosPage />} />
            <Route path="admin/resultados"  element={<ResultadosPage />} />
            <Route path="admin/config"      element={<ConfigPage />} />
            <Route path="admin/auditoria"   element={<AuditoriaPage />} />
            <Route path="admin/correos"           element={<CorreosPage />} />
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
