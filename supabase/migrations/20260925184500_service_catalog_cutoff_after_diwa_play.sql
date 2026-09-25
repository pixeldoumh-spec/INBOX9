BEGIN;

UPDATE public.services
SET catalog_position = NULL
WHERE active = TRUE;

WITH positions(id, service_name, catalog_position) AS (
  VALUES
  ('svc-joy-rummy','Joy Rummy',1),
('svc-ind-rummy','IND Rummy',2),
('svc-inr-rummy','INR Rummy',3),
('svc-rumble-rummy','Rumble Rummy',4),
('svc-bingo-101','Bingo 101',5),
('svc-spin-101','Spin 101',6),
('svc-diwa-top','Diwa Top',7),
('svc-jaiho-slots','Jaiho Slots',8),
('svc-rummy-91','Rummy 91',9),
('svc-max-rummy','Max Rummy',10),
('svc-gold-rummy','Gold Rummy',11),
('svc-win-rummy','Win Rummy',12),
('svc-diwa-x','Diwa X',13),
('svc-jaiho-rummy','Jaiho Rummy',14),
('svc-jaiho-91','Jaiho 91',15),
('svc-diwa-win','Diwa Win',16),
('svc-maha-games','Maha Games',17),
('svc-jaiho-777-vip','Jaiho 777 VIP',18),
('svc-rummy-888','Rummy 888',19),
('svc-dhan-game','Dhan Game',20),
('svc-diwa-game','Diwa Game',21),
('svc-diwa-vip','Diwa VIP',22),
('svc-ind-club','IND Club',23),
('svc-diwa-slots','Diwa Slots',24),
('svc-diwa-777','DIWA 777',25),
('svc-spin-crush','Spin Crush',26),
('svc-spin-winner','Spin Winner',27),
('svc-spin-gold','Spin Gold',28),
('svc-slots-winner','Slots Winner',29),
('svc-rummy-ludo','Rummy Ludo',30),
('svc-jaiho-spin','Jaiho Spin',31),
('svc-yono-777','Yono 777',32),
('svc-rummy-77','Rummy 77',33),
('svc-777-game','777 Game',34),
('svc-club-inr','Club INR',35),
('svc-winzo-rummy','Winzo Rummy',36),
('svc-rummy-app','Rummy App',37),
('svc-ever-777','Ever 777',38),
('svc-inr-slots','INR Slots',39),
('svc-good-slots','Good Slots',40),
('svc-boss-rummy','Boss Rummy',41),
('svc-hindi-777','Hindi 777',42),
('svc-yn-777','YN 777',43),
('svc-yes-spin','Yes Spin',44),
('svc-ok-rummy','OK Rummy',45),
('svc-love-rummy','Love Rummy',46),
('svc-share-slots','Share Slots',47),
('svc-hi-rummy','Hi Rummy',48),
('svc-jaiho-win','Jaiho Win',49),
('svc-goa-spin','Goa Spin',50),
('svc-slots-spin','Slots Spin',51),
('svc-mqm-bet','MQM Bet',52),
('svc-saga-slots','Saga Slots',53),
('svc-rummy-yono','Rummy Yono',54),
('svc-abc-rummy','ABC Rummy',55),
('svc-jaiho-arcade','Jaiho Arcade',56),
('svc-neta-vip','Neta VIP',57),
('svc-mwm-bet','MWM Bet',58),
('svc-en-365','EN 365',59),
('svc-101z-app','101Z App',60),
('svc-rummy-365','Rummy 365',61),
('svc-ind-bingo','IND Bingo',62),
('svc-my-777','My 777',63),
('svc-bet-213-slots','Bet 213 Slots',64),
('svc-gogo-rummy','GoGo Rummy',65),
('svc-789-jackpot','789 Jackpot',66),
('svc-mdm-bet','MDM Bet',67),
('svc-spin-lucky','Spin Lucky',68),
('svc-ind-slots','IND Slots',69),
('svc-mkm-bet','MKM Bet',70),
('svc-yono-maha-games','Yono Maha Games',71),
('svc-game-rummy','Game Rummy',72),
('svc-mbm-bet','MBM Bet',73),
('svc-jaiho-777','Jaiho 777',74),
('svc-top-rummy','TOP Rummy',75),
('svc-spin-777','Spin 777',76),
('svc-567-slots','567 Slots',77),
('svc-yono-vip','Yono VIP',78),
('svc-yono-slots','Yono Slots',79),
('svc-yono-rummy','Yono Rummy',80),
('svc-yono-games','Yono Games',81),
('svc-money-rummy','Money Rummy',82),
('svc-yn-rummy','YN Rummy',83),
('svc-yoyo-slots','Yoyo Slots',84),
('svc-svip-777','SVIP 777',85),
('svc-rummy-zip','Rummy Zip',86),
('svc-diwa-lucky','Diwa Lucky',87),
('svc-diwa-ace','Diwa Ace',88),
('svc-diwa-king','Diwa King',89),
('svc-diwa-play','Diwa Play',90)
)
UPDATE public.services AS s
SET active = TRUE,
    catalog_position = p.catalog_position
FROM positions AS p
WHERE s.id = p.id;

UPDATE public.services
SET active = FALSE,
    catalog_position = NULL
WHERE active = TRUE
  AND catalog_position IS NULL;

UPDATE public.service_provider_routes AS r
SET active = FALSE
FROM public.services AS s
WHERE s.id = r.service_id
  AND s.active = FALSE
  AND r.active = TRUE;

INSERT INTO schema_migrations(version)
VALUES ('036_service_catalog_cutoff_after_diwa_play')
ON CONFLICT DO NOTHING;

COMMIT;
