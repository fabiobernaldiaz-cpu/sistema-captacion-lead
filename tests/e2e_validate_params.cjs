// Valida los parámetros de cada nodo con el validador del propio n8n.
// Uso (desde una carpeta con `npm i n8n`): node e2e_validate_params.cjs n8n/workflow_*.json
const path = require('path');
const fs = require('fs');
const { NodeHelpers } = require('n8n-workflow');
const base = path.join(__dirname, 'node_modules/n8n-nodes-base');
const pkg = require(path.join(base, 'package.json'));
const typeMap = {};
for (const p of pkg.n8n.nodes) {
  const name = path.basename(p).replace('.node.js', '');
  typeMap['n8n-nodes-base.' + name.charAt(0).toLowerCase() + name.slice(1)] = path.join(base, p);
}
function loadType(type, version) {
  const file = typeMap[type];
  if (!file) throw new Error('tipo desconocido ' + type);
  const mod = require(file);
  const Cls = Object.values(mod).find((v) => typeof v === 'function');
  const inst = new Cls();
  if (inst.nodeVersions) {
    const v = inst.nodeVersions[version];
    if (!v) throw new Error(`${type}: versión ${version} no existe (hay ${Object.keys(inst.nodeVersions)})`);
    return v.description;
  }
  const versions = [].concat(inst.description.version);
  if (!versions.includes(version)) throw new Error(`${type}: versión ${version} no soportada (${versions})`);
  return inst.description;
}
let problems = 0;
for (const f of process.argv.slice(2)) {
  const wf = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const node of wf.nodes) {
    if (node.type === 'n8n-nodes-base.stickyNote') continue;
    let desc;
    try { desc = loadType(node.type, node.typeVersion); if (desc.polling && !desc.properties.some((p) => p.name === "pollTimes")) desc.properties.unshift(...require("n8n-core/dist/nodes-loader/constants.js").commonPollingParameters); } catch (e) { console.log('X', path.basename(f), node.name, e.message); problems++; continue; }
    const params = NodeHelpers.getNodeParameters(desc.properties, node.parameters, true, false, node, desc);
    const issues = NodeHelpers.getNodeParametersIssues(desc.properties, { ...node, parameters: params }, desc);
    // parámetros que n8n no reconoce (descartados al cargar)
    const known = NodeHelpers.getNodeParameters(desc.properties, node.parameters, false, false, node, desc) || {};
    const unknown = Object.keys(node.parameters).filter((k) => !(k in known) && !(k in params));
    // credenciales esperadas
    const credTypes = (desc.credentials || []).filter((c) => {
      if (!c.displayOptions) return true;
      return NodeHelpers.displayParameter(params, c, node, desc);
    }).map((c) => c.name);
    const missingCred = credTypes.filter((c) => !(node.credentials || {})[c]);
    const genericCred = node.parameters.genericAuthType && !(node.credentials || {})[node.parameters.genericAuthType];
    if (issues || unknown.length || missingCred.length || genericCred) {
      problems++;
      console.log('!', path.basename(f), '|', node.name, JSON.stringify({ issues, unknown, missingCred, genericCred }));
    }
  }
  console.log('checked', path.basename(f), wf.nodes.length, 'nodes');
}
console.log(problems ? `PROBLEMAS: ${problems}` : 'SIN PROBLEMAS');
