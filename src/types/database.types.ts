export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      abandoned_cart_email_jobs: {
        Row: {
          attempts: number
          cart_id: string
          created_at: string
          error_message: string | null
          id: string
          locked_at: string | null
          scheduled_for: string
          sent_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          cart_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          locked_at?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          cart_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          locked_at?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "abandoned_cart_email_jobs_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abandoned_cart_email_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abandoned_cart_email_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_campaign_placements: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          multiplier_snapshot: number
          placement_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          multiplier_snapshot: number
          placement_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          multiplier_snapshot?: number
          placement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaign_placements_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_campaign_placements_placement_id_fkey"
            columns: ["placement_id"]
            isOneToOne: false
            referencedRelation: "ad_placements"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_campaigns: {
        Row: {
          advertiser_type: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          currency: string
          duration_days: number
          end_at: string | null
          id: string
          inventory_block_count: number | null
          inventory_block_start: string | null
          is_paid: boolean
          name: string
          news_format: string | null
          owner_user_id: string | null
          pricing_plan_id: string | null
          rejected_reason: string | null
          rotation_policy_snapshot: Json
          start_at: string | null
          status: string
          total_price: number
          total_price_usd: number
          updated_at: string
        }
        Insert: {
          advertiser_type: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          currency?: string
          duration_days: number
          end_at?: string | null
          id?: string
          inventory_block_count?: number | null
          inventory_block_start?: string | null
          is_paid?: boolean
          name: string
          news_format?: string | null
          owner_user_id?: string | null
          pricing_plan_id?: string | null
          rejected_reason?: string | null
          rotation_policy_snapshot?: Json
          start_at?: string | null
          status?: string
          total_price?: number
          total_price_usd?: number
          updated_at?: string
        }
        Update: {
          advertiser_type?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          currency?: string
          duration_days?: number
          end_at?: string | null
          id?: string
          inventory_block_count?: number | null
          inventory_block_start?: string | null
          is_paid?: boolean
          name?: string
          news_format?: string | null
          owner_user_id?: string | null
          pricing_plan_id?: string | null
          rejected_reason?: string | null
          rotation_policy_snapshot?: Json
          start_at?: string | null
          status?: string
          total_price?: number
          total_price_usd?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaigns_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_campaigns_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_campaigns_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_campaigns_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_campaigns_pricing_plan_id_fkey"
            columns: ["pricing_plan_id"]
            isOneToOne: false
            referencedRelation: "ad_pricing_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_creatives: {
        Row: {
          campaign_id: string
          created_at: string
          cta_text: string
          destination_kind: string
          destination_url: string
          id: string
          image_url: string
          locale: string | null
          page_count: number
          placement_slug: string | null
          title: string
          updated_at: string
          validation_errors: Json
          validation_status: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          cta_text: string
          destination_kind: string
          destination_url: string
          id?: string
          image_url: string
          locale?: string | null
          page_count?: number
          placement_slug?: string | null
          title: string
          updated_at?: string
          validation_errors?: Json
          validation_status?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          cta_text?: string
          destination_kind?: string
          destination_url?: string
          id?: string
          image_url?: string
          locale?: string | null
          page_count?: number
          placement_slug?: string | null
          title?: string
          updated_at?: string
          validation_errors?: Json
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_creatives_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_events: {
        Row: {
          campaign_id: string
          channel: string
          created_at: string
          creative_id: string | null
          event_type: string
          fingerprint: string | null
          id: string
          locale: string | null
          metadata: Json
          page_path: string | null
          placement_id: string | null
          quantity: number
        }
        Insert: {
          campaign_id: string
          channel: string
          created_at?: string
          creative_id?: string | null
          event_type: string
          fingerprint?: string | null
          id?: string
          locale?: string | null
          metadata?: Json
          page_path?: string | null
          placement_id?: string | null
          quantity?: number
        }
        Update: {
          campaign_id?: string
          channel?: string
          created_at?: string
          creative_id?: string | null
          event_type?: string
          fingerprint?: string | null
          id?: string
          locale?: string | null
          metadata?: Json
          page_path?: string | null
          placement_id?: string | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "ad_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_events_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "ad_creatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_events_placement_id_fkey"
            columns: ["placement_id"]
            isOneToOne: false
            referencedRelation: "ad_placements"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_inventory_reservations: {
        Row: {
          block_start_date: string
          campaign_id: string
          created_at: string
          expires_at: string | null
          id: string
          placement_slug: string
          slot_kind: string
          slot_number: number
          status: string
          updated_at: string
        }
        Insert: {
          block_start_date: string
          campaign_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          placement_slug: string
          slot_kind: string
          slot_number: number
          status: string
          updated_at?: string
        }
        Update: {
          block_start_date?: string
          campaign_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          placement_slug?: string
          slot_kind?: string
          slot_number?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_inventory_reservations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_orders: {
        Row: {
          amount: number
          amount_usd: number
          campaign_id: string
          created_at: string
          currency: string
          id: string
          owner_user_id: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          amount_usd: number
          campaign_id: string
          created_at?: string
          currency?: string
          id?: string
          owner_user_id?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          amount_usd?: number
          campaign_id?: string
          created_at?: string
          currency?: string
          id?: string
          owner_user_id?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_orders_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_orders_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_orders_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_placements: {
        Row: {
          channel: string
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          price_multiplier: number
          slug: string
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          price_multiplier?: number
          slug: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          price_multiplier?: number
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      ad_pricing_plans: {
        Row: {
          code: string
          created_at: string
          currency: string
          duration_days: number
          id: string
          is_active: boolean
          name: string
          price: number
          price_usd: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string
          duration_days: number
          id?: string
          is_active?: boolean
          name: string
          price?: number
          price_usd: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          duration_days?: number
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          price_usd?: number
          updated_at?: string
        }
        Relationships: []
      }
      affiliates: {
        Row: {
          affiliate_code: string
          commission_rate: number
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          affiliate_code: string
          commission_rate?: number
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          affiliate_code?: string
          commission_rate?: number
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliates_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_review_stats"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "affiliates_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_blueprints: {
        Row: {
          created_at: string
          id: string
          is_vetted: boolean
          license_type: string
          manifest: Json
          product_id: string
          prompt_content: string | null
          readme_content: string | null
          tools_config: Json | null
          updated_at: string
          vetted_at: string | null
          vetted_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_vetted?: boolean
          license_type?: string
          manifest?: Json
          product_id: string
          prompt_content?: string | null
          readme_content?: string | null
          tools_config?: Json | null
          updated_at?: string
          vetted_at?: string | null
          vetted_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_vetted?: boolean
          license_type?: string
          manifest?: Json
          product_id?: string
          prompt_content?: string | null
          readme_content?: string | null
          tools_config?: Json | null
          updated_at?: string
          vetted_at?: string | null
          vetted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_blueprints_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "product_review_stats"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "agent_blueprints_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_blueprints_vetted_by_fkey"
            columns: ["vetted_by"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_blueprints_vetted_by_fkey"
            columns: ["vetted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_recap_day_themes: {
        Row: {
          created_at: string
          day_index: number
          is_active: boolean
          skip_if_quiet: boolean
          source_ids: string[]
          theme_description_en: string | null
          theme_description_fr: string | null
          theme_key: string
          theme_name_en: string
          theme_name_fr: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_index: number
          is_active?: boolean
          skip_if_quiet?: boolean
          source_ids?: string[]
          theme_description_en?: string | null
          theme_description_fr?: string | null
          theme_key: string
          theme_name_en: string
          theme_name_fr: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_index?: number
          is_active?: boolean
          skip_if_quiet?: boolean
          source_ids?: string[]
          theme_description_en?: string | null
          theme_description_fr?: string | null
          theme_key?: string
          theme_name_en?: string
          theme_name_fr?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_recap_generation_artifacts: {
        Row: {
          created_at: string
          edition_key: string
          error_message: string | null
          id: string
          input_hash: string
          model: string
          output_json: Json | null
          provider: string
          run_id: string | null
          stage: string
          status: string
          updated_at: string
          usage_json: Json
        }
        Insert: {
          created_at?: string
          edition_key: string
          error_message?: string | null
          id?: string
          input_hash: string
          model: string
          output_json?: Json | null
          provider: string
          run_id?: string | null
          stage: string
          status: string
          updated_at?: string
          usage_json?: Json
        }
        Update: {
          created_at?: string
          edition_key?: string
          error_message?: string | null
          id?: string
          input_hash?: string
          model?: string
          output_json?: Json | null
          provider?: string
          run_id?: string | null
          stage?: string
          status?: string
          updated_at?: string
          usage_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_recap_generation_artifacts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_recap_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_recap_documents: {
        Row: {
          cleaned_text: string | null
          created_at: string
          http_status: number | null
          id: string
          raw_markdown: string | null
          run_id: string
          scrape_method: string | null
          scrape_ok: boolean
          source_id: string | null
          source_url: string
        }
        Insert: {
          cleaned_text?: string | null
          created_at?: string
          http_status?: number | null
          id?: string
          raw_markdown?: string | null
          run_id: string
          scrape_method?: string | null
          scrape_ok?: boolean
          source_id?: string | null
          source_url: string
        }
        Update: {
          cleaned_text?: string | null
          created_at?: string
          http_status?: number | null
          id?: string
          raw_markdown?: string | null
          run_id?: string
          scrape_method?: string | null
          scrape_ok?: boolean
          source_id?: string | null
          source_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_recap_documents_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_recap_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_recap_documents_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "ai_recap_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_recap_editions: {
        Row: {
          created_at: string
          edition_key: string
          fact_check_result: Json | null
          id: string
          published_at: string | null
          quality_report: Json | null
          run_id: string | null
          status: string
          updated_at: string
          week_end: string
          week_start: string
        }
        Insert: {
          created_at?: string
          edition_key: string
          fact_check_result?: Json | null
          id?: string
          published_at?: string | null
          quality_report?: Json | null
          run_id?: string | null
          status?: string
          updated_at?: string
          week_end: string
          week_start: string
        }
        Update: {
          created_at?: string
          edition_key?: string
          fact_check_result?: Json | null
          id?: string
          published_at?: string | null
          quality_report?: Json | null
          run_id?: string | null
          status?: string
          updated_at?: string
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_recap_editions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_recap_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_recap_newsletter_dispatches: {
        Row: {
          created_at: string
          edition_id: string
          error_message: string | null
          id: string
          payload_json: Json
          provider: string
          sendfox_campaign_id: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          edition_id: string
          error_message?: string | null
          id?: string
          payload_json?: Json
          provider?: string
          sendfox_campaign_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          edition_id?: string
          error_message?: string | null
          id?: string
          payload_json?: Json
          provider?: string
          sendfox_campaign_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_recap_newsletter_dispatches_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "ai_recap_editions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_recap_posts: {
        Row: {
          clap_count: number
          content_json: Json
          content_markdown: string
          created_at: string
          edition_id: string
          excerpt: string | null
          id: string
          intro: string
          is_published: boolean
          locale: string
          published_at: string | null
          slug: string
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          clap_count?: number
          content_json?: Json
          content_markdown: string
          created_at?: string
          edition_id: string
          excerpt?: string | null
          id?: string
          intro: string
          is_published?: boolean
          locale: string
          published_at?: string | null
          slug: string
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          clap_count?: number
          content_json?: Json
          content_markdown?: string
          created_at?: string
          edition_id?: string
          excerpt?: string | null
          id?: string
          intro?: string
          is_published?: boolean
          locale?: string
          published_at?: string | null
          slug?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_recap_posts_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "ai_recap_editions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_recap_runs: {
        Row: {
          attempt: number
          created_at: string
          edition_key: string
          error_message: string | null
          failure_reason: string | null
          finished_at: string | null
          id: string
          metrics_json: Json
          mode: string
          started_at: string
          status: string
          trigger_type: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          edition_key: string
          error_message?: string | null
          failure_reason?: string | null
          finished_at?: string | null
          id?: string
          metrics_json?: Json
          mode?: string
          started_at?: string
          status?: string
          trigger_type?: string
        }
        Update: {
          attempt?: number
          created_at?: string
          edition_key?: string
          error_message?: string | null
          failure_reason?: string | null
          finished_at?: string | null
          id?: string
          metrics_json?: Json
          mode?: string
          started_at?: string
          status?: string
          trigger_type?: string
        }
        Relationships: []
      }
      ai_recap_schedule_settings: {
        Row: {
          created_at: string
          id: boolean
          is_enabled: boolean
          slot_a_day: number
          slot_a_hour: number
          slot_a_minute: number
          slot_b_day: number
          slot_b_hour: number
          slot_b_minute: number
          slot_c_day: number | null
          slot_c_hour: number | null
          slot_c_minute: number | null
          slot_d_day: number | null
          slot_d_hour: number | null
          slot_d_minute: number | null
          slot_e_day: number | null
          slot_e_hour: number | null
          slot_e_minute: number | null
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: boolean
          is_enabled?: boolean
          slot_a_day?: number
          slot_a_hour?: number
          slot_a_minute?: number
          slot_b_day?: number
          slot_b_hour?: number
          slot_b_minute?: number
          slot_c_day?: number | null
          slot_c_hour?: number | null
          slot_c_minute?: number | null
          slot_d_day?: number | null
          slot_d_hour?: number | null
          slot_d_minute?: number | null
          slot_e_day?: number | null
          slot_e_hour?: number | null
          slot_e_minute?: number | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: boolean
          is_enabled?: boolean
          slot_a_day?: number
          slot_a_hour?: number
          slot_a_minute?: number
          slot_b_day?: number
          slot_b_hour?: number
          slot_b_minute?: number
          slot_c_day?: number | null
          slot_c_hour?: number | null
          slot_c_minute?: number | null
          slot_d_day?: number | null
          slot_d_hour?: number | null
          slot_d_minute?: number | null
          slot_e_day?: number | null
          slot_e_hour?: number | null
          slot_e_minute?: number | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_recap_sources: {
        Row: {
          created_at: string
          domain: string
          feed_url: string | null
          id: string
          is_active: boolean
          locale_hint: string
          name: string
          priority: number
          rss_allow_firecrawl_fallback: boolean
          scrape_route: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          domain: string
          feed_url?: string | null
          id?: string
          is_active?: boolean
          locale_hint?: string
          name: string
          priority?: number
          rss_allow_firecrawl_fallback?: boolean
          scrape_route?: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          domain?: string
          feed_url?: string | null
          id?: string
          is_active?: boolean
          locale_hint?: string
          name?: string
          priority?: number
          rss_allow_firecrawl_fallback?: boolean
          scrape_route?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      api_monitor_endpoint_state: {
        Row: {
          created_at: string
          endpoint: string
          error_rate_percent: number
          health_status: string
          last_alerted_red_at: string | null
          last_checked_at: string
          last_success_at: string | null
          updated_at: string
          window_error: number
          window_total: number
        }
        Insert: {
          created_at?: string
          endpoint: string
          error_rate_percent?: number
          health_status: string
          last_alerted_red_at?: string | null
          last_checked_at?: string
          last_success_at?: string | null
          updated_at?: string
          window_error?: number
          window_total?: number
        }
        Update: {
          created_at?: string
          endpoint?: string
          error_rate_percent?: number
          health_status?: string
          last_alerted_red_at?: string | null
          last_checked_at?: string
          last_success_at?: string | null
          updated_at?: string
          window_error?: number
          window_total?: number
        }
        Relationships: []
      }
      api_rate_limits: {
        Row: {
          rate_key: string
          request_count: number
          updated_at: string
          window_started_at: string
        }
        Insert: {
          rate_key: string
          request_count?: number
          updated_at?: string
          window_started_at: string
        }
        Update: {
          rate_key?: string
          request_count?: number
          updated_at?: string
          window_started_at?: string
        }
        Relationships: []
      }
      article_claps: {
        Row: {
          clap_count: number
          clapper_id: string
          content_id: string
          content_type: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          clap_count?: number
          clapper_id: string
          content_id: string
          content_type: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          clap_count?: number
          clapper_id?: string
          content_id?: string
          content_type?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          created_at: string
          event_type: string
          id: string
          ip_address: unknown
          metadata: Json | null
          new_data: Json | null
          old_data: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          new_data?: Json | null
          old_data?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          new_data?: Json | null
          old_data?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_password_history: {
        Row: {
          changed_at: string
          id: string
          password_hash: string
          user_id: string
        }
        Insert: {
          changed_at?: string
          id?: string
          password_hash: string
          user_id: string
        }
        Update: {
          changed_at?: string
          id?: string
          password_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      billing_entitlements: {
        Row: {
          created_at: string
          ends_at: string | null
          feature_key: string
          feature_value: string | null
          id: string
          is_active: boolean
          metadata: Json
          source: string
          starts_at: string
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          feature_key: string
          feature_value?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          source?: string
          starts_at?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          feature_key?: string
          feature_value?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          source?: string
          starts_at?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_entitlements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_entitlements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_activity: {
        Row: {
          blocked: boolean
          details: Json
          detected_at: string
          id: string
          ip_address: string | null
          path: string | null
          reason: string
          source: string
          user_agent: string | null
        }
        Insert: {
          blocked?: boolean
          details?: Json
          detected_at?: string
          id?: string
          ip_address?: string | null
          path?: string | null
          reason: string
          source: string
          user_agent?: string | null
        }
        Update: {
          blocked?: boolean
          details?: Json
          detected_at?: string
          id?: string
          ip_address?: string | null
          path?: string | null
          reason?: string
          source?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          added_at: string
          cart_id: string
          id: string
          price_snapshot: number
          product_id: string
          variant_id: string | null
          variant_key: string | null
        }
        Insert: {
          added_at?: string
          cart_id: string
          id?: string
          price_snapshot: number
          product_id: string
          variant_id?: string | null
          variant_key?: string | null
        }
        Update: {
          added_at?: string
          cart_id?: string
          id?: string
          price_snapshot?: number
          product_id?: string
          variant_id?: string | null
          variant_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_review_stats"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          created_at: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_session_items: {
        Row: {
          amount_cents: number
          application_fee_cents: number
          buyer_id: string
          cart_id: string | null
          cart_item_id: string | null
          created_at: string
          currency: string
          id: string
          product_id: string
          seller_id: string
          seller_payout_cents: number
          stripe_checkout_session_id: string
          variant_id: string | null
        }
        Insert: {
          amount_cents: number
          application_fee_cents?: number
          buyer_id: string
          cart_id?: string | null
          cart_item_id?: string | null
          created_at?: string
          currency: string
          id?: string
          product_id: string
          seller_id: string
          seller_payout_cents?: number
          stripe_checkout_session_id: string
          variant_id?: string | null
        }
        Update: {
          amount_cents?: number
          application_fee_cents?: number
          buyer_id?: string
          cart_id?: string | null
          cart_item_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          product_id?: string
          seller_id?: string
          seller_payout_cents?: number
          stripe_checkout_session_id?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkout_session_items_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_session_items_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_session_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_review_stats"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "checkout_session_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_session_items_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_session_items_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_session_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      content_moderation_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          product_id: string
          reason: string
          reporter_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          product_id: string
          reason: string
          reporter_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          product_id?: string
          reason?: string
          reporter_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_moderation_reports_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_review_stats"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "content_moderation_reports_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_moderation_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_moderation_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cookie_consent_events: {
        Row: {
          accepted_categories: string[]
          anonymous_consent_id: string
          consent_version: string
          created_at: string
          event_type: string
          id: string
          locale: string | null
          rejected_categories: string[]
          source: string
          user_id: string | null
        }
        Insert: {
          accepted_categories?: string[]
          anonymous_consent_id: string
          consent_version: string
          created_at?: string
          event_type: string
          id?: string
          locale?: string | null
          rejected_categories?: string[]
          source: string
          user_id?: string | null
        }
        Update: {
          accepted_categories?: string[]
          anonymous_consent_id?: string
          consent_version?: string
          created_at?: string
          event_type?: string
          id?: string
          locale?: string | null
          rejected_categories?: string[]
          source?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cookie_consent_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cookie_consent_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_follows: {
        Row: {
          created_at: string
          creator_id: string
          follower_id: string
          id: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          follower_id: string
          id?: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          follower_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_follows_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_follows_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      editorial_posts: {
        Row: {
          author_name: string | null
          category: string | null
          clap_count: number
          click_count: number
          content_markdown: string
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          excerpt: string | null
          id: string
          is_sponsored: boolean
          last_viewed_at: string | null
          locale: string
          published_at: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          source_locale: string
          sponsored_approved_at: string | null
          sponsored_approved_by: string | null
          sponsored_owner_user_id: string | null
          sponsored_rejected_at: string | null
          sponsored_rejected_by: string | null
          sponsored_rejection_reason: string | null
          sponsored_submitted_at: string | null
          sponsorship_status: string
          status: string
          title: string
          translation_group_id: string
          updated_at: string
          updated_by: string | null
          view_count: number
        }
        Insert: {
          author_name?: string | null
          category?: string | null
          clap_count?: number
          click_count?: number
          content_markdown?: string
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          id?: string
          is_sponsored?: boolean
          last_viewed_at?: string | null
          locale: string
          published_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          source_locale?: string
          sponsored_approved_at?: string | null
          sponsored_approved_by?: string | null
          sponsored_owner_user_id?: string | null
          sponsored_rejected_at?: string | null
          sponsored_rejected_by?: string | null
          sponsored_rejection_reason?: string | null
          sponsored_submitted_at?: string | null
          sponsorship_status?: string
          status?: string
          title: string
          translation_group_id?: string
          updated_at?: string
          updated_by?: string | null
          view_count?: number
        }
        Update: {
          author_name?: string | null
          category?: string | null
          clap_count?: number
          click_count?: number
          content_markdown?: string
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          id?: string
          is_sponsored?: boolean
          last_viewed_at?: string | null
          locale?: string
          published_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          source_locale?: string
          sponsored_approved_at?: string | null
          sponsored_approved_by?: string | null
          sponsored_owner_user_id?: string | null
          sponsored_rejected_at?: string | null
          sponsored_rejected_by?: string | null
          sponsored_rejection_reason?: string | null
          sponsored_submitted_at?: string | null
          sponsorship_status?: string
          status?: string
          title?: string
          translation_group_id?: string
          updated_at?: string
          updated_by?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "editorial_posts_sponsored_approved_by_fkey"
            columns: ["sponsored_approved_by"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_posts_sponsored_approved_by_fkey"
            columns: ["sponsored_approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_posts_sponsored_owner_user_id_fkey"
            columns: ["sponsored_owner_user_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_posts_sponsored_owner_user_id_fkey"
            columns: ["sponsored_owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_posts_sponsored_rejected_by_fkey"
            columns: ["sponsored_rejected_by"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_posts_sponsored_rejected_by_fkey"
            columns: ["sponsored_rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      editorial_sponsorship_orders: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          owner_user_id: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          translation_group_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          owner_user_id?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          translation_group_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          owner_user_id?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          translation_group_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "editorial_sponsorship_orders_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_sponsorship_orders_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      external_api_call_events: {
        Row: {
          channel: string
          created_at: string
          duration_ms: number
          endpoint: string
          id: string
          ip_address: unknown
          metadata: Json
          method: string | null
          request_id: string | null
          status_code: number | null
          success: boolean
          user_agent: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          duration_ms?: number
          endpoint: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          method?: string | null
          request_id?: string | null
          status_code?: number | null
          success?: boolean
          user_agent?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          duration_ms?: number
          endpoint?: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          method?: string | null
          request_id?: string | null
          status_code?: number | null
          success?: boolean
          user_agent?: string | null
        }
        Relationships: []
      }
      footer_social_links: {
        Row: {
          created_at: string
          icon: string
          id: string
          is_enabled: boolean
          label_en: string
          label_fr: string
          order_index: number
          platform: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          icon: string
          id?: string
          is_enabled?: boolean
          label_en: string
          label_fr: string
          order_index?: number
          platform: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          is_enabled?: boolean
          label_en?: string
          label_fr?: string
          order_index?: number
          platform?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      homepage_layout_configs: {
        Row: {
          created_at: string
          environment: string
          published_at: string | null
          published_by: string | null
          sections: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          environment: string
          published_at?: string | null
          published_by?: string | null
          sections?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          environment?: string
          published_at?: string | null
          published_by?: string | null
          sections?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      license_activation_events: {
        Row: {
          created_at: string
          external_user_ref: string | null
          id: string
          idempotency_key: string
          license_key_id: string | null
          metadata: Json
          product_id: string | null
          purchase_id: string | null
          reason: string | null
          seller_id: string
          status: string
          vendor_user_id: string | null
        }
        Insert: {
          created_at?: string
          external_user_ref?: string | null
          id?: string
          idempotency_key: string
          license_key_id?: string | null
          metadata?: Json
          product_id?: string | null
          purchase_id?: string | null
          reason?: string | null
          seller_id: string
          status: string
          vendor_user_id?: string | null
        }
        Update: {
          created_at?: string
          external_user_ref?: string | null
          id?: string
          idempotency_key?: string
          license_key_id?: string | null
          metadata?: Json
          product_id?: string | null
          purchase_id?: string | null
          reason?: string | null
          seller_id?: string
          status?: string
          vendor_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "license_activation_events_license_key_id_fkey"
            columns: ["license_key_id"]
            isOneToOne: false
            referencedRelation: "license_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_activation_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_review_stats"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "license_activation_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_activation_events_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_activation_events_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_activation_events_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      license_keys: {
        Row: {
          created_at: string
          id: string
          key: string
          max_uses: number | null
          product_id: string
          purchase_id: string
          status: string
          uses_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          max_uses?: number | null
          product_id: string
          purchase_id: string
          status?: string
          uses_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          max_uses?: number | null
          product_id?: string
          purchase_id?: string
          status?: string
          uses_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "license_keys_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_review_stats"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "license_keys_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_keys_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      license_webhook_deliveries: {
        Row: {
          attempt_count: number
          created_at: string
          delivered_at: string | null
          endpoint_url: string
          event_id: string
          event_type: string
          id: string
          last_attempt_at: string | null
          last_error: string | null
          last_response_body: string | null
          last_response_status: number | null
          license_key_id: string | null
          max_attempts: number
          next_attempt_at: string
          payload: Json
          product_id: string | null
          purchase_id: string | null
          seller_id: string
          signature: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          delivered_at?: string | null
          endpoint_url: string
          event_id: string
          event_type?: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_response_body?: string | null
          last_response_status?: number | null
          license_key_id?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          product_id?: string | null
          purchase_id?: string | null
          seller_id: string
          signature?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          delivered_at?: string | null
          endpoint_url?: string
          event_id?: string
          event_type?: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_response_body?: string | null
          last_response_status?: number | null
          license_key_id?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          product_id?: string | null
          purchase_id?: string | null
          seller_id?: string
          signature?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "license_webhook_deliveries_license_key_id_fkey"
            columns: ["license_key_id"]
            isOneToOne: false
            referencedRelation: "license_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_webhook_deliveries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_review_stats"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "license_webhook_deliveries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_webhook_deliveries_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_webhook_deliveries_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_webhook_deliveries_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_analytics_retention_policy: {
        Row: {
          days_to_retain: number
          enabled: boolean
          id: string
          last_purge_at: string | null
          updated_at: string
        }
        Insert: {
          days_to_retain?: number
          enabled?: boolean
          id?: string
          last_purge_at?: string | null
          updated_at?: string
        }
        Update: {
          days_to_retain?: number
          enabled?: boolean
          id?: string
          last_purge_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      marketing_campaign_events: {
        Row: {
          campaign_id: string
          created_at: string
          device_type: string | null
          event_type: string
          fingerprint: string | null
          id: string
          locale: string
          metadata: Json | null
          page_url: string | null
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          device_type?: string | null
          event_type: string
          fingerprint?: string | null
          id?: string
          locale: string
          metadata?: Json | null
          page_url?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          device_type?: string | null
          event_type?: string
          fingerprint?: string | null
          id?: string
          locale?: string
          metadata?: Json | null
          page_url?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaign_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          background_image_url: string | null
          body_en: string | null
          body_fr: string | null
          click_count: number
          content_locales: string[]
          content_source_locale: string | null
          conversion_count: number
          created_at: string
          created_by: string | null
          cta_text_en: string | null
          cta_text_fr: string | null
          cta_url: string | null
          custom_config: Json | null
          end_at: string | null
          id: string
          image_url: string | null
          name: string
          priority: number
          start_at: string | null
          status: Database["public"]["Enums"]["marketing_campaign_status"]
          targeting_rules: Json | null
          template_id: string | null
          title_en: string
          title_fr: string
          trigger_config: Json | null
          trigger_type: Database["public"]["Enums"]["marketing_trigger_type"]
          updated_at: string
          updated_by: string | null
          view_count: number
        }
        Insert: {
          background_image_url?: string | null
          body_en?: string | null
          body_fr?: string | null
          click_count?: number
          content_locales?: string[]
          content_source_locale?: string | null
          conversion_count?: number
          created_at?: string
          created_by?: string | null
          cta_text_en?: string | null
          cta_text_fr?: string | null
          cta_url?: string | null
          custom_config?: Json | null
          end_at?: string | null
          id?: string
          image_url?: string | null
          name: string
          priority?: number
          start_at?: string | null
          status?: Database["public"]["Enums"]["marketing_campaign_status"]
          targeting_rules?: Json | null
          template_id?: string | null
          title_en: string
          title_fr: string
          trigger_config?: Json | null
          trigger_type?: Database["public"]["Enums"]["marketing_trigger_type"]
          updated_at?: string
          updated_by?: string | null
          view_count?: number
        }
        Update: {
          background_image_url?: string | null
          body_en?: string | null
          body_fr?: string | null
          click_count?: number
          content_locales?: string[]
          content_source_locale?: string | null
          conversion_count?: number
          created_at?: string
          created_by?: string | null
          cta_text_en?: string | null
          cta_text_fr?: string | null
          cta_url?: string | null
          custom_config?: Json | null
          end_at?: string | null
          id?: string
          image_url?: string | null
          name?: string
          priority?: number
          start_at?: string | null
          status?: Database["public"]["Enums"]["marketing_campaign_status"]
          targeting_rules?: Json | null
          template_id?: string | null
          title_en?: string
          title_fr?: string
          trigger_config?: Json | null
          trigger_type?: Database["public"]["Enums"]["marketing_trigger_type"]
          updated_at?: string
          updated_by?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "marketing_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_templates: {
        Row: {
          created_at: string
          default_config: Json
          description_en: string | null
          description_fr: string | null
          display_order: number
          id: string
          is_active: boolean
          layout_schema: Json
          name_en: string
          name_fr: string
          preview_image_url: string | null
          slug: string
          template_type: Database["public"]["Enums"]["marketing_template_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_config?: Json
          description_en?: string | null
          description_fr?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          layout_schema: Json
          name_en: string
          name_fr: string
          preview_image_url?: string | null
          slug: string
          template_type: Database["public"]["Enums"]["marketing_template_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_config?: Json
          description_en?: string | null
          description_fr?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          layout_schema?: Json
          name_en?: string
          name_fr?: string
          preview_image_url?: string | null
          slug?: string
          template_type?: Database["public"]["Enums"]["marketing_template_type"]
          updated_at?: string
        }
        Relationships: []
      }
      notification_push_deliveries: {
        Row: {
          attempt_count: number
          created_at: string
          id: string
          last_error: string | null
          next_attempt_at: string
          notification_id: string
          sent_at: string | null
          status: string
          subscription_id: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          notification_id: string
          sent_at?: string | null
          status?: string
          subscription_id: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          notification_id?: string
          sent_at?: string | null
          status?: string
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_push_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_push_deliveries_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "notification_push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          device_label: string | null
          endpoint: string
          id: string
          is_active: boolean
          last_seen_at: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          device_label?: string | null
          endpoint: string
          id?: string
          is_active?: boolean
          last_seen_at?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          device_label?: string | null
          endpoint?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          created_at: string
          description: string | null
          email_enabled: boolean
          in_app_enabled: boolean
          is_active: boolean
          key: string
          message_en: string
          message_fr: string
          name: string
          push_enabled: boolean
          subject_en: string
          subject_fr: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          email_enabled?: boolean
          in_app_enabled?: boolean
          is_active?: boolean
          key: string
          message_en: string
          message_fr: string
          name: string
          push_enabled?: boolean
          subject_en: string
          subject_fr: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          email_enabled?: boolean
          in_app_enabled?: boolean
          is_active?: boolean
          key?: string
          message_en?: string
          message_fr?: string
          name?: string
          push_enabled?: boolean
          subject_en?: string
          subject_fr?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          email_error: string | null
          email_provider: string | null
          email_provider_message_id: string | null
          email_sent_at: string | null
          email_status: string
          email_subject: string | null
          email_to: string | null
          id: string
          is_read: boolean
          link: string | null
          message: string | null
          metadata: Json
          read_at: string | null
          template_key: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_error?: string | null
          email_provider?: string | null
          email_provider_message_id?: string | null
          email_sent_at?: string | null
          email_status?: string
          email_subject?: string | null
          email_to?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string | null
          metadata?: Json
          read_at?: string | null
          template_key: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_error?: string | null
          email_provider?: string | null
          email_provider_message_id?: string | null
          email_sent_at?: string | null
          email_status?: string
          email_subject?: string | null
          email_to?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string | null
          metadata?: Json
          read_at?: string | null
          template_key?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          amount_cents: number
          created_at: string
          fulfillment_status: string
          id: string
          order_id: string
          platform_fee_cents: number
          product_id: string
          purchase_id: string | null
          seller_id: string
          seller_payout_cents: number
          variant_id: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          fulfillment_status?: string
          id?: string
          order_id: string
          platform_fee_cents?: number
          product_id: string
          purchase_id?: string | null
          seller_id: string
          seller_payout_cents?: number
          variant_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          fulfillment_status?: string
          id?: string
          order_id?: string
          platform_fee_cents?: number
          product_id?: string
          purchase_id?: string | null
          seller_id?: string
          seller_payout_cents?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_review_stats"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          buyer_id: string
          created_at: string
          currency: string
          fee_cents: number
          id: string
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          subtotal_cents: number
          tax_cents: number
          total_cents: number
          updated_at: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          currency: string
          fee_cents?: number
          id?: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          currency?: string
          fee_cents?: number
          id?: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          order_id: string | null
          provider: string
          provider_charge_id: string | null
          provider_checkout_session_id: string | null
          provider_payment_intent_id: string | null
          raw_metadata: Json
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency: string
          failure_reason?: string | null
          id?: string
          order_id?: string | null
          provider?: string
          provider_charge_id?: string | null
          provider_checkout_session_id?: string | null
          provider_payment_intent_id?: string | null
          raw_metadata?: Json
          status: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          order_id?: string | null
          provider?: string
          provider_charge_id?: string | null
          provider_checkout_session_id?: string | null
          provider_payment_intent_id?: string | null
          raw_metadata?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_bundle_items: {
        Row: {
          bundle_id: string
          created_at: string
          product_id: string
        }
        Insert: {
          bundle_id: string
          created_at?: string
          product_id: string
        }
        Update: {
          bundle_id?: string
          created_at?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_bundle_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "product_review_stats"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_bundle_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_bundle_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_review_stats"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_bundle_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          created_at: string
          description_en: string | null
          description_fr: string | null
          display_order: number
          id: string
          is_active: boolean
          name_en: string
          name_fr: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_en?: string | null
          description_fr?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name_en: string
          name_fr: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_en?: string | null
          description_fr?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name_en?: string
          name_fr?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_popularity_agg_90d: {
        Row: {
          product_id: string
          sales_90d: number
          updated_at: string
          views_90d: number
        }
        Insert: {
          product_id: string
          sales_90d?: number
          updated_at?: string
          views_90d?: number
        }
        Update: {
          product_id?: string
          sales_90d?: number
          updated_at?: string
          views_90d?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_popularity_agg_90d_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "product_review_stats"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_popularity_agg_90d_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          buyer_id: string
          comment: string
          created_at: string
          id: string
          product_id: string
          rating: number
          updated_at: string
        }
        Insert: {
          buyer_id: string
          comment: string
          created_at?: string
          id?: string
          product_id: string
          rating: number
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          comment?: string
          created_at?: string
          id?: string
          product_id?: string
          rating?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_review_stats"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_subcategories: {
        Row: {
          category_id: string
          created_at: string
          description_en: string | null
          description_fr: string | null
          display_order: number
          id: string
          is_active: boolean
          name_en: string
          name_fr: string
          slug: string
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          description_en?: string | null
          description_fr?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name_en: string
          name_fr: string
          slug: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          description_en?: string | null
          description_fr?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name_en?: string
          name_fr?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          created_at: string
          id: string
          name: string
          price_override: number | null
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          price_override?: number | null
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          price_override?: number | null
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_review_stats"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_views: {
        Row: {
          count: number
          id: string
          product_id: string
          view_date: string
        }
        Insert: {
          count?: number
          id?: string
          product_id: string
          view_date?: string
        }
        Update: {
          count?: number
          id?: string
          product_id?: string
          view_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_views_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_review_stats"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_views_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          category_id: string | null
          content_locales: string[] | null
          content_source_locale: string | null
          cover_image_url: string | null
          created_at: string
          description: string | null
          download_count: number
          features: Json | null
          file_path_vault: string | null
          file_size: string | null
          format: string | null
          gallery_urls: string[] | null
          generates_license_key: boolean
          id: string
          is_bundle: boolean
          is_pwyw: boolean
          min_price: number | null
          original_price: number | null
          price: number
          search_vector: unknown
          seller_id: string
          slug: string
          status: string
          subcategory_id: string | null
          tags: string[] | null
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          category?: string | null
          category_id?: string | null
          content_locales?: string[] | null
          content_source_locale?: string | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          download_count?: number
          features?: Json | null
          file_path_vault?: string | null
          file_size?: string | null
          format?: string | null
          gallery_urls?: string[] | null
          generates_license_key?: boolean
          id?: string
          is_bundle?: boolean
          is_pwyw?: boolean
          min_price?: number | null
          original_price?: number | null
          price: number
          search_vector?: unknown
          seller_id: string
          slug: string
          status?: string
          subcategory_id?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          category?: string | null
          category_id?: string | null
          content_locales?: string[] | null
          content_source_locale?: string | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          download_count?: number
          features?: Json | null
          file_path_vault?: string | null
          file_size?: string | null
          format?: string | null
          gallery_urls?: string[] | null
          generates_license_key?: boolean
          id?: string
          is_bundle?: boolean
          is_pwyw?: boolean
          min_price?: number | null
          original_price?: number | null
          price?: number
          search_vector?: unknown
          seller_id?: string
          slug?: string
          status?: string
          subcategory_id?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "product_subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          business_description: string
          business_mcc: string
          business_url: string
          country: string | null
          created_at: string
          display_name: string | null
          id: string
          is_verified: boolean
          legal_acceptance_version: string | null
          legal_accepted_at: string | null
          onboarding_completed: boolean
          plan_type: string
          role: string
          shop_name: string | null
          slug: string | null
          stripe_account_id: string | null
          stripe_charges_enabled: boolean
          stripe_customer_id: string | null
          stripe_details_submitted: boolean
          stripe_onboarding_completed_at: string | null
          stripe_payouts_enabled: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          business_description?: string
          business_mcc?: string
          business_url?: string
          country?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          is_verified?: boolean
          legal_acceptance_version?: string | null
          legal_accepted_at?: string | null
          onboarding_completed?: boolean
          plan_type?: string
          role?: string
          shop_name?: string | null
          slug?: string | null
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_customer_id?: string | null
          stripe_details_submitted?: boolean
          stripe_onboarding_completed_at?: string | null
          stripe_payouts_enabled?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          business_description?: string
          business_mcc?: string
          business_url?: string
          country?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_verified?: boolean
          legal_acceptance_version?: string | null
          legal_accepted_at?: string | null
          onboarding_completed?: boolean
          plan_type?: string
          role?: string
          shop_name?: string | null
          slug?: string | null
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_customer_id?: string | null
          stripe_details_submitted?: boolean
          stripe_onboarding_completed_at?: string | null
          stripe_payouts_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      purchase_incident_actions: {
        Row: {
          action_type: string
          actor_role: string
          actor_user_id: string | null
          created_at: string
          id: string
          incident_id: string
          metadata: Json
        }
        Insert: {
          action_type: string
          actor_role: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          incident_id: string
          metadata?: Json
        }
        Update: {
          action_type?: string
          actor_role?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          incident_id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "purchase_incident_actions_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_incident_actions_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_incident_actions_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "purchase_incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_incidents: {
        Row: {
          assigned_admin_id: string | null
          buyer_id: string
          closed_at: string | null
          created_at: string
          decision: string | null
          evidence_urls: Json
          id: string
          issue_type: string
          opened_by: string
          product_id: string
          purchase_id: string
          refund_amount: number | null
          resolution: string | null
          sla_deadline_at: string | null
          status: string
          stripe_refund_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_admin_id?: string | null
          buyer_id: string
          closed_at?: string | null
          created_at?: string
          decision?: string | null
          evidence_urls?: Json
          id?: string
          issue_type: string
          opened_by: string
          product_id: string
          purchase_id: string
          refund_amount?: number | null
          resolution?: string | null
          sla_deadline_at?: string | null
          status?: string
          stripe_refund_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_admin_id?: string | null
          buyer_id?: string
          closed_at?: string | null
          created_at?: string
          decision?: string | null
          evidence_urls?: Json
          id?: string
          issue_type?: string
          opened_by?: string
          product_id?: string
          purchase_id?: string
          refund_amount?: number | null
          resolution?: string | null
          sla_deadline_at?: string | null
          status?: string
          stripe_refund_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_incidents_assigned_admin_id_fkey"
            columns: ["assigned_admin_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_incidents_assigned_admin_id_fkey"
            columns: ["assigned_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_incidents_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_incidents_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_incidents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_review_stats"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_incidents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_incidents_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          affiliate_commission: number | null
          affiliate_id: string | null
          amount: number
          buyer_id: string
          cart_id: string | null
          cart_item_id: string | null
          commission_kode01: number
          created_at: string
          currency: string
          id: string
          is_bundle_derived: boolean
          product_id: string
          seller_id: string
          seller_payout: number
          source_bundle_purchase_id: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          variant_id: string | null
        }
        Insert: {
          affiliate_commission?: number | null
          affiliate_id?: string | null
          amount: number
          buyer_id: string
          cart_id?: string | null
          cart_item_id?: string | null
          commission_kode01?: number
          created_at?: string
          currency?: string
          id?: string
          is_bundle_derived?: boolean
          product_id: string
          seller_id: string
          seller_payout?: number
          source_bundle_purchase_id?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          variant_id?: string | null
        }
        Update: {
          affiliate_commission?: number | null
          affiliate_id?: string | null
          amount?: number
          buyer_id?: string
          cart_id?: string | null
          cart_item_id?: string | null
          commission_kode01?: number
          created_at?: string
          currency?: string
          id?: string
          is_bundle_derived?: boolean
          product_id?: string
          seller_id?: string
          seller_payout?: number
          source_bundle_purchase_id?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_cart_item_id_fkey"
            columns: ["cart_item_id"]
            isOneToOne: false
            referencedRelation: "cart_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_review_stats"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_source_bundle_purchase_id_fkey"
            columns: ["source_bundle_purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          signal_payload: Json
          source_slug: string | null
          source_type: string
          target_product_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          signal_payload?: Json
          source_slug?: string | null
          source_type: string
          target_product_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          signal_payload?: Json
          source_slug?: string | null
          source_type?: string
          target_product_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_events_target_product_id_fkey"
            columns: ["target_product_id"]
            isOneToOne: false
            referencedRelation: "product_review_stats"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "recommendation_events_target_product_id_fkey"
            columns: ["target_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          id: string
          order_id: string | null
          order_item_id: string | null
          payment_id: string | null
          purchase_id: string | null
          reason: string | null
          status: string
          stripe_refund_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency: string
          id?: string
          order_id?: string | null
          order_item_id?: string | null
          payment_id?: string | null
          purchase_id?: string | null
          reason?: string | null
          status?: string
          stripe_refund_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          order_id?: string | null
          order_item_id?: string | null
          payment_id?: string | null
          purchase_id?: string | null
          reason?: string | null
          status?: string
          stripe_refund_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      restricted_shop_names: {
        Row: {
          created_at: string | null
          id: string
          is_regex: boolean | null
          keyword: string
          reason: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_regex?: boolean | null
          keyword: string
          reason?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_regex?: boolean | null
          keyword?: string
          reason?: string | null
        }
        Relationships: []
      }
      scheduled_emails: {
        Row: {
          buyer_id: string
          created_at: string
          email_type: string
          error_message: string | null
          id: string
          purchase_id: string
          scheduled_for: string
          sent_at: string | null
          status: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          email_type: string
          error_message?: string | null
          id?: string
          purchase_id: string
          scheduled_for: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          email_type?: string
          error_message?: string | null
          id?: string
          purchase_id?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_emails_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_emails_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_emails_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_daily_analytics: {
        Row: {
          metric_date: string
          product_id: string
          refund_cents: number
          revenue_cents: number
          sales_count: number
          seller_id: string
          updated_at: string
          views_count: number
        }
        Insert: {
          metric_date: string
          product_id: string
          refund_cents?: number
          revenue_cents?: number
          sales_count?: number
          seller_id: string
          updated_at?: string
          views_count?: number
        }
        Update: {
          metric_date?: string
          product_id?: string
          refund_cents?: number
          revenue_cents?: number
          sales_count?: number
          seller_id?: string
          updated_at?: string
          views_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "seller_daily_analytics_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_review_stats"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "seller_daily_analytics_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_daily_analytics_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_daily_analytics_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_overrides: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          locale: string
          og_description: string | null
          og_title: string | null
          route_path: string
          title: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          locale?: string
          og_description?: string | null
          og_title?: string | null
          route_path: string
          title?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          locale?: string
          og_description?: string | null
          og_title?: string | null
          route_path?: string
          title?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      seo_blog_agent_profiles: {
        Row: {
          activated_at: string | null
          base_profile_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          nodes_config: Json
          run_config: Json
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          activated_at?: string | null
          base_profile_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          nodes_config?: Json
          run_config?: Json
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          activated_at?: string | null
          base_profile_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          nodes_config?: Json
          run_config?: Json
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "seo_blog_agent_profiles_base_profile_id_fkey"
            columns: ["base_profile_id"]
            isOneToOne: false
            referencedRelation: "seo_blog_agent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_blog_agent_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_blog_agent_profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_blog_agent_runs: {
        Row: {
          article_html: string | null
          article_markdown: string | null
          created_at: string
          created_by: string | null
          editorial_post_id: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          input: Json
          job_id: string | null
          mode: string
          node_statuses: Json
          output_outline: Json | null
          profile_id: string | null
          qa_report: Json
          sources_used: Json
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          article_html?: string | null
          article_markdown?: string | null
          created_at?: string
          created_by?: string | null
          editorial_post_id?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          job_id?: string | null
          mode?: string
          node_statuses?: Json
          output_outline?: Json | null
          profile_id?: string | null
          qa_report?: Json
          sources_used?: Json
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          article_html?: string | null
          article_markdown?: string | null
          created_at?: string
          created_by?: string | null
          editorial_post_id?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          job_id?: string | null
          mode?: string
          node_statuses?: Json
          output_outline?: Json | null
          profile_id?: string | null
          qa_report?: Json
          sources_used?: Json
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_blog_agent_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_blog_agent_runs_editorial_post_id_fkey"
            columns: ["editorial_post_id"]
            isOneToOne: false
            referencedRelation: "editorial_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_blog_agent_runs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "seo_blog_agent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_lockscreen_config: {
        Row: {
          auth_gate_enabled: boolean
          created_at: string
          id: string
          is_enabled: boolean
          message_en: string
          message_fr: string
          newsletter_cta_en: string
          newsletter_cta_fr: string
          newsletter_enabled: boolean
          newsletter_title_en: string
          newsletter_title_fr: string
          password_hash: string
          title_en: string
          title_fr: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auth_gate_enabled?: boolean
          created_at?: string
          id?: string
          is_enabled?: boolean
          message_en?: string
          message_fr?: string
          newsletter_cta_en?: string
          newsletter_cta_fr?: string
          newsletter_enabled?: boolean
          newsletter_title_en?: string
          newsletter_title_fr?: string
          password_hash: string
          title_en?: string
          title_fr?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auth_gate_enabled?: boolean
          created_at?: string
          id?: string
          is_enabled?: boolean
          message_en?: string
          message_fr?: string
          newsletter_cta_en?: string
          newsletter_cta_fr?: string
          newsletter_enabled?: boolean
          newsletter_title_en?: string
          newsletter_title_fr?: string
          password_hash?: string
          title_en?: string
          title_fr?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      stripe_webhook_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_id: string
          id: string
          locked_at: string | null
          processed_at: string | null
          status: string
          type: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_id: string
          id?: string
          locked_at?: string | null
          processed_at?: string | null
          status: string
          type: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_id?: string
          id?: string
          locked_at?: string | null
          processed_at?: string | null
          status?: string
          type?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          created_at: string
          display_name: string | null
          feature_key: string
          grants_pro_entitlement: boolean
          is_active: boolean
          metadata: Json
          plan_key: string
          stripe_price_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          feature_key: string
          grants_pro_entitlement?: boolean
          is_active?: boolean
          metadata?: Json
          plan_key: string
          stripe_price_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          feature_key?: string
          grants_pro_entitlement?: boolean
          is_active?: boolean
          metadata?: Json
          plan_key?: string
          stripe_price_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_marketing_preferences: {
        Row: {
          created_at: string
          dismissed_campaigns: Json | null
          id: string
          marketing_enabled: boolean
          newsletter_popups_enabled: boolean
          promotional_banners_enabled: boolean
          session_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          dismissed_campaigns?: Json | null
          id?: string
          marketing_enabled?: boolean
          newsletter_popups_enabled?: boolean
          promotional_banners_enabled?: boolean
          session_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          dismissed_campaigns?: Json | null
          id?: string
          marketing_enabled?: boolean
          newsletter_popups_enabled?: boolean
          promotional_banners_enabled?: boolean
          session_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_saved_items: {
        Row: {
          created_at: string
          id: string
          item_id: string
          item_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          item_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          item_type?: string
          user_id?: string
        }
        Relationships: []
      }
      vendor_applications: {
        Row: {
          created_at: string
          description: string
          email: string
          id: string
          name: string
          product_type: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          email: string
          id?: string
          name: string
          product_type: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          email?: string
          id?: string
          name?: string
          product_type?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_country_change_events: {
        Row: {
          created_at: string
          from_country: string | null
          id: string
          metadata: Json
          new_stripe_account_id: string | null
          old_stripe_account_id: string | null
          reason: string | null
          status: string
          to_country: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          from_country?: string | null
          id?: string
          metadata?: Json
          new_stripe_account_id?: string | null
          old_stripe_account_id?: string | null
          reason?: string | null
          status: string
          to_country: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          from_country?: string | null
          id?: string
          metadata?: Json
          new_stripe_account_id?: string | null
          old_stripe_account_id?: string | null
          reason?: string | null
          status?: string
          to_country?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_country_change_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_country_change_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_license_integrations: {
        Row: {
          api_secret: string | null
          api_secret_hash: string | null
          created_at: string
          enabled: boolean
          id: string
          seller_id: string
          updated_at: string
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          api_secret?: string | null
          api_secret_hash?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          seller_id: string
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          api_secret?: string | null
          api_secret_hash?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          seller_id?: string
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_license_integrations_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: true
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_license_integrations_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      active_billing_entitlements: {
        Row: {
          ends_at: string | null
          feature_key: string | null
          feature_value: string | null
          metadata: Json | null
          source: string | null
          starts_at: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          user_id: string | null
        }
        Insert: {
          ends_at?: string | null
          feature_key?: string | null
          feature_value?: string | null
          metadata?: Json | null
          source?: string | null
          starts_at?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          user_id?: string | null
        }
        Update: {
          ends_at?: string | null
          feature_key?: string | null
          feature_value?: string | null
          metadata?: Json | null
          source?: string | null
          starts_at?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_entitlements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_entitlements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      article_clap_stats: {
        Row: {
          content_id: string | null
          content_type: string | null
          total_claps: number | null
          unique_clappers: number | null
        }
        Relationships: []
      }
      product_review_stats: {
        Row: {
          average_rating: number | null
          product_id: string | null
          reviews_count: number | null
        }
        Relationships: []
      }
      profile_marketplace_data: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          id: string | null
          is_verified: boolean | null
          role: string | null
          shop_name: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          is_verified?: boolean | null
          role?: string | null
          shop_name?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          is_verified?: boolean | null
          role?: string | null
          shop_name?: string | null
        }
        Relationships: []
      }
      seller_revenue_summary: {
        Row: {
          affiliate_commission_amount: number | null
          gross_amount: number | null
          platform_commission_amount: number | null
          sales_count: number | null
          seller_id: string | null
          seller_net_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profile_marketplace_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activate_license_key_v1: {
        Args: {
          p_external_user_ref: string
          p_idempotency_key: string
          p_license_key: string
          p_product_id: string
          p_seller_id: string
          p_vendor_user_id: string
        }
        Returns: {
          activation_status: string
          key_status: string
          license_key_id: string
          max_uses: number
          product_id: string
          purchase_id: string
          reason: string
          replayed: boolean
          seller_id: string
          uses_count: number
        }[]
      }
      check_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      check_rate_limit_detailed: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: {
          allowed: boolean
          remaining: number
          request_count: number
          reset_at: string
        }[]
      }
      cleanup_bot_activity: { Args: { p_keep_days?: number }; Returns: number }
      cleanup_expired_ad_inventory_holds: { Args: never; Returns: number }
      confirm_news_inventory: { Args: { p_campaign_id: string }; Returns: Json }
      current_user_is_admin: { Args: never; Returns: boolean }
      is_admin_user: { Args: never; Returns: boolean }
      is_mfa_verified: { Args: never; Returns: boolean }
      get_active_campaigns_for_context: {
        Args: {
          p_device_type?: string
          p_locale: string
          p_page_url: string
          p_user_role?: string
        }
        Returns: {
          body: string
          campaign_id: string
          cta_text: string
          cta_url: string
          custom_config: Json
          image_url: string
          priority: number
          template_type: Database["public"]["Enums"]["marketing_template_type"]
          title: string
          trigger_config: Json
          trigger_type: Database["public"]["Enums"]["marketing_trigger_type"]
        }[]
      }
      get_creator_sales_count: {
        Args: { p_seller_id: string }
        Returns: number
      }
      get_marketing_retention_status: {
        Args: never
        Returns: {
          days_to_retain: number
          enabled: boolean
          last_purge_at: string
          newest_event_date: string
          oldest_event_date: string
          total_events: number
        }[]
      }
      get_news_inventory_window: {
        Args: { p_campaign_id: string; p_timezone?: string }
        Returns: {
          block_count: number
          block_start: string
          end_at: string
          start_at: string
        }[]
      }
      get_perf_observability_snapshot: { Args: never; Returns: Json }
      get_product_sales_count: {
        Args: { p_product_id: string }
        Returns: number
      }
      get_seller_analytics_30d: {
        Args: { p_seller_id: string }
        Returns: {
          chart_data: Json
          conversion_rate: number
          total_revenue: number
          total_sales: number
          total_views: number
        }[]
      }
      get_total_sales_count: { Args: never; Returns: number }
      increment_campaign_clicks: {
        Args: { campaign_uuid: string }
        Returns: undefined
      }
      increment_campaign_views: {
        Args: { campaign_uuid: string }
        Returns: undefined
      }
      list_top_deals: {
        Args: { p_limit?: number; p_since: string }
        Returns: {
          product_id: string
          sales_count: number
        }[]
      }
      log_audit_event: {
        Args: {
          p_event_type: string
          p_metadata?: Json
          p_new_data?: Json
          p_old_data?: Json
          p_user_id: string
        }
        Returns: string
      }
      profile_sensitive_fields_unchanged: {
        Args: {
          p_is_verified: boolean
          p_plan_type: string
          p_role: string
          p_stripe_account_id: string
          p_stripe_charges_enabled: boolean
          p_stripe_customer_id: string
          p_stripe_details_submitted: boolean
          p_stripe_onboarding_completed_at: string
          p_stripe_payouts_enabled: boolean
        }
        Returns: boolean
      }
      purge_old_marketing_events: {
        Args: { days_to_retain?: number }
        Returns: {
          events_deleted: number
          oldest_remaining_date: string
        }[]
      }
      refresh_product_popularity_agg_90d: { Args: never; Returns: undefined }
      reserve_news_inventory: {
        Args: {
          p_block_count: number
          p_campaign_id: string
          p_hold_expires_at?: string
          p_news_format: string
          p_timezone?: string
        }
        Returns: Json
      }
      search_market_products_page: {
        Args: {
          p_category_id?: string
          p_limit?: number
          p_offset?: number
          p_query: string
          p_sort?: string
          p_subcategory_ids?: string[]
          p_tags?: string[]
          p_type?: string
        }
        Returns: {
          product_ids: string[]
          total_count: number
        }[]
      }
      suggest_product_titles: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          title: string
        }[]
      }
      upsert_article_clap: {
        Args: {
          p_add_count: number
          p_clapper_id: string
          p_content_id: string
          p_content_type: string
        }
        Returns: {
          total_claps: number
          user_claps: number
        }[]
      }
    }
    Enums: {
      marketing_campaign_status:
        | "draft"
        | "scheduled"
        | "active"
        | "paused"
        | "completed"
        | "archived"
      marketing_template_type:
        | "popup_center"
        | "popup_corner_br"
        | "popup_corner_bl"
        | "banner_top"
        | "banner_inline"
        | "banner_floating"
        | "newsletter_form"
        | "announcement"
        | "promotional"
      marketing_trigger_type:
        | "page_load"
        | "scroll_depth"
        | "time_delay"
        | "exit_intent"
        | "manual"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      marketing_campaign_status: [
        "draft",
        "scheduled",
        "active",
        "paused",
        "completed",
        "archived",
      ],
      marketing_template_type: [
        "popup_center",
        "popup_corner_br",
        "popup_corner_bl",
        "banner_top",
        "banner_inline",
        "banner_floating",
        "newsletter_form",
        "announcement",
        "promotional",
      ],
      marketing_trigger_type: [
        "page_load",
        "scroll_depth",
        "time_delay",
        "exit_intent",
        "manual",
      ],
    },
  },
} as const
