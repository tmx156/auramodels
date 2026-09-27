const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const path = require('path');
const crypto = require('crypto');

// Initialize S3 Client
const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET || 'your-photos-bucket';

/**
 * Generate a unique filename for S3
 */
function generateUniqueFilename(originalFilename) {
    const ext = path.extname(originalFilename);
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(8).toString('hex');
    return `${timestamp}-${randomString}${ext}`;
}

/**
 * Upload a file to S3
 * @param {Buffer} fileBuffer - The file buffer
 * @param {string} originalFilename - Original filename
 * @param {string} folder - Folder path (e.g., 'leads/uuid')
 * @param {string} contentType - MIME type
 * @returns {Object} Upload result with URL and key
 */
async function uploadToS3(fileBuffer, originalFilename, folder, contentType) {
    const filename = generateUniqueFilename(originalFilename);
    const key = folder ? `${folder}/${filename}` : filename;

    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType
        // Note: Public access is controlled via bucket policy, not ACL
    });

    await s3Client.send(command);

    // Return the public URL
    const url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;

    return {
        url,
        key,
        bucket: BUCKET_NAME,
        filename
    };
}

/**
 * Upload a base64 encoded file to S3
 * @param {string} base64Data - Base64 encoded file data
 * @param {string} folder - Folder path
 * @param {string} filenamePrefix - Prefix for the filename
 * @returns {Object} Upload result
 */
async function uploadBase64ToS3(base64Data, folder, filenamePrefix = 'file') {
    // Extract content type and data from base64 string
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);

    if (!matches || matches.length !== 3) {
        throw new Error('Invalid base64 string');
    }

    const contentType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');

    // Determine extension from content type
    const extMap = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'video/mp4': '.mp4',
        'video/quicktime': '.mov',
        'application/pdf': '.pdf'
    };

    const ext = extMap[contentType] || '.bin';
    const filename = `${filenamePrefix}-${Date.now()}${ext}`;

    return uploadToS3(buffer, filename, folder, contentType);
}

/**
 * Delete a file from S3
 * @param {string} key - The S3 object key
 */
async function deleteFromS3(key) {
    const command = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key
    });

    await s3Client.send(command);
    return { success: true, key };
}

/**
 * Generate a presigned URL for direct upload from browser
 * @param {string} filename - The filename to upload
 * @param {string} folder - Folder path
 * @param {string} contentType - MIME type
 * @param {number} expiresIn - URL expiry in seconds (default 5 minutes)
 */
async function getPresignedUploadUrl(filename, folder, contentType, expiresIn = 300) {
    const uniqueFilename = generateUniqueFilename(filename);
    const key = folder ? `${folder}/${uniqueFilename}` : uniqueFilename;

    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: contentType
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });

    return {
        uploadUrl: signedUrl,
        key,
        publicUrl: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'eu-west-2'}.amazonaws.com/${key}`
    };
}

/**
 * Generate a presigned URL for private file access
 * @param {string} key - The S3 object key
 * @param {number} expiresIn - URL expiry in seconds (default 1 hour)
 */
async function getPresignedDownloadUrl(key, expiresIn = 3600) {
    const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key
    });

    return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Extract S3 key from a full S3 URL
 */
function getKeyFromUrl(url) {
    try {
        const urlObj = new URL(url);
        // Remove leading slash
        return urlObj.pathname.substring(1);
    } catch (e) {
        return null;
    }
}

module.exports = {
    s3Client,
    uploadToS3,
    uploadBase64ToS3,
    deleteFromS3,
    getPresignedUploadUrl,
    getPresignedDownloadUrl,
    getKeyFromUrl,
    BUCKET_NAME
};
