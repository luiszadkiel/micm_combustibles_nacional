const fs = require('fs');

const logPath = 'C:\\Users\\zadkiel\\.gemini\\antigravity\\brain\\b1b08825-6f1f-4673-a21b-85282efddbfa\\.system_generated\\logs\\overview.txt';

try {
  if (fs.existsSync(logPath)) {
    console.log("File exists! Reading...");
    const content = fs.readFileSync(logPath, 'utf8');
    
    // Extract lines that look like: "EST-XXXX"  ...
    const matches = content.match(/^"EST-\d{4}".+$/gm);
    
    if (matches && matches.length > 0) {
      console.log(`Found ${matches.length} stations in log.`);
      fs.writeFileSync('C:\\Users\\zadkiel\\Desktop\\micm_combustibles_nacional\\estaciones.tsv', matches.join('\n'), 'utf8');
      console.log('Saved to estaciones.tsv successfully!');
    } else {
      console.log('No stations found in the log file.');
    }
  } else {
    console.log("Log path does not exist: " + logPath);
  }
} catch (err) {
  console.error(err);
}
