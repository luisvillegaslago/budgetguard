-- BudgetGuard Seed Data
-- Initial categories based on typical family expense/income patterns

USE BudgetGuard;
GO

-- Clear existing data (for development only)
-- DELETE FROM Transactions;
-- DELETE FROM Categories;
-- DBCC CHECKIDENT ('Categories', RESEED, 0);
-- DBCC CHECKIDENT ('Transactions', RESEED, 0);

-- Income Categories (guard-success green: #10B981)
INSERT INTO Categories (Name, Type, Icon, Color, SortOrder) VALUES
('Nomina', 'income', 'banknote', '#10B981', 1),
('Reembolsos', 'income', 'receipt', '#34D399', 2),
('Otros Ingresos', 'income', 'plus-circle', '#6EE7B7', 3);

-- Expense Categories (various colors from warm to cool)
-- DefaultShared = 1 for categories typically shared between partners
INSERT INTO Categories (Name, Type, Icon, Color, SortOrder, DefaultShared) VALUES
('Vivienda', 'expense', 'home', '#EF4444', 1, 1),
('Blanquita', 'expense', 'dog', '#F97316', 2, 1),
('Trabajo', 'expense', 'briefcase', '#F59E0B', 3, 0),
('Deporte', 'expense', 'dumbbell', '#EAB308', 4, 0),
('Paracaidismo', 'expense', 'cloud', '#84CC16', 5, 0),
('Supermercado', 'expense', 'shopping-cart', '#22C55E', 6, 0),
('Transporte', 'expense', 'car', '#14B8A6', 7, 0),
('Restaurante', 'expense', 'utensils', '#06B6D4', 8, 0),
('Compras', 'expense', 'shopping-bag', '#0EA5E9', 9, 0),
('Salir', 'expense', 'beer', '#3B82F6', 10, 0),
('Gastos Extra', 'expense', 'alert-circle', '#6366F1', 11, 0),
('Viajes', 'expense', 'plane', '#8B5CF6', 12, 0),
('Anuales', 'expense', 'calendar', '#A855F7', 13, 0);

GO

-- ============================================================
-- Subcategories for Vivienda (shared by default)
-- ============================================================
DECLARE @ViviendaID INT = (SELECT CategoryID FROM Categories WHERE Name = 'Vivienda' AND ParentCategoryID IS NULL);

INSERT INTO Categories (Name, Type, Icon, Color, SortOrder, ParentCategoryID, DefaultShared) VALUES
('Internet', 'expense', 'wifi', '#EF4444', 1, @ViviendaID, 1),
('Asistenta', 'expense', 'spray-can', '#EF4444', 2, @ViviendaID, 1),
('Calefaccion', 'expense', 'flame', '#EF4444', 3, @ViviendaID, 1),
('Luz', 'expense', 'zap', '#EF4444', 4, @ViviendaID, 1),
('Garaje', 'expense', 'warehouse', '#EF4444', 5, @ViviendaID, 1),
('Comunidad', 'expense', 'building-2', '#EF4444', 6, @ViviendaID, 1),
('Compras Casa', 'expense', 'package', '#EF4444', 7, @ViviendaID, 1),
('Otros', 'expense', 'alert-circle', '#EF4444', 8, @ViviendaID, 1);

-- ============================================================
-- Subcategories for Salir
-- ============================================================
DECLARE @SalidasID INT = (SELECT CategoryID FROM Categories WHERE Name = 'Salir' AND ParentCategoryID IS NULL);

INSERT INTO Categories (Name, Type, Icon, Color, SortOrder, ParentCategoryID, DefaultShared) VALUES
('Comida', 'expense', 'utensils', '#3B82F6', 1, @SalidasID, 0),
('Copas', 'expense', 'wine', '#3B82F6', 2, @SalidasID, 0),
('Transporte', 'expense', 'car', '#3B82F6', 3, @SalidasID, 0),
('Ropero', 'expense', 'shirt', '#3B82F6', 4, @SalidasID, 0),
('Otros', 'expense', 'alert-circle', '#3B82F6', 5, @SalidasID, 0);

GO

-- ============================================================
-- Subcategories for Transporte
-- ============================================================
DECLARE @TransporteID INT = (SELECT CategoryID FROM Categories WHERE Name = 'Transporte' AND ParentCategoryID IS NULL);

INSERT INTO Categories (Name, Type, Icon, Color, SortOrder, ParentCategoryID, DefaultShared) VALUES
('Gasolina', 'expense', 'fuel', '#14B8A6', 1, @TransporteID, 0),
('Peaje', 'expense', 'landmark', '#14B8A6', 2, @TransporteID, 0),
('Taxi', 'expense', 'car', '#14B8A6', 3, @TransporteID, 0),
('Parking', 'expense', 'square-parking', '#14B8A6', 4, @TransporteID, 0),
('Transporte Publico', 'expense', 'train-front', '#14B8A6', 5, @TransporteID, 0);

-- ============================================================
-- Subcategories for Deporte
-- ============================================================
DECLARE @DeporteID INT = (SELECT CategoryID FROM Categories WHERE Name = 'Deporte' AND ParentCategoryID IS NULL);

INSERT INTO Categories (Name, Type, Icon, Color, SortOrder, ParentCategoryID, DefaultShared) VALUES
('Padel', 'expense', 'trophy', '#EAB308', 1, @DeporteID, 0),
('Gimnasio', 'expense', 'dumbbell', '#EAB308', 2, @DeporteID, 0),
('Carreras', 'expense', 'flag', '#EAB308', 3, @DeporteID, 0),
('General', 'expense', 'alert-circle', '#EAB308', 4, @DeporteID, 0);

-- ============================================================
-- Subcategories for Trabajo
-- ============================================================
DECLARE @TrabajoID INT = (SELECT CategoryID FROM Categories WHERE Name = 'Trabajo' AND ParentCategoryID IS NULL);

INSERT INTO Categories (Name, Type, Icon, Color, SortOrder, ParentCategoryID, DefaultShared) VALUES
('Seguridad Social', 'expense', 'shield', '#F59E0B', 1, @TrabajoID, 0),
('Impuestos', 'expense', 'landmark', '#F59E0B', 2, @TrabajoID, 0),
('Anthropic', 'expense', 'cpu', '#F59E0B', 3, @TrabajoID, 0),
('General', 'expense', 'alert-circle', '#F59E0B', 4, @TrabajoID, 0);

GO

-- ============================================================
-- Subcategories for Viajes
-- ============================================================
DECLARE @ViajesID INT = (SELECT CategoryID FROM Categories WHERE Name = 'Viajes' AND ParentCategoryID IS NULL);

INSERT INTO Categories (Name, Type, Icon, Color, SortOrder, ParentCategoryID, DefaultShared) VALUES
('Alojamiento', 'expense', 'bed', '#8B5CF6', 1, @ViajesID, 0),
('Transporte', 'expense', 'car', '#8B5CF6', 2, @ViajesID, 0),
('Comida', 'expense', 'utensils', '#8B5CF6', 3, @ViajesID, 0),
('Restaurante', 'expense', 'chef-hat', '#8B5CF6', 4, @ViajesID, 0),
('Actividades', 'expense', 'ticket', '#8B5CF6', 5, @ViajesID, 0),
(N'Esquí', 'expense', 'mountain-snow', '#8B5CF6', 6, @ViajesID, 0),
('Otros', 'expense', 'ellipsis', '#8B5CF6', 7, @ViajesID, 0),
('Skydive', 'expense', 'cloud', '#8B5CF6', 8, @ViajesID, 0),
('Copas', 'expense', 'wine', '#8B5CF6', 9, @ViajesID, 0);

GO

-- Sample transactions for testing (optional - remove in production)
-- Uncomment to add test data

/*
DECLARE @CurrentMonth DATE = DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1);

-- Sample income
INSERT INTO Transactions (CategoryID, AmountCents, Description, TransactionDate, Type) VALUES
(1, 285000, 'Nomina Enero', DATEADD(DAY, 14, @CurrentMonth), 'income'),
(2, 15000, 'Reembolso medico', DATEADD(DAY, 8, @CurrentMonth), 'income');

-- Sample expenses
INSERT INTO Transactions (CategoryID, AmountCents, Description, TransactionDate, Type) VALUES
(4, 80000, 'Alquiler', DATEADD(DAY, 1, @CurrentMonth), 'expense'),
(7, 12500, 'Carniceria La Buena', DATEADD(DAY, 3, @CurrentMonth), 'expense'),
(7, 8745, 'Mercadona', DATEADD(DAY, 7, @CurrentMonth), 'expense'),
(8, 4500, 'Gasolina', DATEADD(DAY, 5, @CurrentMonth), 'expense'),
(9, 3280, 'Restaurante italiano', DATEADD(DAY, 10, @CurrentMonth), 'expense'),
(11, 2100, 'Netflix + Spotify', DATEADD(DAY, 1, @CurrentMonth), 'expense');
*/
