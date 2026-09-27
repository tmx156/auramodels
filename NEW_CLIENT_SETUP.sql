-- NEW CLIENT DB SETUP: paste this whole file into the new project's SQL Editor and click Run.
-- Schema only - no data. Safe to re-run.

-- =====================================================================
-- Rebuild schema for migrated Supabase project
-- Generated 2026-06-18T21:55:51.455Z from OpenAPI introspection
-- Run this in the NEW project's SQL editor (or via psql).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- ---------- TABLES ----------

CREATE TABLE IF NOT EXISTS public."shared_galleries" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "token" text NOT NULL,
  "sale_id" uuid NOT NULL,
  "lead_id" uuid,
  "photo_ids" jsonb NOT NULL,
  "created_by" uuid,
  "created_at" timestamptz DEFAULT now(),
  "email_sent" boolean DEFAULT false,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."email_accounts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "client_id" text,
  "client_secret_encrypted" text,
  "refresh_token_encrypted" text,
  "redirect_uri" text,
  "display_name" text DEFAULT 'Auralndn',
  "is_active" boolean DEFAULT true,
  "is_default" boolean DEFAULT false,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."gmail_watch_state" (
  "account_key" text NOT NULL,
  "email_address" text NOT NULL,
  "history_id" text NOT NULL,
  "watch_expiration" timestamptz,
  "last_notification_received" timestamptz,
  "last_sync_completed" timestamptz,
  "is_active" boolean DEFAULT true,
  "error_count" integer DEFAULT 0,
  "last_error" text,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("account_key")
);

CREATE TABLE IF NOT EXISTS public."leads" (
  "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  "name" text NOT NULL,
  "phone" text,
  "email" text,
  "age" integer,
  "postcode" text,
  "image_url" text,
  "parent_phone" text,
  "notes" text,
  "status" text DEFAULT 'New' NOT NULL,
  "date_booked" timestamptz,
  "booked_at" timestamptz,
  "assigned_at" timestamptz,
  "time_booked" text,
  "is_confirmed" boolean DEFAULT false,
  "has_sale" integer DEFAULT 0,
  "ever_booked" boolean DEFAULT false,
  "booker_id" uuid,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "booking_history" jsonb,
  "deleted_at" timestamptz,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  "salesape_id" text,
  "salesape_qualified" boolean DEFAULT false,
  "salesape_conversation_id" text,
  "custom_fields" jsonb,
  "booking_status" text,
  "reschedule_reason" text,
  "cancellation_reason" text,
  "salesape_initial_message_sent" boolean DEFAULT false,
  "salesape_user_engaged" boolean DEFAULT false,
  "salesape_goal_presented" boolean DEFAULT false,
  "salesape_goal_hit" boolean DEFAULT false,
  "salesape_opted_out" boolean DEFAULT false,
  "salesape_follow_ups_ended" boolean DEFAULT false,
  "salesape_conversation_summary" text,
  "salesape_full_transcript" text,
  "salesape_conversation_url" text,
  "airtable_record_id" text,
  "salesape_record_id" text,
  "salesape_sent_at" timestamptz,
  "salesape_status" text,
  "salesape_portal_link" text,
  "salesape_last_updated" timestamptz,
  "booking_slot" integer DEFAULT 1,
  "salesape_error" text,
  "call_status" text,
  "gender" text,
  "booking_code" varchar,
  "stripe_payment_method_id" text,
  "stripe_customer_id" text,
  "is_double_confirmed" integer DEFAULT 0,
  "review_date" date,
  "review_time" varchar,
  "review_slot" integer,
  "date_of_birth" date,
  "height_inches" integer,
  "waist_inches" integer,
  "hips_inches" integer,
  "eye_color" varchar,
  "hair_color" varchar,
  "hair_length" varchar,
  "lead_source" text,
  "entry_date" timestamptz,
  "reject_reason" text,
  "rejected_at" timestamptz,
  "chest_inches" integer,
  "replydesk_sent_at" timestamptz,
  "replydesk_status" text,
  "replydesk_lead_id" text,
  "replydesk_lead_code" text,
  "replydesk_last_updated" timestamptz,
  "replydesk_conversation_summary" text,
  "replydesk_error" text,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."contract_templates" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar DEFAULT 'Default Contract' NOT NULL,
  "is_active" boolean DEFAULT true,
  "company_name" varchar DEFAULT 'AURALNDN',
  "company_website" varchar DEFAULT 'www.example.com',
  "company_address" varchar DEFAULT '129A Weedington Rd, London NW5 4NX',
  "form_title" varchar DEFAULT 'INVOICE & ORDER FORM',
  "form_subtitle" text DEFAULT 'PLEASE CHECK YOUR ORDER BEFORE LEAVING YOUR VIEWING',
  "form_contact_info" text DEFAULT 'FOR ALL ENQUIRIES PLEASE EMAIL CUSTOMER SERVICES ON SALES@EXAMPLE.COM',
  "terms_and_conditions" text DEFAULT 'By signing this invoice, you confirm that you have viewed, selected and approved all images and all cropping, editing and adjustments. You understand that all orders are final and due to the immediate nature of digital delivery this order is strictly non-refundable, non-cancellable and non-amendable once you leave the premises, without affecting your statutory rights. All digital products, including images, efolios and Z-cards and Project Influencer are delivered immediately upon full payment. Project Influencer has been added to this order as a complimentary addition to your purchased package and holds no independent monetary value. By signing you accept responsibility for downloading, backing up and securely storing your files once they are provided. Finance customers must complete all Ideal4Finance documentation prior to receipt of goods. Efolios include 10 images and hosting for 1 year, which may require renewal thereafter; content may be removed if renewal fees are unpaid. You own the copyright to all images purchased and unless you opt out in writing at the time of signing, Auralndn may use your images for promotional purposes (above) including, but not limited to, display on its website and social media channels. You acknowledge that Auralndn is not a talent casting company/agency and does not guarantee work, representation or casting opportunities. Auralndn accepts no liability for compatibility issues, loss of files after delivery, missed opportunities, or indirect losses and total liability is limited to the amount paid for your order. All personal data is processed in accordance with GDPR and used only to fulfil your order or meet legal requirements. By signing below, you acknowledge that you have read, understood and agree to these Terms & Conditions. For any post-delivery assistance, please contact sales@example.com',
  "signature_instruction" text DEFAULT 'PLEASE SIGN BELOW TO INDICATE YOUR ACCEPTANCE OF THE ABOVE TERMS, AND ENSURE YOU RECEIVE YOUR OWN SIGNED COPY OF THIS INVOICE FOR YOUR RECORDS',
  "footer_line1" varchar DEFAULT 'Auralndn is a trading name of S&A Advertising Ltd',
  "footer_line2" varchar DEFAULT 'Company No 8708429 VAT Reg No 171339904',
  "confirmation1_text" text DEFAULT 'I understand that Auralndn is <strong>not a talent casting company/agency and will not find me work.</strong>',
  "confirmation2_text" text DEFAULT 'I understand that once I leave the premises I <strong>cannot cancel</strong>, amend or reduce the order.',
  "confirmation3_text" text DEFAULT 'I confirm that I am happy for Auralndn to <strong>pass on details and photos</strong> of the client named on this order form. Talent Agencies we pass your details to typically charge between £50 - £200 to register onto their books',
  "confirmation4_text" text DEFAULT 'I confirm that I''''m happy and comfortable with my decision to purchase.',
  "image_permission_text" text DEFAULT 'I give permission for Auralndn to use my images',
  "image_no_permission_text" text DEFAULT 'I DO NOT give permission for Auralndn to use my images',
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  "created_by" uuid,
  "finance_payment_label" varchar DEFAULT 'DEPOSIT TODAY',
  "non_finance_payment_label" varchar DEFAULT 'PAYMENT TODAY',
  "finance_deposit_label" varchar DEFAULT 'DEPOSIT PAID',
  "finance_amount_label" varchar DEFAULT 'FINANCE AMOUNT',
  "finance_provider_text" varchar DEFAULT 'FINANCE VIA IDEAL4FINANCE',
  "finance_info_text" varchar DEFAULT 'Complete docs before receipt',
  "cash_initial_text" varchar DEFAULT 'Viewer must initial any cash received and sign here',
  "creditor_trading_as" text,
  "key_information_text" text,
  "customer_agreement_text" text,
  "creditor_acknowledgement_text" text,
  "cca_notice" text,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."selected_images" (
  "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  "invoice_id" uuid NOT NULL,
  "lead_id" uuid NOT NULL,
  "photo_id" uuid NOT NULL,
  "package_id" uuid,
  "selection_type" text,
  "delivery_status" text DEFAULT 'pending',
  "delivered_at" timestamptz,
  "download_url" text,
  "download_count" integer DEFAULT 0,
  "created_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."contracts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid,
  "package_id" uuid,
  "contract_token" text NOT NULL,
  "signing_url" text,
  "expires_at" timestamptz,
  "status" text DEFAULT 'draft',
  "sent_at" timestamptz,
  "sent_to_email" text,
  "viewed_at" timestamptz,
  "signed_at" timestamptz,
  "contract_data" jsonb,
  "signed_pdf_url" text,
  "created_by" uuid,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  "selected_photo_ids" uuid[],
  "selected_photo_count" integer DEFAULT 0,
  "contract_type" text DEFAULT 'invoice',
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."templates" (
  "id" text NOT NULL,
  "name" text NOT NULL,
  "type" text NOT NULL,
  "subject" text,
  "email_body" text,
  "sms_body" text,
  "category" text,
  "variables" jsonb,
  "reminder_days" integer,
  "send_email" boolean DEFAULT true,
  "send_sms" boolean DEFAULT false,
  "is_active" boolean DEFAULT true,
  "email_account" text DEFAULT 'primary',
  "user_id" uuid,
  "attachments" jsonb,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  "content" text,
  "is_default" boolean DEFAULT false,
  "created_by" uuid,
  "email_account_id" uuid,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."blocked_slots" (
  "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  "date" date NOT NULL,
  "time_slot" text,
  "slot_number" integer,
  "reason" text,
  "created_by" uuid,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."sales" (
  "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  "lead_id" uuid NOT NULL,
  "user_id" uuid,
  "amount" numeric NOT NULL,
  "payment_method" text,
  "payment_type" text,
  "payment_status" text,
  "status" text,
  "notes" text,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."invoices" (
  "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  "invoice_number" text NOT NULL,
  "lead_id" uuid NOT NULL,
  "sale_id" uuid,
  "user_id" uuid,
  "client_name" text NOT NULL,
  "client_email" text,
  "client_phone" text,
  "client_address" text,
  "items" jsonb NOT NULL,
  "subtotal" numeric DEFAULT 0 NOT NULL,
  "vat_rate" numeric DEFAULT 20,
  "vat_amount" numeric DEFAULT 0,
  "total_amount" numeric DEFAULT 0 NOT NULL,
  "currency" text DEFAULT 'GBP',
  "payment_method" text,
  "auth_code" text,
  "payment_reference" text,
  "payment_status" text DEFAULT 'pending',
  "paid_at" timestamptz,
  "signature_status" text DEFAULT 'pending',
  "signature_request_id" text,
  "signature_url" text,
  "client_signature_data" text,
  "signed_at" timestamptz,
  "pdf_url" text,
  "signed_pdf_url" text,
  "notes" text,
  "internal_notes" text,
  "status" text DEFAULT 'draft',
  "completed_at" timestamptz,
  "cancelled_at" timestamptz,
  "cancellation_reason" text,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."photos" (
  "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  "cloudinary_public_id" text NOT NULL,
  "cloudinary_url" text NOT NULL,
  "cloudinary_secure_url" text NOT NULL,
  "cloudinary_folder" text,
  "filename" text,
  "file_size" integer,
  "width" integer,
  "height" integer,
  "format" text,
  "mime_type" text,
  "lead_id" uuid,
  "photographer_id" uuid,
  "uploaded_by" uuid,
  "folder_path" text,
  "tags" text[],
  "description" text,
  "is_primary" boolean DEFAULT false,
  "is_approved" boolean DEFAULT false,
  "is_public" boolean DEFAULT false,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  "deleted_at" timestamptz,
  "storage_provider" text DEFAULT 'cloudinary',
  "s3_bucket" text,
  "s3_key" text,
  "resource_type" text DEFAULT 'image',
  "duration" numeric,
  "thumbnail_url" text,
  "media_type" text,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."lead_source_costs" (
  "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  "lead_source" text NOT NULL,
  "cost_per_lead" numeric,
  "total_spend" numeric,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "notes" text,
  "created_by" uuid,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."packages" (
  "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  "name" text NOT NULL,
  "code" text NOT NULL,
  "type" text NOT NULL,
  "price" numeric NOT NULL,
  "vat_inclusive" boolean DEFAULT true,
  "vat_rate" numeric DEFAULT 20,
  "image_count" integer,
  "includes" jsonb,
  "total_value" numeric,
  "description" text,
  "display_order" integer DEFAULT 0,
  "is_active" boolean DEFAULT true,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."messages" (
  "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  "lead_id" uuid NOT NULL,
  "template_id" text,
  "type" text NOT NULL,
  "subject" text,
  "content" text NOT NULL,
  "email_body" text,
  "sms_body" text,
  "recipient_email" text,
  "recipient_phone" text,
  "sent_by" uuid,
  "sent_by_name" text,
  "status" text DEFAULT 'sent',
  "email_status" text,
  "sms_status" text,
  "read" boolean DEFAULT false,
  "sent_at" timestamptz DEFAULT now(),
  "booking_date" timestamptz,
  "reminder_days" integer,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  "read_status" boolean DEFAULT false,
  "delivery_status" text DEFAULT 'sent',
  "provider_message_id" text,
  "delivery_provider" text,
  "delivery_attempts" integer DEFAULT 0,
  "gmail_message_id" text,
  "error_message" text,
  "gmail_account_key" text,
  "attachments" jsonb,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."callback_reminders" (
  "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  "lead_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "callback_time" timestamptz NOT NULL,
  "callback_note" text,
  "status" text DEFAULT 'pending',
  "notified_at" timestamptz,
  "completed_at" timestamptz,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."finance" (
  "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  "lead_id" uuid NOT NULL,
  "sale_id" uuid,
  "agreement_number" varchar NOT NULL,
  "total_amount" numeric NOT NULL,
  "deposit_amount" numeric DEFAULT 0,
  "monthly_payment" numeric NOT NULL,
  "payment_frequency" varchar DEFAULT 'monthly',
  "term_months" integer DEFAULT 12,
  "interest_rate" numeric DEFAULT 0,
  "start_date" date NOT NULL,
  "next_payment_date" date,
  "status" varchar DEFAULT 'active',
  "total_paid" numeric DEFAULT 0,
  "remaining_balance" numeric NOT NULL,
  "notes" text,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  "cash_price" numeric DEFAULT 0,
  "admin_fee" numeric DEFAULT 0,
  "apr" numeric DEFAULT 0,
  "total_charge_for_credit" numeric DEFAULT 0,
  "total_amount_payable" numeric DEFAULT 0,
  "customer_dob" text,
  "years_at_address" text,
  "monthly_income" numeric DEFAULT 0,
  "priority_outgoings" numeric DEFAULT 0,
  "other_outgoings" numeric DEFAULT 0,
  "disposable_balance" numeric DEFAULT 0,
  "agreed_instalment" numeric DEFAULT 0,
  "creditor_name" text,
  "creditor_date" text,
  "contract_id" text,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."users" (
  "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "password" text,
  "role" text NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  "is_active" boolean DEFAULT true,
  "leads_assigned" integer DEFAULT 0,
  "bookings_made" integer DEFAULT 0,
  "show_ups" integer DEFAULT 0,
  "password_hash" text,
  "assigned_email_account_id" text,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."processed_gmail_messages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "account_key" text NOT NULL,
  "gmail_message_id" text NOT NULL,
  "processed_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."daily_booker_performance" (
  "id" integer NOT NULL,
  "user_id" uuid,
  "booker_id" varchar,
  "performance_date" date NOT NULL,
  "leads_assigned" integer DEFAULT 0,
  "leads_contacted" integer DEFAULT 0,
  "leads_created" integer DEFAULT 0,
  "leads_booked" integer DEFAULT 0,
  "leads_confirmed" integer DEFAULT 0,
  "leads_attended" integer DEFAULT 0,
  "leads_cancelled" integer DEFAULT 0,
  "sales_made" integer DEFAULT 0,
  "total_sale_amount" numeric DEFAULT 0,
  "conversion_rate" numeric DEFAULT 0,
  "show_up_rate" numeric DEFAULT 0,
  "calls_made" integer DEFAULT 0,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

-- ---------- FOREIGN KEYS ----------

ALTER TABLE public."leads" ADD CONSTRAINT "leads_booker_id_fkey" FOREIGN KEY ("booker_id") REFERENCES public."users"("id") ON DELETE SET NULL;
ALTER TABLE public."leads" ADD CONSTRAINT "leads_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES public."users"("id") ON DELETE SET NULL;
ALTER TABLE public."leads" ADD CONSTRAINT "leads_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES public."users"("id") ON DELETE SET NULL;
ALTER TABLE public."selected_images" ADD CONSTRAINT "selected_images_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES public."invoices"("id") ON DELETE SET NULL;
ALTER TABLE public."selected_images" ADD CONSTRAINT "selected_images_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES public."leads"("id") ON DELETE SET NULL;
ALTER TABLE public."selected_images" ADD CONSTRAINT "selected_images_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES public."packages"("id") ON DELETE SET NULL;
ALTER TABLE public."contracts" ADD CONSTRAINT "contracts_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES public."leads"("id") ON DELETE SET NULL;
ALTER TABLE public."contracts" ADD CONSTRAINT "contracts_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES public."packages"("id") ON DELETE SET NULL;
ALTER TABLE public."contracts" ADD CONSTRAINT "contracts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES public."users"("id") ON DELETE SET NULL;
ALTER TABLE public."templates" ADD CONSTRAINT "templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES public."users"("id") ON DELETE SET NULL;
ALTER TABLE public."templates" ADD CONSTRAINT "templates_email_account_id_fkey" FOREIGN KEY ("email_account_id") REFERENCES public."email_accounts"("id") ON DELETE SET NULL;
ALTER TABLE public."blocked_slots" ADD CONSTRAINT "blocked_slots_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES public."users"("id") ON DELETE SET NULL;
ALTER TABLE public."sales" ADD CONSTRAINT "sales_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES public."leads"("id") ON DELETE SET NULL;
ALTER TABLE public."sales" ADD CONSTRAINT "sales_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES public."users"("id") ON DELETE SET NULL;
ALTER TABLE public."invoices" ADD CONSTRAINT "invoices_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES public."leads"("id") ON DELETE SET NULL;
ALTER TABLE public."invoices" ADD CONSTRAINT "invoices_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES public."sales"("id") ON DELETE SET NULL;
ALTER TABLE public."invoices" ADD CONSTRAINT "invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES public."users"("id") ON DELETE SET NULL;
ALTER TABLE public."photos" ADD CONSTRAINT "photos_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES public."leads"("id") ON DELETE SET NULL;
ALTER TABLE public."photos" ADD CONSTRAINT "photos_photographer_id_fkey" FOREIGN KEY ("photographer_id") REFERENCES public."users"("id") ON DELETE SET NULL;
ALTER TABLE public."photos" ADD CONSTRAINT "photos_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES public."users"("id") ON DELETE SET NULL;
ALTER TABLE public."lead_source_costs" ADD CONSTRAINT "lead_source_costs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES public."users"("id") ON DELETE SET NULL;
ALTER TABLE public."messages" ADD CONSTRAINT "messages_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES public."leads"("id") ON DELETE SET NULL;
ALTER TABLE public."messages" ADD CONSTRAINT "messages_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES public."templates"("id") ON DELETE SET NULL;
ALTER TABLE public."messages" ADD CONSTRAINT "messages_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES public."users"("id") ON DELETE SET NULL;
ALTER TABLE public."callback_reminders" ADD CONSTRAINT "callback_reminders_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES public."leads"("id") ON DELETE SET NULL;
ALTER TABLE public."callback_reminders" ADD CONSTRAINT "callback_reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES public."users"("id") ON DELETE SET NULL;
ALTER TABLE public."finance" ADD CONSTRAINT "finance_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES public."leads"("id") ON DELETE SET NULL;
ALTER TABLE public."finance" ADD CONSTRAINT "finance_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES public."sales"("id") ON DELETE SET NULL;


-- ====================== TRIGGER FUNCTIONS ======================
-- =====================================================
-- Migration: Fix Function Search Path Security Issues
-- =====================================================
-- Purpose: Add SET search_path to all functions to prevent
--          search path injection attacks (security best practice)
-- Date: 2025-01-XX
-- =====================================================

-- Fix 1: update_updated_at_column function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Fix 2: update_gmail_watch_state_updated_at function
CREATE OR REPLACE FUNCTION update_gmail_watch_state_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Fix 3: get_lead_stats function
CREATE OR REPLACE FUNCTION get_lead_stats(
  start_date timestamptz DEFAULT NULL,
  end_date timestamptz DEFAULT NULL,
  booker_user_id text DEFAULT NULL
)
RETURNS TABLE (
  total bigint,
  new_count bigint,
  booked_count bigint,
  attended_count bigint,
  cancelled_count bigint,
  assigned_count bigint,
  rejected_count bigint,
  callback_count bigint,
  no_answer_count bigint,
  not_interested_count bigint,
  wrong_number_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH filtered_leads AS (
    SELECT
      status
    FROM leads
    WHERE
      (start_date IS NULL OR created_at >= start_date)
      AND (end_date IS NULL OR created_at <= end_date)
      AND (booker_user_id IS NULL OR booker_id::text = booker_user_id)
      AND (postcode IS NULL OR postcode != 'ZZGHOST')  -- Exclude ghost bookings
  )
  SELECT
    COUNT(*)::bigint as total,
    COUNT(*) FILTER (WHERE status = 'New')::bigint as new_count,
    COUNT(*) FILTER (WHERE status = 'Booked')::bigint as booked_count,
    COUNT(*) FILTER (WHERE status = 'Attended')::bigint as attended_count,
    COUNT(*) FILTER (WHERE status = 'Cancelled')::bigint as cancelled_count,
    COUNT(*) FILTER (WHERE status = 'Assigned')::bigint as assigned_count,
    COUNT(*) FILTER (WHERE status = 'Rejected')::bigint as rejected_count,
    COUNT(*) FILTER (WHERE status = 'Call Back')::bigint as callback_count,
    COUNT(*) FILTER (WHERE status = 'No Answer')::bigint as no_answer_count,
    COUNT(*) FILTER (WHERE status = 'Not Interested')::bigint as not_interested_count,
    COUNT(*) FILTER (WHERE status = 'Wrong number')::bigint as wrong_number_count
  FROM filtered_leads;
END;
$$;

-- Fix 4: update_user_stats function (if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
    AND p.proname = 'update_user_stats'
  ) THEN
    -- Function exists, update it with search_path
    -- Note: We need to get the function signature first
    EXECUTE (
      SELECT 'CREATE OR REPLACE FUNCTION update_user_stats' || 
             pg_get_function_identity_arguments(p.oid) || ' ' ||
             'RETURNS ' || pg_get_function_result(p.oid) || ' ' ||
             'LANGUAGE ' || l.lanname || ' ' ||
             'SECURITY DEFINER ' ||
             'SET search_path = public ' ||
             'AS $func$' || pg_get_functiondef(p.oid) || '$func$'
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      JOIN pg_language l ON p.prolang = l.oid
      WHERE n.nspname = 'public' 
      AND p.proname = 'update_user_stats'
      LIMIT 1
    );
    RAISE NOTICE '✅ Fixed update_user_stats function';
  ELSE
    RAISE NOTICE '⚠️  update_user_stats function does not exist, skipping';
  END IF;
END $$;

-- Fix 5: ensure_message_content function (if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
    AND p.proname = 'ensure_message_content'
  ) THEN
    -- Function exists, update it with search_path
    EXECUTE (
      SELECT 'CREATE OR REPLACE FUNCTION ensure_message_content' || 
             pg_get_function_identity_arguments(p.oid) || ' ' ||
             'RETURNS ' || pg_get_function_result(p.oid) || ' ' ||
             'LANGUAGE ' || l.lanname || ' ' ||
             'SECURITY DEFINER ' ||
             'SET search_path = public ' ||
             'AS $func$' || pg_get_functiondef(p.oid) || '$func$'
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      JOIN pg_language l ON p.prolang = l.oid
      WHERE n.nspname = 'public' 
      AND p.proname = 'ensure_message_content'
      LIMIT 1
    );
    RAISE NOTICE '✅ Fixed ensure_message_content function';
  ELSE
    RAISE NOTICE '⚠️  ensure_message_content function does not exist, skipping';
  END IF;
END $$;

-- Verify all functions now have search_path set
DO $$
DECLARE
  func_record RECORD;
  func_count INTEGER := 0;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Function Search Path Status:';
  RAISE NOTICE '========================================';
  
  FOR func_record IN
    SELECT 
      p.proname as func_name,
      CASE 
        WHEN p.proconfig IS NULL THEN '❌ NO search_path'
        WHEN array_to_string(p.proconfig, ', ') LIKE '%search_path%' THEN '✅ HAS search_path'
        ELSE '❌ NO search_path'
      END as search_path_status
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'update_updated_at_column',
        'update_gmail_watch_state_updated_at',
        'get_lead_stats',
        'update_user_stats',
        'ensure_message_content'
      )
    ORDER BY p.proname
  LOOP
    RAISE NOTICE 'Function: % - %', func_record.func_name, func_record.search_path_status;
    IF func_record.search_path_status LIKE '%✅%' THEN
      func_count := func_count + 1;
    END IF;
  END LOOP;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Fixed: % out of 5 functions', func_count;
  RAISE NOTICE '========================================';
END $$;



-- ====================== get_lead_stats (latest) ======================
-- Migration: Update Assigned Counter Logic
-- Date: 2026-02-04
-- Description: Change the assigned_count logic to count all leads with booker_id,
--              not just leads with status = 'Assigned'
--              This ensures leads retain their "assigned" status even if they
--              move to "No Answer", "Call back", etc.

-- Drop existing function variants
DO $$ 
DECLARE
  func_record RECORD;
BEGIN
  FOR func_record IN 
    SELECT 
      p.proname as func_name,
      pg_get_function_identity_arguments(p.oid) as func_args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
      AND p.proname = 'get_lead_stats'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s) CASCADE', 
      'public', 
      func_record.func_name, 
      func_record.func_args
    );
    RAISE NOTICE 'Dropped function: get_lead_stats(%)', func_record.func_args;
  END LOOP;
END $$;

-- Create updated function with new assigned_count logic
CREATE OR REPLACE FUNCTION get_lead_stats(
  start_date timestamptz DEFAULT NULL,
  end_date timestamptz DEFAULT NULL,
  booker_user_id text DEFAULT NULL
)
RETURNS TABLE (
  total bigint,
  new_count bigint,
  booked_count bigint,
  attended_count bigint,
  cancelled_count bigint,
  assigned_count bigint,
  rejected_count bigint,
  callback_count bigint,
  no_answer_count bigint,
  not_interested_count bigint,
  wrong_number_count bigint
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH filtered_leads AS (
    SELECT
      status,
      booker_id
    FROM leads
    WHERE
      (start_date IS NULL OR created_at >= start_date)
      AND (end_date IS NULL OR created_at <= end_date)
      AND (booker_user_id IS NULL OR booker_id::text = booker_user_id)
      AND (postcode IS NULL OR postcode != 'ZZGHOST')
  )
  SELECT
    COUNT(*)::bigint as total,
    COUNT(*) FILTER (WHERE status = 'New')::bigint as new_count,
    COUNT(*) FILTER (WHERE status = 'Booked')::bigint as booked_count,
    COUNT(*) FILTER (WHERE status = 'Attended')::bigint as attended_count,
    COUNT(*) FILTER (WHERE status = 'Cancelled')::bigint as cancelled_count,
    COUNT(*) FILTER (WHERE booker_id IS NOT NULL)::bigint as assigned_count,
    COUNT(*) FILTER (WHERE status = 'Rejected')::bigint as rejected_count,
    COUNT(*) FILTER (WHERE status = 'Call Back')::bigint as callback_count,
    COUNT(*) FILTER (WHERE status = 'No Answer')::bigint as no_answer_count,
    COUNT(*) FILTER (WHERE status = 'Not Interested')::bigint as not_interested_count,
    COUNT(*) FILTER (WHERE status = 'Wrong number')::bigint as wrong_number_count
  FROM filtered_leads;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_lead_stats(timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_lead_stats(timestamptz, timestamptz, text) TO anon;

COMMENT ON FUNCTION get_lead_stats(timestamptz, timestamptz, text) IS 
'Optimized aggregation function for lead statistics - returns counts by status in a single query.
ASSIGNED_COUNT now counts all leads with booker_id IS NOT NULL (not just status=Assigned).';


-- ====================== RLS ENABLE + POLICIES ======================
-- =====================================================
-- Migration: Enable Row Level Security (RLS) on All Tables
-- =====================================================
-- Purpose: Fix RLS errors that are causing database crashes
--          Enable RLS on all public tables that are missing it
-- Date: 2025-01-XX
-- =====================================================

-- Enable RLS on leads table (has policies but RLS not enabled)
ALTER TABLE IF EXISTS public.leads ENABLE ROW LEVEL SECURITY;

-- Enable RLS on gmail_watch_state table (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables 
             WHERE table_schema = 'public' 
             AND table_name = 'gmail_watch_state') THEN
    ALTER TABLE public.gmail_watch_state ENABLE ROW LEVEL SECURITY;
    
    -- Create basic RLS policies for gmail_watch_state if they don't exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'public' 
      AND tablename = 'gmail_watch_state' 
      AND policyname = 'Gmail watch state is viewable by authenticated users'
    ) THEN
      CREATE POLICY "Gmail watch state is viewable by authenticated users" 
      ON public.gmail_watch_state FOR SELECT 
      USING (true);
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'public' 
      AND tablename = 'gmail_watch_state' 
      AND policyname = 'Gmail watch state is insertable by authenticated users'
    ) THEN
      CREATE POLICY "Gmail watch state is insertable by authenticated users" 
      ON public.gmail_watch_state FOR INSERT 
      WITH CHECK (true);
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'public' 
      AND tablename = 'gmail_watch_state' 
      AND policyname = 'Gmail watch state is updatable by authenticated users'
    ) THEN
      CREATE POLICY "Gmail watch state is updatable by authenticated users" 
      ON public.gmail_watch_state FOR UPDATE 
      USING (true);
    END IF;
    
    RAISE NOTICE '✅ Enabled RLS on gmail_watch_state table';
  ELSE
    RAISE NOTICE '⚠️  gmail_watch_state table does not exist, skipping';
  END IF;
END $$;

-- Enable RLS on callback_reminders table (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables 
             WHERE table_schema = 'public' 
             AND table_name = 'callback_reminders') THEN
    ALTER TABLE public.callback_reminders ENABLE ROW LEVEL SECURITY;
    
    -- Check if any policies exist - if not, create basic ones
    -- (callback_reminders schema may already have user-specific policies)
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'public' 
      AND tablename = 'callback_reminders'
    ) THEN
      -- No policies exist, create basic authenticated user policies
      CREATE POLICY "Callback reminders are viewable by authenticated users" 
      ON public.callback_reminders FOR SELECT 
      USING (true);
      
      CREATE POLICY "Callback reminders are insertable by authenticated users" 
      ON public.callback_reminders FOR INSERT 
      WITH CHECK (true);
      
      CREATE POLICY "Callback reminders are updatable by authenticated users" 
      ON public.callback_reminders FOR UPDATE 
      USING (true);
      
      CREATE POLICY "Callback reminders are deletable by authenticated users" 
      ON public.callback_reminders FOR DELETE 
      USING (true);
      
      RAISE NOTICE '✅ Created basic RLS policies for callback_reminders';
    ELSE
      RAISE NOTICE '✅ callback_reminders already has RLS policies, keeping existing';
    END IF;
    
    RAISE NOTICE '✅ Enabled RLS on callback_reminders table';
  ELSE
    RAISE NOTICE '⚠️  callback_reminders table does not exist, skipping';
  END IF;
END $$;

-- Verify RLS is enabled on all critical tables
DO $$
DECLARE
  rls_status RECORD;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'RLS Status Check:';
  RAISE NOTICE '========================================';
  
  FOR rls_status IN
    SELECT 
      tablename,
      CASE 
        WHEN rowsecurity THEN '✅ ENABLED'
        ELSE '❌ DISABLED'
      END as rls_status
    FROM pg_tables t
    JOIN pg_class c ON c.relname = t.tablename
    WHERE schemaname = 'public'
      AND tablename IN ('leads', 'gmail_watch_state', 'callback_reminders', 
                        'users', 'sales', 'templates', 'messages')
    ORDER BY tablename
  LOOP
    RAISE NOTICE 'Table: % - RLS: %', rls_status.tablename, rls_status.rls_status;
  END LOOP;
  
  RAISE NOTICE '========================================';
END $$;



-- =====================================================
-- Migration: Fix RLS Policies for Lead Status Updates
-- =====================================================
-- Purpose: Ensure RLS policies allow status updates
--          and booking_history updates
-- Date: 2025-01-XX
-- =====================================================

-- Verify RLS is enabled on leads table
DO $$
DECLARE
  rls_enabled BOOLEAN;
BEGIN
  SELECT relrowsecurity INTO rls_enabled
  FROM pg_class c
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = 'public'
  AND c.relname = 'leads';
  
  IF NOT rls_enabled THEN
    ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE '✅ Enabled RLS on leads table';
  ELSE
    RAISE NOTICE '✅ RLS already enabled on leads table';
  END IF;
END $$;

-- Check and fix UPDATE policy on leads table
DO $$
BEGIN
  -- Drop existing UPDATE policy if it exists
  DROP POLICY IF EXISTS "Leads are updatable by authenticated users" ON public.leads;
  
  -- Create new UPDATE policy that allows all authenticated users to update
  CREATE POLICY "Leads are updatable by authenticated users" 
  ON public.leads 
  FOR UPDATE 
  USING (true)
  WITH CHECK (true);
  
  RAISE NOTICE '✅ Created/Updated RLS UPDATE policy on leads table';
END $$;

-- Verify the policy exists and is correct
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'leads'
    AND policyname = 'Leads are updatable by authenticated users'
    AND cmd = 'UPDATE';
  
  IF policy_count > 0 THEN
    RAISE NOTICE '✅ UPDATE policy verified on leads table';
  ELSE
    RAISE WARNING '⚠️  UPDATE policy not found on leads table';
  END IF;
END $$;

-- Check if blocked_slots table needs RLS
DO $$
DECLARE
  table_exists BOOLEAN;
  rls_enabled BOOLEAN;
  policy_exists BOOLEAN;
BEGIN
  -- Check if table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'blocked_slots'
  ) INTO table_exists;
  
  IF table_exists THEN
    -- Check if RLS is enabled
    SELECT relrowsecurity INTO rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
    AND c.relname = 'blocked_slots';
    
    IF NOT rls_enabled THEN
      ALTER TABLE public.blocked_slots ENABLE ROW LEVEL SECURITY;
      
      -- Check if policy exists
      SELECT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'blocked_slots'
        AND policyname = 'Blocked slots are viewable by authenticated users'
      ) INTO policy_exists;
      
      IF NOT policy_exists THEN
        CREATE POLICY "Blocked slots are viewable by authenticated users"
        ON public.blocked_slots FOR SELECT USING (true);
      END IF;
      
      RAISE NOTICE '✅ Enabled RLS on blocked_slots table';
    ELSE
      RAISE NOTICE '✅ RLS already enabled on blocked_slots table';
    END IF;
  ELSE
    RAISE NOTICE '⚠️  blocked_slots table does not exist, skipping';
  END IF;
END $$;

-- Summary
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'RLS Policy Fix Complete';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Leads table RLS: Enabled';
  RAISE NOTICE '✅ Leads UPDATE policy: Created/Verified';
  RAISE NOTICE '✅ Blocked slots RLS: Checked';
  RAISE NOTICE '========================================';
END $$;


-- ---------- STORAGE ----------
INSERT INTO storage.buckets (id, name, public)
VALUES ('template-attachments', 'template-attachments', true)
ON CONFLICT (id) DO NOTHING;
-- Make every contract section editable.
-- All static labels/headings on the contract and finance agreement are stored
-- as overrides in one JSONB column, so new editable labels never need another
-- migration. Defaults live in server/utils/contractLabels.js.
--
-- Run this in the Supabase SQL Editor.

ALTER TABLE contract_templates
  ADD COLUMN IF NOT EXISTS labels JSONB DEFAULT '{}'::jsonb;

UPDATE contract_templates
  SET labels = '{}'::jsonb
  WHERE labels IS NULL;
CREATE INDEX IF NOT EXISTS idx_templates_type ON templates(type);
CREATE INDEX IF NOT EXISTS idx_selected_images_invoice_id ON selected_images(invoice_id);
CREATE INDEX IF NOT EXISTS idx_photos_s3_key ON photos(s3_key) WHERE s3_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_photos_primary ON photos(lead_id) WHERE is_primary = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_photos_photographer_created ON photos(photographer_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_photos_lead_id ON photos(lead_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_template_id ON messages(template_id);
CREATE INDEX IF NOT EXISTS idx_leads_booker_created ON leads(booker_id, created_at);
CREATE INDEX IF NOT EXISTS idx_finance_sale_id ON finance(sale_id);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_read ON finance_admin_notifications(read);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_templates_email_account ON templates(email_account);
CREATE INDEX IF NOT EXISTS idx_photos_lead_created ON photos(lead_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_recipient_email ON messages(recipient_email) WHERE recipient_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_salesape_user_engaged ON leads(salesape_user_engaged) WHERE salesape_user_engaged = TRUE;
CREATE INDEX IF NOT EXISTS idx_leads_replydesk_status ON leads(replydesk_status) WHERE replydesk_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_booking_code ON leads(booking_code);
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_signature_status ON invoices(signature_status);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON invoices(payment_status);
CREATE INDEX IF NOT EXISTS idx_contracts_created_at ON contracts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_salesape_goal_hit ON leads(salesape_goal_hit) WHERE salesape_goal_hit = TRUE;
CREATE INDEX IF NOT EXISTS idx_leads_is_double_confirmed ON leads(is_double_confirmed);
CREATE INDEX IF NOT EXISTS idx_leads_airtable_record_id ON leads(airtable_record_id);
CREATE INDEX IF NOT EXISTS idx_invoices_sale_id ON invoices(sale_id);
CREATE INDEX IF NOT EXISTS idx_finance_payments_finance_id ON finance_payments(finance_id);
CREATE INDEX IF NOT EXISTS idx_callback_reminders_lead_id ON callback_reminders(lead_id);
CREATE INDEX IF NOT EXISTS idx_users_assigned_email_account ON users(assigned_email_account_id);
CREATE INDEX IF NOT EXISTS idx_selected_images_lead_id ON selected_images(lead_id);
CREATE INDEX IF NOT EXISTS idx_reminders_sent_at ON finance_reminders(sent_at);
CREATE INDEX IF NOT EXISTS idx_photos_uploaded_by ON photos(uploaded_by) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_photos_cloudinary_public_id ON photos(cloudinary_public_id);
CREATE INDEX IF NOT EXISTS idx_payment_schedule_finance_id ON finance_payment_schedule(finance_id);
CREATE INDEX IF NOT EXISTS idx_packages_type ON packages(type);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_phone ON messages(recipient_phone) WHERE recipient_phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email) WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_finance_next_payment_date ON finance(next_payment_date);
CREATE INDEX IF NOT EXISTS idx_callback_reminders_user_status_time ON callback_reminders(user_id, status, callback_time) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stripe_links_finance_id ON finance_stripe_links(finance_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_photos_is_primary ON photos(is_primary) WHERE is_primary = TRUE AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payment_schedule_status ON finance_payment_schedule(status);
CREATE INDEX IF NOT EXISTS idx_packages_is_active ON packages(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_messages_attachments ON messages USING GIN (attachments) WHERE attachments != '[]'::jsonb;
CREATE INDEX IF NOT EXISTS idx_leads_stripe_customer_id ON leads(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_review_date ON leads(review_date);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_callback_reminders_user_id ON callback_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_user_id ON sales(user_id);
CREATE INDEX IF NOT EXISTS idx_photos_resource_type ON photos(resource_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON messages(sent_at);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone) WHERE phone IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_gender ON leads(gender) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_booked_at ON leads(booked_at) WHERE booked_at IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_email_accounts_is_default ON email_accounts(is_default);
CREATE INDEX IF NOT EXISTS idx_contracts_token ON contracts(contract_token);
CREATE INDEX IF NOT EXISTS idx_blocked_slots_date_time ON blocked_slots(date, time_slot);
CREATE INDEX IF NOT EXISTS idx_templates_created_by ON templates(created_by);
CREATE INDEX IF NOT EXISTS idx_photos_tags ON photos USING GIN(tags) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_packages_display_order ON packages(display_order);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_ever_booked ON leads(ever_booked) WHERE ever_booked = TRUE AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_lead_source_costs_period ON lead_source_costs(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_finance_status ON finance(status);
CREATE INDEX IF NOT EXISTS idx_finance_lead_id ON finance(lead_id);
CREATE INDEX IF NOT EXISTS idx_blocked_slots_date ON blocked_slots(date);
CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_is_active ON templates(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_selected_images_photo_id ON selected_images(photo_id);
CREATE INDEX IF NOT EXISTS idx_photos_storage_provider ON photos(storage_provider) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_photos_created_at ON photos(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_created_at_status ON leads(created_at, status);
CREATE INDEX IF NOT EXISTS idx_leads_call_status ON leads(call_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_booker_id ON leads(booker_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_email_accounts_is_active ON email_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_callback_reminders_callback_time ON callback_reminders(callback_time) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_selected_images_delivery_status ON selected_images(delivery_status);
CREATE INDEX IF NOT EXISTS idx_sales_amount ON sales(amount);
CREATE INDEX IF NOT EXISTS idx_payment_schedule_due_date ON finance_payment_schedule(due_date);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_read_status ON messages(read_status) WHERE read_status = FALSE;
CREATE INDEX IF NOT EXISTS idx_leads_salesape_sent_at ON leads(salesape_sent_at) WHERE salesape_sent_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_salesape_record_id ON leads(salesape_record_id) WHERE salesape_record_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_replydesk_sent_at ON leads(replydesk_sent_at) WHERE replydesk_sent_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_lead_source ON leads(lead_source) WHERE lead_source IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_date_booked ON leads(date_booked) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contract_templates_active ON contract_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_callback_reminders_status ON callback_reminders(status) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS idx_selected_images_unique ON selected_images(invoice_id, photo_id);
CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_messages_delivery_status ON messages(delivery_status);
CREATE INDEX IF NOT EXISTS idx_leads_salesape_status ON leads(salesape_user_engaged, salesape_goal_hit);
CREATE INDEX IF NOT EXISTS idx_leads_date_of_birth ON leads(date_of_birth);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_assigned_at ON leads(assigned_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_finance_due_day ON finance(due_day);
CREATE INDEX IF NOT EXISTS idx_finance_agreement_number ON finance(agreement_number);
CREATE INDEX IF NOT EXISTS idx_photos_photographer_id ON photos(photographer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_photos_folder_path ON photos(folder_path) WHERE deleted_at IS NULL AND folder_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type);
CREATE INDEX IF NOT EXISTS idx_messages_sent_by ON messages(sent_by);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_booking_status ON leads(booking_status) WHERE booking_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_finance_payments_payment_date ON finance_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_email_accounts_email ON email_accounts(email);
CREATE INDEX IF NOT EXISTS idx_contracts_lead_id ON contracts(lead_id);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_created ON finance_admin_notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_sales_lead_id ON sales(lead_id);
CREATE INDEX IF NOT EXISTS idx_reminders_finance_id ON finance_reminders(finance_id);
CREATE INDEX IF NOT EXISTS idx_packages_code ON packages(code);
CREATE INDEX IF NOT EXISTS idx_leads_replydesk_lead_id ON leads(replydesk_lead_id) WHERE replydesk_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_deleted_at ON leads(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_lead_source_costs_source ON lead_source_costs(lead_source);
CREATE INDEX IF NOT EXISTS idx_invoices_lead_id ON invoices(lead_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contracts_type ON contracts(contract_type);
ALTER TABLE processed_gmail_messages ADD CONSTRAINT processed_gmail_messages_account_msg_key UNIQUE (account_key, gmail_message_id);
ALTER TABLE lead_source_costs ADD CONSTRAINT lead_source_costs_source_period_key UNIQUE (lead_source, period_start, period_end);
-- Schema fixes: defaults/triggers lost by the introspection-based backup
ALTER TABLE daily_booker_performance ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;
ALTER TABLE templates ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
CREATE OR REPLACE FUNCTION public.ensure_message_content() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $f$
BEGIN
  IF NEW.content IS NULL OR NEW.content = '' THEN
    NEW.content := COALESCE(NULLIF(NEW.sms_body, ''), NULLIF(NEW.email_body, ''), NULLIF(NEW.subject, ''), '');
  END IF;
  RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS ensure_message_content_trigger ON messages;
CREATE TRIGGER ensure_message_content_trigger BEFORE INSERT OR UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION public.ensure_message_content();
DO $d$ DECLARE t text; BEGIN
  FOR t IN SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='updated_at' AND table_name IN (SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%1$s_updated_at ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER update_%1$s_updated_at BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
  END LOOP;
END $d$;
-- Required (NOT NULL) foreign keys cannot be SET NULL; cascade so deleting a lead/user works.
ALTER TABLE invoices DROP CONSTRAINT invoices_lead_id_fkey, ADD CONSTRAINT invoices_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE finance DROP CONSTRAINT finance_lead_id_fkey, ADD CONSTRAINT finance_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE messages DROP CONSTRAINT messages_lead_id_fkey, ADD CONSTRAINT messages_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE callback_reminders DROP CONSTRAINT callback_reminders_lead_id_fkey, ADD CONSTRAINT callback_reminders_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE callback_reminders DROP CONSTRAINT callback_reminders_user_id_fkey, ADD CONSTRAINT callback_reminders_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
