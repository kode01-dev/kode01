-- ============================================
-- SEED MARKETING TEMPLATES (6 Gabarits)
-- ============================================

-- 1. Newsletter Signup - Center Modal
INSERT INTO marketing_templates (
  slug, name_en, name_fr, description_en, description_fr,
  template_type, layout_schema, display_order
) VALUES (
  'newsletter-center-modal',
  'Newsletter Signup - Center Modal',
  'Inscription Newsletter - Modal Centré',
  'Professional centered modal for newsletter subscriptions with email validation',
  'Modal centré professionnel pour inscriptions newsletter avec validation email',
  'newsletter_form',
  '{
    "components": [
      {
        "type": "modal",
        "position": "center",
        "maxWidth": "440px",
        "padding": "40px",
        "borderRadius": "24px",
        "fields": [
          {"type": "title", "size": "1.75rem", "font": "serif"},
          {"type": "subtitle", "size": "14px"},
          {"type": "email_input", "required": true},
          {"type": "submit_button", "style": "primary"},
          {"type": "privacy_text", "size": "11px"}
        ]
      }
    ]
  }'::jsonb,
  1
);

-- 2. Announcement - Top Banner
INSERT INTO marketing_templates (
  slug, name_en, name_fr, description_en, description_fr,
  template_type, layout_schema, display_order
) VALUES (
  'announcement-top-banner',
  'Announcement - Top Bar',
  'Annonce - Barre Supérieure',
  'Fixed top banner for important announcements and updates',
  'Bannière fixe en haut pour annonces importantes et mises à jour',
  'banner_top',
  '{
    "components": [
      {
        "type": "banner",
        "position": "top",
        "height": "auto",
        "padding": "12px 24px",
        "background": "kode01-noir",
        "fields": [
          {"type": "icon", "size": "20px"},
          {"type": "message", "size": "14px", "weight": "bold"},
          {"type": "cta_button", "size": "small"},
          {"type": "close_button"}
        ]
      }
    ]
  }'::jsonb,
  2
);

-- 3. Promotional Popup - Corner (Bottom Right)
INSERT INTO marketing_templates (
  slug, name_en, name_fr, description_en, description_fr,
  template_type, layout_schema, display_order
) VALUES (
  'promo-corner-popup',
  'Promotional Popup - Bottom Right',
  'Popup Promotionnel - Bas Droite',
  'Compact corner popup for promotional offers and CTAs',
  'Popup compact dans le coin pour offres promotionnelles et CTAs',
  'popup_corner_br',
  '{
    "components": [
      {
        "type": "popup",
        "position": "bottom-right",
        "maxWidth": "360px",
        "padding": "24px",
        "borderRadius": "24px",
        "shadow": "2xl",
        "fields": [
          {"type": "badge", "text": "NEW", "color": "kode01-pink"},
          {"type": "title", "size": "1.25rem", "font": "serif"},
          {"type": "description", "size": "14px"},
          {"type": "image", "maxHeight": "200px", "borderRadius": "16px"},
          {"type": "cta_button", "style": "primary", "fullWidth": true},
          {"type": "dismiss_link"}
        ]
      }
    ]
  }'::jsonb,
  3
);

-- 4. Exit Intent - Special Offer
INSERT INTO marketing_templates (
  slug, name_en, name_fr, description_en, description_fr,
  template_type, layout_schema, display_order
) VALUES (
  'exit-intent-modal',
  'Exit Intent - Special Offer',
  'Intention de Sortie - Offre Spéciale',
  'Triggered on exit intent to retain visitors with special offers',
  'Déclenché à l intention de sortie pour retenir visiteurs avec offres spéciales',
  'popup_center',
  '{
    "components": [
      {
        "type": "modal",
        "position": "center",
        "maxWidth": "520px",
        "padding": "48px",
        "borderRadius": "24px",
        "backdrop": "blur",
        "fields": [
          {"type": "emoji", "size": "48px", "default": "🎁"},
          {"type": "title", "size": "2rem", "font": "serif", "align": "center"},
          {"type": "subtitle", "size": "16px", "align": "center"},
          {"type": "features_list", "items": 3},
          {"type": "countdown_timer", "duration": 600},
          {"type": "cta_button", "style": "primary", "size": "large"},
          {"type": "secondary_button", "style": "ghost"}
        ]
      }
    ]
  }'::jsonb,
  4
);

-- 5. Floating Banner - Bottom Center
INSERT INTO marketing_templates (
  slug, name_en, name_fr, description_en, description_fr,
  template_type, layout_schema, display_order
) VALUES (
  'floating-bottom-banner',
  'Floating Banner - Bottom Center',
  'Bannière Flottante - Bas Centre',
  'Floating banner at bottom of page with action buttons',
  'Bannière flottante en bas de page avec boutons d action',
  'banner_floating',
  '{
    "components": [
      {
        "type": "banner",
        "position": "bottom-center",
        "maxWidth": "480px",
        "padding": "20px 24px",
        "borderRadius": "32px",
        "shadow": "2xl",
        "backdrop": "blur",
        "fields": [
          {"type": "icon_pulse", "size": "48px"},
          {"type": "title", "size": "16px", "weight": "bold"},
          {"type": "description", "size": "14px"},
          {"type": "action_buttons", "count": 2, "layout": "horizontal"}
        ]
      }
    ]
  }'::jsonb,
  5
);

-- 6. Inline Content Banner
INSERT INTO marketing_templates (
  slug, name_en, name_fr, description_en, description_fr,
  template_type, layout_schema, display_order
) VALUES (
  'inline-content-banner',
  'Inline Content Banner',
  'Bannière de Contenu Intégrée',
  'Inline banner integrated within page content',
  'Bannière intégrée dans le contenu de la page',
  'banner_inline',
  '{
    "components": [
      {
        "type": "banner",
        "position": "inline",
        "width": "100%",
        "padding": "32px",
        "borderRadius": "24px",
        "border": "2px",
        "fields": [
          {"type": "grid_layout", "columns": 2},
          {"type": "image", "maxWidth": "40%"},
          {"type": "content_area", "width": "60%", "fields": [
            {"type": "overline", "size": "10px", "uppercase": true},
            {"type": "title", "size": "1.5rem"},
            {"type": "body", "size": "14px"},
            {"type": "cta_button"}
          ]}
        ]
      }
    ]
  }'::jsonb,
  6
);

-- ============================================
-- VERIFICATION
-- ============================================

-- Verify all 6 templates were created
SELECT slug, name_en, template_type, display_order
FROM marketing_templates
ORDER BY display_order;
