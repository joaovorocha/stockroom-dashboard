const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

/**
 * Compress and optimize an image file
 * @param {string} inputPath - Path to the original image
 * @param {object} options - Compression options
 * @param {number} options.maxWidth - Maximum width in pixels (default: 1920)
 * @param {number} options.maxHeight - Maximum height in pixels (default: 1920)
 * @param {number} options.quality - JPEG/WebP quality 1-100 (default: 80)
 * @param {string} options.format - Output format: 'jpeg', 'webp', or 'auto' (default: 'auto')
 * @returns {Promise<{path: string, originalSize: number, compressedSize: number, savings: string}>}
 */
async function compressImage(inputPath, options = {}) {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 80,
    format = 'auto'
  } = options;

  try {
    const originalStats = fs.statSync(inputPath);
    const originalSize = originalStats.size;

    // Read the image
    let image = sharp(inputPath);
    const metadata = await image.metadata();

    // Resize if image is larger than max dimensions (maintain aspect ratio)
    if (metadata.width > maxWidth || metadata.height > maxHeight) {
      image = image.resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true
      });
    }

    // Determine output format
    let outputFormat = format === 'auto' ? 'jpeg' : format;
    if (format === 'auto' && metadata.format === 'png' && metadata.hasAlpha) {
      // Keep PNG for images with transparency
      outputFormat = 'png';
    }

    // Apply format-specific compression
    if (outputFormat === 'jpeg' || outputFormat === 'jpg') {
      image = image.jpeg({ quality, mozjpeg: true });
    } else if (outputFormat === 'webp') {
      image = image.webp({ quality });
    } else if (outputFormat === 'png') {
      image = image.png({ compressionLevel: 9, quality });
    }

    // Generate output filename
    const ext = path.extname(inputPath);
    const outputPath = inputPath.replace(ext, `_compressed${ext}`);

    // Save compressed image
    await image.toFile(outputPath);

    // Get compressed file size
    const compressedStats = fs.statSync(outputPath);
    const compressedSize = compressedStats.size;

    // Replace original with compressed version
    fs.unlinkSync(inputPath);
    fs.renameSync(outputPath, inputPath);

    const savings = ((1 - compressedSize / originalSize) * 100).toFixed(1);

    return {
      path: inputPath,
      originalSize,
      compressedSize,
      savings: `${savings}%`
    };
  } catch (error) {
    console.error('Error compressing image:', error);
    // If compression fails, keep the original file
    return {
      path: inputPath,
      originalSize: fs.statSync(inputPath).size,
      compressedSize: fs.statSync(inputPath).size,
      savings: '0%',
      error: error.message
    };
  }
}

/**
 * Middleware for Express/Multer to automatically compress uploaded images
 * Use this after multer upload middleware
 */
function compressUploadedImages(options = {}) {
  return async (req, res, next) => {
    try {
      // Handle single file upload
      if (req.file) {
        const result = await compressImage(req.file.path, options);
        req.file.compressedSize = result.compressedSize;
        req.file.compressionSavings = result.savings;
      }

      // Handle multiple file uploads
      if (req.files && Array.isArray(req.files)) {
        for (const file of req.files) {
          const result = await compressImage(file.path, options);
          file.compressedSize = result.compressedSize;
          file.compressionSavings = result.savings;
        }
      }

      // Handle multiple file fields
      if (req.files && typeof req.files === 'object' && !Array.isArray(req.files)) {
        for (const fieldName in req.files) {
          const filesArray = req.files[fieldName];
          for (const file of filesArray) {
            const result = await compressImage(file.path, options);
            file.compressedSize = result.compressedSize;
            file.compressionSavings = result.savings;
          }
        }
      }

      next();
    } catch (error) {
      console.error('Error in image compression middleware:', error);
      // Don't fail the request if compression fails, just continue
      next();
    }
  };
}

module.exports = {
  compressImage,
  compressUploadedImages
};
