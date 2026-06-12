-- ============================================================================
-- 02_RLS.SQL — PencaLes 2.0
-- Funciones helper de autorización + RLS + políticas + Storage.
-- Ejecutar DESPUÉS de 01_schema.sql
--
-- Todas las helper son SECURITY DEFINER + STABLE → bypasean RLS (evita recursión)
-- y usan auth.uid() del servidor.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- FUNCIONES HELPER
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true);
$$;

CREATE OR REPLACE FUNCTION is_tenant_admin(p_tenant UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT is_super_admin() OR EXISTS (
    SELECT 1 FROM tenant_roles
    WHERE tenant_id = p_tenant AND user_id = auth.uid() AND role = 'admin'
  );
$$;

-- admin O loader del tenant (admin siempre implica loader).
CREATE OR REPLACE FUNCTION is_tenant_loader(p_tenant UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT is_super_admin() OR EXISTS (
    SELECT 1 FROM tenant_roles
    WHERE tenant_id = p_tenant AND user_id = auth.uid() AND role IN ('admin', 'loader')
  );
$$;

-- ¿Puede cargar resultados de esta competencia? super-admin, o admin/loader de
-- algún tenant que tenga un Ten-Comp sobre esta competencia.
CREATE OR REPLACE FUNCTION can_load_results(p_competition UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT is_super_admin() OR EXISTS (
    SELECT 1
    FROM tenant_roles tr
    JOIN ten_comps tc ON tc.tenant_id = tr.tenant_id
    WHERE tr.user_id = auth.uid()
      AND tr.role IN ('admin', 'loader')
      AND tc.competition_id = p_competition
  );
$$;

-- Admin del Ten-Comp = admin del tenant dueño del Ten-Comp.
CREATE OR REPLACE FUNCTION is_ten_comp_admin(p_ten_comp UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT is_super_admin() OR EXISTS (
    SELECT 1 FROM ten_comps tc
    JOIN tenant_roles tr ON tr.tenant_id = tc.tenant_id
    WHERE tc.id = p_ten_comp AND tr.user_id = auth.uid() AND tr.role = 'admin'
  );
$$;

-- Miembro del Ten-Comp (cualquier estado: pending/approved/blocked).
CREATE OR REPLACE FUNCTION is_member(p_ten_comp UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM ten_comp_members
    WHERE ten_comp_id = p_ten_comp AND user_id = auth.uid()
      AND status <> 'blocked'
  );
$$;

CREATE OR REPLACE FUNCTION is_approved_member(p_ten_comp UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM ten_comp_members
    WHERE ten_comp_id = p_ten_comp AND user_id = auth.uid() AND status = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION is_subgrupo_member(p_subgrupo_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM subgrupo_members WHERE subgrupo_id = p_subgrupo_id AND user_id = auth.uid()
  );
$$;

-- ¿La competencia de este Ten-Comp ya comenzó? (algún partido con datetime <= now())
CREATE OR REPLACE FUNCTION ten_comp_started(p_ten_comp UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM matches m
    JOIN ten_comps tc ON tc.competition_id = m.competition_id
    WHERE tc.id = p_ten_comp AND m.match_datetime <= now()
  );
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- HABILITAR RLS
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE profiles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_roles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE advancement_engines       ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_bonus_types   ENABLE ROW LEVEL SECURITY;
ALTER TABLE phases                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE stadiums                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE knockout_slot_rules       ENABLE ROW LEVEL SECURITY;
ALTER TABLE combinaciones             ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_position_overrides  ENABLE ROW LEVEL SECURITY;
ALTER TABLE best_third_rank_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE ten_comps                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE ten_comp_scoring          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ten_comp_bonus_config     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ten_comp_members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_predictions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_points              ENABLE ROW LEVEL SECURITY;
ALTER TABLE subgrupos                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE subgrupo_members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions_audit         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_predictions_audit   ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_queue               ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════════════
-- PLATAFORMA
-- ════════════════════════════════════════════════════════════════════════════

-- profiles: lectura para autenticados; edición propia sin escalar flags; super-admin total.
CREATE POLICY "profiles_read_auth" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND is_super_admin = (SELECT is_super_admin FROM profiles WHERE id = auth.uid())
    AND is_active      = (SELECT is_active      FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "profiles_super_admin" ON profiles FOR ALL USING (is_super_admin());

-- tenants: nombre/logo no son sensibles → lectura autenticada; escritura super-admin.
-- El tenant-admin puede editar su propio tenant (logo, nombre).
CREATE POLICY "tenants_read_auth" ON tenants FOR SELECT TO authenticated USING (true);
CREATE POLICY "tenants_super_admin" ON tenants FOR ALL USING (is_super_admin());
CREATE POLICY "tenants_update_own_admin" ON tenants FOR UPDATE
  USING (is_tenant_admin(id)) WITH CHECK (is_tenant_admin(id));

-- tenant_roles: el usuario ve sus roles; el tenant-admin ve/gestiona los de su tenant.
CREATE POLICY "tenant_roles_read" ON tenant_roles FOR SELECT
  USING (user_id = auth.uid() OR is_tenant_admin(tenant_id));
CREATE POLICY "tenant_roles_super_admin" ON tenant_roles FOR ALL USING (is_super_admin());
-- El tenant-admin puede asignar/quitar SOLO cargadores (role='loader') de su tenant.
CREATE POLICY "tenant_roles_admin_manage_loaders" ON tenant_roles FOR ALL
  USING (is_tenant_admin(tenant_id) AND role = 'loader')
  WITH CHECK (is_tenant_admin(tenant_id) AND role = 'loader');

-- ════════════════════════════════════════════════════════════════════════════
-- CATÁLOGO — lectura pública (hechos deportivos); escritura super-admin,
-- resultados también por cargadores.
-- ════════════════════════════════════════════════════════════════════════════

CREATE POLICY "engines_read"  ON advancement_engines FOR SELECT USING (true);
CREATE POLICY "engines_admin" ON advancement_engines FOR ALL USING (is_super_admin());

CREATE POLICY "competitions_read"  ON competitions FOR SELECT USING (true);
CREATE POLICY "competitions_admin" ON competitions FOR ALL USING (is_super_admin());

CREATE POLICY "comp_bonus_read"  ON competition_bonus_types FOR SELECT USING (true);
CREATE POLICY "comp_bonus_admin" ON competition_bonus_types FOR ALL USING (is_super_admin());

CREATE POLICY "phases_read"  ON phases FOR SELECT USING (true);
CREATE POLICY "phases_admin" ON phases FOR ALL USING (is_super_admin());

CREATE POLICY "groups_read"  ON groups FOR SELECT USING (true);
CREATE POLICY "groups_admin" ON groups FOR ALL USING (is_super_admin());

CREATE POLICY "stadiums_read"  ON stadiums FOR SELECT USING (true);
CREATE POLICY "stadiums_admin" ON stadiums FOR ALL USING (is_super_admin());

CREATE POLICY "teams_read"  ON teams FOR SELECT USING (true);
CREATE POLICY "teams_admin" ON teams FOR ALL USING (is_super_admin());

CREATE POLICY "ksr_read"  ON knockout_slot_rules FOR SELECT USING (true);
CREATE POLICY "ksr_admin" ON knockout_slot_rules FOR ALL USING (is_super_admin());

CREATE POLICY "comb_read"  ON combinaciones FOR SELECT USING (true);
CREATE POLICY "comb_admin" ON combinaciones FOR ALL USING (is_super_admin());

-- matches: lectura pública; super-admin total; cargadores pueden UPDATE (resultados).
CREATE POLICY "matches_read"  ON matches FOR SELECT USING (true);
CREATE POLICY "matches_admin" ON matches FOR ALL USING (is_super_admin());
CREATE POLICY "matches_loader_update" ON matches FOR UPDATE
  USING (can_load_results(competition_id))
  WITH CHECK (can_load_results(competition_id));

-- overrides de posiciones: lectura pública; escritura cargadores (gestión de standings).
CREATE POLICY "gpo_read"  ON group_position_overrides FOR SELECT USING (true);
CREATE POLICY "gpo_write" ON group_position_overrides FOR ALL
  USING (can_load_results(competition_id)) WITH CHECK (can_load_results(competition_id));

CREATE POLICY "btro_read"  ON best_third_rank_overrides FOR SELECT USING (true);
CREATE POLICY "btro_write" ON best_third_rank_overrides FOR ALL
  USING (can_load_results(competition_id)) WITH CHECK (can_load_results(competition_id));

-- ════════════════════════════════════════════════════════════════════════════
-- TEN-COMPS Y PARTICIPACIÓN
-- ════════════════════════════════════════════════════════════════════════════

-- ten_comps: públicos visibles a todos; privados solo a miembros/admins.
CREATE POLICY "ten_comps_read" ON ten_comps FOR SELECT
  USING (visibility = 'public' OR is_member(id) OR is_ten_comp_admin(id));
CREATE POLICY "ten_comps_admin_manage" ON ten_comps FOR ALL
  USING (is_tenant_admin(tenant_id)) WITH CHECK (is_tenant_admin(tenant_id));

-- scoring y bonus_config: miembros leen; admin del Ten-Comp escribe.
CREATE POLICY "scoring_read" ON ten_comp_scoring FOR SELECT
  USING (is_member(ten_comp_id) OR is_ten_comp_admin(ten_comp_id)
         OR EXISTS (SELECT 1 FROM ten_comps tc WHERE tc.id = ten_comp_id AND tc.visibility = 'public'));
CREATE POLICY "scoring_write" ON ten_comp_scoring FOR ALL
  USING (is_ten_comp_admin(ten_comp_id)) WITH CHECK (is_ten_comp_admin(ten_comp_id));

CREATE POLICY "tcbonus_read" ON ten_comp_bonus_config FOR SELECT
  USING (is_member(ten_comp_id) OR is_ten_comp_admin(ten_comp_id)
         OR EXISTS (SELECT 1 FROM ten_comps tc WHERE tc.id = ten_comp_id AND tc.visibility = 'public'));
CREATE POLICY "tcbonus_write" ON ten_comp_bonus_config FOR ALL
  USING (is_ten_comp_admin(ten_comp_id)) WITH CHECK (is_ten_comp_admin(ten_comp_id));

-- ten_comp_members: miembros se ven entre sí; admin gestiona; uno puede salir.
-- El ALTA se hace vía RPC join_ten_comp() (SECURITY DEFINER) → sin política INSERT para usuarios.
CREATE POLICY "members_read" ON ten_comp_members FOR SELECT
  USING (user_id = auth.uid() OR is_member(ten_comp_id) OR is_ten_comp_admin(ten_comp_id));
CREATE POLICY "members_admin_manage" ON ten_comp_members FOR ALL
  USING (is_ten_comp_admin(ten_comp_id)) WITH CHECK (is_ten_comp_admin(ten_comp_id));
CREATE POLICY "members_leave_self" ON ten_comp_members FOR DELETE
  USING (user_id = auth.uid());

-- predictions: propia siempre; ajenas tras empezar el partido (mismo Ten-Comp, viewer aprobado).
CREATE POLICY "predictions_select" ON predictions FOR SELECT
  USING (
    auth.uid() = user_id
    OR (
      is_approved_member(ten_comp_id)
      AND EXISTS (SELECT 1 FROM matches m WHERE m.id = match_id AND m.match_datetime <= now())
    )
    OR is_ten_comp_admin(ten_comp_id)
  );
-- INSERT/UPDATE: miembro (pending o approved puede predecir), antes del partido, Ten-Comp abierto,
-- y el partido debe pertenecer a la competencia del Ten-Comp.
CREATE POLICY "predictions_insert" ON predictions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND is_member(ten_comp_id)
    AND EXISTS (
      SELECT 1 FROM matches m
      JOIN ten_comps tc ON tc.id = ten_comp_id
      WHERE m.id = match_id AND m.competition_id = tc.competition_id
        AND m.match_datetime > now() AND tc.status = 'open'
    )
  );
CREATE POLICY "predictions_update" ON predictions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND is_member(ten_comp_id)
    AND EXISTS (
      SELECT 1 FROM matches m
      JOIN ten_comps tc ON tc.id = ten_comp_id
      WHERE m.id = match_id AND m.competition_id = tc.competition_id
        AND m.match_datetime > now() AND tc.status = 'open'
    )
  );
CREATE POLICY "predictions_delete" ON predictions FOR DELETE
  USING (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM matches m WHERE m.id = match_id AND m.match_datetime > now())
  );
CREATE POLICY "predictions_admin" ON predictions FOR ALL USING (is_ten_comp_admin(ten_comp_id));

-- bonus_predictions: propias; bloqueadas cuando la competencia del Ten-Comp ya empezó.
CREATE POLICY "bonus_pred_read" ON bonus_predictions FOR SELECT
  USING (user_id = auth.uid() OR is_ten_comp_admin(ten_comp_id));
CREATE POLICY "bonus_pred_insert" ON bonus_predictions FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND is_member(ten_comp_id)
    AND EXISTS (SELECT 1 FROM ten_comps tc WHERE tc.id = ten_comp_id AND tc.bonus_enabled = true AND tc.status = 'open')
    AND NOT ten_comp_started(ten_comp_id)
  );
CREATE POLICY "bonus_pred_update" ON bonus_predictions FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM ten_comps tc WHERE tc.id = ten_comp_id AND tc.bonus_enabled = true AND tc.status = 'open')
    AND NOT ten_comp_started(ten_comp_id)
  );

-- bonus_points: usuario ve los suyos; admin del Ten-Comp ve todos. Escritura solo vía RPC.
CREATE POLICY "bonus_pts_read" ON bonus_points FOR SELECT
  USING (user_id = auth.uid() OR is_ten_comp_admin(ten_comp_id));
CREATE POLICY "bonus_pts_admin" ON bonus_points FOR ALL USING (is_ten_comp_admin(ten_comp_id));

-- subgrupos: privados dentro del Ten-Comp.
CREATE POLICY "subgrupos_read" ON subgrupos FOR SELECT
  USING (creator_id = auth.uid() OR is_subgrupo_member(id) OR is_ten_comp_admin(ten_comp_id));
CREATE POLICY "subgrupos_insert" ON subgrupos FOR INSERT
  WITH CHECK (auth.uid() = creator_id AND is_member(ten_comp_id));
CREATE POLICY "subgrupos_update_creator" ON subgrupos FOR UPDATE
  USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "subgrupos_admin" ON subgrupos FOR ALL USING (is_ten_comp_admin(ten_comp_id));
CREATE POLICY "subgrupos_delete_creator" ON subgrupos FOR DELETE USING (auth.uid() = creator_id);

CREATE POLICY "sgm_read" ON subgrupo_members FOR SELECT
  USING (user_id = auth.uid() OR is_subgrupo_member(subgrupo_id)
         OR EXISTS (SELECT 1 FROM subgrupos s WHERE s.id = subgrupo_id AND is_ten_comp_admin(s.ten_comp_id)));
CREATE POLICY "sgm_insert_creator" ON subgrupo_members FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM subgrupos WHERE id = subgrupo_id AND creator_id = auth.uid()));
CREATE POLICY "sgm_delete_self" ON subgrupo_members FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "sgm_delete_creator" ON subgrupo_members FOR DELETE
  USING (EXISTS (SELECT 1 FROM subgrupos WHERE id = subgrupo_id AND creator_id = auth.uid()));

-- audits: admin del Ten-Comp.
CREATE POLICY "pred_audit_read"  ON predictions_audit FOR SELECT USING (is_ten_comp_admin(ten_comp_id));
CREATE POLICY "bonus_audit_read" ON bonus_predictions_audit FOR SELECT USING (is_ten_comp_admin(ten_comp_id));

-- email_queue: admin del tenant.
CREATE POLICY "email_queue_admin" ON email_queue FOR ALL
  USING (tenant_id IS NOT NULL AND is_tenant_admin(tenant_id))
  WITH CHECK (tenant_id IS NOT NULL AND is_tenant_admin(tenant_id));

-- ════════════════════════════════════════════════════════════════════════════
-- STORAGE
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('logos',   'logos',   true, 2097152, ARRAY['image/jpeg','image/png','image/webp','image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "avatars_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "avatars_user_upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "avatars_user_update" ON storage.objects FOR UPDATE
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "avatars_user_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "logos_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'logos');
-- Subida de logos: solo super-admin (alta de tenants). Gestión vía panel.
CREATE POLICY "logos_admin_write" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'logos' AND is_super_admin());
CREATE POLICY "logos_admin_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'logos' AND is_super_admin());
CREATE POLICY "logos_admin_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'logos' AND is_super_admin());
