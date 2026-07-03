-- ============================================================
--  Adhivakta AI — seed data (library items)
--  Idempotent via slug conflict. Demo user + sample matters are
--  seeded from scripts/db-apply.mjs (needs a bcrypt hash).
-- ============================================================

insert into public.library_items (slug, kind, title, court, citation, tags, author, outcome, excerpt, uses, cited, verified) values
  ('j1', 'judgment', 'Dashrath Rupsingh Rathod v. State of Maharashtra', 'Supreme Court', '(2014) 9 SCC 129',
   array['§138','Jurisdiction','Cheque Bounce'], null, null,
   'Landmark ruling on territorial jurisdiction for cheque dishonour cases and computation of limitation.', 0, 412, true),

  ('d1', 'draft', '§138 Legal Notice — Insufficient Funds', 'Kerala HC', null,
   array['§138','Notice','Cheque Bounce'], 'Adv. P. Nair', 'Settled',
   'Battle-tested notice format that secured pre-litigation settlement in 11 days. Includes interest computation clause.', 1240, 0, true),

  ('j2', 'judgment', 'MSR Leathers v. S. Palaniappan', 'Supreme Court', '(2013) 1 SCC 177',
   array['§138','Successive Notices'], null, null,
   'On the right to issue successive demand notices and re-presentation of cheques under the NI Act.', 0, 288, true),

  ('d2', 'draft', 'Complaint u/s 138 — Magistrate Court', 'Telangana', null,
   array['§138','Complaint','Cheque Bounce'], 'Adv. S. Reddy', 'Convicted',
   'Full complaint format with evidence list and witness affidavit annexures, ready to adapt.', 860, 0, true),

  ('j3', 'judgment', 'Yogendra Pratap Singh v. Savitri Pandey', 'Supreme Court', '(2014) 10 SCC 713',
   array['§138','Limitation'], null, null,
   'On premature complaints and the mandatory 15-day waiting period before filing under §138.', 0, 197, true),

  ('j4', 'judgment', 'Kusum Ingots & Alloys Ltd. v. Pennar Peterson', 'Supreme Court', '(2000) 2 SCC 745',
   array['§138','Notice','Limitation'], null, null,
   'Clarifies the five components required to constitute an offence under Section 138.', 0, 154, true),

  ('d3', 'draft', 'Bail Application — Sessions Court', 'Rajasthan', null,
   array['Bail','CrPC'], 'Adv. M. Khan', 'Granted',
   'Regular bail application with grounds, precedents and undertaking, formatted for sessions court.', 540, 0, true),

  ('d4', 'draft', 'Consumer Complaint — District Forum', 'Maharashtra', null,
   array['Consumer','Deficiency'], 'Adv. R. Iyer', 'Compensated',
   'Deficiency-in-service complaint with prayer for compensation and litigation costs.', 720, 0, true),

  ('d5', 'draft', 'Rent & Eviction Notice — Rent Control', 'Delhi', null,
   array['Rent','Eviction'], 'Adv. N. Bansal', 'Vacated',
   'Eviction notice for non-payment of rent, compliant with Delhi Rent Control Act timelines.', 410, 0, true)
on conflict (slug) do nothing;
