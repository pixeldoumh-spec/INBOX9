-- INBOX9 Sprint 1: PostgreSQL schema and deterministic India service seed
BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
  country CHAR(2) NOT NULL DEFAULT 'IN',
  availability TEXT NOT NULL CHECK (availability IN ('high','medium','low')) DEFAULT 'high',
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activations (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id),
  service_name TEXT NOT NULL,
  country CHAR(2) NOT NULL DEFAULT 'IN',
  phone_number TEXT NOT NULL,
  price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL CHECK (status IN ('Active','Completed','Expired','Refunded','Cancelled')) DEFAULT 'Active',
  otp TEXT,
  refund_paise INTEGER CHECK (refund_paise IS NULL OR refund_paise >= 0),
  mock_otp_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activations_created_at ON activations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activations_service_status ON activations(service_id, status);
CREATE INDEX IF NOT EXISTS idx_activations_expires ON activations(expires_at) WHERE status='Active';

INSERT INTO services (id,name,category,currency,price_paise,country,availability,stock) VALUES
('whatsapp-0','WhatsApp','Social','INR',950,'IN','high',24),
('facebook-1','Facebook','Social','INR',1000,'IN','high',41),
('instagram-2','Instagram','Social','INR',1100,'IN','high',58),
('snapchat-3','Snapchat','Social','INR',1200,'IN','high',75),
('zoom-4','Zoom','Productivity','INR',850,'IN','high',92),
('gmail-5','Gmail','Productivity','INR',1450,'IN','high',109),
('yonorummy-6','YONORUMMY','Rummy','INR',850,'IN','high',36),
('yono777-7','YONO777','Games','INR',800,'IN','high',53),
('bingo101-8','BINGO101','Games','INR',850,'IN','high',70),
('gogorummy-9','GOGORUMMY','Rummy','INR',850,'IN','high',87),
('hirummy-10','HIRUMMY','Rummy','INR',850,'IN','high',104),
('indclub-11','INDCLUB','Games','INR',800,'IN','high',31),
('indrummy-12','INDRUMMY','Rummy','INR',900,'IN','high',48),
('indslot-13','INDSLOT','Games','INR',800,'IN','high',65),
('jaiho777-14','JAIHO777','Games','INR',800,'IN','high',82),
('jaihoarcade-15','JAIHOARCADE','Games','INR',850,'IN','high',99),
('jaihorummy-16','JAIHORUMMY','Rummy','INR',850,'IN','high',26),
('jaihoslot-17','JAIHOSLOT','Games','INR',800,'IN','high',43),
('jaihospin-18','JAIHOSPIN','Games','INR',800,'IN','high',60),
('jaihowin-19','JAIHOWIN','Games','INR',800,'IN','high',77),
('loverummy-20','LOVERUMMY','Rummy','INR',850,'IN','high',94),
('mahagames-21','MAHAGAMES','Games','INR',800,'IN','high',111),
('netavip-22','NETAVIP','Games','INR',1000,'IN','high',38),
('rummy91-23','RUMMY91','Rummy','INR',850,'IN','high',55),
('sagaslot-24','SAGASLOT','Games','INR',800,'IN','high',72),
('shareslot-25','SHARESLOT','Games','INR',800,'IN','high',89),
('slotspin-26','SLOTSPIN','Games','INR',800,'IN','high',106),
('slotwinner-27','SLOTWINNER','Games','INR',800,'IN','high',33),
('spin101-28','SPIN101','Games','INR',800,'IN','high',50),
('spincrush-29','SPINCRUSH','Games','INR',800,'IN','high',67),
('spingold-30','SPINGOLD','Games','INR',800,'IN','high',84),
('spinwinner-31','SPINWINNER','Games','INR',800,'IN','high',101),
('spin777-32','SPIN777','Games','INR',800,'IN','high',28),
('yn777-33','YN777','Games','INR',800,'IN','high',45),
('yonoarcade-34','YONOARCADE','Games','INR',800,'IN','high',62),
('yonogame-35','YONOGAME','Games','INR',800,'IN','high',79),
('abcrummy-36','ABCRUMMY','Rummy','INR',850,'IN','high',96),
('yonoslot-37','YONOSLOT','Games','INR',800,'IN','high',113),
('yonovip-38','YONOVIP','Games','INR',900,'IN','high',40),
('101z-39','101Z','Games','INR',800,'IN','high',57),
('567slots-40','567SLOTS','Games','INR',800,'IN','high',74),
('789jackpot-41','789JACKPOT','Games','INR',800,'IN','high',91),
('clubinr-42','CLUBINR','Games','INR',800,'IN','high',108),
('hindi777-43','HINDI777','Games','INR',800,'IN','high',35),
('mbmbet-44','MBMBET','Games','INR',800,'IN','high',52),
('okrummy-45','OKRUMMY','Rummy','INR',850,'IN','high',69),
('rumblerummy-46','RUMBLERUMMY','Rummy','INR',850,'IN','high',86),
('yesspin-47','YESSPIN','Games','INR',800,'IN','high',103),
('777game-48','777GAME','Games','INR',800,'IN','high',30),
('rummyludo-49','RUMMYLUDO','Rummy','INR',850,'IN','high',47),
('rummy77-50','RUMMY77','Rummy','INR',850,'IN','high',64),
('rummy888-51','RUMMY888','Rummy','INR',850,'IN','high',81),
('bossrummy-52','BOSSRUMMY','Rummy','INR',850,'IN','high',98),
('inr-rummy-53','INR RUMMY','Rummy','INR',850,'IN','high',25),
('bet213-54','BET213','Games','INR',800,'IN','high',42),
('diwa777-55','DIWA777','Games','INR',800,'IN','high',59),
('diwagame-56','DIWAGAME','Games','INR',800,'IN','high',76),
('diwaslots-57','DIWASLOTS','Games','INR',800,'IN','high',93),
('diwatop-58','DIWATOP','Games','INR',800,'IN','high',110),
('diwavip-59','DIWAVIP','Games','INR',800,'IN','high',37),
('diwawin-60','DIWAWIN','Games','INR',800,'IN','high',54),
('diwax-61','DIWAX','Games','INR',800,'IN','high',71),
('goodslots-62','GOODSLOTS','Games','INR',800,'IN','high',88),
('mqmbet-63','MQMBET','Games','INR',800,'IN','high',105),
('svip777-64','SVIP777','Games','INR',800,'IN','high',32),
('gamerummy-65','GAMERUMMY','Rummy','INR',850,'IN','high',49),
('jaiho91-66','JAIHO91','Games','INR',800,'IN','high',66),
('joyrummy-67','JOYRUMMY','Rummy','INR',850,'IN','high',83),
('toprummy-68','TOPRUMMY','Rummy','INR',850,'IN','high',100),
('maxrummy-69','MAXRUMMY','Rummy','INR',850,'IN','high',27),
('winrummy-70','WINRUMMY','Rummy','INR',850,'IN','high',44),
('woho-71','WOHO','Games','INR',800,'IN','high',61),
('dhangame-72','DHANGAME','Games','INR',800,'IN','high',78),
('goldrummy-73','GOLDRUMMY','Rummy','INR',850,'IN','high',95),
('diwaking-74','DIWAKING','Games','INR',800,'IN','high',112),
('moneyrummy-75','MONEYRUMMY','Rummy','INR',850,'IN','high',39)
ON CONFLICT (id) DO UPDATE SET
  name=EXCLUDED.name, category=EXCLUDED.category, currency=EXCLUDED.currency,
  price_paise=EXCLUDED.price_paise, country=EXCLUDED.country,
  availability=EXCLUDED.availability, stock=EXCLUDED.stock, active=TRUE, updated_at=NOW();

INSERT INTO schema_migrations(version) VALUES ('001_initial') ON CONFLICT DO NOTHING;
COMMIT;
