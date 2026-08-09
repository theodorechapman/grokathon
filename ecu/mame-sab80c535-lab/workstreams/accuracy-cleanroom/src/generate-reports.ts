import { generateReports } from './report-writer.ts';

const result = generateReports();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
