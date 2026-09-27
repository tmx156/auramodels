/**
 * Enhanced Gmail Email Content Extractor
 * Extracts HTML content, plain text, and embedded images from Gmail messages
 * Preserves formatting exactly as it appears in Gmail
 */

class GmailEmailExtractor {
  constructor(gmail, accountKey, supabaseStorage) {
    this.gmail = gmail;
    this.accountKey = accountKey;
    this.supabaseStorage = supabaseStorage;
  }

  /**
   * Decode base64url encoded data
   */
  decodeBase64Url(data) {
    if (!data) return '';
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if needed
    const pad = base64.length % 4;
    const paddedBase64 = pad ? base64 + '='.repeat(4 - pad) : base64;
    return Buffer.from(paddedBase64, 'base64').toString('utf8');
  }

  /**
   * Extract HTML and text content from Gmail message payload
   * Returns: { html: string, text: string, embeddedImages: array }
   */
  async extractEmailContent(message, messageId) {
    const payload = message.payload || message;
    let htmlContent = '';
    let textContent = '';
    const embeddedImages = [];

    // Extract from parts recursively
    if (payload.parts) {
      const result = await this.extractFromParts(payload.parts, messageId);
      htmlContent = result.html;
      textContent = result.text;
      embeddedImages.push(...result.embeddedImages);
    } else if (payload.body?.data) {
      // Single part message
      const decoded = this.decodeBase64Url(payload.body.data);
      if (payload.mimeType === 'text/html') {
        htmlContent = decoded;
        // Also create text version
        textContent = this.htmlToText(decoded);
      } else if (payload.mimeType === 'text/plain') {
        textContent = decoded;
      }
    }

    return {
      html: htmlContent,
      text: textContent || this.htmlToText(htmlContent),
      embeddedImages
    };
  }

  /**
   * Recursively extract content from message parts
   */
  async extractFromParts(parts, messageId) {
    let htmlContent = '';
    let textContent = '';
    const embeddedImages = [];

    if (!parts || !Array.isArray(parts)) {
      return { html: htmlContent, text: textContent, embeddedImages };
    }

    for (const part of parts) {
      // Handle nested parts
      if (part.parts) {
        const nested = await this.extractFromParts(part.parts, messageId);
        if (!htmlContent) htmlContent = nested.html;
        if (!textContent) textContent = nested.text;
        embeddedImages.push(...nested.embeddedImages);
      }

      const mimeType = part.mimeType || '';
      const bodyData = part.body?.data;
      const attachmentId = part.body?.attachmentId;

      // Extract HTML content
      if (mimeType === 'text/html' && bodyData && !attachmentId) {
        htmlContent = this.decodeBase64Url(bodyData);
      }

      // Extract plain text content
      if (mimeType === 'text/plain' && bodyData && !attachmentId) {
        textContent = this.decodeBase64Url(bodyData);
      }

      // Extract embedded images (CID images)
      if (mimeType.startsWith('image/') && attachmentId) {
        const headers = part.headers || [];
        const contentId = headers.find(h => h.name.toLowerCase() === 'content-id')?.value || '';
        const contentDisposition = headers.find(h => h.name.toLowerCase() === 'content-disposition')?.value || '';
        const filename = part.filename || headers.find(h => h.name.toLowerCase() === 'content-name')?.value || '';

        // Check if it's an embedded image (inline, not attachment)
        if (contentDisposition.toLowerCase().includes('inline') || contentId) {
          try {
            const embeddedImg = await this.extractEmbeddedImage(
              messageId,
              attachmentId,
              contentId,
              filename,
              mimeType,
              part.body?.size || 0
            );
            if (embeddedImg) {
              embeddedImages.push(embeddedImg);
            }
          } catch (error) {
            console.error(`⚠️ Error extracting embedded image: ${error.message}`);
          }
        }
      }
    }

    return { html: htmlContent, text: textContent, embeddedImages };
  }

  /**
   * Extract and upload embedded image (CID image)
   */
  async extractEmbeddedImage(messageId, attachmentId, contentId, filename, mimeType, size) {
    try {
      // Download attachment from Gmail
      const attachmentResponse = await this.gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: messageId,
        id: attachmentId
      });

      const attachmentData = attachmentResponse.data;
      const fileData = attachmentData.data;

      // Decode base64url
      const base64 = fileData.replace(/-/g, '+').replace(/_/g, '/');
      const pad = base64.length % 4;
      const paddedBase64 = pad ? base64 + '='.repeat(4 - pad) : base64;
      const buffer = Buffer.from(paddedBase64, 'base64');

      // Generate filename
      const cleanCid = contentId.replace(/[<>]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileExt = filename ? require('path').extname(filename) : this.getFileExtensionFromMimeType(mimeType);
      const uniqueFilename = `email-embedded-images/${messageId}/${cleanCid}${fileExt}`;

      // Save to temporary file
      const path = require('path');
      const fs = require('fs');
      const tempDir = path.join(__dirname, '../uploads/temp_email_attachments');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const tempFilePath = path.join(tempDir, `${Date.now()}_${cleanCid}${fileExt}`);
      fs.writeFileSync(tempFilePath, buffer);

      // Upload to Supabase Storage
      const uploadResult = await this.supabaseStorage.uploadFile(
        tempFilePath,
        uniqueFilename,
        mimeType
      );

      // Clean up temp file
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupError) {
        console.warn(`⚠️ Failed to clean up temp file:`, cleanupError.message);
      }

      if (uploadResult.success) {
        return {
          cid: contentId,
          url: uploadResult.url,
          filename: filename || `embedded_${cleanCid}${fileExt}`,
          mimetype: mimeType,
          size: size || buffer.length,
          gmail_attachment_id: attachmentId
        };
      }

      return null;
    } catch (error) {
      console.error(`❌ Error extracting embedded image:`, error.message);
      return null;
    }
  }

  /**
   * Get file extension from MIME type
   */
  getFileExtensionFromMimeType(mimeType) {
    const mimeToExt = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg'
    };
    return mimeToExt[mimeType] || '.jpg';
  }

  /**
   * Convert HTML to plain text (fallback)
   */
  htmlToText(html) {
    if (!html) return '';

    let text = html;

    // Remove style and script tags
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

    // Convert block elements to newlines
    text = text.replace(/<\/?(div|p|br|h[1-6]|li|tr)[^>]*>/gi, '\n');
    text = text.replace(/<\/td>/gi, '\t');

    // Remove all other HTML tags
    text = text.replace(/<[^>]+>/g, '');

    // Decode HTML entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/&apos;/g, "'");

    // Clean up whitespace
    text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/^\s+|\s+$/gm, '');

    return text.trim();
  }

  /**
   * Clean email body - remove quoted replies for text version only
   * HTML version should be preserved as-is for Gmail-style rendering
   */
  cleanEmailBody(body, isHtml = false) {
    if (!body) return '';

    // For HTML, return as-is (Gmail shows full email)
    if (isHtml) {
      return body;
    }

    // For text, remove quoted sections
    const lines = body.split(/\r?\n/);
    const customerLines = [];
    let foundCustomerContent = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Stop at quoted reply markers
      if (
        trimmed.match(/^On .+wrote:?/i) ||
        trimmed.match(/^From:.*Sent:.*To:/i) ||
        trimmed.match(/^----+ ?Original [Mm]essage ?----+/)
      ) {
        if (foundCustomerContent) break;
        continue;
      }

      // Stop at signature markers
      if (foundCustomerContent && (
        trimmed.match(/^Sent from/i) ||
        trimmed.match(/^Get Outlook/i) ||
        trimmed.match(/^(Regards|Kind regards|Best regards|Thanks|Thank you)[\s,]*$/i)
      )) {
        break;
      }

      // Add non-empty lines
      if (trimmed.length > 0) {
        customerLines.push(line);
        foundCustomerContent = true;
      }
    }

    let result = customerLines.join('\n');

    // Clean up extra whitespace
    result = result.replace(/\n{3,}/g, '\n\n');
    result = result.replace(/[ \t]+/g, ' ');
    result = result.trim();

    return result;
  }
}

module.exports = GmailEmailExtractor;

