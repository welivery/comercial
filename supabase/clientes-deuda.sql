-- Marca de deuda / problema de pago en la base de clientes.
-- Un cliente con deuda queda FUERA de la prospección automática (no se genera
-- como lead ni entra a secuencias), pero sigue visible y contactable a mano.
-- Correr una vez en el SQL Editor.

alter table clientes add column if not exists deuda      boolean not null default false;
alter table clientes add column if not exists deuda_nota text;

create index if not exists idx_clientes_deuda on clientes(deuda) where deuda;
