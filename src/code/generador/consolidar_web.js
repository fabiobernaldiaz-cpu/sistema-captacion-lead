// @include common/util.js
// @include common/web.js
// Junta lo encontrado en inicio + contacto + aviso legal y elige el mejor email.
const base = $('Extraer datos de la web').item.json;
const htmlContacto = typeof $('Web: contacto').item.json.data === 'string' ? $('Web: contacto').item.json.data : '';
const htmlLegal = typeof $json.data === 'string' ? $json.data : '';
const bloqueados = $('Leer Bloqueados')
  .all()
  .map((i) => texto(i.json && i.json.valor).toLowerCase())
  .filter(Boolean);

const todos = [...(base.emails_home || []), ...extraerEmails(htmlContacto), ...extraerEmails(htmlLegal)];
const emails = ordenarEmails(todos, base.dominio).filter((e) => !estaBloqueado(e, bloqueados));

const rc = extraerRedes(htmlContacto);
const rh = base.redes_home || {};
const instagram = rh.instagram || rc.instagram || '';
const facebook = rh.facebook || rc.facebook || '';
const linkedin = rh.linkedin || rc.linkedin || '';

const { emails_home, redes_home, ...resto } = base;

return {
  json: {
    ...resto,
    email: emails[0] || '',
    emails_alternativos: emails.slice(1, 4).join(', '),
    instagram,
    facebook,
    linkedin,
    texto_contacto: htmlATexto(htmlContacto, 2000),
    tiene_canal: Boolean(emails[0] || instagram || facebook),
  },
};
