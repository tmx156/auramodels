import React, { useEffect, useRef } from 'react';
import { FiPaperclip, FiImage, FiDownload } from 'react-icons/fi';

/**
 * GmailEmailRenderer - Renders HTML emails in a Gmail-like style
 * 
 * Features:
 * - Sanitizes HTML to prevent XSS attacks
 * - Handles embedded images and attachments
 * - Converts relative URLs to absolute
 * - Applies Gmail-like styling while preserving email formatting
 * - Falls back to plain text if no HTML available
 */

const GmailEmailRenderer = ({ 
  htmlContent, 
  textContent, 
  attachments = [], 
  embeddedImages = [],
  className = '' 
}) => {
  const iframeRef = useRef(null);

  // Sanitize HTML content to prevent XSS while preserving email formatting
  const sanitizeHtml = (html) => {
    if (!html) return '';

    // Create a DOM parser to work with the HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Remove dangerous tags and attributes
    const dangerousTags = ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'];
    dangerousTags.forEach(tag => {
      const elements = doc.getElementsByTagName(tag);
      while (elements.length > 0) {
        elements[0].remove();
      }
    });

    // Remove dangerous attributes from all elements
    const allElements = doc.getElementsByTagName('*');
    for (let i = 0; i < allElements.length; i++) {
      const element = allElements[i];
      const attributesToRemove = [];
      
      for (let j = 0; j < element.attributes.length; j++) {
        const attr = element.attributes[j];
        const attrName = attr.name.toLowerCase();
        
        // Remove event handlers and data attributes
        if (attrName.startsWith('on') || 
            attrName.startsWith('data-') ||
            (attrName === 'href' && attr.value.startsWith('javascript:')) ||
            (attrName === 'src' && attr.value.startsWith('javascript:'))) {
          attributesToRemove.push(attr.name);
        }
      }
      
      attributesToRemove.forEach(attr => element.removeAttribute(attr));
    }

    // Handle embedded images - replace cid: references with actual data
    const images = doc.getElementsByTagName('img');
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const src = img.getAttribute('src');
      
      if (src && src.startsWith('cid:')) {
        const cid = src.replace('cid:', '');
        const embeddedImage = embeddedImages.find(img => img.contentId === cid || img.contentId === `<${cid}>`);
        
        if (embeddedImage && embeddedImage.dataUrl) {
          img.setAttribute('src', embeddedImage.dataUrl);
        } else {
          // If we can't find the embedded image, show a placeholder
          img.style.display = 'none';
        }
      }
      
      // Ensure images don't overflow
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
    }

    // Convert relative URLs to absolute
    const links = doc.getElementsByTagName('a');
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const href = link.getAttribute('href');
      
      if (href && !href.startsWith('http') && !href.startsWith('mailto:') && !href.startsWith('#')) {
        link.setAttribute('href', 'https://' + href);
      }
      
      // Open links in new tab
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }

    return doc.body.innerHTML;
  };

  // Generate email styles that mimic Gmail
  const getEmailStyles = () => `
    * {
      box-sizing: border-box;
    }
    
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #202124;
      background-color: transparent;
    }
    
    /* Gmail-like typography */
    p {
      margin: 0 0 12px 0;
    }
    
    p:last-child {
      margin-bottom: 0;
    }
    
    /* Headings */
    h1, h2, h3, h4, h5, h6 {
      margin: 16px 0 8px 0;
      font-weight: 600;
      color: #202124;
    }
    
    h1 { font-size: 20px; }
    h2 { font-size: 18px; }
    h3 { font-size: 16px; }
    h4, h5, h6 { font-size: 14px; }
    
    /* Lists */
    ul, ol {
      margin: 8px 0;
      padding-left: 24px;
    }
    
    li {
      margin: 4px 0;
    }
    
    /* Links */
    a {
      color: #1a73e8;
      text-decoration: none;
    }
    
    a:hover {
      text-decoration: underline;
    }
    
    /* Images */
    img {
      max-width: 100%;
      height: auto;
      border: 0;
    }
    
    /* Tables */
    table {
      border-collapse: collapse;
      max-width: 100%;
    }
    
    td, th {
      padding: 8px;
      border: 1px solid #dadce0;
    }
    
    /* Blockquotes (for reply chains) */
    blockquote {
      margin: 8px 0;
      padding-left: 12px;
      border-left: 3px solid #dadce0;
      color: #5f6368;
    }
    
    /* Gmail quote style for forwarded/replied emails */
    .gmail_quote {
      margin: 8px 0;
      padding-left: 12px;
      border-left: 3px solid #dadce0;
    }
    
    /* Outlook quote style */
    div[style*="border-left"] {
      margin: 8px 0 !important;
    }
    
    /* Horizontal rules */
    hr {
      border: none;
      border-top: 1px solid #dadce0;
      margin: 16px 0;
    }
    
    /* Preformatted text */
    pre {
      background-color: #f8f9fa;
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 13px;
    }
    
    code {
      background-color: #f8f9fa;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 13px;
    }
    
    /* Common email template classes */
    .signature {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #dadce0;
    }
    
    /* Hide any tracking pixels */
    img[width="1"][height="1"],
    img[width="0"][height="0"] {
      display: none;
    }
    
    /* Responsive embeds */
    iframe, video {
      max-width: 100%;
    }
  `;

  // Render content in iframe for isolation
  useEffect(() => {
    if (iframeRef.current && htmlContent) {
      const iframe = iframeRef.current;
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      
      const sanitizedHtml = sanitizeHtml(htmlContent);
      
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>${getEmailStyles()}</style>
          </head>
          <body>${sanitizedHtml}</body>
        </html>
      `);
      doc.close();
      
      // Auto-resize iframe to content
      const resizeIframe = () => {
        iframe.style.height = doc.body.scrollHeight + 'px';
      };
      
      resizeIframe();
      
      // Handle images loading
      const images = doc.getElementsByTagName('img');
      for (let img of images) {
        img.onload = resizeIframe;
      }
    }
  }, [htmlContent, embeddedImages]);

  // Format file size for display
  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 10) / 10 + ' ' + sizes[i];
  };

  // Determine if content is mostly HTML
  const isHtmlContent = (content) => {
    if (!content) return false;
    const htmlPattern = /<[a-z][\s\S]*>/i;
    return htmlPattern.test(content);
  };

  // If we have HTML content, render it in an iframe
  if (htmlContent && isHtmlContent(htmlContent)) {
    return (
      <div className={`gmail-email-renderer ${className}`}>
        <iframe
          ref={iframeRef}
          className="w-full border-0"
          style={{ minHeight: '100px' }}
          title="Email Content"
          sandbox="allow-same-origin allow-popups"
        />
        
        {/* Attachments section */}
        {attachments && attachments.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
              <FiPaperclip className="mr-2" />
              Attachments ({attachments.length})
            </h4>
            <div className="flex flex-wrap gap-2">
              {attachments.map((attachment, index) => (
                <a
                  key={index}
                  href={attachment.url || attachment.downloadUrl || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors"
                >
                  {attachment.contentType?.startsWith('image/') ? (
                    <FiImage className="mr-2 text-blue-500" />
                  ) : (
                    <FiPaperclip className="mr-2 text-gray-500" />
                  )}
                  <span className="truncate max-w-[150px]">
                    {attachment.filename || attachment.name || `Attachment ${index + 1}`}
                  </span>
                  {attachment.size && (
                    <span className="ml-2 text-xs text-gray-500">
                      ({formatFileSize(attachment.size)})
                    </span>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Fallback to plain text rendering with link detection
  const renderPlainText = (text) => {
    if (!text) return <p className="text-gray-500 italic">No content</p>;

    // URL regex pattern
    const urlPattern = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/g;
    
    // Split text by URLs and render
    const parts = text.split(urlPattern);
    const matches = text.match(urlPattern) || [];
    
    return (
      <div className="whitespace-pre-wrap break-words text-sm text-gray-900">
        {parts.map((part, index) => (
          <React.Fragment key={index}>
            {part}
            {matches[index] && (
              <a
                href={matches[index].startsWith('www.') ? `https://${matches[index]}` : matches[index]}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                {matches[index]}
              </a>
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  return (
    <div className={`gmail-email-renderer ${className}`}>
      {renderPlainText(textContent || htmlContent)}
      
      {/* Attachments section for plain text emails */}
      {attachments && attachments.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
            <FiPaperclip className="mr-2" />
            Attachments ({attachments.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {attachments.map((attachment, index) => (
              <a
                key={index}
                href={attachment.url || attachment.downloadUrl || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors"
              >
                <FiPaperclip className="mr-2 text-gray-500" />
                <span className="truncate max-w-[150px]">
                  {attachment.filename || attachment.name || `Attachment ${index + 1}`}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default GmailEmailRenderer;
