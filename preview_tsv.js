const fs = require('fs');
try {
    const content = fs.readFileSync('C:\\Users\\zadkiel\\Desktop\\micm_combustibles_nacional\\estaciones.tsv', 'utf16le');
    const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
    console.log(`Total lines: ${lines.length}`);
    console.log(lines.slice(0, 5).join('\n'));
} catch (e) {
    console.error(e);
}
