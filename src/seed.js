import { seedDatabase } from './seed/seedData.js';

seedDatabase()
  .then(() => {
    console.log('[seed] Completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[seed] Failed:', error.message);
    process.exit(1);
  });
