# Enterprise Multi-Store Email Processing Guide

## Looker Email Patterns

### Email Subject Patterns

Looker sends two types of emails for store data:

#### 1. Single Store Emails
**Pattern**: `[Store Name] - [Dashboard Name]`

Examples:
- `San Francisco - Stores Performance`
- `Chicago - Daily Metrics`
- `New York Soho - Store Ops`

**Processing**: Data is assigned to the specific store only.

#### 2. Multi-Store Emails (ALL Stores)
**Pattern**: `[Dashboard Name] (ALL)` or `[Dashboard Name] - ALL`

Examples:
- `Stores Performance (ALL)`
- `Store Ops Overdue Audit (ALL)`
- `Work Related Expenses - ALL`

**Processing**: Data contains rows for ALL stores and must be distributed accordingly.

### CSV Data Structure

#### Single Store CSV
```csv
"Metric","Value"
"Sales","$45,231"
"Customers","125"
```
No "Location Name" or "Store Name" column.

#### Multi-Store CSV (ALL)
```csv
"Location Name","Metric","Value"
"San Francisco","Sales","$45,231"
"Chicago","Sales","$38,492"
"New York Soho","Sales","$52,187"
```
Contains "Location Name" or "Store" column.

## Implementation Strategy

### Phase 1: Database Setup ✅
- [x] Create `stores` table with all North America locations
- [x] Add `store_id` to operational tables
- [x] Create indexes for performance
- [x] Seed 39 North America stores

### Phase 2: Email Processor Updates 🔄
- [ ] Update `gmail-looker-fetcher.js` to pass email subject to processor
- [ ] Update `looker-data-processor.js` to detect (ALL) emails
- [ ] Parse multi-store CSV files
- [ ] Distribute data to correct store_id

### Phase 3: Data Processing Logic

```javascript
// Pseudo-code for processing
const emailInfo = parseEmailSubject(email.subject);

if (emailInfo.isAllStores) {
  // Email contains data for ALL stores
  const csvData = parseCSV(file);
  
  if (isMultiStoreCSV(csvData)) {
    // CSV has "Location Name" column
    for (const row of csvData) {
      const storeCode = extractStoreCodeFromLocation(row['Location Name']);
      const storeId = await getStoreIdByCode(storeCode);
      
      // Save data with storeId
      await saveMetrics(row, storeId);
    }
  } else {
    // Single row for each store - replicate
    const allStoreIds = await getAllStoreIds();
    for (const storeId of allStoreIds) {
      await saveMetrics(csvData[0], storeId);
    }
  }
} else {
  // Email is for specific store only
  const storeId = await getStoreIdByCode(emailInfo.storeCode);
  await saveMetrics(csvData[0], storeId || 1); // Default to SF if unknown
}
```

### Phase 4: Frontend Updates
- [ ] Add store selector dropdown
- [ ] Filter dashboard data by selected store
- [ ] Store selection in session/cookie
- [ ] Multi-store comparison views

## Store Code Mapping

| Location | Code | Email |
|----------|------|-------|
| San Francisco | SF | sanfrancisco@suitsupply.com |
| New York Soho | NYS | nysoho@suitsupply.com |
| New York Madison | NYM | nymadison@suitsupply.com |
| Chicago | CHI | chicago@suitsupply.com |
| Los Angeles Century City | LAC | lacenturycity@suitsupply.com |
| ... | ... | ... |

Full list: 39 stores total (36 US, 2 Canada, 1 Australia)

## Testing Checklist

### Email Processing Tests
- [ ] Test single-store email (e.g., "San Francisco - Metrics")
- [ ] Test (ALL) email with multi-store CSV
- [ ] Test (ALL) email with single-row CSV
- [ ] Test unknown store name handling
- [ ] Verify store_id assignment

### Database Tests
- [ ] Verify all 39 stores seeded correctly
- [ ] Check foreign key constraints
- [ ] Test store_id queries with indexes
- [ ] Verify data isolation between stores

### Performance Tests
- [ ] Query performance with 1000+ records per store
- [ ] Index effectiveness
- [ ] Multi-store aggregation queries

## Deployment Strategy

### Development Branch: `enterprise-multistore`
Current production remains on `main` branch.

### Rollout Plan
1. **Week 1-2**: Database migrations, email parser
2. **Week 3**: Data processing logic
3. **Week 4**: Frontend store selector
4. **Week 5-6**: Testing with real data
5. **Week 7**: Pilot with 3-5 stores
6. **Week 8**: Full rollout

### Feature Flag
```bash
export FEATURE_MULTISTORE=true  # Enable multi-store features
export FEATURE_MULTISTORE=false # Disable (SF only)
```

### Backwards Compatibility
- All existing code defaults to `store_id = 1` (San Francisco)
- No breaking changes to current SF operations
- Multi-store features are additive only

## Monitoring

### Key Metrics
- Emails processed per day (by type: single vs ALL)
- Data distribution across stores
- Query performance per store
- Storage growth rate

### Alerts
- Missing store_id in new records
- Unknown store names in CSV
- Failed email processing
- Slow multi-store queries (> 1s)

## Support

### Common Issues

**Q: Email marked (ALL) but only has SF data?**
A: Check CSV for "Location Name" column. If missing, it's single-store data mislabeled.

**Q: Store name not recognized?**
A: Add mapping to `STORE_NAME_TO_CODE` in `multi-store-parser.js`

**Q: Performance slow with all stores?**
A: Check indexes on `store_id` columns. Run `EXPLAIN ANALYZE` on slow queries.

### Contacts
- **Technical Lead**: Victor Rocha
- **Database Admin**: PostgreSQL team
- **Looker Admin**: Analytics team
