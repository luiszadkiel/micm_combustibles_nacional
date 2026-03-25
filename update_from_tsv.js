require('dotenv').config();
const fs = require('fs');
const db = require('./src/db');

async function main() {
    try {
        const content = fs.readFileSync('C:\\Users\\zadkiel\\Desktop\\micm_combustibles_nacional\\estaciones.tsv', 'utf16le');
        const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
        
        let updatedCount = 0;
        console.log(`Processing ${lines.length} lines from TSV...`);
        
        for (let i = 0; i < lines.length; i++) {
            const parts = lines[i].split('\t');
            if (parts.length >= 9) {
                let id = parts[0].replace(/"/g, '');
                let latText = parts[7].replace(/"/g, '');
                let lonText = parts[8].replace(/"/g, '');
                
                let lat = parseFloat(latText);
                let lon = parseFloat(lonText);
                
                if (!isNaN(lat) && !isNaN(lon)) {
                    const res = await db.query('UPDATE dim_estacion SET lat = $1, lon = $2 WHERE estacion_id = $3', [lat, lon, id]);
                    if (res.rowCount > 0) updatedCount++;
                }
            }
        }
        
        console.log(`Successfully updated ${updatedCount} stations in the database.`);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

main();
