const { execFile } = require('child_process');
const path = require('path');

const helper = path.join(__dirname, 'opower_helper.py');

const env = {
  ...process.env,
  OPOWER_USERNAME: process.env.OPOWER_USERNAME,
  OPOWER_PASSWORD: process.env.OPOWER_PASSWORD,
};

execFile(
  'python',
  [
    helper,
    '--login-file',
    path.join(__dirname, 'comed-login.json'),
    '--days',
    '2',
  ],
  {
    env,
    timeout: 120000,
  },
  (error, stdout, stderr) => {
    if (error) {
      console.error('Helper failed:', error.message);
      console.error(stderr);
      process.exit(1);
    }

    console.log('Python helper returned:');
    console.log(stdout);

    try {
      const data = JSON.parse(stdout);

      console.log('');
      console.log('JSON parsed successfully.');
      console.log('OK:', data.ok);
      console.log('Utility:', data.utility);
      console.log('Readings:', data.readings.length);

      if (data.readings.length) {
        console.log('Latest:', data.readings[data.readings.length - 1]);
      }
    } catch (err) {
      console.error('Invalid JSON:', err.message);
      process.exit(1);
    }
  }
);
