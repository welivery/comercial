-- Secuencias de email (Etapa A: configuración, sin envío todavía) ────────────
-- Cada vendedor arma sus secuencias (varios mails con tiempos de espera) para
-- reactivar ex-clientes o prospectar. El envío real se agrega en la Etapa C.
-- Idempotente: se puede correr más de una vez.

create table if not exists secuencias (
  id          uuid primary key default gen_random_uuid(),
  vendedor_id uuid references vendedores(id) on delete cascade, -- null = plantilla compartida
  nombre      text not null,
  objetivo    text not null default 'reactivacion' check (objetivo in ('reactivacion','prospeccion','otro')),
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists secuencia_pasos (
  id           uuid primary key default gen_random_uuid(),
  secuencia_id uuid not null references secuencias(id) on delete cascade,
  orden        int  not null default 1,
  dias_espera  int  not null default 0, -- días desde la inscripción (paso 1) o desde el paso anterior
  asunto       text not null default '',
  cuerpo       text not null default '',
  activo       boolean not null default true
);
create index if not exists idx_pasos_secuencia on secuencia_pasos(secuencia_id, orden);

create table if not exists secuencia_inscripciones (
  id                  uuid primary key default gen_random_uuid(),
  secuencia_id        uuid not null references secuencias(id) on delete cascade,
  vendedor_id         uuid not null references vendedores(id) on delete cascade,
  lead_id             uuid references leads(id) on delete set null,
  destinatario_nombre text not null default '',
  destinatario_email  text not null default '',
  estado              text not null default 'activa' check (estado in ('activa','pausada','respondio','terminada','rebotada')),
  paso_actual         int  not null default 0, -- cuántos pasos ya se enviaron
  proximo_envio_at    timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists idx_insc_vendedor on secuencia_inscripciones(vendedor_id);

create table if not exists secuencia_envios (
  id            uuid primary key default gen_random_uuid(),
  inscripcion_id uuid not null references secuencia_inscripciones(id) on delete cascade,
  paso_id       uuid references secuencia_pasos(id) on delete set null,
  estado        text not null default 'enviado' check (estado in ('enviado','error','respondido')),
  message_id    text,
  error         text,
  created_at    timestamptz not null default now()
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table secuencias              enable row level security;
alter table secuencia_pasos         enable row level security;
alter table secuencia_inscripciones enable row level security;
alter table secuencia_envios        enable row level security;

-- secuencias: el vendedor ve las suyas + las plantillas compartidas; edita solo
-- las suyas. El admin ve/edita todo.
drop policy if exists "seq: ver" on secuencias;
create policy "seq: ver" on secuencias for select
  using (vendedor_id = current_vendedor_id() or vendedor_id is null or is_admin_ventas());
drop policy if exists "seq: crea" on secuencias;
create policy "seq: crea" on secuencias for insert
  with check (vendedor_id = current_vendedor_id() or is_admin_ventas());
drop policy if exists "seq: edita" on secuencias;
create policy "seq: edita" on secuencias for update
  using (vendedor_id = current_vendedor_id() or is_admin_ventas())
  with check (vendedor_id = current_vendedor_id() or is_admin_ventas());
drop policy if exists "seq: borra" on secuencias;
create policy "seq: borra" on secuencias for delete
  using (vendedor_id = current_vendedor_id() or is_admin_ventas());

-- pasos: heredan el permiso de su secuencia.
drop policy if exists "pasos: ver" on secuencia_pasos;
create policy "pasos: ver" on secuencia_pasos for select using (
  exists (select 1 from secuencias s where s.id = secuencia_pasos.secuencia_id
    and (s.vendedor_id = current_vendedor_id() or s.vendedor_id is null or is_admin_ventas())));
drop policy if exists "pasos: edita" on secuencia_pasos;
create policy "pasos: edita" on secuencia_pasos for all using (
  exists (select 1 from secuencias s where s.id = secuencia_pasos.secuencia_id
    and (s.vendedor_id = current_vendedor_id() or is_admin_ventas())))
  with check (
  exists (select 1 from secuencias s where s.id = secuencia_pasos.secuencia_id
    and (s.vendedor_id = current_vendedor_id() or is_admin_ventas())));

-- inscripciones: propias del vendedor (o admin).
drop policy if exists "insc: propio" on secuencia_inscripciones;
create policy "insc: propio" on secuencia_inscripciones for all
  using (vendedor_id = current_vendedor_id() or is_admin_ventas())
  with check (vendedor_id = current_vendedor_id() or is_admin_ventas());

-- envíos: heredan de la inscripción.
drop policy if exists "envios: propio" on secuencia_envios;
create policy "envios: propio" on secuencia_envios for all using (
  exists (select 1 from secuencia_inscripciones i where i.id = secuencia_envios.inscripcion_id
    and (i.vendedor_id = current_vendedor_id() or is_admin_ventas())))
  with check (
  exists (select 1 from secuencia_inscripciones i where i.id = secuencia_envios.inscripcion_id
    and (i.vendedor_id = current_vendedor_id() or is_admin_ventas())));

-- ── Plantillas sembradas (compartidas, vendedor_id null) ─────────────────────
insert into secuencias (id, vendedor_id, nombre, objetivo) values
  ('5e000000-0000-0000-0000-000000000001', null, 'Reactivación de ex-clientes', 'reactivacion'),
  ('5e000000-0000-0000-0000-000000000002', null, 'Prospección en frío', 'prospeccion')
on conflict (id) do nothing;

insert into secuencia_pasos (id, secuencia_id, orden, dias_espera, asunto, cuerpo) values
  ('5e000000-0000-0000-0000-0000000000a1', '5e000000-0000-0000-0000-000000000001', 1, 0,
   '{{empresa}}, nos encantaría volver a ayudarte con tus envíos',
   E'Hola {{nombre}},\n\nTe escribo de Welivery. Trabajamos juntos antes y quería saber cómo vienen hoy con la logística de {{empresa}}.\n\nMejoramos bastante los tiempos en regiones y sumamos tracking en tiempo real y fulfillment. Si te sirve, coordinamos 15 minutos y te muestro números concretos para tu operación.\n\n¿Te viene bien esta semana?\n\nSaludos,'),
  ('5e000000-0000-0000-0000-0000000000a2', '5e000000-0000-0000-0000-000000000001', 2, 3,
   'Una propuesta corta para {{empresa}}',
   E'Hola {{nombre}},\n\nTe dejo la idea en dos líneas: última milla en RM en 24-48h y opción de fulfillment para que no te ocupes del armado de pedidos.\n\n¿Lo vemos en una llamada corta?\n\nSaludos,'),
  ('5e000000-0000-0000-0000-0000000000a3', '5e000000-0000-0000-0000-000000000001', 3, 5,
   '¿Cierro el tema, {{nombre}}?',
   E'Hola {{nombre}},\n\nNo quiero insistir de más. Si hoy no es el momento, sin problema.\n\nSi te interesa ver números para {{empresa}}, respondé este mail y coordinamos. ¡Gracias!'),
  ('5e000000-0000-0000-0000-0000000000b1', '5e000000-0000-0000-0000-000000000002', 1, 0,
   'Envíos más rápidos para {{empresa}}',
   E'Hola {{nombre}},\n\nSoy de Welivery, hacemos última milla y fulfillment para e-commerce en Chile.\n\nAyudamos a tiendas como {{empresa}} a mejorar los tiempos de entrega (24-48h en RM) con tracking en tiempo real. ¿Te paso una cotización rápida?\n\nSaludos,'),
  ('5e000000-0000-0000-0000-0000000000b2', '5e000000-0000-0000-0000-000000000002', 2, 3,
   '¿Te sirve una comparación de costos?',
   E'Hola {{nombre}},\n\nPuedo armarte una comparación simple de costos y tiempos para {{empresa}} contra lo que usás hoy.\n\n¿Te interesa que te la mande?\n\nSaludos,'),
  ('5e000000-0000-0000-0000-0000000000b3', '5e000000-0000-0000-0000-000000000002', 3, 6,
   'Último toque, {{nombre}}',
   E'Hola {{nombre}},\n\nCierro el seguimiento por ahora. Si en algún momento querés revisar tu logística, respondé este mail y lo vemos.\n\n¡Éxitos con {{empresa}}!')
on conflict (id) do nothing;
