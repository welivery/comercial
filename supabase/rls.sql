-- Welivery Comercial — Row Level Security.
-- Dos roles: admin (gerencia comercial) ve y edita todo; vendedor ve/gestiona
-- SOLO sus oportunidades y objetivos, y la base/contexto en lectura.

-- ─────────────────────── Helpers (sin recursión) ───────────────────────
-- vendedor_id del usuario logueado (enlazado por user_id).
create or replace function current_vendedor_id()
returns uuid
language sql stable security definer set search_path = public
as $$ select id from public.vendedores where user_id = auth.uid(); $$;

create or replace function current_rol_ventas()
returns rol_ventas
language sql stable security definer set search_path = public
as $$ select rol from public.vendedores where user_id = auth.uid(); $$;

create or replace function is_admin_ventas()
returns boolean language sql stable
as $$ select current_rol_ventas() = 'admin'; $$;

-- Habilitar RLS
alter table config_ventas        enable row level security;
alter table vendedores           enable row level security;
alter table objetivos            enable row level security;
alter table oportunidades        enable row level security;
alter table oportunidad_eventos  enable row level security;
alter table clientes             enable row level security;
alter table contexto_ia          enable row level security;
alter table fuentes_ia           enable row level security;
alter table reglas_ia            enable row level security;
alter table contexto_vendedor    enable row level security;

-- config_ventas: staff lee; admin edita.
create policy "config: staff lee" on config_ventas for select using (auth.uid() is not null);
create policy "config: admin edita" on config_ventas for all using (is_admin_ventas()) with check (is_admin_ventas());

-- vendedores: staff autenticado lee todos (el vendedor necesita ver el equipo en
-- algunos lugares; los datos sensibles se acotan por tabla). Admin gestiona.
create policy "vend: staff lee" on vendedores for select using (auth.uid() is not null);
create policy "vend: admin gestiona" on vendedores for all using (is_admin_ventas()) with check (is_admin_ventas());
-- El vendedor puede actualizar su propia ficha (nombre/zona), no su rol.
create policy "vend: edita propia" on vendedores for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- objetivos: el vendedor ve el suyo; admin ve/edita todos.
create policy "obj: propio o admin" on objetivos for select
  using (vendedor_id = current_vendedor_id() or is_admin_ventas());
create policy "obj: admin edita" on objetivos for all
  using (is_admin_ventas()) with check (is_admin_ventas());

-- oportunidades: el vendedor gestiona las suyas; admin ve/gestiona todas.
create policy "op: propias select" on oportunidades for select
  using (vendedor_id = current_vendedor_id() or is_admin_ventas());
create policy "op: propias insert" on oportunidades for insert
  with check (vendedor_id = current_vendedor_id() or is_admin_ventas());
create policy "op: propias update" on oportunidades for update
  using (vendedor_id = current_vendedor_id() or is_admin_ventas())
  with check (vendedor_id = current_vendedor_id() or is_admin_ventas());
create policy "op: admin delete" on oportunidades for delete using (is_admin_ventas());

-- eventos: visibles/insertables si la oportunidad es del vendedor o es admin.
create policy "evt: ver" on oportunidad_eventos for select using (
  is_admin_ventas() or exists (
    select 1 from oportunidades o
    where o.id = oportunidad_eventos.oportunidad_id and o.vendedor_id = current_vendedor_id()));
create policy "evt: agregar" on oportunidad_eventos for insert with check (
  is_admin_ventas() or exists (
    select 1 from oportunidades o
    where o.id = oportunidad_eventos.oportunidad_id and o.vendedor_id = current_vendedor_id()));

-- clientes: todo el equipo lee (insumo de leads); admin gestiona.
create policy "cli: staff lee" on clientes for select using (auth.uid() is not null);
create policy "cli: admin gestiona" on clientes for all using (is_admin_ventas()) with check (is_admin_ventas());

-- contexto IA: staff lee; admin edita.
create policy "ctx: staff lee" on contexto_ia for select using (auth.uid() is not null);
create policy "ctx: admin edita" on contexto_ia for all using (is_admin_ventas()) with check (is_admin_ventas());
create policy "fuentes: staff lee" on fuentes_ia for select using (auth.uid() is not null);
create policy "fuentes: admin edita" on fuentes_ia for all using (is_admin_ventas()) with check (is_admin_ventas());
create policy "reglas: staff lee" on reglas_ia for select using (auth.uid() is not null);
create policy "reglas: admin edita" on reglas_ia for all using (is_admin_ventas()) with check (is_admin_ventas());
create policy "ctxv: staff lee" on contexto_vendedor for select using (auth.uid() is not null);
create policy "ctxv: admin edita" on contexto_vendedor for all using (is_admin_ventas()) with check (is_admin_ventas());
