/**
 * EMAIL DISPLAY VALIDATOR
 * Validates email content before serving to UI to prevent display issues
 */

class EmailDisplayValidator {
    constructor() {
        this.validationRules = {
            // Content validation rules
            content: {
                minLength: 10,
                maxLength: 100000,
                allowedChars: /[\x20-\x7E\u00A0-\uFFFF]/,
                forbiddenPatterns: [
                    /^[A-Za-z0-9+/]+=*$/, // Base64 content
                    /=3D|=20|=0A/, // Quoted-printable
                    /<html|<body|<div/, // HTML tags
                    /Content-Type:|Content-Transfer-Encoding:|MIME-Version:/, // MIME headers
                    /Đ|Ñ|Ð/, // Garbled characters
                ]
            },
            
            // Subject validation rules
            subject: {
                minLength: 1,
                maxLength: 200,
                required: true
            },
            
            // From address validation rules
            from: {
                pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                required: true
            }
        };
    }

    /**
     * Validate email content for display issues
     * @param {string} content - Email content to validate
     * @returns {Object} Validation result
     */
    validateContent(content) {
        const issues = [];
        
        if (!content || typeof content !== 'string') {
            issues.push('CONTENT_MISSING_OR_INVALID_TYPE');
            return { isValid: false, issues, severity: 'HIGH' };
        }
        
        // Check length
        if (content.length < this.validationRules.content.minLength) {
            issues.push('CONTENT_TOO_SHORT');
        }
        
        if (content.length > this.validationRules.content.maxLength) {
            issues.push('CONTENT_TOO_LONG');
        }
        
        // Check for forbidden patterns
        for (const pattern of this.validationRules.content.forbiddenPatterns) {
            if (pattern.test(content)) {
                if (pattern.source.includes('A-Za-z0-9+/')) {
                    issues.push('BASE64_CONTENT_NOT_DECODED');
                } else if (pattern.source.includes('=3D|=')) {
                    issues.push('QUOTED_PRINTABLE_NOT_DECODED');
                } else if (pattern.source.includes('html|body|div')) {
                    issues.push('HTML_TAGS_NOT_STRIPPED');
                } else if (pattern.source.includes('Content-Type|MIME')) {
                    issues.push('MIME_HEADERS_NOT_REMOVED');
                } else if (pattern.source.includes('Đ|Ñ|Ð')) {
                    issues.push('GARBLED_CHARACTERS_ENCODING_ISSUE');
                }
            }
        }
        
        // Check for "No content available"
        if (content.trim() === 'No content available' || content.trim() === '') {
            issues.push('NO_CONTENT_AVAILABLE');
        }
        
        // Determine severity
        let severity = 'LOW';
        if (issues.includes('CONTENT_MISSING_OR_INVALID_TYPE') || 
            issues.includes('NO_CONTENT_AVAILABLE') ||
            issues.includes('GARBLED_CHARACTERS_ENCODING_ISSUE')) {
            severity = 'HIGH';
        } else if (issues.includes('BASE64_CONTENT_NOT_DECODED') || 
                   issues.includes('QUOTED_PRINTABLE_NOT_DECODED') ||
                   issues.includes('HTML_TAGS_NOT_STRIPPED')) {
            severity = 'MEDIUM';
        }
        
        return {
            isValid: issues.length === 0,
            issues,
            severity,
            contentLength: content.length,
            preview: content.substring(0, 200)
        };
    }

    /**
     * Validate complete email message
     * @param {Object} emailData - Email data to validate
     * @returns {Object} Complete validation result
     */
    validateEmail(emailData) {
        const validation = {
            messageId: emailData.id,
            subject: emailData.subject,
            from: emailData.recipient_email,
            timestamp: emailData.created_at,
            issues: [],
            isValid: true,
            severity: 'LOW',
            contentValidation: null
        };
        
        // Validate content
        if (emailData.content) {
            validation.contentValidation = this.validateContent(emailData.content);
            if (!validation.contentValidation.isValid) {
                validation.isValid = false;
                validation.issues.push(...validation.contentValidation.issues);
                validation.severity = validation.contentValidation.severity;
            }
        } else {
            validation.isValid = false;
            validation.issues.push('CONTENT_MISSING');
            validation.severity = 'HIGH';
        }
        
        // Validate subject
        if (!emailData.subject || emailData.subject.trim() === '') {
            validation.isValid = false;
            validation.issues.push('SUBJECT_MISSING');
            validation.severity = 'HIGH';
        } else if (emailData.subject.length > this.validationRules.subject.maxLength) {
            validation.isValid = false;
            validation.issues.push('SUBJECT_TOO_LONG');
            validation.severity = 'MEDIUM';
        }
        
        // Validate from address
        if (!emailData.recipient_email || !this.validationRules.from.pattern.test(emailData.recipient_email)) {
            validation.isValid = false;
            validation.issues.push('FROM_ADDRESS_INVALID');
            validation.severity = 'HIGH';
        }
        
        // Validate timestamp
        if (!emailData.created_at || isNaN(new Date(emailData.created_at).getTime())) {
            validation.isValid = false;
            validation.issues.push('TIMESTAMP_INVALID');
            validation.severity = 'MEDIUM';
        }
        
        return validation;
    }

    /**
     * Fix common content issues
     * @param {string} content - Content to fix
     * @returns {string} Fixed content
     */
    fixContent(content) {
        if (!content || typeof content !== 'string') {
            return 'Email content could not be processed. Please check the original email.';
        }
        
        let fixedContent = content;
        
        // Fix quoted-printable
        fixedContent = fixedContent.replace(/=3D/g, '=');
        fixedContent = fixedContent.replace(/=20/g, ' ');
        fixedContent = fixedContent.replace(/=0A/g, '\n');
        
        // Remove HTML tags
        fixedContent = fixedContent.replace(/<[^>]*>/g, '');
        
        // Remove MIME headers
        fixedContent = fixedContent.replace(/Content-Type:[^\n]*\n/g, '');
        fixedContent = fixedContent.replace(/Content-Transfer-Encoding:[^\n]*\n/g, '');
        fixedContent = fixedContent.replace(/MIME-Version:[^\n]*\n/g, '');
        
        // Fix common encoding issues
        fixedContent = fixedContent.replace(/Đ/g, 'D');
        fixedContent = fixedContent.replace(/Ñ/g, 'N');
        fixedContent = fixedContent.replace(/Ð/g, 'D');
        
        // Trim and clean up
        fixedContent = fixedContent.trim();
        
        // If content is still too short or problematic, provide fallback
        if (fixedContent.length < 10 || fixedContent === 'No content available') {
            return 'Email content requires manual review. Please check the original email for full content.';
        }
        
        return fixedContent;
    }

    /**
     * Log validation results
     * @param {Object} validation - Validation result to log
     */
    logValidation(validation) {
        if (!validation.isValid) {
            console.log(`❌ EMAIL DISPLAY VALIDATION FAILED - ID: ${validation.messageId}`);
            console.log(`   Subject: ${validation.subject}`);
            console.log(`   From: ${validation.from}`);
            console.log(`   Severity: ${validation.severity}`);
            console.log(`   Issues: ${validation.issues.join(', ')}`);
            if (validation.contentValidation) {
                console.log(`   Content Preview: ${validation.contentValidation.preview}...`);
            }
            console.log('');
        } else {
            console.log(`✅ EMAIL DISPLAY VALIDATION PASSED - ID: ${validation.messageId}`);
        }
    }
}

module.exports = EmailDisplayValidator;
