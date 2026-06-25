import { execFileSync } from 'child_process';

let data = '';
process.stdin.on('data', chunk => (data += chunk));
process.stdin.on('end', () => {
  const file = JSON.parse(data).tool_input?.file_path;
  if (!file) process.exit(0);
  try {
    execFileSync(process.execPath, ['node_modules/eslint/bin/eslint.js', file], { stdio: 'inherit' });
  } catch {
    process.exit(2);
  }
});