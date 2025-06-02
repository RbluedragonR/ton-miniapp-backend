require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`ARIX Terminal Backend listening on port ${PORT}`);
  console.log(`TON Network: ${process.env.TON_NETWORK || 'not set'}`);
});
