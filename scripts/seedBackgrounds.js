import { Background } from '../src/models/index.js';
import { getBackgroundColorsData, getBackgroundImagesData } from './backgroundsData.js';

async function seedBackgrounds() {
  try {
    console.log('Starting background seeding...');

    // Check if backgrounds already exist
    const count = await Background.count();
    if (count > 0) {
      console.log(`Backgrounds already seeded (${count} records found). Skipping...`);
      return;
    }

    const colors = getBackgroundColorsData();
    const images = getBackgroundImagesData();
    const allBackgrounds = [...colors, ...images];

    console.log(`Seeding ${allBackgrounds.length} backgrounds...`);

    await Background.bulkCreate(allBackgrounds, {
      ignoreDuplicates: true,
    });

    console.log('✅ Background seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding backgrounds:', error);
    process.exit(1);
  }
}

seedBackgrounds();
