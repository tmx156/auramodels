const express = require('express');
const { auth } = require('../middleware/auth');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const MessagingService = require('../utils/messagingService');
const emailAccountService = require('../utils/emailAccountService');

const router = express.Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey || config.supabase.anonKey);

function generateShareToken() {
  return crypto.randomBytes(16).toString('hex');
}

function buildGalleryEmailHTML(leadName, galleryUrl, photoCount) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f8f9fa;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f9fa;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#f97316,#fb923c);padding:40px 40px 30px;text-align:center;">
              <div style="font-size:36px;margin-bottom:12px;">📸</div>
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">Your Photos Are Ready</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 20px;color:#374151;font-size:16px;line-height:1.6;">
                Hi ${leadName},
              </p>
              <p style="margin:0 0 28px;color:#374151;font-size:16px;line-height:1.6;">
                We've selected <strong>${photoCount} photo${photoCount !== 1 ? 's' : ''}</strong> for you. Click the button below to view your gallery — no download or login needed, just open and browse.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 32px;">
                    <a href="${galleryUrl}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:12px;font-size:16px;font-weight:600;letter-spacing:0.3px;">
                      View Your Gallery
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 28px;word-break:break-all;">
                <a href="${galleryUrl}" style="color:#f97316;font-size:13px;text-decoration:underline;">${galleryUrl}</a>
              </p>

              <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />

              <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.5;">
                This link is private — only people with the link can view these photos. It won't expire, so you can come back to it any time.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;padding:24px 40px;text-align:center;border-top:1px solid #f3f4f6;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                Auralndn &mdash; Thank you for choosing us
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Create a shared gallery link and optionally email it (authenticated)
router.post('/', auth, async (req, res) => {
  try {
    const { sale_id, lead_id, photo_ids, send_email, gallery_url_prefix } = req.body;

    if (!sale_id || !photo_ids || !photo_ids.length) {
      return res.status(400).json({ message: 'sale_id and photo_ids are required' });
    }

    let token;
    let galleryId;

    // Check if a gallery already exists for this sale
    const { data: existing } = await supabase
      .from('shared_galleries')
      .select('id, token, email_sent')
      .eq('sale_id', sale_id)
      .single();

    let alreadyEmailed = false;

    if (existing) {
      await supabase
        .from('shared_galleries')
        .update({ photo_ids })
        .eq('id', existing.id);
      token = existing.token;
      galleryId = existing.id;
      alreadyEmailed = existing.email_sent === true;
    } else {
      token = generateShareToken();
      const { data, error } = await supabase
        .from('shared_galleries')
        .insert({
          token,
          sale_id,
          lead_id: lead_id || null,
          photo_ids,
          created_by: req.user.id
        })
        .select('id, token')
        .single();

      if (error) {
        console.error('Error creating shared gallery:', error);
        return res.status(500).json({ message: 'Failed to create shared gallery' });
      }
      token = data.token;
      galleryId = data.id;
    }

    // Send email if not already sent for this gallery
    let emailSent = false;
    if (send_email && lead_id && !alreadyEmailed) {
      try {
        const { data: lead } = await supabase
          .from('leads')
          .select('name, email')
          .eq('id', lead_id)
          .single();

        if (lead?.email) {
          const finalUrl = gallery_url_prefix ? `${gallery_url_prefix}${token}` : `${req.protocol}://${req.get('host')}/gallery/${token}`;
          const leadName = lead.name || 'there';
          const htmlBody = buildGalleryEmailHTML(leadName, finalUrl, photo_ids.length);

          const message = {
            id: uuidv4(),
            lead_id,
            recipient_email: lead.email,
            subject: 'Your Photo Gallery is Ready',
            email_body: htmlBody,
            type: 'email',
            sent_by: req.user.id,
            status: 'pending',
            created_at: new Date().toISOString()
          };

          let resolvedEmailAccount = 'primary';
          try {
            const resolution = await emailAccountService.resolveEmailAccount({
              userId: req.user?.id
            });
            if (resolution.type === 'database' && resolution.account) {
              resolvedEmailAccount = resolution.account;
            }
          } catch (resolveErr) {
            console.error('Email account resolution error:', resolveErr.message);
          }

          await MessagingService.sendEmail(message, resolvedEmailAccount);
          emailSent = true;
          await supabase
            .from('shared_galleries')
            .update({ email_sent: true })
            .eq('id', galleryId);
          console.log(`📧 Gallery email sent to ${lead.email} for sale ${sale_id}`);
        }
      } catch (emailErr) {
        console.error('Error sending gallery email:', emailErr);
      }
    }

    res.json({
      success: true,
      token,
      gallery_id: galleryId,
      email_sent: emailSent
    });
  } catch (error) {
    console.error('Error creating shared gallery:', error);
    res.status(500).json({ message: 'Error creating shared gallery', error: error.message });
  }
});

// Public endpoint - fetch gallery by token (NO auth)
router.get('/public/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const { data: gallery, error } = await supabase
      .from('shared_galleries')
      .select('*')
      .eq('token', token)
      .single();

    if (error || !gallery) {
      return res.status(404).json({ message: 'Gallery not found' });
    }

    const { data: photos } = await supabase
      .from('photos')
      .select('id, filename, cloudinary_url, cloudinary_secure_url, description')
      .in('id', gallery.photo_ids);

    let leadName = null;
    if (gallery.lead_id) {
      const { data: lead } = await supabase
        .from('leads')
        .select('name')
        .eq('id', gallery.lead_id)
        .single();
      leadName = lead?.name || null;
    }

    res.json({
      success: true,
      gallery: {
        id: gallery.id,
        lead_name: leadName,
        photos: photos || [],
        created_at: gallery.created_at
      }
    });
  } catch (error) {
    console.error('Error fetching shared gallery:', error);
    res.status(500).json({ message: 'Error fetching gallery', error: error.message });
  }
});

module.exports = router;
