import React, { useState, useEffect } from 'react';
import { FiDownload, FiImage, FiFile, FiExternalLink } from 'react-icons/fi';
import DOMPurify from 'dompurify';

/**
 * Gmail-style Email Renderer
 * Renders HTML emails exactly as they appear in Gmail, including:
 * - HTML formatting
 * - Embedded images (CID images)
 * - Attachments
 * - Safe HTML sanitization
 */
const GmailEmailRenderer = ({ 
  htmlContent, 
  textContent, 
  attachments = [], 
  embeddedImages = [],
  className = ''
}) => {
  const [sanitizedHtml, setSanitizedHtml] = useState('');
  const [imageErrors, setImageErrors] = useState(new Set());
  const [expandedAttachments, setExpandedAttachments] = useState({});

  useEffect(() => {
    if (!htmlContent && !textContent) {
      setSanitizedHtml('');
      return;
    }

    let html = htmlContent || '';

    // If no HTML but we have text, convert to HTML
    if (!html && textContent) {
      html = textContent
        .split('\n')
        .map(line => {
          // Preserve whitespace
          if (!line.trim()) return '<br />';
          // Escape HTML entities
          return `<p>${escapeHtml(line)}</p>`;
        })
        .join('');
    }

    // Replace CID (Content-ID) image references with embedded image URLs
    if (embeddedImages && embeddedImages.length > 0) {
      embeddedImages.forEach(img => {
        if (img.cid && img.url) {
          // Replace CID references in various formats
          const cidPatterns = [
            new RegExp(`cid:${escapeRegex(img.cid)}`, 'gi'),
            new RegExp(`cid:${escapeRegex(img.cid.replace(/[<>]/g, ''))}`, 'gi'),
            new RegExp(`"${escapeRegex(img.cid)}"`, 'gi'),
            new RegExp(`'${escapeRegex(img.cid)}'`, 'gi')
          ];

          cidPatterns.forEach(pattern => {
            html = html.replace(pattern, img.url);
          });
        }
      });
    }

    // Replace relative image URLs with absolute URLs if needed
    html = html.replace(/src=["']([^"']+)["']/gi, (match, url) => {
      // If it's already an absolute URL, keep it
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
        return match;
      }
      // If it's a CID reference that wasn't replaced, try to find in embedded images
      if (url.startsWith('cid:')) {
        const cid = url.replace('cid:', '').replace(/[<>]/g, '');
        const embeddedImg = embeddedImages.find(img => 
          img.cid && (img.cid.includes(cid) || cid.includes(img.cid))
        );
        if (embeddedImg && embeddedImg.url) {
          return `src="${embeddedImg.url}"`;
        }
      }
      return match;
    });

    // Sanitize HTML to prevent XSS attacks while preserving formatting
    const cleanHtml = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p', 'br', 'div', 'span', 'a', 'img', 'strong', 'em', 'b', 'i', 'u',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote',
        'table', 'thead', 'tbody', 'tr', 'td', 'th', 'hr', 'pre', 'code'
      ],
      ALLOWED_ATTR: [
        'href', 'src', 'alt', 'title', 'class', 'style', 'width', 'height',
        'target', 'rel', 'align', 'valign', 'colspan', 'rowspan'
      ],
      ALLOW_DATA_ATTR: false,
      KEEP_CONTENT: true,
      // Allow style attributes but sanitize them
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
    });

    setSanitizedHtml(cleanHtml);
  }, [htmlContent, textContent, embeddedImages]);

  const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  const escapeRegex = (str) => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };


  const handleImageError = (cid) => {
    setImageErrors(prev => new Set([...prev, cid]));
  };

  const isImageAttachment = (attachment) => {
    return attachment.mimetype && attachment.mimetype.startsWith('image/');
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleAttachmentClick = (attachment, e) => {
    e.preventDefault();
    if (attachment.url) {
      window.open(attachment.url, '_blank', 'noopener,noreferrer');
    }
  };

  const toggleAttachmentPreview = (attachmentId) => {
    setExpandedAttachments(prev => ({
      ...prev,
      [attachmentId]: !prev[attachmentId]
    }));
  };

  if (!sanitizedHtml && !textContent) {
    return (
      <div className={`text-gray-500 italic ${className}`}>
        No content available
      </div>
    );
  }

  return (
    <div className={`gmail-email-renderer ${className}`}>
      {/* Email HTML Content */}
      <div
        className="email-html-content prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          fontSize: '14px',
          lineHeight: '1.6',
          color: '#202124'
        }}
      />

      {/* Embedded Images Display */}
      {embeddedImages && embeddedImages.length > 0 && (
        <div className="mt-4 space-y-2">
          {embeddedImages.map((img, idx) => (
            !imageErrors.has(img.cid) && (
              <div key={idx} className="inline-block mr-2 mb-2">
                <img
                  src={img.url}
                  alt={img.filename || 'Embedded image'}
                  className="max-w-full h-auto rounded border border-gray-200"
                  style={{ maxHeight: '400px' }}
                  onError={() => handleImageError(img.cid)}
                />
              </div>
            )
          ))}
        </div>
      )}

      {/* Attachments */}
      {attachments && attachments.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="flex items-center mb-3">
            <FiFile className="h-4 w-4 text-gray-500 mr-2" />
            <span className="text-sm font-medium text-gray-700">
              {attachments.length} Attachment{attachments.length !== 1 ? 's' : ''}
            </span>
          </div>
          
          <div className="space-y-2">
            {attachments.map((attachment, idx) => (
              <div
                key={idx}
                className="border border-gray-200 rounded-lg overflow-hidden bg-white hover:bg-gray-50 transition-colors"
              >
                <div className="p-3 flex items-center justify-between">
                  <div className="flex items-center flex-1 min-w-0">
                    {isImageAttachment(attachment) ? (
                      <FiImage className="h-5 w-5 text-blue-500 flex-shrink-0 mr-3" />
                    ) : (
                      <FiFile className="h-5 w-5 text-gray-400 flex-shrink-0 mr-3" />
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {attachment.filename || `Attachment ${idx + 1}`}
                      </p>
                      {attachment.size && (
                        <p className="text-xs text-gray-500">
                          {formatFileSize(attachment.size)}
                          {attachment.mimetype && ` • ${attachment.mimetype}`}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2 ml-3">
                    {/* Preview toggle for images */}
                    {isImageAttachment(attachment) && attachment.url && (
                      <button
                        onClick={() => toggleAttachmentPreview(attachment.filename || idx)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Preview image"
                      >
                        <FiImage className="h-4 w-4" />
                      </button>
                    )}
                    
                    {/* Download/Open button */}
                    {attachment.url && (
                      <a
                        href={attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => handleAttachmentClick(attachment, e)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title={isImageAttachment(attachment) ? 'Open image' : 'Download file'}
                      >
                        {isImageAttachment(attachment) ? (
                          <FiExternalLink className="h-4 w-4" />
                        ) : (
                          <FiDownload className="h-4 w-4" />
                        )}
                      </a>
                    )}
                  </div>
                </div>
                
                {/* Image preview */}
                {isImageAttachment(attachment) && 
                 attachment.url && 
                 expandedAttachments[attachment.filename || idx] && (
                  <div className="border-t border-gray-200 p-3 bg-gray-50">
                    <img
                      src={attachment.url}
                      alt={attachment.filename || 'Attachment'}
                      className="max-w-full h-auto rounded"
                      style={{ maxHeight: '500px' }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom Styles for Gmail-like rendering */}
      <style>{`
        .gmail-email-renderer .email-html-content {
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        
        .gmail-email-renderer .email-html-content img {
          max-width: 100%;
          height: auto;
          border-radius: 4px;
          margin: 8px 0;
        }
        
        .gmail-email-renderer .email-html-content a {
          color: #1a73e8;
          text-decoration: none;
        }
        
        .gmail-email-renderer .email-html-content a:hover {
          text-decoration: underline;
        }
        
        .gmail-email-renderer .email-html-content table {
          border-collapse: collapse;
          width: 100%;
          margin: 8px 0;
        }
        
        .gmail-email-renderer .email-html-content table td,
        .gmail-email-renderer .email-html-content table th {
          padding: 8px;
          border: 1px solid #ddd;
        }
        
        .gmail-email-renderer .email-html-content blockquote {
          border-left: 4px solid #ddd;
          padding-left: 12px;
          margin: 8px 0;
          color: #666;
        }
        
        .gmail-email-renderer .email-html-content pre {
          background: #f5f5f5;
          padding: 12px;
          border-radius: 4px;
          overflow-x: auto;
        }
      `}</style>
    </div>
  );
};

export default GmailEmailRenderer;

