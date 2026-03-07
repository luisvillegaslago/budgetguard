-- BudgetGuard Seed Data (PostgreSQL)
-- Initial categories based on typical family expense/income patterns

-- Income Categories (guard-success green: #10B981)
INSERT INTO "Categories" ("Name", "Type", "Icon", "Color", "SortOrder") VALUES
('Nomina', 'income', 'banknote', '#10B981', 1),
('Reembolsos', 'income', 'receipt', '#34D399', 2),
('Otros Ingresos', 'income', 'plus-circle', '#6EE7B7', 3);

-- Expense Categories (various colors from warm to cool)
-- DefaultShared = TRUE for categories typically shared between partners
INSERT INTO "Categories" ("Name", "Type", "Icon", "Color", "SortOrder", "DefaultShared") VALUES
('Vivienda', 'expense', 'home', '#EF4444', 1, TRUE),
('Blanquita', 'expense', 'dog', '#F97316', 2, TRUE),
('Trabajo', 'expense', 'briefcase', '#F59E0B', 3, FALSE),
('Deporte', 'expense', 'dumbbell', '#EAB308', 4, FALSE),
('Paracaidismo', 'expense', 'cloud', '#84CC16', 5, FALSE),
('Supermercado', 'expense', 'shopping-cart', '#22C55E', 6, FALSE),
('Transporte', 'expense', 'car', '#14B8A6', 7, FALSE),
('Restaurante', 'expense', 'utensils', '#06B6D4', 8, FALSE),
('Compras', 'expense', 'shopping-bag', '#0EA5E9', 9, FALSE),
('Salir', 'expense', 'beer', '#3B82F6', 10, FALSE),
('Gastos Extra', 'expense', 'alert-circle', '#6366F1', 11, FALSE),
('Viajes', 'expense', 'plane', '#8B5CF6', 12, FALSE),
('Anuales', 'expense', 'calendar', '#A855F7', 13, FALSE);

-- ============================================================
-- Subcategories for Vivienda (shared by default)
-- ============================================================
DO $$
DECLARE
  v_id INT;
BEGIN
  SELECT "CategoryID" INTO v_id FROM "Categories" WHERE "Name" = 'Vivienda' AND "ParentCategoryID" IS NULL;

  INSERT INTO "Categories" ("Name", "Type", "Icon", "Color", "SortOrder", "ParentCategoryID", "DefaultShared") VALUES
  ('Internet', 'expense', 'wifi', '#EF4444', 1, v_id, TRUE),
  ('Asistenta', 'expense', 'spray-can', '#EF4444', 2, v_id, TRUE),
  ('Calefaccion', 'expense', 'flame', '#EF4444', 3, v_id, TRUE),
  ('Luz', 'expense', 'zap', '#EF4444', 4, v_id, TRUE),
  ('Garaje', 'expense', 'warehouse', '#EF4444', 5, v_id, TRUE),
  ('Comunidad', 'expense', 'building-2', '#EF4444', 6, v_id, TRUE),
  ('Compras Casa', 'expense', 'package', '#EF4444', 7, v_id, TRUE),
  ('Otros', 'expense', 'alert-circle', '#EF4444', 8, v_id, TRUE);
END $$;

-- ============================================================
-- Subcategories for Salir
-- ============================================================
DO $$
DECLARE
  v_id INT;
BEGIN
  SELECT "CategoryID" INTO v_id FROM "Categories" WHERE "Name" = 'Salir' AND "ParentCategoryID" IS NULL;

  INSERT INTO "Categories" ("Name", "Type", "Icon", "Color", "SortOrder", "ParentCategoryID", "DefaultShared") VALUES
  ('Comida', 'expense', 'utensils', '#3B82F6', 1, v_id, FALSE),
  ('Copas', 'expense', 'wine', '#3B82F6', 2, v_id, FALSE),
  ('Transporte', 'expense', 'car', '#3B82F6', 3, v_id, FALSE),
  ('Ropero', 'expense', 'shirt', '#3B82F6', 4, v_id, FALSE),
  ('Otros', 'expense', 'alert-circle', '#3B82F6', 5, v_id, FALSE);
END $$;

-- ============================================================
-- Subcategories for Transporte
-- ============================================================
DO $$
DECLARE
  v_id INT;
BEGIN
  SELECT "CategoryID" INTO v_id FROM "Categories" WHERE "Name" = 'Transporte' AND "ParentCategoryID" IS NULL;

  INSERT INTO "Categories" ("Name", "Type", "Icon", "Color", "SortOrder", "ParentCategoryID", "DefaultShared") VALUES
  ('Gasolina', 'expense', 'fuel', '#14B8A6', 1, v_id, FALSE),
  ('Peaje', 'expense', 'landmark', '#14B8A6', 2, v_id, FALSE),
  ('Taxi', 'expense', 'car', '#14B8A6', 3, v_id, FALSE),
  ('Parking', 'expense', 'square-parking', '#14B8A6', 4, v_id, FALSE),
  ('Transporte Publico', 'expense', 'train-front', '#14B8A6', 5, v_id, FALSE);
END $$;

-- ============================================================
-- Subcategories for Deporte
-- ============================================================
DO $$
DECLARE
  v_id INT;
BEGIN
  SELECT "CategoryID" INTO v_id FROM "Categories" WHERE "Name" = 'Deporte' AND "ParentCategoryID" IS NULL;

  INSERT INTO "Categories" ("Name", "Type", "Icon", "Color", "SortOrder", "ParentCategoryID", "DefaultShared") VALUES
  ('Padel', 'expense', 'trophy', '#EAB308', 1, v_id, FALSE),
  ('Gimnasio', 'expense', 'dumbbell', '#EAB308', 2, v_id, FALSE),
  ('Carreras', 'expense', 'flag', '#EAB308', 3, v_id, FALSE),
  ('General', 'expense', 'alert-circle', '#EAB308', 4, v_id, FALSE);
END $$;

-- ============================================================
-- Subcategories for Trabajo
-- ============================================================
DO $$
DECLARE
  v_id INT;
BEGIN
  SELECT "CategoryID" INTO v_id FROM "Categories" WHERE "Name" = 'Trabajo' AND "ParentCategoryID" IS NULL;

  INSERT INTO "Categories" ("Name", "Type", "Icon", "Color", "SortOrder", "ParentCategoryID", "DefaultShared") VALUES
  ('Seguridad Social', 'expense', 'shield', '#F59E0B', 1, v_id, FALSE),
  ('Impuestos', 'expense', 'landmark', '#F59E0B', 2, v_id, FALSE),
  ('Anthropic', 'expense', 'cpu', '#F59E0B', 3, v_id, FALSE),
  ('General', 'expense', 'alert-circle', '#F59E0B', 4, v_id, FALSE);
END $$;

-- ============================================================
-- Subcategories for Viajes
-- ============================================================
DO $$
DECLARE
  v_id INT;
BEGIN
  SELECT "CategoryID" INTO v_id FROM "Categories" WHERE "Name" = 'Viajes' AND "ParentCategoryID" IS NULL;

  INSERT INTO "Categories" ("Name", "Type", "Icon", "Color", "SortOrder", "ParentCategoryID", "DefaultShared") VALUES
  ('Alojamiento', 'expense', 'bed', '#8B5CF6', 1, v_id, FALSE),
  ('Transporte', 'expense', 'car', '#8B5CF6', 2, v_id, FALSE),
  ('Comida', 'expense', 'utensils', '#8B5CF6', 3, v_id, FALSE),
  ('Restaurante', 'expense', 'chef-hat', '#8B5CF6', 4, v_id, FALSE),
  ('Actividades', 'expense', 'ticket', '#8B5CF6', 5, v_id, FALSE),
  ('Esquí', 'expense', 'mountain-snow', '#8B5CF6', 6, v_id, FALSE),
  ('Otros', 'expense', 'ellipsis', '#8B5CF6', 7, v_id, FALSE),
  ('Skydive', 'expense', 'cloud', '#8B5CF6', 8, v_id, FALSE),
  ('Copas', 'expense', 'wine', '#8B5CF6', 9, v_id, FALSE);
END $$;
