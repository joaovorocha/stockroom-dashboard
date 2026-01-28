-- ============================================================================
-- ENTERPRISE MULTI-STORE MIGRATION - Insert North America Stores
-- Works with existing stores table structure (code, name vs store_code, store_name)
-- ============================================================================

BEGIN;

-- Add missing columns to existing stores table if needed
ALTER TABLE stores ADD COLUMN IF NOT EXISTS region VARCHAR(50);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS country VARCHAR(50);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS state_province VARCHAR(100);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS street_address TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS store_email VARCHAR(255);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS store_phone VARCHAR(50);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'USD';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS regional_manager VARCHAR(255);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS store_manager VARCHAR(255);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Rename state to state_province if it exists
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='state') THEN
    ALTER TABLE stores RENAME COLUMN state TO state_province_old;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_stores_region ON stores(region);
CREATE INDEX IF NOT EXISTS idx_stores_country ON stores(country);
CREATE INDEX IF NOT EXISTS idx_stores_email ON stores(LOWER(store_email));

-- Insert North America stores (using existing column names: code, name)
INSERT INTO stores (code, name, region, country, state_province, city, street_address, postal_code, store_email, store_phone, regional_manager, store_manager) VALUES
-- United States Stores
('ATL', 'Atlanta', 'North America', 'US', 'GA', 'Atlanta', '3400 Around Lenox Rd NE', '30326', 'atlanta@suitsupply.com', '+1 (404) 800-1143', 'James Kongmany', 'Samuel Mercer'),
('AUS', 'Austin', 'North America', 'US', 'TX', 'Austin', '11701 Domain Boulevard Domain Northside, Suite C9.138', '78758', 'austin@suitsupply.com', '+1 (512) 262-4367', 'David Gallagher', 'Karla Lewis'),
('BOS', 'Boston', 'North America', 'US', 'MA', 'Boston', '240A Newbury St', '02116', 'boston@suitsupply.com', '+1 (617) 249 7821', 'Marc Abdel Sater', 'Rafael Duran'),
('CHI', 'Chicago', 'North America', 'US', 'IL', 'Chicago', '945 N Rush St Ste 4', '60611', 'chicago@suitsupply.com', '+1 (312) 340-6909', 'Marc Abdel Sater', 'Cameron Siegle'),
('DAL', 'Dallas', 'North America', 'US', 'TX', 'Dallas', '3700 Mckinney Ave Ste 100', '75204', 'dallas@suitsupply.com', '+1 (214) 643-8556', 'David Gallagher', 'Karissa Valadez'),
('DEN', 'Denver', 'North America', 'US', 'CO', 'Denver', '299 Detroit St', '80206', 'denver@suitsupply.com', '+1(303) 876-9900', 'Joshua Haslett', 'Pedro Maldonado'),
('EDI', 'Edina', 'North America', 'US', 'MN', 'Edina', '3165L Galleria', '55435', 'edina@suitsupply.com', '+1 (952) 213-2599', 'David Gallagher', 'Tyler Jay'),
('GRN', 'Greenwich', 'North America', 'US', 'CT', 'Greenwich', '80 Mason St', '06830', 'greenwich@suitsupply.com', '+1 (203) 318-7140', 'Erin Moriarty', 'Francis Springer'),
('HOU', 'Houston', 'North America', 'US', 'TX', 'Houston', '2601 Westheimer Rd Ste C220', '77098', 'houston@suitsupply.com', '+1 (713) 999-9050', 'David Gallagher', 'Sherlyn Remo'),
('KOP', 'King of Prussia', 'North America', 'US', 'PA', 'King Of Prussia', '160 N Gulph Rd', '19406', 'kingofprussia@suitsupply.com', '+1 (215) 278-8038', 'James Kongmany', 'Adolph Sims'),
('LAK', 'LA Abbot Kinney', 'North America', 'US', 'CA', 'Venice', '1136 Abbot Kinney Blvd', '90291', 'laabbotkinney@suitsupply.com', '+1 (424) 206-6180', 'Kenneth Lea', 'Aaron Sellars'),
('LAC', 'LA Century City', 'North America', 'US', 'CA', 'Los Angeles', '10250 Santa Monica Blvd', '90067', 'lacenturycity@suitsupply.com', '+1 (424) 201-0885', 'Kenneth Lea', 'Mila Washington'),
('LV', 'Las Vegas', 'North America', 'US', 'NV', 'Las Vegas', '3327 Las Vegas Blvd S Ste 2744', '89109', 'lasvegas@suitsupply.com', '+1 (702) 766-7497', 'Joshua Haslett', 'Ali Nezam'),
('MIA', 'Miami Beach', 'North America', 'US', 'FL', 'Miami Beach', '1000 17th St', '33139', 'miami@suitsupply.com', '+1 (305) 570-3185', 'Nicky Ogando', 'Ross Belizaire'),
('MIB', 'Miami Brickell', 'North America', 'US', 'FL', 'Miami', '701 S Miami Ave, Suite-161', '33131', 'miamibrickell@suitsupply.com', '+1 (305) 363 7707', 'Nicky Ogando', 'Evelyn Reinaldo'),
('NPB', 'Newport Beach', 'North America', 'US', 'CA', 'Newport Beach', '905 Newport Center Dr', '92660', 'newportbeach@suitsupply.com', '+1 (949) 239 0275', 'Kenneth Lea', 'Christopher Williams'),
('NYB', 'NY Brookfield Place', 'North America', 'US', 'NY', 'New York', '230 Vesey St Ste 210', '10281', 'brookfield@suitsupply.com', '+1 (843) 631-6674', 'Erin Moriarty', 'Emilia Ramirez'),
('NYH', 'NY Hudson Yards', 'North America', 'US', 'NY', 'New York', '20 Hudson Yards', '10001', 'hudsonyards@suitsupply.com', '+1 (646) 825 5030', 'Erin Moriarty', 'Fernanda Luengo'),
('NYM', 'NY Madison Ave', 'North America', 'US', 'NY', 'New York', '635 Madison Ave', '10022', 'nymadison@suitsupply.com', '+1 (212) 259-0400', 'Erin Moriarty', 'Michael Schmank Jr'),
('NYS', 'NY Soho', 'North America', 'US', 'NY', 'New York', '453 Broome St', '10013', 'nysoho@suitsupply.com', '+1 (212) 828-7250', 'Marc Abdel Sater', 'Paris Prepis'),
('NYW', 'NY Williamsburg', 'North America', 'US', 'NY', 'Brooklyn', '57 Wythe Ave', '11249', 'williamsburg@suitsupply.com', '+1 (347) 407-9355', 'Erin Moriarty', 'Steven Odermatt'),
('PHL', 'Philadelphia', 'North America', 'US', 'PA', 'Philadelphia', '1601 Locust St', '19102', 'philadelphia@suitsupply.com', '+1 (215) 383-1500', 'James Kongmany', 'Dana Christmas'),
('PLN', 'Plano', 'North America', 'US', 'TX', 'Plano', '7701 Windrose Ave Ste F190', '75024', 'plano@suitsupply.com', '+1 (469) 518-7626', 'David Gallagher', 'Marc Poulsen'),
('ROF', 'Roosevelt Field', 'North America', 'US', 'NY', 'Garden City', '630 Old Country Rd', '11530', 'rooseveltfield@suitsupply.com', '+1 (516) 200-3373', 'Erin Moriarty', 'Javier Carvajal'),
('SD', 'San Diego', 'North America', 'US', 'CA', 'San Diego', '4303 La Jolla Village Dr Spc 2125', '92122', 'sandiego@suitsupply.com', '+1 (609) 201 0152', 'Kenneth Lea', 'Andy Montano'),
('SJ', 'San Jose', 'North America', 'US', 'CA', 'San Jose', '333 Santana Row Ste 1020', '95128', 'sanjose@suitsupply.com', '+1 (408) 617 8939', 'Joshua Haslett', 'Tristin Kemp'),
('SCO', 'Scottsdale', 'North America', 'US', 'AZ', 'Scottsdale', '15257 N Scottsdale Rd Ste 200', '85254', 'scottsdale@suitsupply.com', '+1 (602) 536-7586', 'Joshua Haslett', 'Kim Felty'),
('SEA', 'Seattle Bellevue', 'North America', 'US', 'WA', 'Bellevue', '144 Bellevue Sq', '98004', 'seattle@suitsupply.com', '+1 (206) 212-0100', 'Joshua Haslett', 'Cassie Smith'),
('SED', 'Seattle Downtown', 'North America', 'US', 'WA', 'Seattle', '416 University Street Suite 210 & 212', '98101', 'SeattleDowntown@suitsupply.com', '+1 (206) 397-8901', 'Joshua Haslett', 'Christopher Nabua'),
('SHO', 'Short Hills', 'North America', 'US', 'NJ', 'Short Hills', '1200 Morris Turnpike Suite A125', '07078', 'shorthills@suitsupply.com', '+1 (862) 372-6996', 'Erin Moriarty', 'Natalie Reyes'),
('STL', 'St Louis', 'North America', 'US', 'MO', 'Saint Louis', '44 Maryland Plz', '63108', 'stlouis@suitsupply.com', '+1 (314) 207-0782', 'David Gallagher', 'Carlos Turner'),
('TPA', 'Tampa', 'North America', 'US', 'FL', 'Tampa', '1525 W. Swann Avenue Hyde Park Village', '33606', 'tampa@suitsupply.com', '+1 (813) 331-5013', 'Nicky Ogando', 'Nicole Villegas'),
('TYS', 'Tysons Galleria', 'North America', 'US', 'VA', 'McLean', '2001 International Dr', '22102', 'tysons@suitsupply.com', '+1 (571) 200-3302', 'James Kongmany', 'Amanda Thomas'),
('DC', 'Washington', 'North America', 'US', 'DC', 'Washington', '2828 Pennsylvania Ave NW', '20007', 'washington@suitsupply.com', '+1 (202) 800-7800', 'James Kongmany', 'Brigita Stankaityte'),
('WOO', 'Woodlands', 'North America', 'US', 'TX', 'The Woodlands', '9595 Six Pines Dr Ste 530', '77380', 'woodlands@suitsupply.com', '+1 (713) 322-9292', 'David Gallagher', 'Jonathan Rivera'),

-- Canadian Stores
('MTL', 'Montreal', 'North America', 'CA', 'QC', 'Montréal', '2152 Rue de la Montagne', 'H3G 1Z7', 'montreal@suitsupply.com', '+1 (514) 612-5292', 'Marc Abdel Sater', 'Alexandre Sevigny'),
('TOR', 'Toronto', 'North America', 'CA', 'ON', 'Toronto', '9-11 Hazelton Ave', 'M5R 2E1', 'toronto@suitsupply.com', '+1 (647) 699-1399', 'Marc Abdel Sater', 'Johnston Daniels'),

-- Australia
('SYD', 'Sydney', 'North America', 'AU', 'New South Wales', 'Sydney', '5 MARTIN Place', '2000', 'sydney@suitsupply.com', '+61 288 800 768', 'Kenneth Lea', 'Grant Mayhew')
ON CONFLICT (code) DO UPDATE SET
  region = EXCLUDED.region,
  country = EXCLUDED.country,
  state_province = EXCLUDED.state_province,
  street_address = EXCLUDED.street_address,
  postal_code = EXCLUDED.postal_code,
  store_email = EXCLUDED.store_email,
  store_phone = EXCLUDED.store_phone,
  regional_manager = EXCLUDED.regional_manager,
  store_manager = EXCLUDED.store_manager,
  updated_at = NOW();

-- Update San Francisco with full details
UPDATE stores SET
  region = 'North America',
  country = 'US',
  state_province = 'CA',
  street_address = '175 Maiden Ln',
  postal_code = '94108',
  store_email = 'sanfrancisco@suitsupply.com',
  store_phone = '+1 (650) 409-1717',
  regional_manager = 'Joshua Haslett',
  store_manager = 'Aundra Nichols',
  updated_at = NOW()
WHERE code = 'SF';

COMMIT;

-- Verification
SELECT 'Total Stores' as metric, COUNT(*)::text as value FROM stores
UNION ALL
SELECT 'Active Stores' as metric, COUNT(*)::text as value FROM stores WHERE is_active = true
UNION ALL
SELECT 'North America Stores' as metric, COUNT(*)::text as value FROM stores WHERE region = 'North America';
