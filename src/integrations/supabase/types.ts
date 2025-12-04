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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      ai_suggestions: {
        Row: {
          confidence_score: number | null
          content: string
          created_at: string
          id: string
          is_implemented: boolean
          lead_id: string
          suggestion_type: string
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          content: string
          created_at?: string
          id?: string
          is_implemented?: boolean
          lead_id: string
          suggestion_type: string
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          content?: string
          created_at?: string
          id?: string
          is_implemented?: boolean
          lead_id?: string
          suggestion_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_suggestions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_reply_settings: {
        Row: {
          auto_reply_to_existing: boolean
          auto_reply_to_leads: boolean
          business_hours_enabled: boolean
          business_hours_end: string
          business_hours_start: string
          business_hours_timezone: string
          confidence_threshold: number
          created_at: string
          enabled: boolean
          exclude_keywords: string[] | null
          general_response_template: string
          id: string
          lead_response_template: string
          min_email_length: number
          out_of_hours_template: string
          reply_delay_minutes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_reply_to_existing?: boolean
          auto_reply_to_leads?: boolean
          business_hours_enabled?: boolean
          business_hours_end?: string
          business_hours_start?: string
          business_hours_timezone?: string
          confidence_threshold?: number
          created_at?: string
          enabled?: boolean
          exclude_keywords?: string[] | null
          general_response_template?: string
          id?: string
          lead_response_template?: string
          min_email_length?: number
          out_of_hours_template?: string
          reply_delay_minutes?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_reply_to_existing?: boolean
          auto_reply_to_leads?: boolean
          business_hours_enabled?: boolean
          business_hours_end?: string
          business_hours_start?: string
          business_hours_timezone?: string
          confidence_threshold?: number
          created_at?: string
          enabled?: boolean
          exclude_keywords?: string[] | null
          general_response_template?: string
          id?: string
          lead_response_template?: string
          min_email_length?: number
          out_of_hours_template?: string
          reply_delay_minutes?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      business_knowledge: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          is_active: boolean
          tags: string[] | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          id?: string
          is_active?: boolean
          tags?: string[] | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          tags?: string[] | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_accounts: {
        Row: {
          access_token: string
          client_id: string
          client_secret: string
          created_at: string
          email: string
          id: string
          is_active: boolean
          last_sync_at: string | null
          provider: string
          refresh_token: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          client_id: string
          client_secret: string
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          provider: string
          refresh_token: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          client_id?: string
          client_secret?: string
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          provider?: string
          refresh_token?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_campaigns: {
        Row: {
          body_template: string
          created_at: string
          followup_delay_days: number
          id: string
          is_active: boolean
          max_followups: number
          name: string
          subject_template: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body_template: string
          created_at?: string
          followup_delay_days?: number
          id?: string
          is_active?: boolean
          max_followups?: number
          name: string
          subject_template: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body_template?: string
          created_at?: string
          followup_delay_days?: number
          id?: string
          is_active?: boolean
          max_followups?: number
          name?: string
          subject_template?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_configurations: {
        Row: {
          created_at: string
          from_email: string
          from_name: string
          id: string
          is_active: boolean
          smtp_host: string
          smtp_password: string
          smtp_port: number
          smtp_username: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          from_email: string
          from_name?: string
          id?: string
          is_active?: boolean
          smtp_host?: string
          smtp_password: string
          smtp_port?: number
          smtp_username: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          from_email?: string
          from_name?: string
          id?: string
          is_active?: boolean
          smtp_host?: string
          smtp_password?: string
          smtp_port?: number
          smtp_username?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          body: string
          campaign_id: string | null
          created_at: string
          followup_number: number
          id: string
          lead_id: string
          opened_at: string | null
          replied_at: string | null
          sent_at: string | null
          status: string
          subject: string
          user_id: string
        }
        Insert: {
          body: string
          campaign_id?: string | null
          created_at?: string
          followup_number?: number
          id?: string
          lead_id: string
          opened_at?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          user_id: string
        }
        Update: {
          body?: string
          campaign_id?: string | null
          created_at?: string
          followup_number?: number
          id?: string
          lead_id?: string
          opened_at?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_queue: {
        Row: {
          body_html: string
          body_text: string | null
          campaign_id: string | null
          created_at: string
          error_message: string | null
          id: string
          lead_id: string | null
          max_retries: number
          retry_count: number
          scheduled_at: string
          sent_at: string | null
          status: string
          subject: string
          to_email: string
          to_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body_html: string
          body_text?: string | null
          campaign_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          lead_id?: string | null
          max_retries?: number
          retry_count?: number
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          subject: string
          to_email: string
          to_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body_html?: string
          body_text?: string | null
          campaign_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          lead_id?: string | null
          max_retries?: number
          retry_count?: number
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          subject?: string
          to_email?: string
          to_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_queue_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      ifc_knowledge: {
        Row: {
          category: string
          content: string
          created_at: string | null
          embedding: string | null
          id: string
          metadata: Json | null
          subcategory: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          category: string
          content: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
          subcategory?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
          subcategory?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          company: string | null
          created_at: string
          email: string
          id: string
          last_contact_date: string | null
          name: string
          next_followup_date: string | null
          notes: string | null
          phone: string | null
          source: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          id?: string
          last_contact_date?: string | null
          name: string
          next_followup_date?: string | null
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          id?: string
          last_contact_date?: string | null
          name?: string
          next_followup_date?: string | null
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      processed_emails: {
        Row: {
          ai_confidence: number | null
          ai_response: string | null
          body: string
          created_at: string
          email_account_id: string
          from_email: string
          id: string
          is_lead: boolean
          lead_confidence: number | null
          lead_tags: string[] | null
          message_id: string
          received_at: string
          status: string
          subject: string
          to_email: string
          user_id: string
        }
        Insert: {
          ai_confidence?: number | null
          ai_response?: string | null
          body: string
          created_at?: string
          email_account_id: string
          from_email: string
          id?: string
          is_lead?: boolean
          lead_confidence?: number | null
          lead_tags?: string[] | null
          message_id: string
          received_at: string
          status?: string
          subject: string
          to_email: string
          user_id: string
        }
        Update: {
          ai_confidence?: number | null
          ai_response?: string | null
          body?: string
          created_at?: string
          email_account_id?: string
          from_email?: string
          id?: string
          is_lead?: boolean
          lead_confidence?: number | null
          lead_tags?: string[] | null
          message_id?: string
          received_at?: string
          status?: string
          subject?: string
          to_email?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "processed_emails_email_account_id_fkey"
            columns: ["email_account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_name: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          architecture_result: Json | null
          created_at: string
          current_stage: string | null
          generated_code: string | null
          geometry_result: Json | null
          id: string
          ifc_url: string | null
          last_error: string | null
          project_name: string | null
          spec_json: Json | null
          status: string
          updated_at: string
          user_prompt: string
          validation_result: Json | null
        }
        Insert: {
          architecture_result?: Json | null
          created_at?: string
          current_stage?: string | null
          generated_code?: string | null
          geometry_result?: Json | null
          id?: string
          ifc_url?: string | null
          last_error?: string | null
          project_name?: string | null
          spec_json?: Json | null
          status?: string
          updated_at?: string
          user_prompt: string
          validation_result?: Json | null
        }
        Update: {
          architecture_result?: Json | null
          created_at?: string
          current_stage?: string | null
          generated_code?: string | null
          geometry_result?: Json | null
          id?: string
          ifc_url?: string | null
          last_error?: string | null
          project_name?: string | null
          spec_json?: Json | null
          status?: string
          updated_at?: string
          user_prompt?: string
          validation_result?: Json | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_sent: boolean
          scheduled_date: string
          scheduled_time: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_sent?: boolean
          scheduled_date: string
          scheduled_time: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_sent?: boolean
          scheduled_date?: string
          scheduled_time?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      search_ifc_knowledge: {
        Args: {
          filter_category?: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          category: string
          content: string
          id: string
          metadata: Json
          similarity: number
          subcategory: string
          title: string
        }[]
      }
    }
    Enums: {
      code_status: "pending" | "validated" | "error" | "executing"
      pipeline_status:
        | "pending"
        | "intent_parsing"
        | "code_generation"
        | "code_validation"
        | "structural_review"
        | "executing"
        | "retrying"
        | "completed"
        | "failed"
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
  public: {
    Enums: {
      code_status: ["pending", "validated", "error", "executing"],
      pipeline_status: [
        "pending",
        "intent_parsing",
        "code_generation",
        "code_validation",
        "structural_review",
        "executing",
        "retrying",
        "completed",
        "failed",
      ],
    },
  },
} as const
