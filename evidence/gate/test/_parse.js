const fs = require('fs');
const raw = fs.readFileSync('/home/cleme/perso/claude-cockpit/.worktrees/t_2fe761e4/evidence/gate/test/claude-verdict.json','utf8');
const env = JSON.parse(raw);
console.log('is_error:', env.is_error, '| subtype:', env.subtype, '| terminal_reason:', env.terminal_reason, '| num_turns:', env.num_turns);
const r = env.result;
const m = r.match(/```json\s*\n([\s\S]*?)\n```/);
if (!m) { console.log('NO JSON FENCE FOUND'); console.log(r.slice(0,500)); process.exit(1); }
const v = JSON.parse(m[1]);
fs.writeFileSync('/home/cleme/perso/claude-cockpit/.worktrees/t_2fe761e4/evidence/gate/test/verdict-parsed.json', JSON.stringify(v,null,2));
console.log('=== VERDICT ===');
console.log(JSON.stringify(v,null,2));