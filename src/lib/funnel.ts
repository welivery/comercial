// Reglas del embudo de prospección. Defaults sensatos; en F4 pasan a ser
// configurables por el admin (por país).

// Reciclado por falta de respuesta: si un lead acumula >= MIN_CONTACTOS contactos
// SIN respuesta dentro de VENTANA_DIAS, el sistema sugiere reagendarlo o descartarlo.
export const RECICLAR_MIN_CONTACTOS = 5
export const RECICLAR_VENTANA_DIAS = 15
// Opciones de reagenda (en meses) que se ofrecen al reciclar.
export const RECICLAR_MESES = [1, 2, 3]
