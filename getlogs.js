const { execSync } = require('child_process');
const fs = require('fs');

try {
    execSync('docker logs backend > backend_err.log 2>&1');
    const logs = fs.readFileSync('backend_err.log', 'utf8');
    const lines = logs.split('\n');
    console.log(lines.slice(-30).join('\n'));
} catch (e) {
    console.log("Failed", e.message);
}
