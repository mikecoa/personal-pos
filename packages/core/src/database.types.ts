
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "accounts": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"owner_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"owner_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"owner_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"cash_movements": {
                  Row: {
                    "account_id": string,"amount": number,"description": string,"employee_id": string | null,"employee_name": string | null,"id": string,"kind": "in"|"out","location_id": string,"moved_at": string,"shift_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"amount": number,"description": string,"employee_id"?: string | null,"employee_name"?: string | null,"id": string,"kind": "in"|"out","location_id": string,"moved_at": string,"shift_id": string
                  }
                  Update: {
                    "account_id"?: string,"amount"?: number,"description"?: string,"employee_id"?: string | null,"employee_name"?: string | null,"id"?: string,"kind"?: "in"|"out","location_id"?: string,"moved_at"?: string,"shift_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cash_movements_shift_id_location_id_fkey"
      columns: ["shift_id","location_id"]
isOneToOne: false
      referencedRelation: "shifts"
      referencedColumns: ["id","location_id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "account_id": string,"created_at": string,"id": string,"location_id": string,"name": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"created_at"?: string,"id"?: string,"location_id": string,"name": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string,"created_at"?: string,"id"?: string,"location_id"?: string,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_location_id_account_id_fkey"
      columns: ["location_id","account_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","account_id"]
    }
                  ]
                },"customers": {
                  Row: {
                    "account_id": string,"created_at": string,"discount_id": string | null,"email": string | null,"id": string,"location_id": string,"name": string,"note": string | null,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"created_at"?: string,"discount_id"?: string | null,"email"?: string | null,"id"?: string,"location_id": string,"name": string,"note"?: string | null,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string,"created_at"?: string,"discount_id"?: string | null,"email"?: string | null,"id"?: string,"location_id"?: string,"name"?: string,"note"?: string | null,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customers_discount_id_location_id_fkey"
      columns: ["discount_id","location_id"]
isOneToOne: false
      referencedRelation: "discounts"
      referencedColumns: ["id","location_id"]
    },{
      foreignKeyName: "customers_location_id_account_id_fkey"
      columns: ["location_id","account_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","account_id"]
    }
                  ]
                },"devices": {
                  Row: {
                    "account_id": string,"app_version": string | null,"created_at": string,"id": string,"last_error": string | null,"last_seen_at": string | null,"last_sync_ok_at": string | null,"location_id": string,"name": string,"pending_count": number,"receipt_prefix": string,"registered_by": string,"rejected_count": number,"revoked_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"app_version"?: string | null,"created_at"?: string,"id"?: string,"last_error"?: string | null,"last_seen_at"?: string | null,"last_sync_ok_at"?: string | null,"location_id": string,"name": string,"pending_count"?: number,"receipt_prefix": string,"registered_by": string,"rejected_count"?: number,"revoked_at"?: string | null
                  }
                  Update: {
                    "account_id"?: string,"app_version"?: string | null,"created_at"?: string,"id"?: string,"last_error"?: string | null,"last_seen_at"?: string | null,"last_sync_ok_at"?: string | null,"location_id"?: string,"name"?: string,"pending_count"?: number,"receipt_prefix"?: string,"registered_by"?: string,"rejected_count"?: number,"revoked_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "devices_location_id_account_id_fkey"
      columns: ["location_id","account_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","account_id"]
    }
                  ]
                },"dining_tables": {
                  Row: {
                    "account_id": string,"area_id": string | null,"created_at": string,"id": string,"is_active": boolean,"location_id": string,"name": string,"pos_x": number | null,"pos_y": number | null,"seats": number,"shape": "square"|"round"|"long","sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"area_id"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"location_id": string,"name": string,"pos_x"?: number | null,"pos_y"?: number | null,"seats"?: number,"shape"?: "square"|"round"|"long","sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string,"area_id"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"location_id"?: string,"name"?: string,"pos_x"?: number | null,"pos_y"?: number | null,"seats"?: number,"shape"?: "square"|"round"|"long","sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "dining_tables_area_id_location_id_fkey"
      columns: ["area_id","location_id"]
isOneToOne: false
      referencedRelation: "table_areas"
      referencedColumns: ["id","location_id"]
    },{
      foreignKeyName: "dining_tables_location_id_account_id_fkey"
      columns: ["location_id","account_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","account_id"]
    }
                  ]
                },"discounts": {
                  Row: {
                    "account_id": string,"created_at": string,"id": string,"is_active": boolean,"kind": "percent"|"amount","location_id": string,"name": string,"scope": "bill"|"item"|"both","sort_order": number,"updated_at": string,"value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"kind": "percent"|"amount","location_id": string,"name": string,"scope"?: "bill"|"item"|"both","sort_order"?: number,"updated_at"?: string,"value": number
                  }
                  Update: {
                    "account_id"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"kind"?: "percent"|"amount","location_id"?: string,"name"?: string,"scope"?: "bill"|"item"|"both","sort_order"?: number,"updated_at"?: string,"value"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "discounts_location_id_account_id_fkey"
      columns: ["location_id","account_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","account_id"]
    }
                  ]
                },"employee_locations": {
                  Row: {
                    "account_id": string,"employee_id": string,"location_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"employee_id": string,"location_id": string
                  }
                  Update: {
                    "account_id"?: string,"employee_id"?: string,"location_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "employee_locations_employee_id_account_id_fkey"
      columns: ["employee_id","account_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id","account_id"]
    },{
      foreignKeyName: "employee_locations_location_id_account_id_fkey"
      columns: ["location_id","account_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","account_id"]
    }
                  ]
                },"employees": {
                  Row: {
                    "account_id": string,"created_at": string,"email": string | null,"has_pin": boolean | null,"id": string,"is_active": boolean,"name": string,"phone": string | null,"pin_hash": string | null,"pin_lookup": string | null,"role_id": string,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"created_at"?: string,"email"?: string | null,"has_pin"?: never,"id"?: string,"is_active"?: boolean,"name": string,"phone"?: string | null,"pin_hash"?: string | null,"pin_lookup"?: string | null,"role_id": string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "account_id"?: string,"created_at"?: string,"email"?: string | null,"has_pin"?: never,"id"?: string,"is_active"?: boolean,"name"?: string,"phone"?: string | null,"pin_hash"?: string | null,"pin_lookup"?: string | null,"role_id"?: string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "employees_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employees_role_id_account_id_fkey"
      columns: ["role_id","account_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id","account_id"]
    }
                  ]
                },"item_modifier_sets": {
                  Row: {
                    "account_id": string,"item_id": string,"location_id": string,"modifier_set_id": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"item_id": string,"location_id": string,"modifier_set_id": string,"sort_order"?: number
                  }
                  Update: {
                    "account_id"?: string,"item_id"?: string,"location_id"?: string,"modifier_set_id"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_modifier_sets_item_id_location_id_fkey"
      columns: ["item_id","location_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","location_id"]
    },{
      foreignKeyName: "item_modifier_sets_location_id_account_id_fkey"
      columns: ["location_id","account_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","account_id"]
    },{
      foreignKeyName: "item_modifier_sets_modifier_set_id_location_id_fkey"
      columns: ["modifier_set_id","location_id"]
isOneToOne: false
      referencedRelation: "modifier_sets"
      referencedColumns: ["id","location_id"]
    }
                  ]
                },"item_variants": {
                  Row: {
                    "account_id": string,"created_at": string,"id": string,"is_active": boolean,"item_id": string,"location_id": string,"name": string,"price": number,"sku": string | null,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"item_id": string,"location_id": string,"name"?: string,"price": number,"sku"?: string | null,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"item_id"?: string,"location_id"?: string,"name"?: string,"price"?: number,"sku"?: string | null,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_variants_item_id_location_id_fkey"
      columns: ["item_id","location_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","location_id"]
    },{
      foreignKeyName: "item_variants_location_id_account_id_fkey"
      columns: ["location_id","account_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","account_id"]
    }
                  ]
                },"items": {
                  Row: {
                    "account_id": string,"avg_cost": number | null,"category_id": string | null,"created_at": string,"description": string | null,"id": string,"image_url": string | null,"is_active": boolean,"location_id": string,"name": string,"sort_order": number,"source_key": string,"stock": number,"stock_alert": number | null,"track_stock": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"avg_cost"?: number | null,"category_id"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"image_url"?: string | null,"is_active"?: boolean,"location_id": string,"name": string,"sort_order"?: number,"source_key"?: string,"stock"?: number,"stock_alert"?: number | null,"track_stock"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string,"avg_cost"?: number | null,"category_id"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"image_url"?: string | null,"is_active"?: boolean,"location_id"?: string,"name"?: string,"sort_order"?: number,"source_key"?: string,"stock"?: number,"stock_alert"?: number | null,"track_stock"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "items_category_id_location_id_fkey"
      columns: ["category_id","location_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","location_id"]
    },{
      foreignKeyName: "items_location_id_account_id_fkey"
      columns: ["location_id","account_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","account_id"]
    }
                  ]
                },"location_settings": {
                  Row: {
                    "account_id": string,"auto_shift_enabled": boolean,"default_starting_cash": number,"gratuity_enabled": boolean,"gratuity_name": string,"gratuity_rate_bp": number,"location_id": string,"pin_required_actions": (string)[],"prices_include_tax": boolean,"rounding_enabled": boolean,"rounding_mode": string,"rounding_unit": number,"save_bill_enabled": boolean,"split_payment_enabled": boolean,"stock_limit_enabled": boolean,"tax_after_discount": boolean,"tax_enabled": boolean,"tax_name": string,"tax_rate_bp": number,"track_server": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"auto_shift_enabled"?: boolean,"default_starting_cash"?: number,"gratuity_enabled"?: boolean,"gratuity_name"?: string,"gratuity_rate_bp"?: number,"location_id": string,"pin_required_actions"?: (string)[],"prices_include_tax"?: boolean,"rounding_enabled"?: boolean,"rounding_mode"?: string,"rounding_unit"?: number,"save_bill_enabled"?: boolean,"split_payment_enabled"?: boolean,"stock_limit_enabled"?: boolean,"tax_after_discount"?: boolean,"tax_enabled"?: boolean,"tax_name"?: string,"tax_rate_bp"?: number,"track_server"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string,"auto_shift_enabled"?: boolean,"default_starting_cash"?: number,"gratuity_enabled"?: boolean,"gratuity_name"?: string,"gratuity_rate_bp"?: number,"location_id"?: string,"pin_required_actions"?: (string)[],"prices_include_tax"?: boolean,"rounding_enabled"?: boolean,"rounding_mode"?: string,"rounding_unit"?: number,"save_bill_enabled"?: boolean,"split_payment_enabled"?: boolean,"stock_limit_enabled"?: boolean,"tax_after_discount"?: boolean,"tax_enabled"?: boolean,"tax_name"?: string,"tax_rate_bp"?: number,"track_server"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "location_settings_location_id_account_id_fkey"
      columns: ["location_id","account_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","account_id"]
    }
                  ]
                },"locations": {
                  Row: {
                    "account_id": string,"address": string | null,"created_at": string,"currency": string,"id": string,"is_active": boolean,"name": string,"phone": string | null,"timezone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"address"?: string | null,"created_at"?: string,"currency"?: string,"id"?: string,"is_active"?: boolean,"name": string,"phone"?: string | null,"timezone"?: string
                  }
                  Update: {
                    "account_id"?: string,"address"?: string | null,"created_at"?: string,"currency"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"phone"?: string | null,"timezone"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "locations_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    }
                  ]
                },"member_locations": {
                  Row: {
                    "account_id": string,"location_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"location_id": string,"user_id": string
                  }
                  Update: {
                    "account_id"?: string,"location_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "member_locations_account_id_user_id_fkey"
      columns: ["account_id","user_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["account_id","user_id"]
    },{
      foreignKeyName: "member_locations_location_id_account_id_fkey"
      columns: ["location_id","account_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","account_id"]
    }
                  ]
                },"members": {
                  Row: {
                    "account_id": string,"created_at": string,"display_name": string | null,"role": "owner"|"admin"|"staff","user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"created_at"?: string,"display_name"?: string | null,"role"?: "owner"|"admin"|"staff","user_id": string
                  }
                  Update: {
                    "account_id"?: string,"created_at"?: string,"display_name"?: string | null,"role"?: "owner"|"admin"|"staff","user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "members_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    }
                  ]
                },"modifier_options": {
                  Row: {
                    "account_id": string,"created_at": string,"id": string,"is_active": boolean,"location_id": string,"modifier_set_id": string,"name": string,"price": number,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"location_id": string,"modifier_set_id": string,"name": string,"price"?: number,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"location_id"?: string,"modifier_set_id"?: string,"name"?: string,"price"?: number,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "modifier_options_location_id_account_id_fkey"
      columns: ["location_id","account_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","account_id"]
    },{
      foreignKeyName: "modifier_options_modifier_set_id_location_id_fkey"
      columns: ["modifier_set_id","location_id"]
isOneToOne: false
      referencedRelation: "modifier_sets"
      referencedColumns: ["id","location_id"]
    }
                  ]
                },"modifier_sets": {
                  Row: {
                    "account_id": string,"created_at": string,"id": string,"location_id": string,"max_select": number | null,"min_select": number,"name": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"created_at"?: string,"id"?: string,"location_id": string,"max_select"?: number | null,"min_select"?: number,"name": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string,"created_at"?: string,"id"?: string,"location_id"?: string,"max_select"?: number | null,"min_select"?: number,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "modifier_sets_location_id_account_id_fkey"
      columns: ["location_id","account_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","account_id"]
    }
                  ]
                },"order_discounts": {
                  Row: {
                    "account_id": string,"amount": number,"discount_id": string | null,"id": string,"kind": "percent"|"amount","location_id": string,"name": string,"order_id": string,"value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"amount": number,"discount_id"?: string | null,"id": string,"kind": "percent"|"amount","location_id": string,"name": string,"order_id": string,"value": number
                  }
                  Update: {
                    "account_id"?: string,"amount"?: number,"discount_id"?: string | null,"id"?: string,"kind"?: "percent"|"amount","location_id"?: string,"name"?: string,"order_id"?: string,"value"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_discounts_order_id_location_id_fkey"
      columns: ["order_id","location_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id","location_id"]
    }
                  ]
                },"order_lines": {
                  Row: {
                    "account_id": string,"category_name": string | null,"discount": Json | null,"discount_amount": number,"id": string,"item_id": string | null,"item_name": string,"line_total": number,"location_id": string,"modifiers": NonNullable<Json>,"modifiers_price": number,"note": string | null,"order_id": string,"qty": number,"sort_order": number,"unit_price": number,"variant_id": string | null,"variant_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"category_name"?: string | null,"discount"?: Json | null,"discount_amount"?: number,"id": string,"item_id"?: string | null,"item_name": string,"line_total": number,"location_id": string,"modifiers"?: NonNullable<Json>,"modifiers_price"?: number,"note"?: string | null,"order_id": string,"qty": number,"sort_order": number,"unit_price": number,"variant_id"?: string | null,"variant_name"?: string
                  }
                  Update: {
                    "account_id"?: string,"category_name"?: string | null,"discount"?: Json | null,"discount_amount"?: number,"id"?: string,"item_id"?: string | null,"item_name"?: string,"line_total"?: number,"location_id"?: string,"modifiers"?: NonNullable<Json>,"modifiers_price"?: number,"note"?: string | null,"order_id"?: string,"qty"?: number,"sort_order"?: number,"unit_price"?: number,"variant_id"?: string | null,"variant_name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_lines_location_id_account_id_fkey"
      columns: ["location_id","account_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","account_id"]
    },{
      foreignKeyName: "order_lines_order_id_location_id_fkey"
      columns: ["order_id","location_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id","location_id"]
    }
                  ]
                },"order_voids": {
                  Row: {
                    "account_id": string,"amount": number,"employee_id": string | null,"employee_name": string | null,"id": string,"item_name": string,"line_id": string | null,"location_id": string,"order_id": string,"qty": number,"reason": string,"voided_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"amount": number,"employee_id"?: string | null,"employee_name"?: string | null,"id": string,"item_name": string,"line_id"?: string | null,"location_id": string,"order_id": string,"qty": number,"reason": string,"voided_at": string
                  }
                  Update: {
                    "account_id"?: string,"amount"?: number,"employee_id"?: string | null,"employee_name"?: string | null,"id"?: string,"item_name"?: string,"line_id"?: string | null,"location_id"?: string,"order_id"?: string,"qty"?: number,"reason"?: string,"voided_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_voids_order_id_location_id_fkey"
      columns: ["order_id","location_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id","location_id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "account_id": string,"bill_name": string | null,"cancel_reason": string | null,"cancelled_at": string | null,"change_due": number,"closed_by": string | null,"closed_by_name": string | null,"completed_at": string | null,"created_at": string,"customer_id": string | null,"customer_name": string | null,"device_id": string,"discount_total": number,"gratuity_name": string | null,"gratuity_rate_bp": number,"gratuity_total": number,"gross": number,"guests": number | null,"id": string,"location_id": string,"number": string,"opened_at": string,"opened_by": string | null,"opened_by_name": string | null,"paid": number,"prices_include_tax": boolean,"rounding": number,"sales_type_id": string | null,"sales_type_name": string | null,"served_by": string | null,"served_by_name": string | null,"shift_id": string | null,"status": "open"|"completed"|"cancelled","subtotal": number,"table_id": string | null,"table_name": string | null,"tax_after_discount": boolean,"tax_name": string | null,"tax_rate_bp": number,"tax_total": number,"total": number,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"bill_name"?: string | null,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"change_due"?: number,"closed_by"?: string | null,"closed_by_name"?: string | null,"completed_at"?: string | null,"created_at"?: string,"customer_id"?: string | null,"customer_name"?: string | null,"device_id": string,"discount_total"?: number,"gratuity_name"?: string | null,"gratuity_rate_bp"?: number,"gratuity_total"?: number,"gross"?: number,"guests"?: number | null,"id": string,"location_id": string,"number": string,"opened_at": string,"opened_by"?: string | null,"opened_by_name"?: string | null,"paid"?: number,"prices_include_tax"?: boolean,"rounding"?: number,"sales_type_id"?: string | null,"sales_type_name"?: string | null,"served_by"?: string | null,"served_by_name"?: string | null,"shift_id"?: string | null,"status": "open"|"completed"|"cancelled","subtotal"?: number,"table_id"?: string | null,"table_name"?: string | null,"tax_after_discount"?: boolean,"tax_name"?: string | null,"tax_rate_bp"?: number,"tax_total"?: number,"total"?: number,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "account_id"?: string,"bill_name"?: string | null,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"change_due"?: number,"closed_by"?: string | null,"closed_by_name"?: string | null,"completed_at"?: string | null,"created_at"?: string,"customer_id"?: string | null,"customer_name"?: string | null,"device_id"?: string,"discount_total"?: number,"gratuity_name"?: string | null,"gratuity_rate_bp"?: number,"gratuity_total"?: number,"gross"?: number,"guests"?: number | null,"id"?: string,"location_id"?: string,"number"?: string,"opened_at"?: string,"opened_by"?: string | null,"opened_by_name"?: string | null,"paid"?: number,"prices_include_tax"?: boolean,"rounding"?: number,"sales_type_id"?: string | null,"sales_type_name"?: string | null,"served_by"?: string | null,"served_by_name"?: string | null,"shift_id"?: string | null,"status"?: "open"|"completed"|"cancelled","subtotal"?: number,"table_id"?: string | null,"table_name"?: string | null,"tax_after_discount"?: boolean,"tax_name"?: string | null,"tax_rate_bp"?: number,"tax_total"?: number,"total"?: number,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_customer_fk"
      columns: ["customer_id","location_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id","location_id"]
    },{
      foreignKeyName: "orders_device_id_location_id_fkey"
      columns: ["device_id","location_id"]
isOneToOne: false
      referencedRelation: "devices"
      referencedColumns: ["id","location_id"]
    },{
      foreignKeyName: "orders_location_id_account_id_fkey"
      columns: ["location_id","account_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","account_id"]
    },{
      foreignKeyName: "orders_shift_fk"
      columns: ["shift_id","location_id"]
isOneToOne: false
      referencedRelation: "shifts"
      referencedColumns: ["id","location_id"]
    },{
      foreignKeyName: "orders_table_fk"
      columns: ["table_id","location_id"]
isOneToOne: false
      referencedRelation: "dining_tables"
      referencedColumns: ["id","location_id"]
    }
                  ]
                },"payment_methods": {
                  Row: {
                    "account_id": string,"created_at": string,"id": string,"is_active": boolean,"kind": "cash"|"qr"|"card"|"delivery"|"other"|"invoice","location_id": string,"name": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"kind": "cash"|"qr"|"card"|"delivery"|"other"|"invoice","location_id": string,"name": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"kind"?: "cash"|"qr"|"card"|"delivery"|"other"|"invoice","location_id"?: string,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_methods_location_id_account_id_fkey"
      columns: ["location_id","account_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","account_id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "account_id": string,"amount": number,"change_due": number,"id": string,"kind": "cash"|"qr"|"card"|"delivery"|"other"|"invoice","location_id": string,"method_id": string | null,"method_name": string,"order_id": string,"paid_at": string,"reference": string | null,"tendered": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"amount": number,"change_due"?: number,"id": string,"kind": "cash"|"qr"|"card"|"delivery"|"other"|"invoice","location_id": string,"method_id"?: string | null,"method_name": string,"order_id": string,"paid_at": string,"reference"?: string | null,"tendered"?: number | null
                  }
                  Update: {
                    "account_id"?: string,"amount"?: number,"change_due"?: number,"id"?: string,"kind"?: "cash"|"qr"|"card"|"delivery"|"other"|"invoice","location_id"?: string,"method_id"?: string | null,"method_name"?: string,"order_id"?: string,"paid_at"?: string,"reference"?: string | null,"tendered"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_order_id_location_id_fkey"
      columns: ["order_id","location_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id","location_id"]
    }
                  ]
                },"quick_notes": {
                  Row: {
                    "account_id": string,"category_ids": (string)[],"created_at": string,"id": string,"location_id": string,"sort_order": number,"text": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"category_ids"?: (string)[],"created_at"?: string,"id"?: string,"location_id": string,"sort_order"?: number,"text": string,"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string,"category_ids"?: (string)[],"created_at"?: string,"id"?: string,"location_id"?: string,"sort_order"?: number,"text"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "quick_notes_location_id_account_id_fkey"
      columns: ["location_id","account_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","account_id"]
    }
                  ]
                },"receipt_profiles": {
                  Row: {
                    "account_id": string,"address": string | null,"footer": string | null,"header_name": string,"location_id": string,"logo_url": string | null,"phone": string | null,"show_cashier": boolean,"show_server": boolean,"social": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"address"?: string | null,"footer"?: string | null,"header_name"?: string,"location_id": string,"logo_url"?: string | null,"phone"?: string | null,"show_cashier"?: boolean,"show_server"?: boolean,"social"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string,"address"?: string | null,"footer"?: string | null,"header_name"?: string,"location_id"?: string,"logo_url"?: string | null,"phone"?: string | null,"show_cashier"?: boolean,"show_server"?: boolean,"social"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "receipt_profiles_location_id_account_id_fkey"
      columns: ["location_id","account_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","account_id"]
    }
                  ]
                },"refund_lines": {
                  Row: {
                    "account_id": string,"amount": number,"id": string,"item_id": string | null,"item_name": string,"location_id": string,"order_line_id": string,"qty": number,"refund_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"amount": number,"id": string,"item_id"?: string | null,"item_name": string,"location_id": string,"order_line_id": string,"qty": number,"refund_id": string
                  }
                  Update: {
                    "account_id"?: string,"amount"?: number,"id"?: string,"item_id"?: string | null,"item_name"?: string,"location_id"?: string,"order_line_id"?: string,"qty"?: number,"refund_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "refund_lines_refund_id_location_id_fkey"
      columns: ["refund_id","location_id"]
isOneToOne: false
      referencedRelation: "refunds"
      referencedColumns: ["id","location_id"]
    }
                  ]
                },"refunds": {
                  Row: {
                    "account_id": string,"amount": number,"created_at": string,"device_id": string,"employee_id": string | null,"employee_name": string | null,"id": string,"kind": "cash"|"qr"|"card"|"delivery"|"other"|"invoice","location_id": string,"method_id": string | null,"method_name": string,"order_id": string,"reason": string,"refunded_at": string,"restock": boolean,"shift_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"amount": number,"created_at"?: string,"device_id": string,"employee_id"?: string | null,"employee_name"?: string | null,"id": string,"kind": "cash"|"qr"|"card"|"delivery"|"other"|"invoice","location_id": string,"method_id"?: string | null,"method_name": string,"order_id": string,"reason": string,"refunded_at": string,"restock"?: boolean,"shift_id"?: string | null
                  }
                  Update: {
                    "account_id"?: string,"amount"?: number,"created_at"?: string,"device_id"?: string,"employee_id"?: string | null,"employee_name"?: string | null,"id"?: string,"kind"?: "cash"|"qr"|"card"|"delivery"|"other"|"invoice","location_id"?: string,"method_id"?: string | null,"method_name"?: string,"order_id"?: string,"reason"?: string,"refunded_at"?: string,"restock"?: boolean,"shift_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "refunds_device_id_location_id_fkey"
      columns: ["device_id","location_id"]
isOneToOne: false
      referencedRelation: "devices"
      referencedColumns: ["id","location_id"]
    },{
      foreignKeyName: "refunds_order_id_location_id_fkey"
      columns: ["order_id","location_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id","location_id"]
    },{
      foreignKeyName: "refunds_shift_id_location_id_fkey"
      columns: ["shift_id","location_id"]
isOneToOne: false
      referencedRelation: "shifts"
      referencedColumns: ["id","location_id"]
    }
                  ]
                },"roles": {
                  Row: {
                    "account_id": string,"backoffice_pages": (string)[],"created_at": string,"id": string,"is_system": boolean,"name": string,"permissions": (string)[],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"backoffice_pages"?: (string)[],"created_at"?: string,"id"?: string,"is_system"?: boolean,"name": string,"permissions"?: (string)[],"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string,"backoffice_pages"?: (string)[],"created_at"?: string,"id"?: string,"is_system"?: boolean,"name"?: string,"permissions"?: (string)[],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "roles_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    }
                  ]
                },"sales_types": {
                  Row: {
                    "account_id": string,"created_at": string,"id": string,"is_active": boolean,"location_id": string,"name": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"location_id": string,"name": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"location_id"?: string,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sales_types_location_id_account_id_fkey"
      columns: ["location_id","account_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","account_id"]
    }
                  ]
                },"shifts": {
                  Row: {
                    "account_id": string,"actual_cash": number | null,"closed_at": string | null,"closed_by": string | null,"closed_by_name": string | null,"created_at": string,"device_id": string,"expected_cash": number | null,"id": string,"location_id": string,"opened_at": string,"opened_by": string | null,"opened_by_name": string | null,"starting_cash": number,"status": "open"|"closed","summary": Json | null,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"actual_cash"?: number | null,"closed_at"?: string | null,"closed_by"?: string | null,"closed_by_name"?: string | null,"created_at"?: string,"device_id": string,"expected_cash"?: number | null,"id": string,"location_id": string,"opened_at": string,"opened_by"?: string | null,"opened_by_name"?: string | null,"starting_cash": number,"status": "open"|"closed","summary"?: Json | null,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "account_id"?: string,"actual_cash"?: number | null,"closed_at"?: string | null,"closed_by"?: string | null,"closed_by_name"?: string | null,"created_at"?: string,"device_id"?: string,"expected_cash"?: number | null,"id"?: string,"location_id"?: string,"opened_at"?: string,"opened_by"?: string | null,"opened_by_name"?: string | null,"starting_cash"?: number,"status"?: "open"|"closed","summary"?: Json | null,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "shifts_device_id_location_id_fkey"
      columns: ["device_id","location_id"]
isOneToOne: false
      referencedRelation: "devices"
      referencedColumns: ["id","location_id"]
    },{
      foreignKeyName: "shifts_location_id_account_id_fkey"
      columns: ["location_id","account_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","account_id"]
    }
                  ]
                },"table_areas": {
                  Row: {
                    "account_id": string,"created_at": string,"id": string,"is_active": boolean,"location_id": string,"name": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"location_id": string,"name": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"location_id"?: string,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "table_areas_location_id_account_id_fkey"
      columns: ["location_id","account_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","account_id"]
    }
                  ]
                },"variant_sales_type_prices": {
                  Row: {
                    "account_id": string,"location_id": string,"price": number,"sales_type_id": string,"variant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"location_id": string,"price": number,"sales_type_id": string,"variant_id": string
                  }
                  Update: {
                    "account_id"?: string,"location_id"?: string,"price"?: number,"sales_type_id"?: string,"variant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "variant_sales_type_prices_location_id_account_id_fkey"
      columns: ["location_id","account_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","account_id"]
    },{
      foreignKeyName: "variant_sales_type_prices_sales_type_id_location_id_fkey"
      columns: ["sales_type_id","location_id"]
isOneToOne: false
      referencedRelation: "sales_types"
      referencedColumns: ["id","location_id"]
    },{
      foreignKeyName: "variant_sales_type_prices_variant_id_location_id_fkey"
      columns: ["variant_id","location_id"]
isOneToOne: false
      referencedRelation: "item_variants"
      referencedColumns: ["id","location_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "claim_employee_access":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"copy_items_to_locations":
{ Args: { "p_item_ids": (string)[],"p_target_locations": (string)[] }; Returns: number
                           },
"create_account":
{ Args: { "p_first_location": string,"p_name": string }; Returns: string
                           },
"device_heartbeat":
{ Args: { "p": Json,"p_device": string }; Returns: undefined
                           },
"pos_catalog":
{ Args: { "p_device": string }; Returns: Json
                           },
"pos_open_orders":
{ Args: { "p_device": string }; Returns: Json
                           },
"pos_save_category":
{ Args: { "p": Json,"p_device": string }; Returns: Json
                           },
"pos_save_customer":
{ Args: { "p": Json,"p_device": string }; Returns: Json
                           },
"pos_save_item":
{ Args: { "p": Json,"p_device": string }; Returns: Json
                           },
"pos_save_quick_notes":
{ Args: { "p": Json,"p_device": string }; Returns: Json
                           },
"pos_shift_settings":
{ Args: { "p": Json,"p_device": string }; Returns: Json
                           },
"pos_table_setup":
{ Args: { "p": Json,"p_device": string }; Returns: Json
                           },
"pos_tables_bulk":
{ Args: { "p": Json,"p_device": string }; Returns: Json
                           },
"pos_tables_layout":
{ Args: { "p": Json,"p_device": string }; Returns: Json
                           },
"register_device":
{ Args: { "p_location": string,"p_name": string }; Returns: {
              "account_id": string,
"app_version": string | null,
"created_at": string,
"id": string,
"last_error": string | null,
"last_seen_at": string | null,
"last_sync_ok_at": string | null,
"location_id": string,
"name": string,
"pending_count": number,
"receipt_prefix": string,
"registered_by": string,
"rejected_count": number,
"revoked_at": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "devices"
        isOneToOne: true
        isSetofReturn: false
      } },
"report_sales":
{ Args: { "p_from": string,"p_locations": (string)[],"p_to": string,"p_tz"?: string }; Returns: Json
                           },
"report_shifts":
{ Args: { "p_from": string,"p_locations": (string)[],"p_to": string }; Returns: Json
                           },
"report_transactions":
{ Args: { "p_from": string,"p_kind"?: string,"p_limit"?: number,"p_locations": (string)[],"p_offset"?: number,"p_search"?: string,"p_to": string }; Returns: Json
                           },
"revoke_device":
{ Args: { "p_device": string }; Returns: undefined
                           },
"save_employee":
{ Args: { "p": Json }; Returns: string
                           },
"save_item":
{ Args: { "p_item": Json }; Returns: string
                           },
"set_employee_pin":
{ Args: { "p_employee": string,"p_pin": string }; Returns: undefined
                           },
"submit_refund":
{ Args: { "p": Json,"p_device": string }; Returns: Json
                           },
"upsert_order":
{ Args: { "p": Json,"p_device": string }; Returns: Json
                           },
"upsert_shift":
{ Args: { "p": Json,"p_device": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
