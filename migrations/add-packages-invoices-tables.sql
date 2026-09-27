-- =====================================================
-- Migration: Add Packages, Invoices, and Selected Images Tables
-- =====================================================
-- This migration adds:
-- 1. packages table - Store package definitions and pricing
-- 2. invoices table - Store invoice data with payment and signature status
-- 3. selected_images table - Track which images client selected per purchase
-- =====================================================

-- Enable UUID extension (should already exist)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. PACKAGES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL, -- 'intro', 'silver', 'gold', 'platinum', 'starter', etc.
    type TEXT NOT NULL CHECK (type IN ('main', 'individual')),
    price NUMERIC(10,2) NOT NULL,
    vat_inclusive BOOLEAN DEFAULT TRUE,
    vat_rate NUMERIC(5,2) DEFAULT 20.00, -- UK VAT rate
    image_count INTEGER, -- NULL for unlimited (full shoot)
    includes JSONB, -- Array of included items: ["Digital Z-Card", "Project Influencer Guide"]
    total_value NUMERIC(10,2), -- Original value before discount (for display)
    description TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for packages
CREATE INDEX IF NOT EXISTS idx_packages_code ON packages(code);
CREATE INDEX IF NOT EXISTS idx_packages_type ON packages(type);
CREATE INDEX IF NOT EXISTS idx_packages_is_active ON packages(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_packages_display_order ON packages(display_order);

-- =====================================================
-- 2. INVOICES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number TEXT UNIQUE NOT NULL, -- ET-2025-0001 format
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Viewer who created

    -- Client info snapshot (in case lead data changes)
    client_name TEXT NOT NULL,
    client_email TEXT,
    client_phone TEXT,
    client_address TEXT,

    -- Invoice items stored as JSONB
    items JSONB NOT NULL DEFAULT '[]', -- [{package_id, code, name, price, quantity, type}]

    -- Pricing
    subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
    vat_rate NUMERIC(5,2) DEFAULT 20.00,
    vat_amount NUMERIC(10,2) DEFAULT 0,
    total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    currency TEXT DEFAULT 'GBP',

    -- Payment info
    payment_method TEXT CHECK (payment_method IN ('pdq', 'cash', 'bank_transfer', 'card', 'other')),
    auth_code TEXT, -- PDQ authorisation code
    payment_reference TEXT, -- Additional payment reference
    payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'partial', 'refunded', 'cancelled')),
    paid_at TIMESTAMPTZ,

    -- E-signature status
    signature_status TEXT DEFAULT 'pending' CHECK (signature_status IN ('pending', 'sent', 'viewed', 'signed', 'declined', 'expired')),
    signature_request_id TEXT, -- External signature service ID (DocuSign envelope ID, etc.)
    signature_url TEXT, -- URL for client to sign
    client_signature_data TEXT, -- Base64 signature image or signature data
    signed_at TIMESTAMPTZ,

    -- Document URLs
    pdf_url TEXT, -- Cloudinary URL of generated PDF
    signed_pdf_url TEXT, -- Cloudinary URL of signed PDF

    -- Notes
    notes TEXT,
    internal_notes TEXT, -- Staff-only notes

    -- Status
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'completed', 'cancelled', 'refunded')),
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for invoices
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_lead_id ON invoices(lead_id);
CREATE INDEX IF NOT EXISTS idx_invoices_sale_id ON invoices(sale_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON invoices(payment_status);
CREATE INDEX IF NOT EXISTS idx_invoices_signature_status ON invoices(signature_status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);

-- =====================================================
-- 3. SELECTED IMAGES TABLE
-- =====================================================
-- Note: photo_id has no foreign key - photos table may or may not exist.
-- This allows flexibility in setup order.
CREATE TABLE IF NOT EXISTS selected_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    photo_id UUID NOT NULL, -- No FK to photos - allows flexibility
    package_id UUID REFERENCES packages(id) ON DELETE SET NULL,
    selection_type TEXT,
    delivery_status TEXT DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'processing', 'delivered', 'failed')),
    delivered_at TIMESTAMPTZ,
    download_url TEXT,
    download_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for selected_images
CREATE INDEX IF NOT EXISTS idx_selected_images_invoice_id ON selected_images(invoice_id);
CREATE INDEX IF NOT EXISTS idx_selected_images_lead_id ON selected_images(lead_id);
CREATE INDEX IF NOT EXISTS idx_selected_images_photo_id ON selected_images(photo_id);
CREATE INDEX IF NOT EXISTS idx_selected_images_delivery_status ON selected_images(delivery_status);

-- Unique constraint to prevent duplicate selections
CREATE UNIQUE INDEX IF NOT EXISTS idx_selected_images_unique ON selected_images(invoice_id, photo_id);

-- =====================================================
-- 4. TRIGGERS FOR UPDATED_AT TIMESTAMPS
-- =====================================================

-- Packages trigger
DROP TRIGGER IF EXISTS update_packages_updated_at ON packages;
CREATE TRIGGER update_packages_updated_at
    BEFORE UPDATE ON packages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Invoices trigger
DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;
CREATE TRIGGER update_invoices_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE selected_images ENABLE ROW LEVEL SECURITY;

-- Packages: All authenticated users can view active packages
DROP POLICY IF EXISTS "Packages are viewable by authenticated users" ON packages;
CREATE POLICY "Packages are viewable by authenticated users" ON packages
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Packages are insertable by authenticated users" ON packages;
CREATE POLICY "Packages are insertable by authenticated users" ON packages
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Packages are updatable by authenticated users" ON packages;
CREATE POLICY "Packages are updatable by authenticated users" ON packages
    FOR UPDATE USING (true);

-- Invoices: All authenticated users can view/manage
DROP POLICY IF EXISTS "Invoices are viewable by authenticated users" ON invoices;
CREATE POLICY "Invoices are viewable by authenticated users" ON invoices
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Invoices are insertable by authenticated users" ON invoices;
CREATE POLICY "Invoices are insertable by authenticated users" ON invoices
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Invoices are updatable by authenticated users" ON invoices;
CREATE POLICY "Invoices are updatable by authenticated users" ON invoices
    FOR UPDATE USING (true);

-- Selected Images: All authenticated users can view/manage
DROP POLICY IF EXISTS "Selected images are viewable by authenticated users" ON selected_images;
CREATE POLICY "Selected images are viewable by authenticated users" ON selected_images
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Selected images are insertable by authenticated users" ON selected_images;
CREATE POLICY "Selected images are insertable by authenticated users" ON selected_images
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Selected images are updatable by authenticated users" ON selected_images;
CREATE POLICY "Selected images are updatable by authenticated users" ON selected_images
    FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Selected images are deletable by authenticated users" ON selected_images;
CREATE POLICY "Selected images are deletable by authenticated users" ON selected_images
    FOR DELETE USING (true);

-- =====================================================
-- 6. SEED DATA - DEFAULT PACKAGES
-- =====================================================

-- Insert main packages (inc VAT) - Values updated January 2026
INSERT INTO packages (name, code, type, price, vat_inclusive, image_count, includes, total_value, description, display_order) VALUES
(
    'INTRO',
    'intro',
    'main',
    840.00,
    true,
    10,
    '["10 images on USB Stick", "Project Influencer Guide"]',
    1199.00,
    'Perfect starter package with 10 professionally edited images',
    1
),
(
    'SILVER',
    'silver',
    'main',
    1200.00,
    true,
    NULL,
    '["Full shoot on USB Stick", "Digital Z-Card", "Project Influencer Guide", "3Lance Casting VIP membership"]',
    3100.00,
    'Complete package with full shoot and digital Z-Card',
    2
),
(
    'GOLD',
    'gold',
    'main',
    1800.00,
    true,
    NULL,
    '["Full shoot on USB Stick", "Digital Z-Card", "Online E-folio", "Project Influencer Guide", "3Lance Casting VIP membership"]',
    3600.00,
    'Premium package with online portfolio',
    3
),
(
    'PLATINUM',
    'platinum',
    'main',
    2400.00,
    true,
    NULL,
    '["Full shoot on USB Stick", "Digital Z-Card", "Online E-folio", "Project Influencer Guide", "3Lance Casting VIP Membership", "+1 more shoot inc all images on USB", "Video Intro"]',
    4800.00,
    'Ultimate package with video intro and additional shoot',
    4
)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    price = EXCLUDED.price,
    includes = EXCLUDED.includes,
    total_value = EXCLUDED.total_value,
    description = EXCLUDED.description,
    display_order = EXCLUDED.display_order;

-- Insert individual packages (+VAT)
INSERT INTO packages (name, code, type, price, vat_inclusive, image_count, includes, description, display_order) VALUES
(
    'Starter Package',
    'starter',
    'individual',
    299.00,
    false,
    5,
    '["5 professionally edited images"]',
    '5 hand-picked images from your shoot',
    10
),
(
    'Digital Z-Card',
    'zcard',
    'individual',
    199.00,
    false,
    NULL,
    '["Professional Digital Z-Card"]',
    'Industry-standard digital comp card',
    11
),
(
    'Full Shoot on USB',
    'full_usb',
    'individual',
    999.00,
    false,
    NULL,
    '["All images from shoot on USB stick"]',
    'Complete collection of all shoot images',
    12
),
(
    'Full Photoshoot + Model Intro Video',
    'full_video',
    'individual',
    1200.00,
    false,
    NULL,
    '["Full photoshoot", "Professional Model Intro Video"]',
    'Complete photoshoot with video introduction',
    13
),
(
    'Online eFolio',
    'efolio',
    'individual',
    499.00,
    false,
    NULL,
    '["Professional Online E-Portfolio"]',
    'Your own online portfolio website',
    14
),
(
    'Project Influencer',
    'influencer',
    'individual',
    399.00,
    false,
    NULL,
    '["Project Influencer Guide & Access"]',
    'Complete influencer guide and resources',
    15
)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    price = EXCLUDED.price,
    includes = EXCLUDED.includes,
    description = EXCLUDED.description,
    display_order = EXCLUDED.display_order;

-- =====================================================
-- 7. HELPER FUNCTION FOR INVOICE NUMBER GENERATION
-- =====================================================
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
    year_str TEXT;
    sequence_num INTEGER;
    invoice_num TEXT;
BEGIN
    year_str := TO_CHAR(NOW(), 'YYYY');

    -- Get the next sequence number for this year
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(invoice_number FROM 'ET-' || year_str || '-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO sequence_num
    FROM invoices
    WHERE invoice_number LIKE 'ET-' || year_str || '-%';

    -- Format: ET-2025-0001
    invoice_num := 'ET-' || year_str || '-' || LPAD(sequence_num::TEXT, 4, '0');

    RETURN invoice_num;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 8. COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE packages IS 'Package definitions with pricing for photography services';
COMMENT ON TABLE invoices IS 'Customer invoices with payment and signature tracking';
COMMENT ON TABLE selected_images IS 'Images selected by client as part of their package purchase';

COMMENT ON COLUMN packages.code IS 'Unique identifier code for the package (intro, silver, gold, platinum, starter, etc.)';
COMMENT ON COLUMN packages.type IS 'Package type: main (bundled) or individual (add-on)';
COMMENT ON COLUMN packages.vat_inclusive IS 'Whether the price includes VAT (main packages) or not (individual items)';
COMMENT ON COLUMN packages.image_count IS 'Number of images included, NULL for unlimited/full shoot';
COMMENT ON COLUMN packages.includes IS 'JSON array of included items/services';

COMMENT ON COLUMN invoices.invoice_number IS 'Unique invoice number in format ET-YYYY-NNNN';
COMMENT ON COLUMN invoices.items IS 'JSON array of invoice line items with package details';
COMMENT ON COLUMN invoices.auth_code IS 'PDQ machine authorisation code for card payments';
COMMENT ON COLUMN invoices.signature_status IS 'E-signature status: pending, sent, viewed, signed, declined, expired';
COMMENT ON COLUMN invoices.client_signature_data IS 'Base64 encoded signature image or signature data';

COMMENT ON COLUMN selected_images.selection_type IS 'How the image was selected: individual pick, starter pack, intro, or full_shoot';
COMMENT ON COLUMN selected_images.delivery_status IS 'Image delivery status to client';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
