-- Welivery Ventas — Seed mínimo (config + contexto para la IA).
-- Vendedores y oportunidades se cargan tras crear usuarios en auth.users
-- (el trigger crea la fila en `vendedores`). Los datos de demo de la UI viven
-- en src/ventas/data/ hasta conectar Supabase.

insert into config_ventas (id, pais, umbral_estrategico) values (1, 'CL', 1000)
  on conflict (id) do nothing;

insert into contexto_ia (id, general) values (1,
  'Propuesta de valor: entregas 24-48h en RM y 48-72h en regiones, tracking en tiempo real y fulfillment opcional (almacenamiento + armado de pedidos).' || E'\n\n' ||
  'Diferenciales: mejor tiempo en regiones que couriers tradicionales; retiro sin costo en bodega del cliente desde 300 envíos/mes.' || E'\n\n' ||
  'Zonas fuertes: RM completa, Valparaíso, Concepción. Más débil: extremo norte y sur (subcontratado).' || E'\n\n' ||
  'Foco del trimestre: marcas reconocidas, e-commerce +1.000 envíos/mes y clientes que quieran fulfillment.'
) on conflict (id) do nothing;

insert into fuentes_ia (key, label, activa, orden) values
  ('base',        'Base de clientes (activos, ex, prospección)', true,  0),
  ('maps',        'Google Maps / negocios locales',              true,  1),
  ('web',         'Sitios web y redes sociales',                 true,  2),
  ('directorios', 'Directorios de e-commerce CL',                true,  3),
  ('resenas',     'Reseñas públicas (detectar dolor)',           false, 4)
  on conflict (key) do nothing;

insert into reglas_ia (tipo, texto, orden) values
  ('evitar',    'No sugerir ex-clientes dados de baja por deuda.',        0),
  ('evitar',    'No proponer clientes ya activos de otro vendedor.',      1),
  ('priorizar', 'Priorizar zonas fuertes (RM, Valparaíso, Concepción).',  2),
  ('priorizar', 'Reconquistar bajas por precio si mejoró su volumen.',    3)
  on conflict do nothing;
