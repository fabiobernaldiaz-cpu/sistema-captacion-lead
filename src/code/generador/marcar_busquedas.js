// @include common/util.js
// Prepara la actualización de la pestaña Busquedas (fecha y contador).
const ahora = ahoraMadrid();
return $('Elegir búsquedas')
  .all()
  .map((i) => ({
    json: {
      id: i.json.id,
      ultima_ejecucion: ahora,
      veces_ejecutada: (Number(i.json.veces_ejecutada) || 0) + 1,
    },
  }));
