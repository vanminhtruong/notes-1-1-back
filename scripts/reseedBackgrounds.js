import { Background } from '../src/models/index.js';
import { getBackgroundColorsData, getBackgroundImagesData } from './backgroundsData.js';

async function reseedBackgrounds() {
  try {
    console.log('Clearing existing backgrounds...');
    await Background.destroy({ where: {}, truncate: true });
    console.log('✅ Cleared all backgrounds');

    const colors = getBackgroundColorsData();
    const images = getBackgroundImagesData();
    const allBackgrounds = [...colors, ...images];

    console.log(`Seeding ${allBackgrounds.length} backgrounds...`);

    await Background.bulkCreate(allBackgrounds, {
      ignoreDuplicates: true,
    });

    console.log('✅ Background reseeding completed successfully!');
    console.log(`Total: ${allBackgrounds.length} backgrounds (${colors.length} colors + ${images.length} images)`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error reseeding backgrounds:', error);
    process.exit(1);
  }
}

reseedBackgrounds();
