                                                Table "public.daily_scan_results"
            Column             |           Type           | Collation | Nullable |                    Default                     
-------------------------------+--------------------------+-----------+----------+------------------------------------------------
 id                            | integer                  |           | not null | nextval('daily_scan_results_id_seq'::regclass)
 count_id                      | text                     |           | not null | 
 status                        | text                     |           | not null | 
 store_load                    | boolean                  |           |          | false
 location_id                   | text                     |           |          | 
 organization_id               | text                     |           |          | 
 created_date                  | timestamp with time zone |           |          | 
 overhead_read_included_from   | timestamp with time zone |           |          | 
 counted_by                    | text                     |           |          | 
 different_location_units      | integer                  |           |          | 0
 expected_units                | integer                  |           |          | 0
 counted_units                 | integer                  |           |          | 0
 missed_units_available        | integer                  |           |          | 0
 missed_units_reserved         | integer                  |           |          | 0
 new_units                     | integer                  |           |          | 0
 found_previously_missed_units | integer                  |           |          | 0
 undecodable_units             | integer                  |           |          | 0
 unmapped_item_units           | integer                  |           |          | 0
 accuracy_percentage           | numeric(5,2)             |           |          | 
 scan_date                     | date                     |           |          | 
 imported_at                   | timestamp with time zone |           |          | now()
 imported_by                   | text                     |           |          | 
 notes                         | text                     |           |          | 
Indexes:
    "daily_scan_results_pkey" PRIMARY KEY, btree (id)
    "daily_scan_results_count_id_key" UNIQUE CONSTRAINT, btree (count_id)
    "idx_daily_scan_results_counted_by" btree (counted_by)
    "idx_daily_scan_results_created_date" btree (created_date)
    "idx_daily_scan_results_scan_date" btree (scan_date)
    "idx_daily_scan_results_status" btree (status)
Triggers:
    trigger_daily_scan_results_updated_at BEFORE UPDATE ON daily_scan_results FOR EACH ROW EXECUTE FUNCTION update_daily_scan_results_updated_at()

