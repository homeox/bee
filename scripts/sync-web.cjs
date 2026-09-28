const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'www');
const assets = [
  'index.html', 'styles.css', 'tuning.js', 'version.js', 'game.js',
  'icon.svg', 'manifest.webmanifest', 'sw.js'
];

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const asset of assets) fs.copyFileSync(path.join(root, asset), path.join(output, asset));
console.log(`Synced ${assets.length} web assets to ${output}`);
