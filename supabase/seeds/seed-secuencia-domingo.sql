-- Secuencia de email compartida "Entrega Domingo" (campaña).
-- Plantilla del equipo (vendedor_id null) → la ven todos los vendedores y, al
-- poner un lead de la campaña "Entrega Domingo" en secuencia, la app la sugiere.
-- Variables: {{empresa}} (nombre del cliente) y {{nombre}} (persona de contacto).
-- Idempotente: no la duplica si ya existe. Correr una vez en el SQL Editor.

do $$
declare sid uuid;
begin
  select id into sid from secuencias where nombre = 'Entrega Domingo' and vendedor_id is null limit 1;
  if sid is not null then
    raise notice 'La secuencia "Entrega Domingo" ya existe (%). No se crea de nuevo.', sid;
    return;
  end if;

  insert into secuencias (vendedor_id, nombre, objetivo, activo)
  values (null, 'Entrega Domingo', 'prospeccion', true)
  returning id into sid;

  insert into secuencia_pasos (secuencia_id, orden, dias_espera, asunto, cuerpo) values
  (sid, 1, 0,
   '{{empresa}}: ahora también entregamos los domingos 📦',
   E'Hola {{nombre}}, te escribo de Welivery.\n\n'
   'Vimos que {{empresa}} despacha los fines de semana, así que quería contarte una novedad: sumamos '
   'entrega los domingos en la Región Metropolitana. Cada vez más e-commerce usan el domingo para '
   'diferenciarse y acortar los tiempos de entrega justo cuando la mayoría no opera.\n\n'
   '¿Te sirve que te cuente cómo funciona y las tarifas? Coordinamos 15 minutos cuando te quede cómodo.\n\n'
   'Saludos,\nEquipo Welivery'),

  (sid, 2, 3,
   'El domingo es el día que tu competencia no entrega',
   E'Hola {{nombre}}, te dejo el dato concreto: habilitar el domingo suele subir la conversión de los '
   'pedidos del fin de semana (el cliente compra sabiendo que le llega al toque) y además descomprime '
   'el lunes.\n\n'
   'En Welivery ya lo tenemos andando en la RM, con entrega el mismo día para pedidos antes del corte. '
   'Si {{empresa}} ya opera el fin de semana, activarlo es directo.\n\n'
   '¿Lo vemos esta semana?\n\nSaludos,\nEquipo Welivery'),

  (sid, 3, 5,
   '¿Cerramos el domingo para {{empresa}}?',
   E'Hola {{nombre}}, no quiero ser insistente :). Si el domingo no es prioridad ahora, avisame y lo '
   'dejamos para más adelante.\n\n'
   'Si te interesa probarlo, coordinamos una prueba corta y lo medimos con tus propios pedidos. '
   '¿Te viene bien una llamada de 15 minutos?\n\n'
   '¡Gracias!\nEquipo Welivery');

  raise notice 'Secuencia "Entrega Domingo" creada (%).', sid;
end $$;
