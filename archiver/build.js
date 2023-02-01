const file_system = require('fs');
const path = require('path');
const archiver = require('archiver');

const build_for = process.env.BUILD_FOR;
const manifest = file_system.readFileSync(path.join(__dirname, '../dist/manifest.json'), 'utf-8');
const manifestJSON = JSON.parse(manifest);
const outputDir = path.join(__dirname, `../versions/tbc2_${manifestJSON.version}-${build_for}.zip`);

console.log('[build] manifest version: ', manifestJSON.version)
console.log('[build] output dir: ', outputDir)

const output = file_system.createWriteStream(outputDir);
const archive = archiver('zip');

output.on('close', function () {
    console.log(archive.pointer() + ' total bytes');
    console.log('archiver has been finalized and the output file descriptor has closed.');
});

archive.on('error', function(err){
    throw err;
});

archive.pipe(output);

archive.directory('dist/', false);

archive.finalize();
