// Uso: node dump_exec.cjs <executionId>  → resumen por nodo de la ejecución
const { DatabaseSync } = require('node:sqlite');
const { parse } = require('flatted');
const db = new DatabaseSync(process.env.N8N_USER_FOLDER + '/.n8n/database.sqlite');
const id = Number(process.argv[2]);
const row = db.prepare('select e.status, d.data, d.workflowData from execution_entity e join execution_data d on d.executionId=e.id where e.id=?').get(id);
const data = parse(row.data);
const rd = data.resultData.runData;
console.log('status:', row.status, data.resultData.error ? 'ERROR: ' + data.resultData.error.message : '');
const order = data.resultData.lastNodeExecuted;
for (const [name, runs] of Object.entries(rd)) {
  for (const r of runs) {
    const outs = (r.data && r.data.main) || [];
    const counts = outs.map((o) => (o ? o.length : 0));
    const err = r.error ? ' ERROR: ' + r.error.message : '';
    console.log(`- ${name}: salidas ${JSON.stringify(counts)}${err}`);
    if (process.argv[3] && name === process.argv[3]) for (const o of outs) for (const it of o || []) console.log(JSON.stringify(it.json, null, 1).slice(0, 3000));
  }
}
console.log('último nodo:', order);
